---
name: ai-architecture-discovery
description: Ingest authorised organisational sources, analyse source-backed uncertainty, and produce a portable AI architecture discovery report. Use for evidence-led discovery across local folders, synced drives, exports, cloud document platforms, collaboration tools, DAMs, and other company data sources; do not use it as an autonomous security audit or as permission to access unapproved systems.
---

# AI Architecture Discovery

Run a consultant-led **Ingest -> Analyse -> Clarifying questions -> Report** process without binding the case to a storage vendor or LLM provider.

The durable output is the evidence case, not a chat transcript. Models may propose observations and questions; people certify organisational facts; the architect owns the final thesis.

## Non-negotiable boundaries

- Inspect only sources and scopes the user has authorised.
- Keep source material in place and read-only unless the user separately requests a write.
- Never request passwords, tokens, or copied secrets in chat. Use the host's approved connector, an authorised export, or a locally synced folder.
- Do not equate connector access with complete coverage. Record unavailable content, permissions, versions, stable IDs, or change history explicitly.
- Keep source facts, deterministic observations, model proposals, human answers, and architect conclusions distinct.
- Cite stable source identifiers or locators beside consequential claims.
- Do not infer that a missing record means the organisation lacks it.
- Do not treat sensitivity cues as verified classifications or prompt rules as permission enforcement.

## Choose the ingestion route

First identify the source platform, authorised scope, and the access mechanism actually available in the current host.

1. **Local or synced folder:** run `scripts/discover.mjs scan-local`. The scanner maps top-level source areas round-robin, stores complete metadata in a local SQLite index, and keeps only bounded representative or consequential evidence in the portable case. A OneDrive, Google Drive, SharePoint, Dropbox, or Box folder synced to the machine is still collected through the local adapter; label its real platform with `--platform` and its method with `--collection synced-folder`.
2. **Native connector or API:** enumerate read-only through the host's approved tool, then normalise the result to `references/schemas/source-snapshot.schema.json`. Do not add a provider SDK to the core.
3. **Export:** treat the export as a bounded snapshot. Preserve the export date and explain which live metadata, permissions, versions, links, or comments it lost.
4. **Unknown platform:** use the generic capability contract. Never block solely because the brand is not listed; describe what can and cannot be enumerated, read, linked, versioned, and permission-checked.

Read [references/source-adapters.md](references/source-adapters.md) when selecting or implementing an ingestion route. Read [references/evidence-contract.md](references/evidence-contract.md) when creating, merging, validating, or interpreting snapshots and cases.

Resolve every bundled script relative to the directory containing this `SKILL.md`. Do not assume the current working directory is the skill directory. In the examples below, `<skill-root>` means that resolved directory.

## Ingest

Create one source declaration per authorised system or export. Capture:

- platform and source family;
- authorised scope and account or tenant label when safe;
- collection method and collection time;
- capability states for enumeration, metadata, content, permissions, versions, stable IDs, and change tracking;
- coverage status, warnings, exclusions, and sampling limits;
- neutral evidence records with source IDs and locators.

For local evidence:

```text
node <skill-root>/scripts/discover.mjs scan-local <folder> --out <case.json>
```

Use `--include-text` only when content inspection is authorised and materially useful. The default inventory stores metadata and deterministic cues, not source document bodies.

Do not raise the evidence-record limit to accommodate a whole company. The whole-company path is hierarchical: map every source area cheaply, retain a bounded evidence projection, then run targeted content or fingerprint analysis against the segments whose uncertainty is consequential. The local SQLite index is an evidence locator and never belongs in an LLM prompt.

For connected or exported evidence, create a source snapshot and run:

```text
node <skill-root>/scripts/discover.mjs ingest-snapshot <snapshot.json> --out <case.json>
node <skill-root>/scripts/discover.mjs ingest-snapshot <snapshot.json> --case <existing-case.json> --out <merged-case.json>
```

The scripts make no model or network calls and refuse to overwrite outputs unless `--force` is supplied.

## Analyse

Start with deterministic observations and the coverage boundary. Then use the LLM only where semantic judgement helps. Analysis identifies consequential uncertainty; it does not resolve that uncertainty or silently turn it into organisational truth.

For each proposed observation:

- cite record IDs;
- state the basis;
- name missing evidence;
- distinguish `source-derived`, `deterministic-observation`, `model-proposed`, `human-verified`, and `architect-conclusion`;
- state confidence only when its basis is explainable;
- mark consequential uncertainty for the clarifying-question stage.

Do not let one model review its own unsupported assertion into truth. A different model can critique reasoning, but only evidence or an attributed person can change the organisational state.

## Clarifying questions

Turn only consequential uncertainty into questions for an attributed person. This is a distinct consulting stage between analysis and the architect's report, not a subsection hidden inside analysis.

- Prioritise questions that could change access, authority, ownership, integration choice, cost, workflow, or recommendation.
- Ask one clear question at a time where the host supports interaction; do not confront a non-technical team with a permanent QA backlog.
- Explain briefly why the answer matters and cite the observation or evidence that caused the question.
- Record who answered, when they answered, and whether the answer is human-verified or remains unresolved.
- Do not complete the final thesis while a consequential question is unanswered unless the architect explicitly carries it into the report as an open risk or assumption.

## Report

The report is for a non-technical decision-maker and the architect. Lead with the current thesis and the few decisions that matter, then expose evidence and detail progressively.

Include:

- scope and explicit coverage limits;
- what is confirmed, observed, proposed, human-verified, and still unknown;
- consequential questions and attributed answers;
- the architect's thesis, recommendation, risks, and next actions;
- source register and provenance;
- collection timestamps and portability information.

Generate ordinary Markdown and self-contained dark interactive HTML with:

```text
node <skill-root>/scripts/discover.mjs report <case.json> --out-dir <directory>
```

Read [references/reporting.md](references/reporting.md) before writing or revising a client-facing thesis.

## LLM and host portability

The skill must remain useful if the LLM changes. The scripts, schemas, evidence states, and outputs contain no provider-specific API calls. A host-specific wrapper may discover tools or connectors, but it must hand evidence back through the neutral snapshot contract.

Read [references/host-portability.md](references/host-portability.md) when adapting this package to a skill-aware agent, a generic LLM chat, an MCP host, or a custom orchestration runtime.

Host invocation syntax is not universal. Codex uses `$ai-architecture-discovery`; Claude Code and Kiro use `/ai-architecture-discovery`. Antigravity exposes discovered Agent Skills and can verify them with `/skills list`; use the skill by name when the current surface does not expose a direct slash alias. Never present a host-specific command as part of the portable evidence protocol.
