# Evidence contract

Use this reference when producing or interpreting a source snapshot or portable case.

## Durable objects

### Source

A source is one authorised system, folder, connector scope, or export. It records the collection mechanism and what that mechanism could actually see.

Capability values are:

- `available`: reliably collected for the authorised scope;
- `partial`: collected for some records or with known loss;
- `unavailable`: the route cannot expose it;
- `unknown`: not enough evidence to determine support;
- `not-requested`: deliberately excluded from this run.

Coverage values are:

- `complete`: every item exposed by the authorised route was enumerated;
- `partial`: known omissions or failures exist;
- `sampled`: a deliberate subset was collected;
- `unknown`: completeness cannot be established.

`complete` describes the connector scope, not the whole company.

### Record

A record is a neutral evidence item: file, document, sheet, presentation, page, message, database row, design, asset, or other source object.

Each record needs:

- a case-unique `id`;
- the owning `sourceId`;
- a stable `externalId` when the platform exposes one;
- a human-readable `name` and `locator`;
- a `recordType` and content state;
- the available timestamps, version, permissions, checksum, link, and metadata;
- `evidenceState: source-fact` for values returned directly by the source route.

Do not place raw access tokens, passwords, private keys, or secret values in records.

### Observation

An observation connects an evidence-backed pattern to records. It must include its basis and evidence state. A deterministic pattern is not automatically an organisational fact.

### Question and answer

A question explains why the uncertainty matters and links to relevant records. An answer needs the responder's name or role, answer time, and verification state. Keep the original question and earlier answers when a later answer supersedes them.

### Thesis

The thesis is the architect's authored judgement. It may cite observations, answers, and records, but its state remains `architect-conclusion`, never `source-fact`.

## Snapshot versus case

`references/schemas/source-snapshot.schema.json` is the adapter boundary for one external source. `references/schemas/case.schema.json` is the portable multi-source case.

Adapters may keep extra platform metadata inside a record's `metadata` object. Do not make platform-specific keys mandatory in the portable case.

## Merge rules

- Preserve each source declaration and collection timestamp.
- Prefix normalised record IDs with the source ID to prevent collisions.
- Prefer stable platform IDs for identity; otherwise use the locator plus an available checksum.
- Do not merge records merely because their names match.
- Exact checksum matches may support a duplicate observation but do not prove the records have the same authority or permissions.
- If a newer snapshot replaces an earlier one, preserve the earlier snapshot or record the supersession explicitly.

## Validation limits

Schema validation proves structural compatibility only. It does not prove authorisation, source completeness, semantic accuracy, or permission enforcement.

