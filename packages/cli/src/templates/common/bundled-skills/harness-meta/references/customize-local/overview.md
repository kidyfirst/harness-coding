# Local Customization Overview

This directory is for local AI working in a user project where `harness-spec init -p <your-name>` has already been run. The AI should modify the personalized workflow root and supported platform directories inside the project, not upstream CLI source code.

## First Determine What The User Actually Wants To Change

| User wording | Read first |
| --- | --- |
| "Change the workflow / phases / next prompt" | `change-workflow.md` |
| "Change task creation, status, archive, or hooks" | `change-task-lifecycle.md` |
| "AI did not read context / change injected content" | `change-context-loading.md` |
| "A platform hook is not behaving as expected" | `change-hooks.md` |
| "Change implement/check/research agent behavior" | `change-agents.md` |
| "Add a skill/command/workflow/prompt" | `change-skills-or-commands.md` |
| "Adjust the project spec structure" | `change-spec-structure.md` |
| "Add team conventions and local notes" | `add-project-local-conventions.md` |

## General Operation Order

1. Confirm platform and directories: inspect which directories exist, such as `.claude/`, `.codex/`, `.gemini/`.
2. Confirm the current active task: run `node ./.${your-name}/scripts/task.js current --source`.
3. Read the local source of truth: prefer `workflow.md`, `config.yaml`, and relevant platform files under the personalized workflow root.
4. Modify narrowly: edit only files related to the user's request.
5. Synchronize semantics: if a shared flow changes, check whether platform entry points also need changes; if a platform entry changes, check whether `workflow.md` still agrees.

## Local File Priority

| Layer | Files |
| --- | --- |
| Workflow | `.${your-name}/workflow.md` |
| Project configuration | `.${your-name}/config.yaml` |
| Task material | `.${your-name}/tasks/<task>/` |
| Project specs | `.${your-name}/spec/` |
| Runtime scripts | `.${your-name}/scripts/` |
| Platform integration | `.claude/`, `.codex/`, `.gemini/` |
| Shared skill | `.agents/skills/` |

## Things Not To Do By Default

- Do not edit the global npm install directory.
- Do not edit `node_modules`.
- Do not assume the user has the upstream Git repository.
- Do not overwrite local files already modified by the user with default templates.
- Do not put team project rules into public `harness-meta`; project rules belong in `spec/` or a local skill.

## When To Inspect Upstream Source

Switch to an upstream source-code perspective only when the user explicitly expresses one of these goals:

- "I want to open a PR upstream"
- "I want to change npm package publish contents"
- "I want to fork this tool"
- "I want to modify the generation logic for `harness-spec init` or `harness-spec update`"

Otherwise, default to modifying local generated files inside the user project.
