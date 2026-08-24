import { createHash } from 'node:crypto';
import { mkdir, open, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_IGNORED = new Set([
  '.git', '.next', '.nuxt', '.cache', '.idea', '.vscode', '.wrangler',
  'node_modules', 'dist', 'build', 'coverage', '__pycache__', '.venv', 'venv',
]);
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.html', '.htm',
  '.xml', '.yaml', '.yml', '.log', '.ini', '.toml', '.rtf',
]);
const MIME_TYPES = new Map([
  ['.txt', 'text/plain'], ['.md', 'text/markdown'], ['.markdown', 'text/markdown'],
  ['.csv', 'text/csv'], ['.tsv', 'text/tab-separated-values'], ['.json', 'application/json'],
  ['.jsonl', 'application/x-ndjson'], ['.html', 'text/html'], ['.htm', 'text/html'],
  ['.xml', 'application/xml'], ['.yaml', 'application/yaml'], ['.yml', 'application/yaml'],
  ['.pdf', 'application/pdf'], ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'],
  ['.gif', 'image/gif'], ['.svg', 'image/svg+xml'], ['.mp4', 'video/mp4'], ['.mov', 'video/quicktime'],
  ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.zip', 'application/zip'],
]);
const SENSITIVITY_RULES = [
  ['personal-data', /\b(passport|driving licen[cs]e|date of birth|dob|personal data|employee record|medical)\b/i],
  ['financial', /\b(bank|account number|sort code|payroll|salary|invoice|payment|tax|vat)\b/i],
  ['contractual', /\b(nda|non.disclosure|contract|agreement|statement of work|\bsow\b|legal|rights|release)\b/i],
  ['credentials', /\b(password|credential|secret|api key|access token|private key)\b/i],
];
const LIFECYCLE_RULES = [
  ['approved', /\b(approved|signed|confirmed|issued)\b/i],
  ['final', /\bfinal\b/i],
  ['draft', /\b(draft|working|review|wip|work.in.progress)\b/i],
  ['superseded', /\b(old|obsolete|superseded|archive|archived|deprecated|previous)\b/i],
  ['copy', /(?:\bcopy\b|\(\d+\)|_copy| - copy)/i],
];
const CATEGORY_RULES = [
  ['Legal', /\b(nda|agreement|contract|terms|licen[cs]e|legal|rights|release|trademark|copyright)\b/i],
  ['Finance', /\b(invoice|budget|cost|quote|estimate|payment|bank|finance|pricing|purchase order|\bpo\b)\b/i],
  ['People', /\b(org chart|organisation|organization|team|people|staff|employee|role|job description|recruit|payroll|salary)\b/i],
  ['Technology', /\b(software|system|technology|tech stack|subscription|integration|api|platform|vendor|supplier|security)\b/i],
  ['Strategy', /\b(strategy|roadmap|objective|business plan|operating model|vision|mission|proposal|board)\b/i],
  ['Operations', /\b(process|workflow|procedure|sop|operations|handover|tracker|schedule|timeline|delivery|approval)\b/i],
  ['Creative', /\b(creative|campaign|brand|style|design|artwork|asset|image|video|photo|retouch|moodboard|lookbook|casting|brief)\b/i],
  ['Research', /\b(research|insight|survey|analysis|report|benchmark|competitor|market)\b/i],
];

function normaliseWords(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_./\\-]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function safeId(value, fallback = 'source') {
  const result = normaliseWords(value).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 64);
  return result || fallback;
}

function labelsFor(value, rules) {
  const haystack = normaliseWords(value);
  return rules.filter(([, rule]) => rule.test(haystack)).map(([label]) => label);
}

function categoryFor(value) {
  const haystack = normaliseWords(value);
  return CATEGORY_RULES.find(([, rule]) => rule.test(haystack))?.[0] ?? 'Unclassified';
}

function weakName(name) {
  const base = path.basename(name, path.extname(name));
  return /^(img|dsc|pxl|scan|document|untitled|new document|screenshot|image|file)[-_ ]?\d*$/i.test(base)
    || /^(copy of|new |untitled)/i.test(base) || base.length < 3;
}

function deterministicScore(locator) {
  return createHash('sha256').update(locator).digest('hex').slice(0, 16);
}

async function fingerprint(filePath, size) {
  const hash = createHash('sha256');
  const handle = await open(filePath, 'r');
  try {
    const sampleSize = 64 * 1024;
    if (size <= sampleSize * 2) {
      const buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, 0);
      hash.update(buffer);
      return `sha256-full:${hash.digest('hex')}`;
    }
    const first = Buffer.alloc(sampleSize);
    const last = Buffer.alloc(sampleSize);
    await handle.read(first, 0, sampleSize, 0);
    await handle.read(last, 0, sampleSize, Math.max(0, size - sampleSize));
    hash.update(String(size));
    hash.update(first);
    hash.update(last);
    return `sha256-sampled:${hash.digest('hex')}`;
  } finally {
    await handle.close();
  }
}

async function readText(filePath, size) {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(size, 256 * 1024));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

function createSegment(name, locator, rootPath, initialTasks) {
  return {
    id: `segment-${safeId(name, 'root')}`,
    name,
    locator,
    rootPath,
    tasks: initialTasks,
    taskIndex: 0,
    fileCount: 0,
    folderCount: initialTasks.some((task) => task.type === 'directory') ? 1 : 0,
    totalBytes: 0,
    oldestModifiedAt: null,
    newestModifiedAt: null,
    extensionCounts: new Map(),
    categoryCounts: new Map(),
    sensitivityCueCount: 0,
    lifecycleCueCounts: new Map(),
    weakNameCount: 0,
    warnings: [],
    representative: [],
    consequential: new Map(),
  };
}

function updateMinMax(segment, modifiedAt) {
  if (!segment.oldestModifiedAt || modifiedAt < segment.oldestModifiedAt) segment.oldestModifiedAt = modifiedAt;
  if (!segment.newestModifiedAt || modifiedAt > segment.newestModifiedAt) segment.newestModifiedAt = modifiedAt;
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function addRepresentative(segment, record, limit) {
  const candidate = { ...record, score: deterministicScore(record.locator), selectionBasis: 'deterministic-representative' };
  segment.representative.push(candidate);
  segment.representative.sort((a, b) => a.score.localeCompare(b.score));
  if (segment.representative.length > limit) segment.representative.pop();
}

function addConsequential(segment, record, reasons, limit) {
  if (!reasons.length || segment.consequential.has(record.locator)) return;
  if (segment.consequential.size >= limit) return;
  segment.consequential.set(record.locator, { ...record, selectionBasis: reasons.join('+') });
}

function serialiseCounts(map, limit = 30) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit));
}

function createIndex(indexPath) {
  if (!indexPath) return null;
  const database = new DatabaseSync(indexPath);
  database.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE records (
      id INTEGER PRIMARY KEY,
      segment_id TEXT NOT NULL,
      locator TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      parent_locator TEXT,
      extension TEXT,
      size INTEGER NOT NULL,
      created_at TEXT,
      modified_at TEXT NOT NULL,
      category TEXT NOT NULL,
      sensitivity_json TEXT NOT NULL,
      lifecycle_json TEXT NOT NULL,
      weak_name INTEGER NOT NULL
    );
    CREATE INDEX records_segment ON records(segment_id);
    CREATE INDEX records_extension ON records(extension);
    CREATE INDEX records_category ON records(category);
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  database.exec('BEGIN');
  const insert = database.prepare(`
    INSERT INTO records (
      segment_id, locator, name, parent_locator, extension, size, created_at,
      modified_at, category, sensitivity_json, lifecycle_json, weak_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return { database, insert };
}

function closeIndex(index, metadata, commit = true) {
  if (!index) return;
  if (commit) {
    index.database.exec('COMMIT');
    const insertMeta = index.database.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(metadata)) insertMeta.run(key, JSON.stringify(value));
  } else {
    try { index.database.exec('ROLLBACK'); } catch { /* best effort for a generated partial index */ }
  }
  index.database.close();
}

function isInside(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function toSnapshotRecord(record, detailed, includeText) {
  const extension = path.extname(record.name).toLowerCase();
  const eligibleText = TEXT_EXTENSIONS.has(extension) && record.size <= 1024 * 1024;
  const contentText = detailed && includeText && eligibleText
    ? await readText(record.absolutePath, record.size).catch(() => null)
    : null;
  return {
    externalId: null,
    name: record.name,
    locator: record.locator,
    parentLocator: record.parentLocator,
    recordType: 'file',
    mimeType: MIME_TYPES.get(extension) ?? null,
    size: record.size,
    createdAt: record.createdAt,
    modifiedAt: record.modifiedAt,
    version: null,
    webUrl: null,
    localPath: record.absolutePath,
    contentState: contentText ? 'partial' : 'metadata-only',
    contentText,
    permissionState: 'partial',
    permissions: [],
    checksum: detailed ? await fingerprint(record.absolutePath, record.size).catch(() => null) : null,
    metadata: {
      extension: extension || null,
      category: record.category,
      sensitivity: record.sensitivity,
      lifecycle: record.lifecycle,
      weakName: record.weakName,
      selectionBasis: record.selectionBasis ?? 'complete-small-scope',
      contentIncluded: Boolean(contentText),
    },
  };
}

export async function mapLocalCompany(rootInput, options = {}) {
  const rootPath = path.resolve(rootInput);
  const rootStat = await stat(rootPath);
  if (!rootStat.isDirectory()) throw new Error('The selected path is not a directory.');

  const maxFiles = Math.min(Math.max(Number(options.maxFiles) || 500_000, 1), 2_000_000);
  const portableRecordLimit = Math.min(Math.max(Number(options.portableRecordLimit) || 1_500, 100), 10_000);
  const representativePerSegment = Math.min(Math.max(Number(options.representativePerSegment) || 45, 5), 250);
  const consequentialPerSegment = Math.min(Math.max(Number(options.consequentialPerSegment) || 35, 5), 250);
  const includeText = options.includeText === true;
  const platform = String(options.platform || 'local-filesystem');
  const collectionMethod = String(options.collectionMethod || 'native-read-only');
  const indexPath = options.indexPath ? path.resolve(options.indexPath) : null;
  if (indexPath && isInside(rootPath, indexPath)) throw new Error('The evidence index must be written outside the authorised source root.');

  const topEntries = await readdir(rootPath, { withFileTypes: true });
  topEntries.sort((a, b) => a.name.localeCompare(b.name));
  const rootFileTasks = [];
  const segments = [];
  for (const entry of topEntries) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED.has(entry.name) || (entry.name.startsWith('.') && options.includeHidden !== true)) continue;
      segments.push(createSegment(entry.name, entry.name, absolutePath, [{ type: 'directory', absolutePath, locator: entry.name }]));
    } else if (entry.isFile()) {
      rootFileTasks.push({ type: 'file', absolutePath, locator: entry.name });
    }
  }
  if (rootFileTasks.length) segments.unshift(createSegment('Root files', '.', rootPath, rootFileTasks));

  let index = null;
  let temporaryIndexPath = null;
  if (indexPath) {
    await mkdir(path.dirname(indexPath), { recursive: true });
    temporaryIndexPath = `${indexPath}.partial-${process.pid}`;
    index = createIndex(temporaryIndexPath);
  }

  let enumeratedFiles = 0;
  let allRecords = [];
  const warnings = [];
  let reachedLimit = false;
  try {
    while (segments.some((segment) => segment.taskIndex < segment.tasks.length) && enumeratedFiles < maxFiles) {
      for (const segment of segments) {
        if (enumeratedFiles >= maxFiles) { reachedLimit = true; break; }
        if (segment.taskIndex >= segment.tasks.length) continue;
        const task = segment.tasks[segment.taskIndex];
        segment.tasks[segment.taskIndex++] = null;
        if (task.type === 'directory') {
          let entries;
          try {
            entries = await readdir(task.absolutePath, { withFileTypes: true });
          } catch (error) {
            const warning = `${task.locator}: ${error.message}`;
            segment.warnings.push(warning);
            warnings.push(warning);
            continue;
          }
          entries.sort((a, b) => a.name.localeCompare(b.name));
          for (const entry of entries) {
            if (entry.isSymbolicLink()) continue;
            const absolutePath = path.join(task.absolutePath, entry.name);
            const locator = path.join(task.locator, entry.name);
            if (entry.isDirectory()) {
              if (DEFAULT_IGNORED.has(entry.name) || (entry.name.startsWith('.') && options.includeHidden !== true)) continue;
              segment.folderCount++;
              segment.tasks.push({ type: 'directory', absolutePath, locator });
            } else if (entry.isFile()) {
              segment.tasks.push({ type: 'file', absolutePath, locator });
            }
          }
          continue;
        }

        try {
          const fileStat = await stat(task.absolutePath);
          const extension = path.extname(task.absolutePath).toLowerCase();
          const modifiedAt = fileStat.mtime.toISOString();
          const createdAt = fileStat.birthtime?.toISOString?.() ?? null;
          const sensitivity = labelsFor(task.locator, SENSITIVITY_RULES);
          const lifecycle = labelsFor(task.locator, LIFECYCLE_RULES);
          const category = categoryFor(task.locator);
          const record = {
            absolutePath: task.absolutePath,
            locator: task.locator,
            parentLocator: path.dirname(task.locator) === '.' ? null : path.dirname(task.locator),
            name: path.basename(task.absolutePath),
            size: fileStat.size,
            createdAt,
            modifiedAt,
            category,
            sensitivity,
            lifecycle,
            weakName: weakName(path.basename(task.absolutePath)),
          };
          enumeratedFiles++;
          segment.fileCount++;
          segment.totalBytes += fileStat.size;
          updateMinMax(segment, modifiedAt);
          increment(segment.extensionCounts, extension || '(none)');
          increment(segment.categoryCounts, category);
          segment.sensitivityCueCount += sensitivity.length ? 1 : 0;
          for (const cue of lifecycle) increment(segment.lifecycleCueCounts, cue);
          if (record.weakName) segment.weakNameCount++;
          addRepresentative(segment, record, representativePerSegment);
          addConsequential(segment, record, [sensitivity.length ? 'sensitivity-cue' : '', lifecycle.length ? 'lifecycle-cue' : '', record.weakName ? 'weak-name' : ''].filter(Boolean), consequentialPerSegment);
          if (allRecords) {
            allRecords.push(record);
            if (allRecords.length > portableRecordLimit) allRecords = null;
          }
          index?.insert.run(
            segment.id, task.locator, record.name, record.parentLocator, extension || null,
            fileStat.size, createdAt, modifiedAt, category, JSON.stringify(sensitivity),
            JSON.stringify(lifecycle), record.weakName ? 1 : 0,
          );
        } catch (error) {
          const warning = `${task.locator}: ${error.message}`;
          segment.warnings.push(warning);
          warnings.push(warning);
        }
      }
    }
    if (segments.some((segment) => segment.taskIndex < segment.tasks.length)) reachedLimit = true;
    if (reachedLimit) warnings.push(`Metadata mapping stopped at the configured ${maxFiles.toLocaleString()} file limit.`);

    const detailed = Boolean(allRecords);
    const selected = detailed ? allRecords : segments.flatMap((segment) => {
      const byLocator = new Map();
      for (const record of segment.consequential.values()) byLocator.set(record.locator, record);
      for (const record of segment.representative) if (!byLocator.has(record.locator)) byLocator.set(record.locator, record);
      return [...byLocator.values()].slice(0, consequentialPerSegment + representativePerSegment);
    });
    const records = [];
    for (const record of selected.sort((a, b) => a.locator.localeCompare(b.locator))) {
      records.push(await toSnapshotRecord(record, detailed, includeText));
    }

    const structureSegments = segments.map((segment) => ({
      id: segment.id,
      name: segment.name,
      locator: segment.locator,
      fileCount: segment.fileCount,
      folderCount: segment.folderCount,
      totalBytes: segment.totalBytes,
      oldestModifiedAt: segment.oldestModifiedAt,
      newestModifiedAt: segment.newestModifiedAt,
      extensionCounts: serialiseCounts(segment.extensionCounts),
      categoryCounts: serialiseCounts(segment.categoryCounts),
      sensitivityCueCount: segment.sensitivityCueCount,
      lifecycleCueCounts: serialiseCounts(segment.lifecycleCueCounts),
      weakNameCount: segment.weakNameCount,
      retainedEvidenceCount: records.filter((record) => record.locator === segment.locator || record.locator.startsWith(`${segment.locator}${path.sep}`)).length,
      warnings: segment.warnings,
    }));
    const totalBytes = structureSegments.reduce((sum, segment) => sum + segment.totalBytes, 0);
    const structure = {
      level: 'top-level-source-map',
      totals: {
        enumeratedFileCount: enumeratedFiles,
        folderCount: structureSegments.reduce((sum, segment) => sum + segment.folderCount, 0),
        totalBytes,
        sensitivityCueCount: structureSegments.reduce((sum, segment) => sum + segment.sensitivityCueCount, 0),
        weakNameCount: structureSegments.reduce((sum, segment) => sum + segment.weakNameCount, 0),
      },
      segments: structureSegments,
    };
    const scanPolicy = {
      mode: detailed ? 'complete-small-scope' : 'hierarchical-company-map',
      traversal: 'round-robin-top-level',
      maxEnumeratedFiles: maxFiles,
      portableRecordLimit,
      representativePerSegment,
      consequentialPerSegment,
      enumeratedFileCount: enumeratedFiles,
      retainedEvidenceRecordCount: records.length,
      fingerprints: detailed ? 'all-retained-records' : 'deferred-until-targeted-analysis',
      content: includeText && detailed ? 'eligible-text-sampled' : 'not-requested',
    };
    closeIndex(index, { sourceRoot: rootPath, createdAt: new Date().toISOString(), scanPolicy, structure }, true);
    index = null;
    if (temporaryIndexPath && indexPath) {
      if (options.force === true) await unlink(indexPath).catch(() => {});
      await rename(temporaryIndexPath, indexPath);
    }

    return {
      snapshotVersion: '0.1.0',
      source: {
        id: safeId(options.sourceId || `${platform}-${path.basename(rootPath)}`),
        platform,
        sourceFamily: collectionMethod === 'synced-folder' ? 'synced-cloud-folder' : 'local-filesystem',
        displayName: options.displayName || path.basename(rootPath),
        scope: rootPath,
        locator: rootPath,
        collectionMethod,
        collectedAt: new Date().toISOString(),
        capabilities: {
          enumeration: warnings.length ? 'partial' : 'available', metadata: 'available',
          content: includeText && detailed ? 'partial' : 'not-requested', permissions: 'partial',
          versions: 'unavailable', stableIds: 'partial', changeTracking: 'unavailable',
        },
        coverage: {
          status: warnings.length ? 'partial' : 'complete',
          notes: [
            'Top-level sources were traversed round-robin so one large segment could not monopolise a capped run.',
            detailed ? 'The scope fit inside the portable case limit.' : 'Full metadata is in the local SQLite index; the portable case retains bounded representative and consequential evidence only.',
            'Symbolic links and common generated or dependency folders were not followed.',
            collectionMethod === 'synced-folder' ? 'Cloud-native permissions, versions, comments, stable web IDs, and placeholders may not be represented by the synced projection.' : 'Local filesystem access does not establish source-system sharing or organisational authority.',
          ],
          warnings,
        },
      },
      records,
      structure,
      scanPolicy,
      indexes: indexPath ? [{ type: 'sqlite-metadata-index', path: indexPath, recordCount: enumeratedFiles, portable: false }] : [],
    };
  } catch (error) {
    closeIndex(index, {}, false);
    if (temporaryIndexPath) await unlink(temporaryIndexPath).catch(() => {});
    throw error;
  }
}

