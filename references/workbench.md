# Stateful workbench

Read this reference when starting, resuming, diagnosing, or updating a discovery case.

## Mental model

The user sees four stages only:

1. Ingest
2. Analyse
3. Clarifying questions
4. Report

Commands are controls inside those stages, not additional stages. The portable case is the durable state; chat history is optional context.

## Entrypoint

Use `scripts/workbench.mjs` for new cases. It wraps the existing deterministic discovery engine and adds state, recovery, attributed decisions, and health checks.

```text
node <skill-root>/scripts/workbench.mjs start --name <case-name> --out <case.json>
node <skill-root>/scripts/workbench.mjs status <case.json>
node <skill-root>/scripts/workbench.mjs next <case.json>
node <skill-root>/scripts/workbench.mjs doctor <case.json>
```

`status` and `next` are read-only. `doctor` reports structural and workflow problems but does not repair them.

## Ingest

```text
node <skill-root>/scripts/workbench.mjs scan-local <authorised-folder> --out <case.json>
node <skill-root>/scripts/workbench.mjs ingest-snapshot <snapshot.json> --case <case.json> --out <merged-case.json>
```

Never place the generated case or index inside the authorised source root.

## Analyse

Review consequential deterministic observations without changing their evidence state:

```text
node <skill-root>/scripts/workbench.mjs review <case.json> --observation <id> --state acknowledged --by <architect> --out <updated.json>
```

Allowed review states are `acknowledged`, `contested`, `carried-forward`, and `dismissed`. A review records architect handling; it does not certify the source-derived pattern.

## Clarifying questions

Record an attributed answer:

```text
node <skill-root>/scripts/workbench.mjs answer <case.json> --question <id> --by <person-or-role> --text-file <answer.txt> --out <updated.json>
```

Use a text file for long or punctuation-heavy answers. A consequential question may be deferred only with a reason that is carried into the report:

```text
node <skill-root>/scripts/workbench.mjs defer <case.json> --question <id> --reason <reason> --by <architect> --out <updated.json>
```

## Report

Import an architect-authored thesis object and then render:

```text
node <skill-root>/scripts/workbench.mjs thesis <case.json> --from <thesis.json> --by <architect> --out <updated.json>
node <skill-root>/scripts/workbench.mjs report <updated.json> --out-dir <directory>
```

A final thesis requires all four thesis fields and an attributed architect. Open consequential questions block the workflow unless deliberately deferred.

## Resume and migration

Running `status` against any valid case reconstructs the next action from evidence, review, question, and thesis state. Older cases remain readable. Add workflow state explicitly with:

```text
node <skill-root>/scripts/workbench.mjs migrate <legacy-case.json> --out <migrated-case.json>
```

Do not silently migrate or overwrite a case while answering an unrelated question. Mutating commands write a new case unless `--force` explicitly replaces the chosen output.
