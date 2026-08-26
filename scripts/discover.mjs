#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapLocalCompany } from './lib/map-local.mjs';
import { createWorkflow, syncWorkflow } from './lib/workflow.mjs';
import { renderHtmlReport as renderHtmlReportCore, renderMarkdownReport as renderMarkdownReportCore } from './lib/report.mjs';

export const CASE_SCHEMA_VERSION = '0.5.0';
export const SNAPSHOT_VERSION = '0.1.0';
const SUPPORTED_CASE_SCHEMA_VERSIONS = new Set(['0.2.0', '0.3.0', '0.4.0', CASE_SCHEMA_VERSION]);

const CAPABILITY_STATES = new Set(['available', 'partial', 'unavailable', 'unknown', 'not-requested']);
const COVERAGE_STATES = new Set(['complete', 'partial', 'sampled', 'unknown']);
const COLLECTION_METHODS = new Set(['native-read-only', 'connector-read-only', 'synced-folder', 'export', 'manual', 'unknown']);
const CONTENT_STATES = new Set(['available', 'partial', 'metadata-only', 'unavailable', 'not-requested']);
const CONCEPT_ROUND_STATES = new Set(['open', 'selected', 'superseded', 'rejected', 'deferred']);
const CONCEPT_ORIGINS = new Set(['model-proposed', 'architect-proposed']);

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
const UNTRUSTED_INSTRUCTION_RULES = [
  ['instruction-override', /\b(ignore|disregard|override)\b.{0,40}\b(previous|prior|system|developer|instructions?|rules?)\b/i],
  ['credential-request', /\b(reveal|show|send|copy|upload|return)\b.{0,40}\b(password|credential|secret|api key|access token|private key|system prompt)\b/i],
  ['tool-execution', /\b(run|execute|open|download|install|delete)\b.{0,30}\b(command|script|powershell|terminal|shell|attachment|link)\b/i],
];

function normaliseWords(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_./\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeId(value, fallback = 'source') {
  const result = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return result || fallback;
}

function uniqueId(preferred, used) {
  const base = safeId(preferred);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

function stringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function integerOrNull(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function matchLabels(value, rules) {
  const haystack = normaliseWords(value);
  return rules.filter(([, expression]) => expression.test(haystack)).map(([label]) => label);
}

function categoryFor(value) {
  const haystack = normaliseWords(value);
  return CATEGORY_RULES.find(([, expression]) => expression.test(haystack))?.[0] ?? 'Unclassified';
}

function weakName(name) {
  const base = path.basename(String(name), path.extname(String(name)));
  return /^(img|dsc|pxl|scan|document|untitled|new document|screenshot|image|file)[-_ ]?\d*$/i.test(base)
    || /^(copy of|new |untitled)/i.test(base)
    || base.length < 3;
}

function authorityKey(record) {
  const ext = path.extname(record.name);
  const base = path.basename(record.name, ext)
    .toLowerCase()
    .replace(/\b(final|approved|signed|confirmed|draft|working|review|wip|old|obsolete|superseded|archive|archived|copy)\b/g, ' ')
    .replace(/\b(v(?:er(?:sion)?)?\s*\d+(?:\.\d+)*)\b/g, ' ')
    .replace(/\b(19|20)\d{2}[-_. ]\d{1,2}[-_. ]\d{1,2}\b/g, ' ')
    .replace(/\(\d+\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const parent = record.parentLocator ?? path.dirname(record.locator);
  const parentKey = normaliseWords(parent).toLowerCase().split(' ').slice(-2).join(' ');
  return `${parentKey}::${base || path.basename(record.name, ext).toLowerCase()}`;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${label} must be an array of strings.`);
}

function validateConceptRound(round, index, references) {
  const label = `case.conceptRounds[${index}]`;
  assertObject(round, label);
  for (const key of ['id', 'createdAt', 'trigger', 'status', 'evidenceState']) assertNonEmptyString(round[key], `${label}.${key}`);
  if (!CONCEPT_ROUND_STATES.has(round.status)) throw new Error(`${label}.status has an invalid state.`);
  if (round.evidenceState !== 'model-proposed') throw new Error(`${label}.evidenceState must be model-proposed.`);
  if (typeof round.steer !== 'string') throw new Error(`${label}.steer must be a string.`);
  if (!Array.isArray(round.concepts) || !round.concepts.length) throw new Error(`${label}.concepts must contain at least one concept.`);
  const conceptIds = new Set();
  for (let conceptIndex = 0; conceptIndex < round.concepts.length; conceptIndex++) {
    const concept = round.concepts[conceptIndex];
    const conceptLabel = `${label}.concepts[${conceptIndex}]`;
    assertObject(concept, conceptLabel);
    for (const key of ['id', 'name', 'thesis', 'problem', 'peopleChange', 'smallestIntervention', 'distinctFromOthers', 'origin']) assertNonEmptyString(concept[key], `${conceptLabel}.${key}`);
    if (conceptIds.has(concept.id)) throw new Error(`${label} contains duplicate concept id ${concept.id}.`);
    conceptIds.add(concept.id);
    if (!CONCEPT_ORIGINS.has(concept.origin)) throw new Error(`${conceptLabel}.origin has an invalid state.`);
    assertObject(concept.evidence, `${conceptLabel}.evidence`);
    for (const key of ['observationIds', 'answerIds', 'recordIds']) assertStringArray(concept.evidence[key], `${conceptLabel}.evidence.${key}`);
    for (const [key, knownIds] of Object.entries(references)) {
      for (const referenceId of concept.evidence[key]) {
        if (!knownIds.has(referenceId)) throw new Error(`${conceptLabel}.evidence.${key} references unknown id ${referenceId}.`);
      }
    }
    for (const key of ['assumptions', 'dependencies', 'integrations', 'benefits', 'tradeOffs', 'killCriteria']) assertStringArray(concept[key], `${conceptLabel}.${key}`);
    for (const key of ['operatingBurden', 'costShape', 'lockIn', 'portability', 'reversibility']) {
      if (typeof concept[key] !== 'string') throw new Error(`${conceptLabel}.${key} must be a string.`);
    }
  }
  return conceptIds;
}

function validateSource(source) {
  assertObject(source, 'source');
  for (const key of ['id', 'platform', 'sourceFamily', 'displayName', 'scope', 'collectionMethod', 'collectedAt']) {
    if (typeof source[key] !== 'string' || !source[key].trim()) throw new Error(`source.${key} must be a non-empty string.`);
  }
  if (!COLLECTION_METHODS.has(source.collectionMethod)) throw new Error(`Unsupported collection method: ${source.collectionMethod}.`);
  assertObject(source.capabilities, 'source.capabilities');
  for (const key of ['enumeration', 'metadata', 'content', 'permissions', 'versions', 'stableIds', 'changeTracking']) {
    if (!CAPABILITY_STATES.has(source.capabilities[key])) throw new Error(`source.capabilities.${key} has an invalid state.`);
  }
  assertObject(source.coverage, 'source.coverage');
  if (!COVERAGE_STATES.has(source.coverage.status)) throw new Error('source.coverage.status has an invalid state.');
  if (!Array.isArray(source.coverage.notes) || !Array.isArray(source.coverage.warnings)) throw new Error('source.coverage notes and warnings must be arrays.');
}

export function validateSnapshot(snapshot) {
  assertObject(snapshot, 'snapshot');
  if (snapshot.snapshotVersion !== SNAPSHOT_VERSION) throw new Error(`snapshotVersion must be ${SNAPSHOT_VERSION}.`);
  validateSource(snapshot.source);
  if (!Array.isArray(snapshot.records)) throw new Error('snapshot.records must be an array.');
  snapshot.records.forEach((record, index) => {
    assertObject(record, `record ${index + 1}`);
    for (const key of ['name', 'locator', 'recordType', 'contentState']) {
      if (typeof record[key] !== 'string' || !record[key].trim()) throw new Error(`record ${index + 1}.${key} must be a non-empty string.`);
    }
    if (!CONTENT_STATES.has(record.contentState)) throw new Error(`record ${index + 1}.contentState has an invalid state.`);
    const permissionState = record.permissionState ?? 'unknown';
    if (!CAPABILITY_STATES.has(permissionState)) throw new Error(`record ${index + 1}.permissionState has an invalid state.`);
  });
  return { valid: true, kind: 'source-snapshot', sourceCount: 1, recordCount: snapshot.records.length };
}

function normaliseSource(source) {
  return {
    id: safeId(source.id),
    platform: source.platform.trim(),
    sourceFamily: source.sourceFamily.trim(),
    displayName: source.displayName.trim(),
    scope: source.scope.trim(),
    locator: stringOrNull(source.locator),
    collectionMethod: source.collectionMethod,
    collectedAt: source.collectedAt,
    capabilities: { ...source.capabilities },
    coverage: {
      status: source.coverage.status,
      notes: source.coverage.notes.map(String),
      warnings: source.coverage.warnings.map(String),
    },
  };
}

function normaliseRecord(record, sourceId, recordId) {
  const contentState = record.contentState;
  return {
    id: recordId,
    sourceId,
    externalId: stringOrNull(record.externalId),
    name: record.name.trim(),
    locator: record.locator.trim(),
    parentLocator: stringOrNull(record.parentLocator),
    recordType: record.recordType.trim(),
    mimeType: stringOrNull(record.mimeType),
    size: integerOrNull(record.size),
    createdAt: stringOrNull(record.createdAt),
    modifiedAt: stringOrNull(record.modifiedAt),
    version: stringOrNull(record.version),
    webUrl: stringOrNull(record.webUrl),
    localPath: stringOrNull(record.localPath),
    contentState,
    contentText: contentState === 'available' || contentState === 'partial' ? stringOrNull(record.contentText) : null,
    permissionState: record.permissionState ?? 'unknown',
    permissions: Array.isArray(record.permissions) ? record.permissions : [],
    checksum: stringOrNull(record.checksum),
    metadata: record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata) ? record.metadata : {},
    cues: {
      sensitivity: matchLabels(`${record.locator} ${record.name}`, SENSITIVITY_RULES),
      lifecycle: matchLabels(`${record.locator} ${record.name}`, LIFECYCLE_RULES),
      category: categoryFor(`${record.locator} ${record.name}`),
      weakName: weakName(record.name),
      untrustedInstruction: matchLabels(record.contentText ?? '', UNTRUSTED_INSTRUCTION_RULES),
    },
    evidenceState: 'source-fact',
  };
}

function makeObservation(index, severity, type, title, detail, recordIds, basis, evidenceState = 'deterministic-observation') {
  return {
    id: `observation-${String(index).padStart(3, '0')}`,
    severity,
    type,
    title,
    detail,
    recordIds,
    basis,
    evidenceState,
    reviewState: 'unreviewed',
  };
}

function deriveObservations(sources, records, structure = null, scanPolicy = null) {
  const observations = [];
  let index = 1;
  const incompleteSources = sources.filter((source) => source.coverage.status !== 'complete' || source.coverage.warnings.length);
  if (incompleteSources.length) {
    observations.push(makeObservation(
      index++, 'decision', 'coverage',
      `${incompleteSources.length} source scope${incompleteSources.length === 1 ? ' has' : 's have'} incomplete or unknown coverage`,
      'Absence claims and totals must be read inside these connector, export, sampling, or access boundaries.',
      [], 'Declared source capability and coverage states', 'source-derived',
    ));
  }

  const sensitive = records.filter((record) => record.cues.sensitivity.length);
  const sensitiveCount = structure?.totals?.sensitivityCueCount ?? sensitive.length;
  if (sensitiveCount) {
    observations.push(makeObservation(
      index++, 'decision', 'permissions',
      `${sensitiveCount} records carry likely sensitivity cues`,
      'The cues come from names and locators. Confirm the real access boundary before content analysis or model use.',
      sensitive.slice(0, 40).map((record) => record.id), 'Deterministic name and locator patterns',
    ));
  }

  if (structure?.segments?.length > 1) {
    const total = structure.totals?.enumeratedFileCount || 0;
    const dominant = [...structure.segments].sort((a, b) => b.fileCount - a.fileCount)[0];
    const ratio = total ? dominant.fileCount / total : 0;
    if (ratio >= 0.5) {
      observations.push(makeObservation(
        index++, 'review', 'structure',
        `“${dominant.name}” contains ${Math.round(ratio * 100)}% of the mapped records`,
        'A single source area dominates the company map. Analyse it as its own evidence slice so its volume does not hide smaller but consequential functions.',
        records.filter((record) => record.locator === dominant.locator || record.locator.startsWith(`${dominant.locator}${path.sep}`)).slice(0, 30).map((record) => record.id),
        'Top-level source-map file counts', 'source-derived',
      ));
    }
  }

  const families = new Map();
  for (const record of records) {
    if (!record.cues.lifecycle.some((cue) => ['approved', 'final', 'draft', 'superseded'].includes(cue))) continue;
    const key = authorityKey(record);
    const group = families.get(key) ?? [];
    group.push(record);
    families.set(key, group);
  }
  for (const group of families.values()) {
    if (group.length < 2) continue;
    const currentCount = group.filter((record) => record.cues.lifecycle.some((cue) => ['approved', 'final'].includes(cue))).length;
    if (currentCount < 2 && !group.some((record) => record.cues.lifecycle.includes('superseded'))) continue;
    observations.push(makeObservation(
      index++, 'decision', 'authority',
      `Competing authority cues around “${path.basename(group[0].name, path.extname(group[0].name))}”`,
      `${group.length} related records use final, approved, draft, or superseded language. Their names do not establish which one controls.`,
      group.map((record) => record.id), 'Normalised record family and lifecycle cues',
    ));
  }

  const checksumGroups = new Map();
  for (const record of records.filter((item) => item.checksum)) {
    const key = `${record.size ?? 'unknown'}:${record.checksum}`;
    const group = checksumGroups.get(key) ?? [];
    group.push(record);
    checksumGroups.set(key, group);
  }
  const duplicateGroups = [...checksumGroups.values()].filter((group) => group.length > 1);
  if (duplicateGroups.length) {
    const duplicateRecordCount = duplicateGroups.reduce((sum, group) => sum + group.length, 0);
    observations.push(makeObservation(
      index++, 'review', 'duplication',
      `${duplicateRecordCount} records form ${duplicateGroups.length} likely duplicate groups`,
      'Matching size and checksum indicate equivalent bytes, not equivalent authority, access, or operational purpose. Review the pattern as one issue rather than creating a question per group.',
      duplicateGroups.flatMap((group) => group.map((record) => record.id)).slice(0, 100), 'Checksum and byte size',
    ));
  }

  const weak = records.filter((record) => record.cues.weakName);
  const weakCount = structure?.totals?.weakNameCount ?? weak.length;
  if (weakCount) {
    observations.push(makeObservation(
      index++, weakCount > 20 ? 'review' : 'note', 'discoverability',
      `${weakCount} records have weakly descriptive names`,
      'Generic names increase dependence on folder context and the people who remember it.',
      weak.slice(0, 50).map((record) => record.id), 'Transparent record-name patterns',
    ));
  }

  const metadataOnly = records.filter((record) => ['metadata-only', 'unavailable', 'not-requested'].includes(record.contentState));
  if (metadataOnly.length) {
    const mappedCount = structure?.totals?.enumeratedFileCount ?? metadataOnly.length;
    observations.push(makeObservation(
      index++, 'note', 'coverage', `${mappedCount} mapped records do not contain readable body content in this case`,
      scanPolicy?.mode === 'hierarchical-company-map'
        ? 'The portable case contains a bounded evidence projection and the complete metadata remains in the local index. Content should be extracted only for a consequential source slice.'
        : 'Their metadata can support inventory and triage, but semantic absence claims require another route or human confirmation.',
      metadataOnly.slice(0, 40).map((record) => record.id), 'Declared record content states', 'source-derived',
    ));
  }
  const instructionLike = records.filter((record) => record.cues.untrustedInstruction?.length);
  if (instructionLike.length) {
    observations.push(makeObservation(
      index++, 'decision', 'content-safety',
      `${instructionLike.length} retained content records contain instruction-like text`,
      'Treat this text as untrusted evidence, not as permission or agent instructions. The cue may also occur in benign policy or training material and requires contextual review.',
      instructionLike.slice(0, 40).map((record) => record.id), 'Deterministic instruction-like text patterns',
    ));
  }
  return observations;
}

function deriveQuestions(observations) {
  const templates = {
    authority: 'Which source currently controls this decision, and who can supersede it?',
    permissions: 'Who may access these materials, and what must be excluded from wider analysis?',
    duplication: 'Are these copies operationally distinct, or are teams working from uncontrolled duplicates?',
    discoverability: 'Who can identify the business meaning of these records without opening them one by one?',
    coverage: 'What consequential evidence is missing or invisible through the current collection route?',
    structure: 'Should this dominant source area be analysed as one system, or split into separate operational domains?',
    'content-safety': 'Is this instruction-like content expected source material, and should it be isolated from model-assisted analysis?',
  };
  const seenTypes = new Set();
  return observations
    .filter((observation) => observation.severity !== 'note')
    .filter((observation) => {
      if (seenTypes.has(observation.type)) return false;
      seenTypes.add(observation.type);
      return true;
    })
    .slice(0, 8)
    .map((observation, index) => ({
      id: `question-${String(index + 1).padStart(3, '0')}`,
      title: templates[observation.type] ?? 'What needs human clarification before acting on this observation?',
      whyItMatters: observation.title,
      observationIds: [observation.id],
      recordIds: observation.recordIds,
      status: 'open',
      evidenceState: 'deterministic-observation',
    }));
}

function coverageSummary(sources, records, structure = null, scanPolicy = null) {
  const capabilityGaps = {};
  for (const key of ['enumeration', 'metadata', 'content', 'permissions', 'versions', 'stableIds', 'changeTracking']) {
    capabilityGaps[key] = sources.filter((source) => source.capabilities[key] !== 'available').map((source) => ({
      sourceId: source.id,
      state: source.capabilities[key],
    }));
  }
  return {
    sourceCount: sources.length,
    recordCount: records.length,
    enumeratedRecordCount: structure?.totals?.enumeratedFileCount ?? records.length,
    retainedEvidenceRecordCount: records.length,
    representationMode: scanPolicy?.mode ?? 'portable-source-snapshot',
    readableContentCount: records.filter((record) => ['available', 'partial'].includes(record.contentState)).length,
    metadataOnlyCount: records.filter((record) => ['metadata-only', 'unavailable', 'not-requested'].includes(record.contentState)).length,
    permissionMetadataCount: records.filter((record) => record.permissionState === 'available').length,
    partialPermissionContextCount: records.filter((record) => record.permissionState === 'partial').length,
    coverageStates: Object.fromEntries([...COVERAGE_STATES].map((state) => [state, sources.filter((source) => source.coverage.status === state).length])),
    capabilityGaps,
  };
}

export function emptyCase(caseName) {
  const now = new Date().toISOString();
  return {
    schemaVersion: CASE_SCHEMA_VERSION,
    caseId: `case-${Date.now()}`,
    caseName,
    createdAt: now,
    updatedAt: now,
    sources: [],
    records: [],
    observations: [],
    questions: [],
    answers: [],
    conceptRounds: [],
    conceptDecision: null,
    structure: null,
    scanPolicy: null,
    indexes: [],
    workflow: createWorkflow(now),
    thesis: {
      context: '',
      diagnosticView: '',
      recommendation: '',
      risks: '',
      nextActions: '',
      author: '',
      status: 'working',
      evidenceState: 'architect-conclusion',
    },
    coverage: {},
    provenance: {
      builder: `ai-architecture-discovery/${CASE_SCHEMA_VERSION}`,
      aiUsedForIngest: false,
      sourceSystemsModified: false,
      portable: true,
    },
  };
}

export function ingestSnapshot(snapshot, existingCase = null, options = {}) {
  validateSnapshot(snapshot);
  const result = existingCase ? structuredClone(existingCase) : emptyCase(options.caseName || snapshot.source.displayName);
  if (existingCase) validateCase(result);
  result.conceptRounds ??= [];
  result.conceptDecision ??= null;
  const previousObservations = new Map(result.observations.map((observation) => [`${observation.type}::${observation.title}`, observation]));
  const previousQuestions = new Map(result.questions.map((question) => [question.title, question]));

  const usedSourceIds = new Set(result.sources.map((source) => source.id));
  const source = normaliseSource(snapshot.source);
  if (usedSourceIds.has(source.id)) throw new Error(`The case already contains source id “${source.id}”. Use a distinct source id or preserve it as a later snapshot outside this merge.`);
  const sourceId = uniqueId(source.id, usedSourceIds);
  source.id = sourceId;

  const usedRecordIds = new Set(result.records.map((record) => record.id));
  const records = [...snapshot.records]
    .sort((a, b) => a.locator.localeCompare(b.locator))
    .map((record, index) => {
      const preferred = record.externalId ? `${sourceId}-${record.externalId}` : `${sourceId}-${String(index + 1).padStart(5, '0')}`;
      return normaliseRecord(record, sourceId, uniqueId(preferred, usedRecordIds));
    });

  result.sources.push(source);
  result.records.push(...records);
  if (snapshot.structure) {
    const incomingSegments = snapshot.structure.segments.map((segment) => ({ ...segment, sourceId }));
    const priorSegments = result.structure?.segments ?? [];
    result.structure = {
      level: snapshot.structure.level,
      totals: {
        enumeratedFileCount: (result.structure?.totals?.enumeratedFileCount ?? 0) + snapshot.structure.totals.enumeratedFileCount,
        folderCount: (result.structure?.totals?.folderCount ?? 0) + snapshot.structure.totals.folderCount,
        totalBytes: (result.structure?.totals?.totalBytes ?? 0) + snapshot.structure.totals.totalBytes,
        sensitivityCueCount: (result.structure?.totals?.sensitivityCueCount ?? 0) + snapshot.structure.totals.sensitivityCueCount,
        weakNameCount: (result.structure?.totals?.weakNameCount ?? 0) + snapshot.structure.totals.weakNameCount,
      },
      segments: [...priorSegments, ...incomingSegments],
    };
    result.scanPolicy = snapshot.scanPolicy ?? result.scanPolicy;
    result.indexes = [...(result.indexes ?? []), ...(snapshot.indexes ?? []).map((item) => ({ ...item, sourceId }))];
  }
  result.schemaVersion = CASE_SCHEMA_VERSION;
  result.observations = deriveObservations(result.sources, result.records, result.structure, result.scanPolicy).map((observation) => ({
    ...observation,
    reviewState: previousObservations.get(`${observation.type}::${observation.title}`)?.reviewState ?? observation.reviewState,
  }));
  const derivedQuestions = deriveQuestions(result.observations).map((question) => {
    const previous = previousQuestions.get(question.title);
    return previous ? { ...question, id: previous.id, status: previous.status ?? question.status } : question;
  });
  const retainedQuestions = result.questions.filter((question) => question.evidenceState !== 'deterministic-observation');
  result.questions = [...derivedQuestions, ...retainedQuestions];
  result.coverage = coverageSummary(result.sources, result.records, result.structure, result.scanPolicy);
  result.updatedAt = new Date().toISOString();
  syncWorkflow(result, {
    type: 'source-ingested',
    stage: 'ingest',
    actor: 'system',
    detail: `${source.displayName} ingested through ${source.collectionMethod}.`,
    references: [source.id],
  }, result.updatedAt);
  return result;
}

export function validateCase(caseFile) {
  assertObject(caseFile, 'case');
  if (!SUPPORTED_CASE_SCHEMA_VERSIONS.has(caseFile.schemaVersion)) throw new Error(`schemaVersion must be one of: ${[...SUPPORTED_CASE_SCHEMA_VERSIONS].join(', ')}.`);
  for (const key of ['caseId', 'caseName', 'createdAt', 'updatedAt']) {
    if (typeof caseFile[key] !== 'string' || !caseFile[key].trim()) throw new Error(`case.${key} must be a non-empty string.`);
  }
  for (const key of ['sources', 'records', 'observations', 'questions', 'answers']) {
    if (!Array.isArray(caseFile[key])) throw new Error(`case.${key} must be an array.`);
  }
  if (caseFile.conceptRounds != null && !Array.isArray(caseFile.conceptRounds)) throw new Error('case.conceptRounds must be an array when present.');
  if (caseFile.conceptDecision != null) assertObject(caseFile.conceptDecision, 'case.conceptDecision');
  if (caseFile.schemaVersion === CASE_SCHEMA_VERSION && caseFile.workflow == null) throw new Error('case.workflow is required for schema 0.5.0.');
  if (caseFile.workflow != null) {
    assertObject(caseFile.workflow, 'case.workflow');
    for (const key of ['version', 'status', 'currentStage', 'updatedAt']) assertNonEmptyString(caseFile.workflow[key], `case.workflow.${key}`);
    assertObject(caseFile.workflow.stages, 'case.workflow.stages');
    if (!Array.isArray(caseFile.workflow.events)) throw new Error('case.workflow.events must be an array.');
  }
  assertObject(caseFile.thesis, 'case.thesis');
  assertObject(caseFile.coverage, 'case.coverage');
  assertObject(caseFile.provenance, 'case.provenance');
  const sourceIds = new Set();
  for (const source of caseFile.sources) {
    validateSource(source);
    if (sourceIds.has(source.id)) throw new Error(`Duplicate source id: ${source.id}.`);
    sourceIds.add(source.id);
  }
  const recordIds = new Set();
  for (const record of caseFile.records) {
    if (!sourceIds.has(record.sourceId)) throw new Error(`Record ${record.id} references unknown source ${record.sourceId}.`);
    if (recordIds.has(record.id)) throw new Error(`Duplicate record id: ${record.id}.`);
    recordIds.add(record.id);
  }
  for (const observation of caseFile.observations) {
    for (const recordId of observation.recordIds ?? []) {
      if (!recordIds.has(recordId)) throw new Error(`Observation ${observation.id} references unknown record ${recordId}.`);
    }
  }
  const observationIds = new Set(caseFile.observations.map((observation) => observation.id).filter(Boolean));
  const answerIds = new Set(caseFile.answers.map((answer) => answer.id).filter(Boolean));
  const conceptIds = new Set();
  for (let index = 0; index < (caseFile.conceptRounds ?? []).length; index++) {
    for (const conceptId of validateConceptRound(caseFile.conceptRounds[index], index, {
      observationIds,
      answerIds,
      recordIds,
    })) {
      if (conceptIds.has(conceptId)) throw new Error(`Duplicate concept id across rounds: ${conceptId}.`);
      conceptIds.add(conceptId);
    }
  }
  if (caseFile.conceptDecision?.selectedConceptIds != null) {
    assertStringArray(caseFile.conceptDecision.selectedConceptIds, 'case.conceptDecision.selectedConceptIds');
    for (const conceptId of caseFile.conceptDecision.selectedConceptIds) {
      if (!conceptIds.has(conceptId)) throw new Error(`case.conceptDecision references unknown concept ${conceptId}.`);
    }
  }
  return { valid: true, kind: 'portable-case', sourceCount: caseFile.sources.length, recordCount: caseFile.records.length };
}

export async function scanLocalSource(rootInput, options = {}) {
  if (!COLLECTION_METHODS.has(String(options.collectionMethod || 'native-read-only'))) {
    throw new Error(`Unsupported collection method: ${options.collectionMethod}.`);
  }
  return mapLocalCompany(rootInput, options);
}

export function renderMarkdownReport(caseFile) {
  return renderMarkdownReportCore(caseFile, validateCase);
}

export function renderHtmlReport(caseFile) {
  return renderHtmlReportCore(caseFile, validateCase);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const options = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) options[key] = true;
    else {
      options[key] = next;
      index++;
    }
  }
  return { command, positional, options };
}

async function fileExists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

async function writeOutput(filePath, content, force) {
  const resolved = path.resolve(filePath);
  if (!force && await fileExists(resolved)) throw new Error(`Refusing to overwrite existing output: ${resolved}. Use --force to replace it.`);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, content, 'utf8');
  return resolved;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
}

function usage() {
  return `AI Architecture Discovery\n\n` +
    `  scan-local <folder> --out <case.json> [--index <evidence.sqlite>] [--platform onedrive] [--collection synced-folder] [--include-text]\n` +
    `  ingest-snapshot <snapshot.json> --out <case.json> [--case <existing.json>]\n` +
    `  validate <snapshot-or-case.json>\n` +
    `  report <case.json> --out-dir <directory>\n\n` +
    `Outputs are not overwritten unless --force is supplied.`;
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, positional, options } = parseArgs(argv);
  if (!command || ['help', '--help', '-h'].includes(command)) return { output: usage(), exitCode: 0 };

  if (command === 'scan-local') {
    if (!positional[0] || typeof options.out !== 'string') throw new Error('scan-local requires <folder> and --out <case.json>.');
    const rootPath = path.resolve(positional[0]);
    const outputPathCandidate = path.resolve(options.out);
    const outputRelative = path.relative(rootPath, outputPathCandidate);
    if (outputRelative === '' || (!outputRelative.startsWith('..') && !path.isAbsolute(outputRelative))) {
      throw new Error('The generated case must be written outside the authorised source root.');
    }
    if (!options.force && await fileExists(outputPathCandidate)) throw new Error(`Refusing to overwrite existing output: ${outputPathCandidate}. Use --force to replace it.`);
    const parsedOutput = path.parse(outputPathCandidate);
    const indexPath = typeof options.index === 'string' ? path.resolve(options.index) : path.join(parsedOutput.dir, `${parsedOutput.name}.evidence.sqlite`);
    if (!options.force && await fileExists(indexPath)) throw new Error(`Refusing to overwrite existing evidence index: ${indexPath}. Use --force to replace it.`);
    const snapshot = await scanLocalSource(positional[0], {
      platform: options.platform,
      collectionMethod: options.collection,
      sourceId: options['source-id'],
      displayName: options['source-name'],
      includeText: options['include-text'] === true,
      includeHidden: options['include-hidden'] === true,
      maxFiles: options['max-files'],
      portableRecordLimit: options['portable-record-limit'],
      representativePerSegment: options['representative-per-segment'],
      consequentialPerSegment: options['consequential-per-segment'],
      indexPath,
      force: options.force === true,
    });
    const caseFile = ingestSnapshot(snapshot, null, { caseName: options['case-name'] });
    const outputPath = await writeOutput(options.out, `${JSON.stringify(caseFile, null, 2)}\n`, options.force === true);
    return { output: `Created ${outputPath}\nCreated ${indexPath}\nMapped ${caseFile.coverage.enumeratedRecordCount.toLocaleString()} records; retained ${caseFile.coverage.retainedEvidenceRecordCount.toLocaleString()} portable evidence records across ${caseFile.structure?.segments?.length ?? 0} top-level source areas.`, exitCode: 0, caseFile };
  }

  if (command === 'ingest-snapshot') {
    if (!positional[0] || typeof options.out !== 'string') throw new Error('ingest-snapshot requires <snapshot.json> and --out <case.json>.');
    const snapshot = await readJson(positional[0]);
    const existing = typeof options.case === 'string' ? await readJson(options.case) : null;
    const caseFile = ingestSnapshot(snapshot, existing, { caseName: options['case-name'] });
    const outputPath = await writeOutput(options.out, `${JSON.stringify(caseFile, null, 2)}\n`, options.force === true);
    return { output: `Created ${outputPath}\n${caseFile.coverage.recordCount} records from ${caseFile.coverage.sourceCount} sources.`, exitCode: 0, caseFile };
  }

  if (command === 'validate') {
    if (!positional[0]) throw new Error('validate requires <snapshot-or-case.json>.');
    const value = await readJson(positional[0]);
    const result = value.snapshotVersion ? validateSnapshot(value) : validateCase(value);
    return { output: `Valid ${result.kind}: ${result.sourceCount} source(s), ${result.recordCount} record(s).`, exitCode: 0, result };
  }

  if (command === 'report') {
    if (!positional[0] || typeof options['out-dir'] !== 'string') throw new Error('report requires <case.json> and --out-dir <directory>.');
    const caseFile = await readJson(positional[0]);
    validateCase(caseFile);
    const base = safeId(caseFile.caseName, 'discovery-report');
    const outputDirectory = path.resolve(options['out-dir']);
    const markdownPath = await writeOutput(path.join(outputDirectory, `${base}.md`), renderMarkdownReport(caseFile), options.force === true);
    const htmlPath = await writeOutput(path.join(outputDirectory, `${base}.html`), renderHtmlReport(caseFile), options.force === true);
    return { output: `Created ${markdownPath}\nCreated ${htmlPath}`, exitCode: 0, paths: [markdownPath, htmlPath] };
  }

  throw new Error(`Unknown command: ${command}.\n\n${usage()}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runCli()
    .then((result) => {
      process.stdout.write(`${result.output}\n`);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
