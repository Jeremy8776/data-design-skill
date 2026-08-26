# Adapter capability contract

Read this reference when connecting a new source platform or deciding whether a host connector is sufficient.

An adapter is a replaceable read-only acquisition route. It authenticates outside the portable case, enumerates only the authorised scope, and emits `source-snapshot.schema.json`.

## Required declaration

Before collection, describe:

- adapter and platform identity;
- route type: local, synced folder, native connector, API, export, or manual;
- whether the route is actually available in the current host;
- the exact authorised scope;
- capability states for enumeration, metadata, content, permissions, versions, stable IDs, and change tracking;
- known losses and exclusions;
- where authentication and permission enforcement occur.

Use `references/schemas/adapter-capability.schema.json` for a machine-readable declaration.

## Decision rules

- Prefer a host's approved read-only connector when it exposes the required capability safely.
- Prefer a synced folder when metadata orientation is enough and cloud-only permissions, comments, versions, or links are not being claimed.
- Prefer a bounded export when no connector exists; state its collection time and losses.
- Never install a provider SDK into the portable core merely because one host lacks a connector.
- Never ask the user to paste credentials into chat.
- Never describe `available in theory` as `available in this run`.
- Stop or narrow the scope when permission boundaries cannot be represented safely.

## Adapter acceptance checks

An adapter is ready only when it can:

1. refuse unauthorised scope expansion;
2. emit a structurally valid neutral snapshot;
3. preserve stable locators or explain their absence;
4. label partial and unavailable capabilities honestly;
5. keep secrets out of records and logs;
6. demonstrate that source systems were not modified;
7. resume or fail with a clear bounded error rather than silently skipping content.
