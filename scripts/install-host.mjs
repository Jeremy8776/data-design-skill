#!/usr/bin/env node

import { access, cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_NAME = 'ai-architecture-discovery';
const SUPPORTED_HOSTS = new Set(['codex', 'claude', 'kiro', 'antigravity', 'agents']);
const SUPPORTED_SCOPES = new Set(['user', 'workspace']);

function requireInside(base, target) {
  const relative = path.relative(base, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Resolved installation target is outside or equal to its expected base: ${target}`);
  }
}

export function resolveInstallationTarget({
  host,
  scope,
  workspace = process.cwd(),
  homeDirectory = os.homedir(),
  codexHome = process.env.CODEX_HOME,
} = {}) {
  if (!SUPPORTED_HOSTS.has(host)) throw new Error(`Unsupported host: ${host || '(missing)'}.`);
  if (!SUPPORTED_SCOPES.has(scope)) throw new Error(`Unsupported scope: ${scope || '(missing)'}.`);

  const workspaceRoot = path.resolve(workspace);
  const homeRoot = path.resolve(homeDirectory);
  let base;

  if (host === 'codex') {
    if (scope !== 'user') throw new Error('This installer only claims the verified user scope for Codex.');
    base = path.resolve(codexHome || path.join(homeRoot, '.codex'), 'skills');
  } else if (host === 'claude') {
    base = scope === 'user' ? path.join(homeRoot, '.claude', 'skills') : path.join(workspaceRoot, '.claude', 'skills');
  } else if (host === 'kiro') {
    base = scope === 'user' ? path.join(homeRoot, '.kiro', 'skills') : path.join(workspaceRoot, '.kiro', 'skills');
  } else if (host === 'antigravity') {
    base = scope === 'user' ? path.join(homeRoot, '.gemini', 'config', 'skills') : path.join(workspaceRoot, '.agents', 'skills');
  } else {
    if (scope !== 'workspace') throw new Error('The generic Agent Skills target is workspace-only because user locations are host-defined.');
    base = path.join(workspaceRoot, '.agents', 'skills');
  }

  const resolvedBase = path.resolve(base);
  const target = path.join(resolvedBase, SKILL_NAME);
  requireInside(resolvedBase, target);
  return { host, scope, base: resolvedBase, target };
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function validateSourceRoot(sourceRoot) {
  const sourceStat = await stat(sourceRoot);
  if (!sourceStat.isDirectory()) throw new Error('The canonical skill root is not a directory.');
  const skillText = await readFile(path.join(sourceRoot, 'SKILL.md'), 'utf8');
  if (!skillText.includes(`name: ${SKILL_NAME}`)) throw new Error(`The source SKILL.md is not ${SKILL_NAME}.`);
}

export async function installForHost({
  host,
  scope,
  workspace,
  homeDirectory,
  codexHome,
  sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  force = false,
  dryRun = false,
} = {}) {
  const canonicalRoot = path.resolve(sourceRoot);
  await validateSourceRoot(canonicalRoot);
  const resolved = resolveInstallationTarget({ host, scope, workspace, homeDirectory, codexHome });
  if (path.resolve(resolved.target) === canonicalRoot) throw new Error('The canonical skill is already at the resolved installation target.');

  const targetExists = await exists(resolved.target);
  if (targetExists && !force) {
    throw new Error(`Refusing to replace existing installation: ${resolved.target}. Re-run with --force to update it.`);
  }
  if (dryRun) return { ...resolved, installed: false, wouldReplace: targetExists };

  await mkdir(resolved.base, { recursive: true });
  await cp(canonicalRoot, resolved.target, {
    recursive: true,
    force,
    errorOnExist: !force,
    filter: (source) => !['.git', '.portable-install.json'].includes(path.basename(source)),
  });
  const marker = {
    formatVersion: '0.1.0',
    skill: SKILL_NAME,
    host,
    scope,
    installedAt: new Date().toISOString(),
    canonicalSource: canonicalRoot,
  };
  await writeFile(path.join(resolved.target, '.portable-install.json'), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  return { ...resolved, installed: true, wouldReplace: targetExists };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}.`);
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) options[key] = true;
    else { options[key] = next; index++; }
  }
  return options;
}

function invocationFor(host) {
  if (host === 'codex') return '$ai-architecture-discovery';
  if (host === 'claude' || host === 'kiro') return '/ai-architecture-discovery';
  if (host === 'antigravity') return 'Verify with /skills list, then ask to use ai-architecture-discovery.';
  return 'Use the host\'s Agent Skills invocation or ask for ai-architecture-discovery by name.';
}

function usage() {
  return `Install AI Architecture Discovery for an Agent Skills host\n\n` +
    `  node install-host.mjs --host <codex|claude|kiro|antigravity|agents> --scope <user|workspace> [--workspace <path>] [--dry-run] [--force]\n\n` +
    `Codex is user-scope only. The generic Agent Skills target is workspace-scope only.`;
}

export async function runInstallCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help === true) return { output: usage(), exitCode: 0 };
  if (typeof options.host !== 'string' || typeof options.scope !== 'string') throw new Error(`--host and --scope are required.\n\n${usage()}`);
  const result = await installForHost({
    host: options.host,
    scope: options.scope,
    workspace: typeof options.workspace === 'string' ? options.workspace : process.cwd(),
    force: options.force === true,
    dryRun: options['dry-run'] === true,
  });
  const action = result.installed ? (result.wouldReplace ? 'Updated' : 'Installed') : 'Would install';
  return {
    output: `${action} ${SKILL_NAME} for ${result.host} (${result.scope})\n${result.target}\nInvoke: ${invocationFor(result.host)}`,
    exitCode: 0,
    result,
  };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runInstallCli()
    .then((result) => {
      process.stdout.write(`${result.output}\n`);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
