import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { installForHost, resolveInstallationTarget } from '../scripts/install-host.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('host targets match documented workspace and user conventions', () => {
  const workspace = path.resolve('C:/work/client');
  const home = path.resolve('C:/Users/tester');
  assert.equal(resolveInstallationTarget({ host: 'claude', scope: 'workspace', workspace, homeDirectory: home }).target, path.join(workspace, '.claude', 'skills', 'ai-architecture-discovery'));
  assert.equal(resolveInstallationTarget({ host: 'kiro', scope: 'workspace', workspace, homeDirectory: home }).target, path.join(workspace, '.kiro', 'skills', 'ai-architecture-discovery'));
  assert.equal(resolveInstallationTarget({ host: 'antigravity', scope: 'workspace', workspace, homeDirectory: home }).target, path.join(workspace, '.agents', 'skills', 'ai-architecture-discovery'));
  assert.equal(resolveInstallationTarget({ host: 'antigravity', scope: 'user', workspace, homeDirectory: home }).target, path.join(home, '.gemini', 'config', 'skills', 'ai-architecture-discovery'));
  assert.equal(resolveInstallationTarget({ host: 'codex', scope: 'user', workspace, homeDirectory: home, codexHome: path.join(home, '.codex') }).target, path.join(home, '.codex', 'skills', 'ai-architecture-discovery'));
  assert.throws(() => resolveInstallationTarget({ host: 'codex', scope: 'workspace', workspace, homeDirectory: home }), /user scope/);
  assert.throws(() => resolveInstallationTarget({ host: 'agents', scope: 'user', workspace, homeDirectory: home }), /workspace-only/);
});

test('workspace install copies the canonical package and records provenance', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'portable-skill-host-'));
  try {
    const result = await installForHost({ host: 'kiro', scope: 'workspace', workspace, sourceRoot: skillRoot });
    assert.equal(result.installed, true);
    const skillText = await readFile(path.join(result.target, 'SKILL.md'), 'utf8');
    const marker = JSON.parse(await readFile(path.join(result.target, '.portable-install.json'), 'utf8'));
    assert.match(skillText, /name: ai-architecture-discovery/);
    assert.equal(marker.host, 'kiro');
    assert.equal(marker.canonicalSource, skillRoot);
    await assert.rejects(() => access(path.join(result.target, '.git')));
    await assert.rejects(() => installForHost({ host: 'kiro', scope: 'workspace', workspace, sourceRoot: skillRoot }), /Refusing to replace/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('dry run resolves the target without creating an installation', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'portable-skill-dry-run-'));
  try {
    const result = await installForHost({ host: 'claude', scope: 'workspace', workspace, sourceRoot: skillRoot, dryRun: true });
    assert.equal(result.installed, false);
    await assert.rejects(() => readFile(path.join(result.target, 'SKILL.md'), 'utf8'));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
