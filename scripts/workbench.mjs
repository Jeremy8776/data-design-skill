#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASE_SCHEMA_VERSION,
  emptyCase,
  runCli as runDiscoveryCli,
  validateCase,
} from './discover.mjs';
import {
  applyThesis,
  deferQuestion,
  inspectCase,
  recordAnswer,
  reviewObservation,
  syncWorkflow,
  workflowSummary,
} from './lib/workflow.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const options = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith('--')) positional.push(token);
    else {
      const key = token.slice(2);
      const next = rest[index + 1];
      if (!next || next.startsWith('--')) options[key] = true;
      else { options[key] = next; index++; }
    }
  }
  return { command, positional, options };
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
}

async function writeJson(filePath, value, force = false) {
  const resolved = path.resolve(filePath);
  if (!force && await exists(resolved)) throw new Error(`Refusing to overwrite existing output: ${resolved}. Use --force to replace it.`);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function requireOutput(options) {
  if (typeof options.out !== 'string') throw new Error('This command requires --out <updated-case.json>.');
  return options.out;
}

function compactStatus(caseFile) {
  const value = workflowSummary(caseFile);
  const stages = Object.entries(value.stages).map(([stage, status]) => `${stage}:${status}`).join('  ');
  return [
    `${caseFile.caseName} · ${value.status}`,
    stages,
    `Mapped ${value.metrics.recordCount.toLocaleString()} · ${value.metrics.unreviewedObservationCount} observations to review · ${value.metrics.openQuestionCount} open questions`,
    `Next: ${value.next.command} — ${value.next.reason}`,
  ].join('\n');
}

function usage() {
  return `AI Architecture Discovery Workbench\n\n` +
    `  start --name <case-name> --out <case.json>\n` +
    `  scan-local <folder> --out <case.json> [discovery options]\n` +
    `  ingest-snapshot <snapshot.json> --out <case.json> [--case <existing.json>]\n` +
    `  status <case.json> [--json]\n` +
    `  next <case.json> [--json]\n` +
    `  review <case.json> --observation <id> --state <acknowledged|contested|carried-forward|dismissed> --out <updated.json> [--note <text>] [--by <actor>]\n` +
    `  answer <case.json> --question <id> --by <person-or-role> (--text <answer> | --text-file <file>) --out <updated.json>\n` +
    `  defer <case.json> --question <id> --reason <reason> --out <updated.json> [--by <actor>]\n` +
    `  thesis <case.json> --from <thesis.json> --out <updated.json> [--by <architect>]\n` +
    `  migrate <case.json> --out <updated.json>\n` +
    `  doctor <case.json> [--json]\n` +
    `  report <case.json> --out-dir <directory>\n\n` +
    `Mutating commands write a new case unless --force explicitly replaces the selected output.`;
}

export async function runWorkbenchCli(argv = process.argv.slice(2)) {
  const { command, positional, options } = parseArgs(argv);
  if (!command || ['help', '--help', '-h'].includes(command)) return { output: usage(), exitCode: 0 };

  if (['scan-local', 'ingest-snapshot', 'validate', 'report'].includes(command)) return runDiscoveryCli(argv);

  if (command === 'start') {
    if (typeof options.name !== 'string' || typeof options.out !== 'string') throw new Error('start requires --name <case-name> and --out <case.json>.');
    const caseFile = emptyCase(options.name);
    const outputPath = await writeJson(options.out, caseFile, options.force === true);
    return { output: `Created ${outputPath}\n${compactStatus(caseFile)}`, exitCode: 0, caseFile };
  }

  if (!positional[0]) throw new Error(`${command} requires <case.json>.`);
  const casePath = path.resolve(positional[0]);
  const caseFile = await readJson(casePath);
  validateCase(caseFile);

  if (command === 'status') {
    const summary = workflowSummary(caseFile);
    return { output: options.json === true ? JSON.stringify(summary, null, 2) : compactStatus(caseFile), exitCode: 0, summary };
  }

  if (command === 'next') {
    const next = workflowSummary(caseFile).next;
    return { output: options.json === true ? JSON.stringify(next, null, 2) : `${next.command}\n${next.reason}`, exitCode: 0, next };
  }

  if (command === 'review') {
    if (typeof options.observation !== 'string' || typeof options.state !== 'string') throw new Error('review requires --observation <id> and --state <state>.');
    reviewObservation(caseFile, options.observation, options.state, options.note ?? '', options.by ?? 'architect');
  } else if (command === 'answer') {
    if (typeof options.question !== 'string' || typeof options.by !== 'string') throw new Error('answer requires --question <id> and --by <person-or-role>.');
    const answer = typeof options['text-file'] === 'string' ? await readFile(path.resolve(options['text-file']), 'utf8') : options.text;
    recordAnswer(caseFile, { questionId: options.question, answer, answeredBy: options.by });
  } else if (command === 'defer') {
    if (typeof options.question !== 'string' || typeof options.reason !== 'string') throw new Error('defer requires --question <id> and --reason <reason>.');
    deferQuestion(caseFile, { questionId: options.question, reason: options.reason, actor: options.by ?? 'architect' });
  } else if (command === 'thesis') {
    if (typeof options.from !== 'string') throw new Error('thesis requires --from <thesis.json>.');
    applyThesis(caseFile, await readJson(options.from), options.by);
  } else if (command === 'migrate') {
    caseFile.schemaVersion = CASE_SCHEMA_VERSION;
    syncWorkflow(caseFile, { type: 'case-migrated', stage: workflowSummary(caseFile).currentStage, detail: `Case migrated to schema ${CASE_SCHEMA_VERSION}.` });
  } else if (command === 'doctor') {
    const diagnosis = inspectCase(caseFile);
    const missingIndexes = [];
    for (const index of caseFile.indexes ?? []) {
      if (index.path && !await exists(index.path)) missingIndexes.push(index.path);
    }
    for (const indexPath of missingIndexes) diagnosis.findings.push({ severity: 'warning', code: 'INDEX_UNAVAILABLE', message: `Local evidence index is unavailable at ${indexPath}.` });
    diagnosis.healthy = diagnosis.healthy && !diagnosis.findings.some((item) => item.severity === 'blocker');
    const output = options.json === true
      ? JSON.stringify(diagnosis, null, 2)
      : [`${diagnosis.healthy ? 'Healthy' : 'Needs attention'} · ${caseFile.caseName}`, ...diagnosis.findings.map((item) => `[${item.severity}] ${item.code}: ${item.message}`), `Next: ${diagnosis.summary.next.command}`].join('\n');
    return { output, exitCode: diagnosis.healthy ? 0 : 1, diagnosis };
  } else {
    throw new Error(`Unknown command: ${command}.\n\n${usage()}`);
  }

  const outputPath = await writeJson(requireOutput(options), caseFile, options.force === true);
  return { output: `Created ${outputPath}\n${compactStatus(caseFile)}`, exitCode: 0, caseFile, outputPath };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runWorkbenchCli().then((result) => {
    process.stdout.write(`${result.output}\n`);
    process.exitCode = result.exitCode;
  }).catch((error) => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
