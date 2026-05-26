# Local Architecture Overview

`harness-meta` is for user projects that have already run `harness-spec init -p <your-name>`. The user's machine usually has only the installed `harness-spec` command plus the generated files inside the project; it may not have the CLI source code.

Therefore, when an AI uses this skill, the default customization target is local files inside the user project:

- The personalized workflow root, for example `.harness/`: workflow, tasks, specs, memory, scripts, and runtime state.
- Platform directories: `.claude/`, `.codex/`, `.gemini/`.
- Shared skill layer: `.agents/skills/`.
- Project metadata: `package.json` or the equivalent project config that stores `harness.spec-name`.

Do not default to guiding the user to fork the CLI repository. Treat upstream source code as the operating target only when the user explicitly says they want to change the tool upstream, publish a package, or contribute a PR.

## Local System Model

The generated workflow provides three layers inside a user project:

1. Workflow layer: `workflow.md` defines phases, routing, next actions, and prompt blocks.
2. Persistence layer: `tasks/`, `spec/`, and `workspace/` store tasks, specs, and session memory.
3. Platform integration layer: hooks, settings, agents, skills, commands, prompts, and workflows in platform directories connect the workflow to different AI tools.

All three layers live inside the user project, so an AI can read and modify them directly.

## Core Paths

All paths below are relative to the personalized workflow root, for example `.harness/`.

| Path | Purpose |
| --- | --- |
| `workflow.md` | Workflow phases, skill routing, and workflow-state prompt blocks. |
| `config.yaml` | Project configuration, task lifecycle hooks, monorepo package configuration, and journal configuration. |
| `spec/` | The project's coding conventions and thinking guides. |
| `tasks/` | Each task's PRD, technical notes, research files, and JSONL context. |
| `workspace/` | Project-owner session journals and cross-session memory. |
| `scripts/` | Local Node.js runtime used by commands, hooks, and context injection. |
| `.runtime/` | Session-level runtime state, such as the current task pointer. |
| `.template-hashes.json` | Template hashes for managed files, used by update to determine whether local files were modified by the user. |

## AI Customization Principles

1. Find the local source of truth first: do not edit from memory. Read `workflow.md`, `config.yaml`, the relevant platform directory, and related task files first.
2. Edit the user project, not the npm package cache: modify generated files inside the project, not `node_modules` or the global npm install directory.
3. Keep platform files aligned with the workflow root: if workflow routing changes, also check whether platform skills or commands still describe the same flow.
4. Put project-specific rules in `spec/` or a local skill: do not put team conventions into `harness-meta`.
5. Preserve user changes: if a file was already modified locally, work from the current content instead of overwriting it with a default template.

## How To Use This Directory

- To understand which files exist after init, read `generated-files.md`.
- To change phases, routing, or next actions, read `workflow.md`.
- To change the task model, JSONL context, or active task behavior, read `task-system.md`.
- To change coding convention injection, read `spec-system.md`.
- To understand journals and cross-session memory, read `workspace-memory.md`.
- To change hooks or sub-agent context loading, read `context-injection.md`.
