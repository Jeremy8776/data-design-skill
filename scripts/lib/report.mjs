import { workflowSummary } from './workflow.mjs';

function markdownEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index++) {
    amount /= 1024;
    unit = units[index];
  }
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${unit}`;
}

function thesisText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '_Not yet authored._';
}

export function renderMarkdownReport(caseFile, validateCase) {
  validateCase(caseFile);
  const enumeratedCount = caseFile.coverage.enumeratedRecordCount ?? caseFile.coverage.recordCount;
  const retainedCount = caseFile.coverage.retainedEvidenceRecordCount ?? caseFile.coverage.recordCount;
  const lines = [
    `# ${caseFile.caseName}`,
    '',
    `Generated from portable case \`${caseFile.caseId}\` at ${new Date().toISOString()}.`,
    '',
    '**Discovery path:** Ingest -> Analyse -> Clarifying questions -> Report',
    '',
    '## Architect thesis',
    '',
    thesisText(caseFile.thesis.diagnosticView),
    '',
    '### Recommendation',
    '',
    thesisText(caseFile.thesis.recommendation),
    '',
    '### Risks',
    '',
    thesisText(caseFile.thesis.risks),
    '',
    '### Next actions',
    '',
    thesisText(caseFile.thesis.nextActions),
    '',
    '## Coverage boundary',
    '',
    `${caseFile.coverage.sourceCount} source scopes contain ${enumeratedCount.toLocaleString()} mapped records. The portable case retains ${retainedCount.toLocaleString()} evidence records in ${caseFile.coverage.representationMode ?? 'portable-source-snapshot'} mode. ${caseFile.coverage.readableContentCount} retained records contain readable or partial text.`,
    '',
    '| Source | Platform | Method | Coverage | Content | Permissions | Versions |',
    '|---|---|---|---|---|---|---|',
    ...caseFile.sources.map((source) => `| ${markdownEscape(source.displayName)} | ${markdownEscape(source.platform)} | ${source.collectionMethod} | ${source.coverage.status} | ${source.capabilities.content} | ${source.capabilities.permissions} | ${source.capabilities.versions} |`),
    '',
    '## Company source map',
    '',
  ];
  if (caseFile.structure?.segments?.length) {
    lines.push('| Source area | Files mapped | Folders | Size | Retained evidence |', '|---|---:|---:|---:|---:|');
    for (const segment of [...caseFile.structure.segments].sort((a, b) => b.fileCount - a.fileCount)) {
      lines.push(`| ${markdownEscape(segment.name)} | ${segment.fileCount.toLocaleString()} | ${segment.folderCount.toLocaleString()} | ${formatBytes(segment.totalBytes)} | ${segment.retainedEvidenceCount.toLocaleString()} |`);
    }
    lines.push('');
  } else {
    lines.push('_No hierarchical source map is attached to this case._', '');
  }
  lines.push('## Consequential observations', '');
  if (!caseFile.observations.length) lines.push('_No observations have been produced._', '');
  for (const observation of caseFile.observations) {
    lines.push(`### ${observation.title}`, '', `**State:** ${observation.evidenceState}  `, `**Basis:** ${observation.basis}  `, `**Records:** ${observation.recordIds.length ? observation.recordIds.map((id) => `\`${id}\``).join(', ') : 'Coverage declaration'}`, '', observation.detail, '');
  }
  lines.push('## Clarifying questions', '', '### Open questions', '');
  if (!caseFile.questions.length) lines.push('_No questions are open._', '');
  for (const question of caseFile.questions) {
    lines.push(`- **${question.title}** ${question.whyItMatters} (${question.status})`);
  }
  lines.push('', '### Human-verified answers', '');
  if (!caseFile.answers.length) lines.push('_No human answer has been recorded._', '');
  for (const answer of caseFile.answers) {
    lines.push(`### ${markdownEscape(answer.questionTitle || answer.questionId || 'Attributed answer')}`, '', answer.answer || '_No answer text recorded._', '', `**Answered by:** ${markdownEscape(answer.answeredBy || 'Unattributed')}  `, `**Answered at:** ${markdownEscape(answer.answeredAt || 'Not recorded')}  `, `**State:** ${markdownEscape(answer.evidenceState || 'human-verified')}`, '');
  }
  lines.push('## Concept round', '');
  const latestConceptRound = caseFile.conceptRounds?.at(-1);
  if (!latestConceptRound) {
    lines.push('_No concept round has been drafted._', '');
  } else {
    lines.push(`**Round:** ${markdownEscape(latestConceptRound.id)}  `, `**Status:** ${markdownEscape(latestConceptRound.status)}  `, `**Steer:** ${markdownEscape(latestConceptRound.steer || 'None')}`, '');
    for (const concept of latestConceptRound.concepts) {
      const evidenceIds = [...concept.evidence.observationIds, ...concept.evidence.answerIds, ...concept.evidence.recordIds];
      lines.push(`### ${markdownEscape(concept.name)}`, '', concept.thesis, '', `**Smallest intervention:** ${markdownEscape(concept.smallestIntervention)}  `, `**People change:** ${markdownEscape(concept.peopleChange)}  `, `**Operating burden:** ${markdownEscape(concept.operatingBurden || 'Not established')}  `, `**Cost shape:** ${markdownEscape(concept.costShape || 'Not established')}  `, `**Lock-in:** ${markdownEscape(concept.lockIn || 'Not established')}  `, `**Portability:** ${markdownEscape(concept.portability || 'Not established')}  `, `**Reversibility:** ${markdownEscape(concept.reversibility || 'Not established')}`, '', `**Evidence:** ${evidenceIds.length ? evidenceIds.map((id) => `\`${id}\``).join(', ') : 'No evidence linked'}`, '', `**Assumptions:** ${concept.assumptions.length ? concept.assumptions.map(markdownEscape).join('; ') : 'None recorded'}  `, `**Trade-offs:** ${concept.tradeOffs.length ? concept.tradeOffs.map(markdownEscape).join('; ') : 'None recorded'}  `, `**Kill criteria:** ${concept.killCriteria.length ? concept.killCriteria.map(markdownEscape).join('; ') : 'None recorded'}`, '');
    }
    if (caseFile.conceptDecision) lines.push(`**Architect decision:** ${markdownEscape(caseFile.conceptDecision.status || 'working')} — ${markdownEscape(caseFile.conceptDecision.rationale || 'No rationale recorded.')}`, '');
  }
  lines.push('## Source provenance', '', '| Source ID | Scope | Collected | Warnings |', '|---|---|---|---|');
  for (const source of caseFile.sources) {
    lines.push(`| \`${source.id}\` | ${markdownEscape(source.scope)} | ${source.collectedAt} | ${source.coverage.warnings.length ? markdownEscape(source.coverage.warnings.join('; ')) : 'None recorded'} |`);
  }
  lines.push('', '> AI may propose. Humans certify. The architect owns the thesis. Source-system permissions remain authoritative.', '');
  return lines.join('\n');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function paragraphHtml(value) {
  const content = thesisText(value);
  return `<p>${escapeHtml(content)}</p>`;
}

export function renderHtmlReport(caseFile, validateCase) {
  validateCase(caseFile);
  const workflow = workflowSummary(caseFile);
  const enumeratedCount = caseFile.coverage.enumeratedRecordCount ?? caseFile.coverage.recordCount;
  const retainedCount = caseFile.coverage.retainedEvidenceRecordCount ?? caseFile.coverage.recordCount;
  const sourceRows = caseFile.sources.map((source) => `
          <tr><th scope="row">${escapeHtml(source.displayName)}</th><td>${escapeHtml(source.platform)}</td><td>${escapeHtml(source.collectionMethod)}</td><td><span class="state">${escapeHtml(source.coverage.status)}</span></td><td>${escapeHtml(source.capabilities.content)}</td><td>${escapeHtml(source.capabilities.permissions)}</td><td>${escapeHtml(source.capabilities.versions)}</td></tr>`).join('');
  const observations = caseFile.observations.length ? caseFile.observations.map((observation) => `
        <article class="observation" data-observation data-severity="${escapeHtml(observation.severity)}">
          <div class="observation-meta"><span class="severity ${escapeHtml(observation.severity)}">${escapeHtml(observation.severity)}</span><span class="evidence-state">${escapeHtml(observation.evidenceState)}</span><span>${observation.recordIds.length.toLocaleString()} evidence links</span></div>
          <h3>${escapeHtml(observation.title)}</h3>
          <p>${escapeHtml(observation.detail)}</p>
          <details><summary>Evidence and basis</summary><p>${escapeHtml(observation.basis)}</p><p class="mono">${escapeHtml(observation.recordIds.join(', ') || 'Coverage declaration')}</p></details>
        </article>`).join('') : '<p class="empty">No observations have been produced.</p>';
  const questions = caseFile.questions.length ? caseFile.questions.map((question, index) => `
        <article class="question-panel" data-question-panel data-index="${index}"${index === 0 ? '' : ' hidden'}>
          <p class="question-reason">Why this matters · ${escapeHtml(question.whyItMatters)}</p>
          <h3>${escapeHtml(question.title)}</h3>
          <div class="question-actions"><button type="button" class="button secondary" data-copy-question="${escapeHtml(question.title)}">Copy question</button><span class="state">${escapeHtml(question.status)}</span></div>
          <details><summary>Linked evidence</summary><p class="mono">${escapeHtml([...question.observationIds, ...question.recordIds].join(', ') || 'No linked evidence')}</p></details>
        </article>`).join('') : '<p class="empty">No clarifying questions are open.</p>';
  const answers = caseFile.answers.length ? caseFile.answers.map((answer) => `<article class="observation"><div><span class="evidence-state">${escapeHtml(answer.evidenceState || 'human-verified')}</span></div><h3>${escapeHtml(answer.questionTitle || answer.questionId || 'Attributed answer')}</h3><p>${escapeHtml(answer.answer || 'No answer text recorded.')}</p><p><strong>${escapeHtml(answer.answeredBy || 'Unattributed')}</strong> · ${escapeHtml(answer.answeredAt || 'Time not recorded')}</p></article>`).join('') : '<p>No human answer has been recorded.</p>';
  const latestConceptRound = caseFile.conceptRounds?.at(-1) ?? null;
  const selectedConceptIds = new Set(caseFile.conceptDecision?.selectedConceptIds ?? []);
  const conceptRoundHtml = latestConceptRound ? `<div class="concept-round"><div class="concept-round-head"><h3>Concept round</h3><p>${escapeHtml(latestConceptRound.steer ? `Steer: ${latestConceptRound.steer}` : 'Distinct interventions derived from the current evidence and answers.')}</p></div><div class="concept-grid">${latestConceptRound.concepts.map((concept) => {
    const evidenceIds = [...concept.evidence.observationIds, ...concept.evidence.answerIds, ...concept.evidence.recordIds];
    return `<article class="concept-card" data-selected="${selectedConceptIds.has(concept.id)}"><div><span class="evidence-state">${escapeHtml(concept.origin)}</span>${selectedConceptIds.has(concept.id) ? '<span class="severity verified">selected</span>' : ''}</div><h3>${escapeHtml(concept.name)}</h3><p>${escapeHtml(concept.thesis)}</p><dl><div><dt>Smallest intervention</dt><dd>${escapeHtml(concept.smallestIntervention)}</dd></div><div><dt>People change</dt><dd>${escapeHtml(concept.peopleChange)}</dd></div><div><dt>Operating burden</dt><dd>${escapeHtml(concept.operatingBurden || 'Not established')}</dd></div><div><dt>Portability</dt><dd>${escapeHtml(concept.portability || 'Not established')}</dd></div></dl><details><summary>Evidence, assumptions and trade-offs</summary><p><strong>Evidence:</strong> ${escapeHtml(evidenceIds.join(', ') || 'No evidence linked')}</p><p><strong>Assumptions:</strong> ${escapeHtml(concept.assumptions.join('; ') || 'None recorded')}</p><p><strong>Trade-offs:</strong> ${escapeHtml(concept.tradeOffs.join('; ') || 'None recorded')}</p><p><strong>Kill criteria:</strong> ${escapeHtml(concept.killCriteria.join('; ') || 'None recorded')}</p></details></article>`;
  }).join('')}</div>${caseFile.conceptDecision ? `<p class="concept-decision"><strong>Architect decision:</strong> ${escapeHtml(caseFile.conceptDecision.status || 'working')} · ${escapeHtml(caseFile.conceptDecision.rationale || 'No rationale recorded.')}</p>` : '<p class="concept-decision">No concept has been selected.</p>'}</div>` : '<div class="concept-round empty"><h3>Concept round</h3><p>No concept round has been drafted. Use it only when several materially different interventions remain viable.</p></div>';
  const sortedSegments = caseFile.structure?.segments?.length ? [...caseFile.structure.segments].sort((a, b) => b.fileCount - a.fileCount) : [];
  const maxSegmentFiles = Math.max(1, ...sortedSegments.map((segment) => segment.fileCount));
  const segmentButtons = sortedSegments.map((segment, index) => {
    const width = Math.max(2, (segment.fileCount / maxSegmentFiles) * 100);
    const share = enumeratedCount ? (segment.fileCount / enumeratedCount) * 100 : 0;
    return `<button type="button" class="segment-row" data-segment aria-pressed="${index === 0 ? 'true' : 'false'}" data-name="${escapeHtml(segment.name)}" data-files="${segment.fileCount.toLocaleString()}" data-folders="${segment.folderCount.toLocaleString()}" data-size="${escapeHtml(formatBytes(segment.totalBytes))}" data-evidence="${segment.retainedEvidenceCount.toLocaleString()}" data-share="${share.toFixed(1)}%" data-sensitivity="${(segment.sensitivityCueCount ?? 0).toLocaleString()}" data-weak="${(segment.weakNameCount ?? 0).toLocaleString()}"><span class="segment-label"><strong>${escapeHtml(segment.name)}</strong><span>${segment.fileCount.toLocaleString()}</span></span><span class="segment-track" aria-hidden="true"><span style="width:${width.toFixed(2)}%"></span></span></button>`;
  }).join('');
  const firstSegment = sortedSegments[0] ?? null;
  const segmentRows = sortedSegments.map((segment) => `<tr><th scope="row">${escapeHtml(segment.name)}</th><td>${segment.fileCount.toLocaleString()}</td><td>${segment.folderCount.toLocaleString()}</td><td>${escapeHtml(formatBytes(segment.totalBytes))}</td><td>${segment.retainedEvidenceCount.toLocaleString()}</td></tr>`).join('');
  const openQuestionCount = caseFile.questions.filter((question) => question.status === 'open').length;
  const thesisReady = ['diagnosticView', 'recommendation', 'risks', 'nextActions'].some((field) => typeof caseFile.thesis[field] === 'string' && caseFile.thesis[field].trim());
  const statusTitle = thesisReady
    ? 'The architect thesis is ready for review.'
    : openQuestionCount
      ? `${openQuestionCount.toLocaleString()} clarifying ${openQuestionCount === 1 ? 'question remains' : 'questions remain'} before the thesis.`
      : latestConceptRound
        ? 'Concept directions are ready for the architect\'s decision.'
        : 'Clarification is complete. Draft concepts or author the thesis.';
  const statusDetail = thesisReady
    ? 'Read the conclusion first, then trace it back through the evidence path.'
    : openQuestionCount
      ? 'The map and observations are orientation. Human answers should resolve the consequential uncertainty before the report becomes a recommendation.'
      : latestConceptRound
        ? 'Select, combine, steer, defer, or reject the proposals before the final recommendation.'
        : 'Use a concept round when several interventions remain viable; skip it when the evidence supports only one safe path.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(caseFile.caseName)} — AI architecture discovery</title>
  <style>
    :root{color-scheme:dark;--ground:#0f1419;--rail:#0b1015;--sheet:#151c23;--sheet-raised:#1a232c;--rule:#2c3944;--rule-strong:#465866;--text:#edf3f5;--muted:#a7b3bb;--blue:#79a7f2;--blue-deep:#356fca;--red:#f08b7e;--green:#66c69b;--amber:#d7a968}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:108px}body{margin:0;background:var(--ground);color:var(--text);font:15px/1.6 Aptos,"Segoe UI Variable","Segoe UI",sans-serif}::selection{background:var(--blue-deep);color:var(--text)}::-webkit-scrollbar{width:12px;height:12px}::-webkit-scrollbar-track{background:var(--rail)}::-webkit-scrollbar-thumb{background:var(--rule-strong);border:3px solid var(--rail);border-radius:6px}button,a,summary{font:inherit}button{color:inherit}.skip-link{position:fixed;left:16px;top:12px;z-index:20;transform:translateY(-150%);background:var(--text);color:var(--ground);padding:8px 12px;border-radius:3px}.skip-link:focus{transform:none}main{width:min(1160px,calc(100% - 40px));margin:auto;padding:42px 0 80px}.case-header{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:40px;align-items:end;padding-bottom:30px;border-bottom:1px solid var(--rule)}h1{font-size:clamp(1.75rem,3vw,2.375rem);line-height:.98;letter-spacing:-.04em;margin:0;max-width:15ch;text-wrap:balance}h2{font-size:1.125rem;line-height:1.08;letter-spacing:-.035em;margin:0;text-wrap:balance}h3{font-size:1.125rem;line-height:1.35;margin:10px 0 8px}p{max-width:72ch;color:var(--muted)}.case-meta{margin:14px 0 0;color:var(--muted);font-size:.875rem}.readiness{border:1px solid var(--rule-strong);background:var(--sheet);padding:18px}.readiness strong{display:block;color:${thesisReady ? 'var(--green)' : 'var(--red)'};font-size:1.125rem;line-height:1.35;margin-bottom:8px}.readiness p{margin:0}.case-spine{position:sticky;top:0;z-index:10;display:grid;grid-template-columns:repeat(4,1fr);margin:0 -12px;background:color-mix(in srgb,var(--rail) 94%,transparent);border-bottom:1px solid var(--rule);padding:0 12px}.case-spine a{position:relative;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;min-height:72px;padding:12px;color:var(--muted);text-decoration:none;border-bottom:2px solid transparent}.case-spine a:hover,.case-spine a[aria-current="step"]{color:var(--text);border-bottom-color:var(--blue)}.case-spine .step-number{grid-row:1/3;display:grid;place-items:center;width:28px;height:28px;border:1px solid var(--rule-strong);border-radius:50%;font-variant-numeric:tabular-nums}.case-spine a[aria-current="step"] .step-number{background:var(--blue-deep);border-color:var(--blue);color:var(--text)}.case-spine strong{line-height:1.2}.case-spine small{font-size:.75rem;color:inherit}.stage{margin:0;padding:70px 0;border-bottom:1px solid var(--rule)}.stage-heading{display:grid;grid-template-columns:80px minmax(0,1fr);gap:20px;align-items:start;margin-bottom:30px}.stage-index{font-size:.75rem;color:var(--blue);font-variant-numeric:tabular-nums}.stage-heading p{margin:10px 0 0;max-width:64ch}.source-map{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(260px,.65fr);gap:20px;align-items:start}.segment-list{display:grid;gap:5px}.segment-row{appearance:none;width:100%;border:0;background:transparent;padding:8px;text-align:left;cursor:pointer;border-radius:3px}.segment-row:hover,.segment-row[aria-pressed="true"]{background:var(--sheet)}.segment-row:focus-visible,.button:focus-visible,.filter:focus-visible,.question-nav button:focus-visible,.case-spine a:focus-visible,summary:focus-visible{outline:3px solid var(--blue);outline-offset:3px}.segment-label{display:flex;justify-content:space-between;gap:16px;margin-bottom:5px}.segment-label strong{font-size:.875rem}.segment-label span{color:var(--muted);font-variant-numeric:tabular-nums}.segment-track{display:block;height:8px;background:var(--sheet);border:1px solid var(--rule);overflow:hidden}.segment-track span{display:block;height:100%;background:var(--blue)}.segment-row[aria-pressed="true"] .segment-track span{background:var(--green)}.segment-detail{position:sticky;top:96px;background:var(--sheet);border:1px solid var(--rule-strong);padding:20px}.segment-detail h3{font-size:1.125rem;margin:0 0 18px}.segment-detail dl{display:grid;grid-template-columns:1fr 1fr;margin:0}.segment-detail dl div{padding:11px 0;border-top:1px solid var(--rule)}.segment-detail dl div:nth-child(even){padding-left:14px}.segment-detail dt{font-size:.75rem;color:var(--muted)}.segment-detail dd{margin:2px 0 0;font-size:1.125rem;font-weight:650;font-variant-numeric:tabular-nums}.coverage-note{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule);margin-top:28px}.coverage-note div{background:var(--sheet);padding:16px}.coverage-note strong{display:block;color:var(--text)}.coverage-note span{color:var(--muted);font-size:.75rem}.disclosure{margin-top:20px;border:1px solid var(--rule);background:var(--sheet);padding:0 16px}.disclosure summary{min-height:48px;display:flex;align-items:center;color:var(--blue);font-weight:650;cursor:pointer}.table-wrap{overflow-x:auto;padding-bottom:10px}table{width:100%;border-collapse:collapse;background:var(--sheet)}th,td{text-align:left;padding:11px;border-bottom:1px solid var(--rule);vertical-align:top}thead th{color:var(--muted);font-size:.75rem}tbody th{font-weight:600}.filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.filter,.button,.question-nav button{min-height:44px;border:1px solid var(--rule-strong);background:var(--sheet);padding:8px 14px;border-radius:3px;cursor:pointer}.filter:hover,.filter[aria-pressed="true"],.button:hover,.question-nav button:hover{background:var(--sheet-raised);border-color:var(--blue)}.filter[aria-pressed="true"]{color:var(--blue)}.observations{display:grid;gap:10px}.observation{background:var(--sheet);border:1px solid var(--rule);padding:18px}.observation[hidden]{display:none}.observation-meta{display:flex;flex-wrap:wrap;gap:9px;align-items:center;color:var(--muted);font-size:.75rem}.severity,.state,.evidence-state{display:inline-block;border:1px solid currentColor;border-radius:3px;padding:2px 7px;font-size:.75rem}.severity.decision{color:var(--red)}.severity.review{color:var(--amber)}.severity.note,.evidence-state{color:var(--blue)}details{border-top:1px solid var(--rule);margin-top:14px;padding-top:4px}summary{padding:9px 0;cursor:pointer;color:var(--blue);font-weight:650}.mono{font:12px/1.55 Consolas,"SFMono-Regular",monospace;overflow-wrap:anywhere}.question-workspace{max-width:820px}.question-panel{background:var(--sheet);border:1px solid var(--rule-strong);padding:clamp(20px,4vw,38px);min-height:280px;display:flex;flex-direction:column;justify-content:center}.question-panel[hidden]{display:none}.question-reason{color:var(--amber);font-size:.75rem;margin:0 0 18px}.question-panel h3{font-size:clamp(1.75rem,3vw,2.375rem);line-height:1.15;letter-spacing:-.03em;margin:0;max-width:24ch;text-wrap:balance}.question-actions{display:flex;align-items:center;gap:12px;margin-top:28px}.secondary{background:transparent}.question-controls{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:12px}.question-nav{display:flex;gap:8px}.question-nav button:disabled{opacity:.42;cursor:not-allowed}.question-count{font-variant-numeric:tabular-nums;color:var(--muted)}.answers{margin-top:32px}.thesis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:var(--rule);border:1px solid var(--rule)}.thesis article{background:var(--sheet);padding:22px}.thesis article:first-child{grid-column:1/-1}.thesis p{margin-bottom:0}.empty{color:var(--muted);font-style:italic}.report-status{margin-bottom:20px;color:${thesisReady ? 'var(--green)' : 'var(--red)'}}footer{margin-top:48px;padding-top:20px;color:var(--muted);font-size:.75rem}.toast{position:fixed;right:18px;bottom:18px;z-index:30;background:var(--text);color:var(--ground);padding:10px 14px;border-radius:3px;box-shadow:0 12px 30px color-mix(in srgb,var(--rail) 72%,transparent)}@media(max-width:820px){main{width:min(100% - 28px,1160px);padding-top:28px}.case-header,.source-map{grid-template-columns:1fr}.segment-detail{position:static}.case-spine{margin:0 -14px;padding:0 6px}.case-spine a{grid-template-columns:1fr;grid-template-rows:auto auto;text-align:center;justify-items:center;min-height:68px;padding:8px 4px}.case-spine .step-number{grid-row:auto;width:23px;height:23px;font-size:.75rem}.case-spine small{display:none}.stage{padding:52px 0}.stage-heading{grid-template-columns:46px 1fr}.coverage-note{grid-template-columns:1fr}.thesis{grid-template-columns:1fr}.thesis article:first-child{grid-column:auto}}@media(max-width:520px){h1{font-size:2.375rem}.case-meta{font-size:.75rem}.case-spine strong{font-size:.75rem}.source-map{gap:14px}.segment-row{padding:8px 2px}.segment-detail dl{grid-template-columns:1fr}.segment-detail dl div:nth-child(even){padding-left:0}.question-actions,.question-controls{align-items:stretch}.question-actions{flex-direction:column}.question-actions .button{width:100%}.question-controls{flex-direction:column}.question-nav{width:100%}.question-nav button{flex:1}.question-count{order:-1}.table-wrap{margin-right:-14px}}@media print{.case-spine,.filters,.question-actions,.question-controls,.toast{display:none!important}.stage{break-inside:avoid}.segment-detail{position:static}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
    .concept-round{margin:0 0 28px}.concept-round-head{display:flex;justify-content:space-between;gap:20px;align-items:baseline;margin-bottom:12px}.concept-round-head h3,.concept-round-head p{margin:0}.concept-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:1px;background:var(--rule);border:1px solid var(--rule)}.concept-card{background:var(--sheet);padding:20px}.concept-card[data-selected="true"]{background:var(--sheet-raised);outline:1px solid var(--green);outline-offset:-1px}.concept-card h3{margin:14px 0 8px}.concept-card dl{margin:18px 0 0}.concept-card dl div{padding:9px 0;border-top:1px solid var(--rule)}.concept-card dt{font-size:.75rem;color:var(--muted)}.concept-card dd{margin:3px 0 0}.severity.verified{color:var(--green);margin-left:8px}.concept-decision{margin:12px 0 0;padding:14px;border:1px solid var(--rule);background:var(--sheet)}@media(max-width:520px){.concept-round-head{display:block}.concept-round-head p{margin-top:8px}}
  </style>
</head>
<body>
  <a class="skip-link" href="#case-content">Skip to report</a>
  <main id="case-content">
    <header class="case-header"><div><h1>${escapeHtml(caseFile.caseName)}</h1><p class="case-meta">AI architecture discovery · ${enumeratedCount.toLocaleString()} records mapped · ${retainedCount.toLocaleString()} retained · updated ${escapeHtml(caseFile.updatedAt)}</p></div><div class="readiness"><strong>${escapeHtml(statusTitle)}</strong><p>${escapeHtml(statusDetail)}</p><p><b>Resume:</b> ${escapeHtml(workflow.next.command)} · ${escapeHtml(workflow.next.reason)}</p></div></header>
    <nav class="case-spine" aria-label="Discovery stages"><a href="#ingest" data-stage-link="ingest" aria-current="step"><span class="step-number">1</span><strong>Ingest</strong><small>${escapeHtml(workflow.stages.ingest)}</small></a><a href="#analyse" data-stage-link="analyse"><span class="step-number">2</span><strong>Analyse</strong><small>${escapeHtml(workflow.stages.analyse)}</small></a><a href="#clarify" data-stage-link="clarify"><span class="step-number">3</span><strong>Clarify</strong><small>${escapeHtml(workflow.stages.clarify)}</small></a><a href="#report" data-stage-link="report"><span class="step-number">4</span><strong>Report</strong><small>${escapeHtml(workflow.stages.report)}</small></a></nav>
    <section class="stage" id="ingest" data-stage-section="ingest" aria-labelledby="ingest-title"><div class="stage-heading"><span class="stage-index">Stage 1</span><div><h2 id="ingest-title">See the company landscape</h2><p>Select a source area to understand its weight in the map. This is metadata orientation, not content or permission certification.</p></div></div>${segmentButtons ? `<div class="source-map"><div class="segment-list" aria-label="Company source areas">${segmentButtons}</div><aside class="segment-detail" id="segment-detail" aria-live="polite"><h3 data-segment-name>${escapeHtml(firstSegment?.name ?? '')}</h3><dl><div><dt>Share of map</dt><dd data-segment-share>${firstSegment && enumeratedCount ? ((firstSegment.fileCount / enumeratedCount) * 100).toFixed(1) : '0.0'}%</dd></div><div><dt>Files</dt><dd data-segment-files>${firstSegment?.fileCount.toLocaleString() ?? '0'}</dd></div><div><dt>Folders</dt><dd data-segment-folders>${firstSegment?.folderCount.toLocaleString() ?? '0'}</dd></div><div><dt>Size</dt><dd data-segment-size>${escapeHtml(formatBytes(firstSegment?.totalBytes ?? 0))}</dd></div><div><dt>Evidence retained</dt><dd data-segment-evidence>${firstSegment?.retainedEvidenceCount.toLocaleString() ?? '0'}</dd></div><div><dt>Sensitivity cues</dt><dd data-segment-sensitivity>${(firstSegment?.sensitivityCueCount ?? 0).toLocaleString()}</dd></div><div><dt>Weak names</dt><dd data-segment-weak>${(firstSegment?.weakNameCount ?? 0).toLocaleString()}</dd></div></dl></aside></div>` : '<p class="empty">No hierarchical source map is attached to this case.</p>'}<div class="coverage-note"><div><strong>${enumeratedCount.toLocaleString()} mapped</strong><span>Complete inside the declared local scope</span></div><div><strong>${retainedCount.toLocaleString()} retained</strong><span>Bounded portable evidence, not the full index</span></div><div><strong>${caseFile.coverage.readableContentCount.toLocaleString()} with text</strong><span>Content was ${caseFile.coverage.readableContentCount ? 'partly available' : 'not requested'}</span></div></div><details class="disclosure"><summary>Inspect coverage and source register</summary><p>Complete means complete only inside the declared connector scope. Source-system permissions and version histories remain authoritative.</p><div class="table-wrap"><table><thead><tr><th>Source</th><th>Platform</th><th>Method</th><th>Coverage</th><th>Content</th><th>Permissions</th><th>Versions</th></tr></thead><tbody>${sourceRows}</tbody></table></div>${segmentRows ? `<div class="table-wrap"><table><thead><tr><th>Source area</th><th>Files</th><th>Folders</th><th>Size</th><th>Evidence</th></tr></thead><tbody>${segmentRows}</tbody></table></div>` : ''}</details></section>
    <section class="stage" id="analyse" data-stage-section="analyse" aria-labelledby="analyse-title"><div class="stage-heading"><span class="stage-index">Stage 2</span><div><h2 id="analyse-title">Focus on what could change the decision</h2><p>Filter the deterministic signals. These are observations to investigate, not organisational truth.</p></div></div><div class="filters" aria-label="Filter observations"><button type="button" class="filter" data-filter="all" aria-pressed="true">All · ${caseFile.observations.length}</button><button type="button" class="filter" data-filter="decision" aria-pressed="false">Decision · ${caseFile.observations.filter((item) => item.severity === 'decision').length}</button><button type="button" class="filter" data-filter="review" aria-pressed="false">Review · ${caseFile.observations.filter((item) => item.severity === 'review').length}</button><button type="button" class="filter" data-filter="note" aria-pressed="false">Context · ${caseFile.observations.filter((item) => item.severity === 'note').length}</button></div><div class="observations">${observations}</div></section>
    <section class="stage" id="clarify" data-stage-section="clarify" aria-labelledby="clarify-title"><div class="stage-heading"><span class="stage-index">Stage 3</span><div><h2 id="clarify-title">Ask one consequential question at a time</h2><p>These questions exist because the evidence cannot safely answer them. Record attributed answers in the portable case before finalising the thesis.</p></div></div><div class="question-workspace">${questions}${caseFile.questions.length ? `<div class="question-controls"><span class="question-count" aria-live="polite">Question <strong data-question-current>1</strong> of ${caseFile.questions.length}</span><div class="question-nav"><button type="button" data-question-prev disabled>Previous</button><button type="button" data-question-next${caseFile.questions.length === 1 ? ' disabled' : ''}>Next question</button></div></div>` : ''}</div><div class="answers"><h3>Human-verified answers</h3><div class="observations">${answers}</div></div></section>
    <section class="stage" id="report" data-stage-section="report" aria-labelledby="report-title"><div class="stage-heading"><span class="stage-index">Stage 4</span><div><h2 id="report-title">Author the architectural thesis</h2><p>The report belongs to the architect. Carry unresolved consequential questions forward explicitly as risks or assumptions.</p></div></div>${conceptRoundHtml}<p class="report-status"><strong>${escapeHtml(statusTitle)}</strong></p><div class="thesis"><article><h3>Diagnostic view</h3>${paragraphHtml(caseFile.thesis.diagnosticView)}</article><article><h3>Recommendation</h3>${paragraphHtml(caseFile.thesis.recommendation)}</article><article><h3>Risks</h3>${paragraphHtml(caseFile.thesis.risks)}</article><article><h3>Next actions</h3>${paragraphHtml(caseFile.thesis.nextActions)}</article></div></section>
    <details class="disclosure"><summary>Inspect case activity · ${(caseFile.workflow?.events?.length ?? 0).toLocaleString()} events</summary><div class="table-wrap"><table><thead><tr><th>Time</th><th>Stage</th><th>Event</th><th>Actor</th></tr></thead><tbody>${(caseFile.workflow?.events ?? []).slice().reverse().map((event) => `<tr><td>${escapeHtml(event.at)}</td><td>${escapeHtml(event.stage)}</td><td>${escapeHtml(event.detail || event.type)}</td><td>${escapeHtml(event.actor)}</td></tr>`).join('')}</tbody></table></div></details><footer>AI may propose. Humans certify. The architect owns the thesis. Source-system permissions remain authoritative.</footer>
  </main>
  <div class="toast" role="status" hidden data-toast>Question copied</div>
  <script>
    (() => {
      const segmentButtons = [...document.querySelectorAll('[data-segment]')];
      const detailFields = {name:document.querySelector('[data-segment-name]'),share:document.querySelector('[data-segment-share]'),files:document.querySelector('[data-segment-files]'),folders:document.querySelector('[data-segment-folders]'),size:document.querySelector('[data-segment-size]'),evidence:document.querySelector('[data-segment-evidence]'),sensitivity:document.querySelector('[data-segment-sensitivity]'),weak:document.querySelector('[data-segment-weak]')};
      segmentButtons.forEach((button) => button.addEventListener('click', () => {segmentButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));Object.entries(detailFields).forEach(([key, field]) => {if (field) field.textContent = button.dataset[key] || '0';});}));
      const filters = [...document.querySelectorAll('[data-filter]')];
      const observationCards = [...document.querySelectorAll('[data-observation]')];
      filters.forEach((button) => button.addEventListener('click', () => {const filter = button.dataset.filter;filters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));observationCards.forEach((card) => {card.hidden = filter !== 'all' && card.dataset.severity !== filter;});}));
      const questionPanels = [...document.querySelectorAll('[data-question-panel]')];
      const previous = document.querySelector('[data-question-prev]');
      const next = document.querySelector('[data-question-next]');
      const current = document.querySelector('[data-question-current]');
      let questionIndex = 0;
      const showQuestion = (index) => {questionIndex = Math.max(0, Math.min(index, questionPanels.length - 1));questionPanels.forEach((panel, panelIndex) => {panel.hidden = panelIndex !== questionIndex;});if (current) current.textContent = String(questionIndex + 1);if (previous) previous.disabled = questionIndex === 0;if (next) next.disabled = questionIndex >= questionPanels.length - 1;};
      previous?.addEventListener('click', () => showQuestion(questionIndex - 1));
      next?.addEventListener('click', () => showQuestion(questionIndex + 1));
      const toast = document.querySelector('[data-toast]');
      document.querySelectorAll('[data-copy-question]').forEach((button) => button.addEventListener('click', async () => {const text = button.dataset.copyQuestion || '';try{await navigator.clipboard.writeText(text);}catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove();}if(toast){toast.hidden=false;window.setTimeout(()=>{toast.hidden=true;},1800);}}));
      const stageLinks = [...document.querySelectorAll('[data-stage-link]')];
      const sections = [...document.querySelectorAll('[data-stage-section]')];
      if ('IntersectionObserver' in window) {const observer=new IntersectionObserver((entries)=>{const visible=entries.filter((entry)=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;stageLinks.forEach((link)=>{if(link.dataset.stageLink===visible.target.dataset.stageSection)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});},{rootMargin:'-20% 0px -65%',threshold:[0,.2,.5]});sections.forEach((section)=>observer.observe(section));}
    })();
  </script>
</body>
</html>`;
}
