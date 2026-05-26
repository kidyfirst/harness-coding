# Local Files Generated After Init

`harness-spec init -p <your-name>` writes a personalized workflow runtime into the user project. Later, `harness-spec update` tries to update managed template files, but it uses `.template-hashes.json` inside the personalized workflow root to determine which files have already been modified by the user.

This page only describes files that are visible and editable inside the user project.

## Personalized Workflow Root

The workflow root is personalized from `harness.spec-name`, for example `.${your-name}/`.

```text
.${your-name}/
├── workflow.md
├── config.yaml
├── .project-owner
├── .version
├── .template-hashes.json
├── .runtime/
├── scripts/
├── spec/
├── tasks/
└── workspace/
```

| Path | Usually editable? | Notes |
| --- | --- | --- |
| `workflow.md` | Yes | Local workflow documentation and AI routing rules. |
| `config.yaml` | Yes | Project configuration, hooks, packages, journal line limits, and related settings. |
| `spec/` | Yes | Project specs, intended to be updated regularly by users and AI. |
| `tasks/` | Yes | Task material and research artifacts, maintained by the task workflow. |
| `workspace/` | Yes | Session records, usually written by `add_session.js`. |
| `scripts/` | Carefully | Local runtime. It can be customized, but only after understanding the call chain. |
| `.runtime/` | No | Runtime state, usually written automatically by hooks/scripts. |
| `.project-owner` | Carefully | Current project owner record. |
| `.version` | No | Version record used by update and legacy-detection logic. |
| `.template-hashes.json` | No | Template hash record. Do not hand-write business rules here. |

## Project Metadata

Node projects also store:

```json
"harness": {
  "spec-name": "<your-name>"
}
```

This value is the source of truth for resolving the personalized workflow root during `update`.

## Platform Directories

Different supported platforms generate different directories:

| Category | Example paths | Purpose |
| --- | --- | --- |
| hooks | `.claude/hooks/`, `.codex/hooks/`, `.gemini/hooks/` | Inject session context, workflow-state, and sub-agent context. |
| settings | `.claude/settings.json`, `.codex/hooks.json`, `.gemini/settings.json` | Tell the platform when to run hooks or adapters. |
| agents | `.claude/agents/`, `.codex/agents/`, `.gemini/agents/` | Define research, implement, and check agents. |
| skills | `.claude/skills/`, `.agents/skills/` | Skills that auto-trigger or can be read by AI. |
| commands/prompts/workflows | `.claude/commands/`, `.codex/skills/`, `.gemini/commands/` | Explicit user-invoked entry points. |

When modifying a platform directory, also confirm whether `workflow.md` still describes the same flow.

## Meaning Of Template Hashes

`.template-hashes.json` records the content hash from the last time `harness-spec` wrote a template file. `harness-spec update` uses it to distinguish three cases:

| Case | Update behavior |
| --- | --- |
| File was not modified by the user | It can be updated automatically. |
| File was modified by the user | Prompt the user to overwrite, keep, or generate `.new`. |
| File is no longer a current template | It may be deleted, renamed, or preserved according to migration rules. |

When an AI customizes local files, it does not need to maintain hashes manually. It is normal for `harness-spec update` to recognize the result as "modified by the user."

## Local Customization Boundaries

Editable by default:

- `workflow.md`
- `config.yaml`
- `spec/**`
- `scripts/**`
- Platform hooks, settings, agents, skills, commands, prompts, and workflows

Do not edit by default:

- Global npm install directory
- `node_modules`
- Upstream repository source code
- Concrete state files under `.runtime/**`
- Hash contents inside `.template-hashes.json`

Switch to the CLI source-code perspective only when the user explicitly wants to contribute upstream.
