import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('trigger evaluation set contains balanced, unique, actionable cases', async () => {
  const cases = JSON.parse(await readFile(path.join(root, 'evals', 'trigger-cases.json'), 'utf8'));
  assert.ok(cases.length >= 10);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.ok(cases.filter((item) => item.shouldTrigger).length >= 5);
  assert.ok(cases.filter((item) => !item.shouldTrigger).length >= 5);
  assert.ok(cases.every((item) => typeof item.prompt === 'string' && item.prompt.length >= 30));
});

test('forward scenarios state observable invariants rather than target wording', async () => {
  const scenarios = JSON.parse(await readFile(path.join(root, 'evals', 'scenarios.json'), 'utf8'));
  assert.ok(scenarios.length >= 6);
  assert.ok(scenarios.every((item) => item.invariants.length >= 4));
  assert.ok(scenarios.flatMap((item) => item.invariants).every((item) => !item.startsWith('says ')));
});
