export const WORKFLOW_VERSION = '0.1.0';
export const WORKFLOW_STAGES = ['ingest', 'analyse', 'clarify', 'report'];

const REVIEW_STATES = new Set(['acknowledged', 'contested', 'carried-forward', 'dismissed']);
const THESIS_FIELDS = ['diagnosticView', 'recommendation', 'risks', 'nextActions'];

function nowIso(value) {
  return value ?? new Date().toISOString();
}

function eventId(workflow) {
  return `event-${String((workflow.events?.length ?? 0) + 1).padStart(4, '0')}`;
}

function stageState(caseFile) {
  const hasSources = caseFile.sources.length > 0;
  const reviewable = caseFile.observations.filter((item) => ['decision', 'review'].includes(item.severity));
  const unreviewed = reviewable.filter((item) => !item.reviewState || item.reviewState === 'unreviewed');
  const openQuestions = caseFile.questions.filter((item) => item.status === 'open');
  const thesisStarted = THESIS_FIELDS.some((field) => String(caseFile.thesis?.[field] ?? '').trim());
  const thesisFinal = caseFile.thesis?.status === 'final';

  return {
    ingest: hasSources ? 'complete' : 'ready',
    analyse: !hasSources ? 'locked' : unreviewed.length ? 'in-progress' : 'complete',
    clarify: !hasSources || unreviewed.length ? 'locked' : openQuestions.length ? 'in-progress' : 'complete',
    report: openQuestions.length ? 'blocked' : thesisFinal ? 'complete' : thesisStarted ? 'in-progress' : 'ready',
    metrics: {
      sourceCount: caseFile.sources.length,
      recordCount: caseFile.coverage?.enumeratedRecordCount ?? caseFile.records.length,
      observationCount: caseFile.observations.length,
      reviewableObservationCount: reviewable.length,
      unreviewedObservationCount: unreviewed.length,
      openQuestionCount: openQuestions.length,
      answerCount: caseFile.answers.length,
      thesisStarted,
      thesisFinal,
    },
  };
}

function currentStage(stages) {
  return WORKFLOW_STAGES.find((stage) => stages[stage] !== 'complete') ?? 'report';
}

export function createWorkflow(at = null) {
  const timestamp = nowIso(at);
  return {
    version: WORKFLOW_VERSION,
    status: 'active',
    currentStage: 'ingest',
    updatedAt: timestamp,
    stages: Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage, { status: stage === 'ingest' ? 'ready' : 'locked', updatedAt: timestamp }])),
    events: [{ id: 'event-0001', type: 'case-started', stage: 'ingest', at: timestamp, actor: 'system', detail: 'Portable discovery case created.' }],
  };
}

export function workflowSummary(caseFile) {
  const states = stageState(caseFile);
  const stage = currentStage(states);
  const next = nextAction(caseFile, states);
  return {
    status: caseFile.workflow?.status ?? 'active',
    currentStage: stage,
    stages: Object.fromEntries(WORKFLOW_STAGES.map((name) => [name, states[name]])),
    metrics: states.metrics,
    next,
  };
}

export function syncWorkflow(caseFile, event = null, at = null) {
  const timestamp = nowIso(at);
  caseFile.workflow ??= createWorkflow(caseFile.createdAt ?? timestamp);
  caseFile.workflow.version = WORKFLOW_VERSION;
  caseFile.workflow.events ??= [];
  const summary = workflowSummary(caseFile);
  caseFile.workflow.currentStage = summary.currentStage;
  caseFile.workflow.status = summary.stages.report === 'complete' ? 'complete' : 'active';
  caseFile.workflow.updatedAt = timestamp;
  caseFile.workflow.stages = Object.fromEntries(WORKFLOW_STAGES.map((stage) => [stage, {
    status: summary.stages[stage],
    updatedAt: caseFile.workflow.stages?.[stage]?.status === summary.stages[stage]
      ? caseFile.workflow.stages[stage].updatedAt
      : timestamp,
  }]));
  if (event) {
    caseFile.workflow.events.push({
      id: eventId(caseFile.workflow),
      type: event.type,
      stage: event.stage ?? summary.currentStage,
      at: timestamp,
      actor: event.actor ?? 'architect',
      detail: event.detail ?? '',
      references: event.references ?? [],
    });
  }
  caseFile.updatedAt = timestamp;
  return caseFile;
}

export function nextAction(caseFile, suppliedStates = null) {
  const states = suppliedStates ?? stageState(caseFile);
  if (!caseFile.sources.length) return { command: 'scan-local or ingest-snapshot', reason: 'No authorised source has been ingested.' };
  const unreviewed = caseFile.observations.find((item) => ['decision', 'review'].includes(item.severity) && (!item.reviewState || item.reviewState === 'unreviewed'));
  if (unreviewed) return { command: `review --observation ${unreviewed.id}`, reason: unreviewed.title };
  const openQuestion = caseFile.questions.find((item) => item.status === 'open');
  if (openQuestion) return { command: `answer --question ${openQuestion.id}`, reason: openQuestion.title };
  if (states.report === 'complete') return { command: 'report', reason: 'The thesis is final; regenerate the portable briefing when needed.' };
  if (caseFile.conceptRounds?.length && !caseFile.conceptDecision) return { command: 'record concept decision', reason: 'A concept round exists without an architect decision.' };
  return { command: 'thesis', reason: 'Clarification is complete; author or finalise the architect thesis.' };
}

export function reviewObservation(caseFile, observationId, reviewState, note = '', actor = 'architect', at = null) {
  if (!REVIEW_STATES.has(reviewState)) throw new Error(`Review state must be one of: ${[...REVIEW_STATES].join(', ')}.`);
  const observation = caseFile.observations.find((item) => item.id === observationId);
  if (!observation) throw new Error(`Unknown observation id: ${observationId}.`);
  observation.reviewState = reviewState;
  observation.reviewNote = String(note ?? '').trim();
  observation.reviewedBy = actor;
  observation.reviewedAt = nowIso(at);
  return syncWorkflow(caseFile, {
    type: 'observation-reviewed', stage: 'analyse', actor,
    detail: `${observationId} marked ${reviewState}.`, references: [observationId],
  }, observation.reviewedAt);
}

export function recordAnswer(caseFile, { questionId, answer, answeredBy, answeredAt = null }) {
  const question = caseFile.questions.find((item) => item.id === questionId);
  if (!question) throw new Error(`Unknown question id: ${questionId}.`);
  if (!String(answer ?? '').trim()) throw new Error('Answer text is required.');
  if (!String(answeredBy ?? '').trim()) throw new Error('An attributed person or role is required.');
  const timestamp = nowIso(answeredAt);
  const usedAnswerIds = new Set(caseFile.answers.map((item) => item.id).filter(Boolean));
  let answerNumber = caseFile.answers.length + 1;
  while (usedAnswerIds.has(`answer-${String(answerNumber).padStart(3, '0')}`)) answerNumber++;
  const id = `answer-${String(answerNumber).padStart(3, '0')}`;
  caseFile.answers.push({
    id,
    questionId,
    questionTitle: question.title,
    answer: String(answer).trim(),
    answeredBy: String(answeredBy).trim(),
    answeredAt: timestamp,
    evidenceState: 'human-verified',
  });
  question.status = 'answered';
  question.resolvedByAnswerId = id;
  return syncWorkflow(caseFile, {
    type: 'question-answered', stage: 'clarify', actor: String(answeredBy).trim(),
    detail: `${questionId} answered and attributed.`, references: [questionId, id],
  }, timestamp);
}

export function deferQuestion(caseFile, { questionId, reason, actor = 'architect', at = null }) {
  const question = caseFile.questions.find((item) => item.id === questionId);
  if (!question) throw new Error(`Unknown question id: ${questionId}.`);
  if (!String(reason ?? '').trim()) throw new Error('A deferral reason is required.');
  question.status = 'deferred';
  question.deferralReason = String(reason).trim();
  question.deferredBy = actor;
  question.deferredAt = nowIso(at);
  return syncWorkflow(caseFile, {
    type: 'question-deferred', stage: 'clarify', actor,
    detail: `${questionId} carried into the report: ${question.deferralReason}`, references: [questionId],
  }, question.deferredAt);
}

export function applyThesis(caseFile, thesis, actor = null, at = null) {
  if (!thesis || typeof thesis !== 'object' || Array.isArray(thesis)) throw new Error('Thesis input must be an object.');
  for (const field of THESIS_FIELDS) {
    if (field in thesis && typeof thesis[field] !== 'string') throw new Error(`thesis.${field} must be a string.`);
  }
  const status = thesis.status ?? caseFile.thesis.status ?? 'working';
  if (!['working', 'final'].includes(status)) throw new Error('thesis.status must be working or final.');
  if (status === 'final' && caseFile.questions.some((question) => question.status === 'open')) {
    throw new Error('A final thesis cannot bypass open consequential questions. Answer or explicitly defer them first.');
  }
  const author = String(actor ?? thesis.author ?? caseFile.thesis.author ?? '').trim();
  if (status === 'final' && !author) throw new Error('A final thesis requires an attributed architect.');
  if (status === 'final') {
    const missing = THESIS_FIELDS.filter((field) => !String(thesis[field] ?? caseFile.thesis[field] ?? '').trim());
    if (missing.length) throw new Error(`A final thesis is missing: ${missing.join(', ')}.`);
  }
  caseFile.thesis = {
    ...caseFile.thesis,
    ...Object.fromEntries(THESIS_FIELDS.filter((field) => field in thesis).map((field) => [field, thesis[field].trim()])),
    author,
    status,
    evidenceState: 'architect-conclusion',
  };
  const timestamp = nowIso(at);
  return syncWorkflow(caseFile, {
    type: status === 'final' ? 'thesis-finalised' : 'thesis-updated', stage: 'report', actor: author || 'architect',
    detail: status === 'final' ? 'Architect thesis marked final.' : 'Architect thesis updated.',
  }, timestamp);
}

export function inspectCase(caseFile) {
  const findings = [];
  const summary = workflowSummary(caseFile);
  if (!caseFile.workflow) findings.push({ severity: 'repair', code: 'WORKFLOW_MISSING', message: 'Run migrate to add resumable workflow state.' });
  if (!caseFile.sources.length) findings.push({ severity: 'blocker', code: 'NO_SOURCES', message: 'No authorised source has been ingested.' });
  for (const source of caseFile.sources) {
    if (source.coverage.status !== 'complete') findings.push({ severity: 'warning', code: 'LIMITED_COVERAGE', message: `${source.displayName} coverage is ${source.coverage.status}.`, sourceId: source.id });
    if (source.coverage.warnings.length) findings.push({ severity: 'warning', code: 'SOURCE_WARNING', message: source.coverage.warnings.join('; '), sourceId: source.id });
  }
  if (summary.metrics.unreviewedObservationCount) findings.push({ severity: 'action', code: 'UNREVIEWED_OBSERVATIONS', message: `${summary.metrics.unreviewedObservationCount} consequential observations need architect review.` });
  if (summary.metrics.openQuestionCount) findings.push({ severity: 'action', code: 'OPEN_QUESTIONS', message: `${summary.metrics.openQuestionCount} consequential questions remain open.` });
  if (caseFile.thesis.status === 'final' && summary.metrics.openQuestionCount) findings.push({ severity: 'blocker', code: 'FINAL_WITH_OPEN_QUESTIONS', message: 'A final thesis cannot silently bypass open consequential questions.' });
  for (const answer of caseFile.answers) {
    if (!caseFile.questions.some((question) => question.id === answer.questionId)) findings.push({ severity: 'repair', code: 'ORPHAN_ANSWER', message: `${answer.id ?? 'An answer'} references missing question ${answer.questionId}.` });
  }
  return { healthy: !findings.some((item) => ['blocker', 'repair'].includes(item.severity)), summary, findings };
}
