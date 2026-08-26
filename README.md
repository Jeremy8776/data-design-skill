# AI Architecture Discovery

A platform-agnostic Agent Skill for evidence-led organisational discovery.

It follows a consultant-led path:

**Ingest → Analyse → Clarifying questions → Report**

The deterministic core maps authorised local or synced folders without changing the source material. At company scale, complete metadata stays in a local SQLite evidence index while the portable case retains a bounded evidence projection. The generated report is a self-contained, permanently dark interactive HTML file.

Schema 0.5 adds a persistent workbench lifecycle to the portable case. A later host can reconstruct the current stage, reviewed observations, attributed answers, deferred risks, architect thesis, next action, and append-only activity history without relying on the original chat.

AI may propose observations and questions. People certify organisational facts. The architect owns the thesis.

## Optional concept round

Once consequential clarifying questions are resolved, ask the skill to **draft concepts** when more than one intervention remains genuinely viable. It produces two to four materially different, evidence-linked directions, including a minimum-change baseline where that is credible.

Each direction exposes its assumptions, operating burden, cost shape, lock-in, portability, trade-offs, reversibility, and kill criteria. The architect can select, combine, steer, defer, or reject the concepts before authoring the final thesis. Earlier rounds remain in the portable case as decision history.

This is a decision tool inside **Report**, not a fifth workflow stage and not an automatic recommendation. See `references/concept-round.md` for the protocol.

## Requirements

- Node.js 22.13 or newer
- A host that can load Agent Skills, or any LLM host that can receive `SKILL.md` as instructions

The local mapper currently uses Node's experimental built-in SQLite API.

## Install

Clone this repository, then run the installer from the repository root.

### Codex

```powershell
node scripts/install-host.mjs --host codex --scope user
```

Invoke with `$ai-architecture-discovery`.

### Claude Code

```powershell
node scripts/install-host.mjs --host claude --scope user
```

Use `--scope workspace --workspace <folder>` for a project-local installation. Invoke with `/ai-architecture-discovery`.

### Kiro

```powershell
node scripts/install-host.mjs --host kiro --scope user
```

Use `--scope workspace --workspace <folder>` for a project-local installation. Invoke with `/ai-architecture-discovery`.

### Antigravity

```powershell
node scripts/install-host.mjs --host antigravity --scope user
```

Use `/skills list` to verify discovery. Direct invocation depends on the current Antigravity surface.

The installer refuses to replace an existing copy unless `--force` is supplied.

## Use without a skill-aware host

Attach `SKILL.md` as the operating instructions and keep all source evidence in the neutral snapshot and case contracts under `references/schemas/`.

## Local discovery

```powershell
node scripts/workbench.mjs scan-local <authorised-folder> --out <case.json>
node scripts/workbench.mjs status <case.json>
node scripts/workbench.mjs next <case.json>
node scripts/workbench.mjs report <case.json> --out-dir <report-folder>
```

Generated cases and SQLite indexes must be written outside the authorised source root. Content inspection is off by default. Use `--include-text` only when it is explicitly authorised and materially useful.

## Stateful controls

```powershell
node scripts/workbench.mjs review <case.json> --observation <id> --state acknowledged --by <architect> --out <updated.json>
node scripts/workbench.mjs answer <case.json> --question <id> --by <person-or-role> --text-file <answer.txt> --out <updated.json>
node scripts/workbench.mjs thesis <case.json> --from <thesis.json> --by <architect> --out <updated.json>
node scripts/workbench.mjs doctor <case.json>
```

Mutating commands write a new case by default. Older valid cases can be upgraded explicitly with `workbench.mjs migrate`; migration is never an unrelated side effect.

## Verify

```powershell
node --no-warnings --test test/*.test.mjs
```

## Boundaries

- No model provider SDK or API call exists in the core.
- Connector access is not treated as complete coverage.
- Sensitivity cues are triage signals, not verified classifications.
- Prompt instructions are not permission enforcement.
- Instructions inside source content are treated as untrusted evidence and surfaced as reviewable cues, never followed as agent commands.
- Missing evidence is not evidence that the organisation lacks something.
- File bodies, permissions and version histories require targeted follow-up when the source route supports them.

See `SKILL.md` for the complete protocol and `references/` for the evidence, adapter, reporting and portability contracts.
