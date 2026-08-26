# Host portability

The package has two layers:

1. **Portable method and artefacts:** `SKILL.md`, neutral JSON schemas, deterministic Node scripts, Markdown, and self-contained HTML.
2. **Replaceable host adapter:** the mechanism a particular agent runtime uses to reach files, connectors, APIs, or user attachments.

## Skill-aware agent hosts

Expose this folder as a skill using the host's normal discovery mechanism. Keep `SKILL.md` canonical; a host manifest may add display metadata but must not change evidence states, permissions, or source contracts.

Checked against first-party documentation on 24 August 2026:

| Host | User installation | Workspace installation | Direct invocation |
|---|---|---|---|
| Codex | `$CODEX_HOME/skills/` or `~/.codex/skills/` | No workspace target is claimed by this installer | `$ai-architecture-discovery` |
| Claude Code | `~/.claude/skills/` | `.claude/skills/` | `/ai-architecture-discovery` |
| Kiro | `~/.kiro/skills/` | `.kiro/skills/` | `/ai-architecture-discovery` |
| Antigravity | `~/.gemini/config/skills/` | `.agents/skills/` | Verify discovery with `/skills list`; direct invocation depends on the current Antigravity surface |
| Generic Agent Skills host | Host-defined | `.agents/skills/` only when the host documents support | Automatic or host-defined |

Use `scripts/install-host.mjs` to resolve these targets without changing the canonical package:

```text
node <skill-root>/scripts/install-host.mjs --host codex --scope user
node <skill-root>/scripts/install-host.mjs --host claude --scope workspace --workspace <project>
node <skill-root>/scripts/install-host.mjs --host kiro --scope workspace --workspace <project>
node <skill-root>/scripts/install-host.mjs --host antigravity --scope workspace --workspace <project>
```

The installer refuses to replace an existing installation unless `--force` is explicitly supplied. An installed copy is a deployment artefact; edit the canonical package and reinstall rather than maintaining separate host-specific instructions.

Primary references:

- Codex official examples show `$skill-name` invocation: <https://developers.openai.com/api/docs/guides/latest-model>
- Claude Code skill locations and `/skill-name` invocation: <https://code.claude.com/docs/en/slash-commands>
- Kiro Agent Skills locations and `/skill-name` invocation: <https://kiro.dev/docs/cli/skills/>
- Antigravity skill locations and `/skills list` verification: <https://docs.cloud.google.com/application-design-center/docs/design-deploy-antigravity-cli>
- Google describes Agent Skills as an open format used by Antigravity and other agents: <https://cloud.google.com/blog/topics/developers-practitioners/level-up-your-agents-announcing-googles-official-skills-repository>

## Generic LLM chats

Provide `SKILL.md` as the operating instruction and attach a validated case or bounded source snapshot. If the chat cannot run Node scripts, run ingestion outside the model and provide the resulting JSON. The model can analyse and draft; it must not claim it enumerated sources it never received.

## MCP or connector hosts

Use the host tool to enumerate the authorised scope, then emit the neutral snapshot. Keep authentication and permission enforcement in the connector or source system. The model receives only the permitted projection.

## Custom orchestration

Resolve `scripts/workbench.mjs` relative to the loaded skill root for the stateful lifecycle. `scripts/discover.mjs` remains the lower-level deterministic evidence and report engine. Neither makes network or LLM calls. A custom model adapter can consume the case and return proposals, but it must preserve record citations and `model-proposed` state.

Do not claim that Cursor, Windsurf, VS Code extensions, or another IDE supports direct skill discovery merely because it can read Markdown. If it does not document the Agent Skills standard, attach `SKILL.md` as an instruction or add a documented host adapter and label that route separately.

## Portability test

A case is portable when a different host can:

- validate it without the original model;
- trace consequential statements to source records;
- see capability and coverage gaps;
- distinguish machine, human, and architect states;
- generate the same deterministic report surfaces;
- continue the analysis without reconstructing organisational truth from chat history.
