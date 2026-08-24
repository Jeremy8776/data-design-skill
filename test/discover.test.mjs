import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import {
  ingestSnapshot,
  renderHtmlReport,
  renderMarkdownReport,
  runCli,
  scanLocalSource,
  validateCase,
  validateSnapshot,
} from '../scripts/discover.mjs';

test('local adapter creates a portable metadata-first case without changing sources', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'architecture-discovery-'));
  try {
    await mkdir(path.join(root, 'Campaign'), { recursive: true });
    await mkdir(path.join(root, 'Finance'), { recursive: true });
    const current = path.join(root, 'Campaign', 'Brand Direction FINAL.txt');
    const competing = path.join(root, 'Campaign', 'Brand Direction FINAL v2.txt');
    const invoice = path.join(root, 'Finance', 'Client Invoice.txt');
    await writeFile(current, 'Approved by the creative director.');
    await writeFile(competing, 'Approved by the creative director.');
    await writeFile(invoice, 'Payment pending.');
    const before = await readFile(current, 'utf8');

    const snapshot = await scanLocalSource(root, { platform: 'onedrive', collectionMethod: 'synced-folder' });
    assert.deepEqual(validateSnapshot(snapshot).valid, true);
    assert.equal(snapshot.source.platform, 'onedrive');
    assert.equal(snapshot.source.capabilities.permissions, 'partial');
    assert.equal(snapshot.source.capabilities.versions, 'unavailable');
    assert.ok(snapshot.records.every((record) => record.contentState === 'metadata-only'));

    const caseFile = ingestSnapshot(snapshot);
    assert.equal(validateCase(caseFile).valid, true);
    assert.equal(caseFile.provenance.aiUsedForIngest, false);
    assert.equal(caseFile.provenance.sourceSystemsModified, false);
    assert.ok(caseFile.observations.some((observation) => observation.type === 'authority'));
    assert.ok(caseFile.observations.some((observation) => observation.type === 'permissions'));
    assert.equal(await readFile(current, 'utf8'), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('neutral snapshots from another platform merge without provider-specific fields', () => {
  const googleSnapshot = {
    snapshotVersion: '0.1.0',
    source: {
      id: 'google-drive-marketing', platform: 'google-drive', sourceFamily: 'cloud-document-platform',
      displayName: 'Marketing Drive', scope: 'Shared drive: Marketing', locator: 'gdrive://marketing',
      collectionMethod: 'connector-read-only', collectedAt: '2026-08-24T12:00:00.000Z',
      capabilities: { enumeration: 'available', metadata: 'available', content: 'partial', permissions: 'available', versions: 'partial', stableIds: 'available', changeTracking: 'partial' },
      coverage: { status: 'complete', notes: ['Complete for the approved shared drive scope.'], warnings: [] },
    },
    records: [{
      externalId: 'doc-123', name: 'Campaign approval', locator: 'Campaign/Campaign approval', parentLocator: 'Campaign',
      recordType: 'document', mimeType: 'application/vnd.google-apps.document', size: null, createdAt: null,
      modifiedAt: '2026-08-23T10:00:00.000Z', version: 'head', webUrl: 'https://docs.google.com/document/d/doc-123',
      localPath: null, contentState: 'partial', contentText: 'Final approval remains pending.', permissionState: 'available',
      permissions: [{ role: 'reader', principalType: 'group' }], checksum: null, metadata: { ownerCount: 1 },
    }],
  };

  const first = ingestSnapshot(googleSnapshot, null, { caseName: 'Multi-source discovery' });
  first.questions.push({ id: 'question-model-001', title: 'Who owns the connector?', whyItMatters: 'Ownership changes the operating model.', observationIds: [], recordIds: [], status: 'open', evidenceState: 'model-proposed' });
  const secondSnapshot = structuredClone(googleSnapshot);
  secondSnapshot.source.id = 'sharepoint-operations';
  secondSnapshot.source.platform = 'sharepoint';
  secondSnapshot.source.displayName = 'Operations library';
  secondSnapshot.source.scope = 'Site: Operations / Documents';
  secondSnapshot.source.locator = 'sharepoint://operations/documents';
  secondSnapshot.records[0].externalId = 'item-987';
  secondSnapshot.records[0].webUrl = 'https://example.sharepoint.com/item-987';
  const merged = ingestSnapshot(secondSnapshot, first);

  assert.equal(merged.sources.length, 2);
  assert.equal(merged.records.length, 2);
  assert.equal(new Set(merged.records.map((record) => record.id)).size, 2);
  assert.ok(merged.questions.some((question) => question.id === 'question-model-001'));
  assert.equal(validateCase(merged).valid, true);
});

test('report command creates portable Markdown and self-contained dark HTML', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'architecture-report-'));
  try {
    const source = path.join(root, 'source');
    const output = path.join(root, 'output');
    await mkdir(source);
    await writeFile(path.join(source, 'Strategy FINAL.txt'), 'Approved.');
    const snapshot = await scanLocalSource(source);
    const caseFile = ingestSnapshot(snapshot, null, { caseName: 'Aster Row discovery' });
    caseFile.thesis.diagnosticView = 'The operating picture depends on informal authority.';
    caseFile.answers.push({ questionId: 'question-001', questionTitle: 'Who controls the brief?', answer: 'The creative director controls it.', answeredBy: 'Campaign lead', answeredAt: '2026-08-24T12:00:00.000Z', evidenceState: 'human-verified' });
    const casePath = path.join(root, 'case.json');
    await writeFile(casePath, JSON.stringify(caseFile));

    const result = await runCli(['report', casePath, '--out-dir', output]);
    assert.equal(result.paths.length, 2);
    const markdown = await readFile(result.paths.find((item) => item.endsWith('.md')), 'utf8');
    const html = await readFile(result.paths.find((item) => item.endsWith('.html')), 'utf8');
    assert.match(markdown, /Coverage boundary/);
    assert.match(markdown, /informal authority/);
    assert.match(markdown, /Campaign lead/);
    assert.match(html, /color-scheme:dark/);
    assert.match(html, /aria-label="Discovery stages"/);
    assert.match(html, /data-stage-link="ingest"/);
    assert.match(html, /data-stage-link="clarify"/);
    assert.match(html, /<h2 id="clarify-title">Ask one consequential question at a time<\/h2>/);
    assert.match(html, /data-segment/);
    assert.match(html, /data-filter="decision"/);
    assert.match(html, /data-question-next/);
    assert.match(html, /<script>/);
    assert.match(html, /Human-verified answers/);
    assert.doesNotMatch(html, /https:\/\/[^"']+\.css/);
    assert.match(renderMarkdownReport(caseFile), /Architect thesis/);
    assert.match(renderHtmlReport(caseFile), /Author the architectural thesis/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI refuses to overwrite an existing case without force', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'architecture-overwrite-'));
  try {
    const source = path.join(root, 'source');
    const output = path.join(root, 'case.json');
    await mkdir(source);
    await writeFile(path.join(source, 'brief.txt'), 'hello');
    await writeFile(output, 'keep me');
    await assert.rejects(() => runCli(['scan-local', source, '--out', output]), /Refusing to overwrite/);
    assert.equal(await readFile(output, 'utf8'), 'keep me');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('large company maps stay bounded while SQLite retains complete metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'architecture-company-map-'));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'architecture-company-output-'));
  try {
    for (const segment of ['Creative', 'Finance', 'Operations']) {
      await mkdir(path.join(root, segment));
      for (let index = 0; index < 50; index++) {
        await writeFile(path.join(root, segment, `${segment} Source ${String(index).padStart(3, '0')}.txt`), `${segment} evidence ${index}`);
      }
    }
    const indexPath = path.join(outputRoot, 'company.evidence.sqlite');
    const snapshot = await scanLocalSource(root, {
      indexPath,
      portableRecordLimit: 100,
      representativePerSegment: 5,
      consequentialPerSegment: 5,
    });
    const caseFile = ingestSnapshot(snapshot, null, { caseName: 'Whole company' });
    assert.equal(caseFile.scanPolicy.mode, 'hierarchical-company-map');
    assert.equal(caseFile.coverage.enumeratedRecordCount, 150);
    assert.ok(caseFile.coverage.retainedEvidenceRecordCount <= 30);
    assert.equal(caseFile.structure.segments.length, 3);
    assert.equal(caseFile.sources[0].coverage.status, 'complete');
    assert.ok(Buffer.byteLength(JSON.stringify(caseFile)) < 250_000);
    const database = new DatabaseSync(indexPath, { readOnly: true });
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM records').get().count, 150);
    database.close();
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('capped company mapping represents each top-level source area fairly', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'architecture-fair-map-'));
  try {
    for (const segment of ['Area A', 'Area B', 'Area C']) {
      await mkdir(path.join(root, segment));
      for (let index = 0; index < 10; index++) {
        await writeFile(path.join(root, segment, `Source ${String(index).padStart(2, '0')}.txt`), `${segment} ${index}`);
      }
    }
    const snapshot = await scanLocalSource(root, { maxFiles: 12, portableRecordLimit: 100 });
    assert.equal(snapshot.source.coverage.status, 'partial');
    assert.equal(snapshot.structure.totals.enumeratedFileCount, 12);
    assert.deepEqual(snapshot.structure.segments.map((segment) => segment.fileCount), [4, 4, 4]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
