# Development Workflow

---

## Core Principles

1. **Plan before code** - figure out what to do before you start
2. **Specs injected, not remembered** - guidelines are injected via hook or skill, not recalled from memory
3. **Persist everything** - research, decisions, and lessons all go to files; conversations get compacted, files don't
4. **Incremental development** - one task at a time
5. **Capture learnings** - after each task, review and write new knowledge back to spec

---

## Harness Spec System

### Project Ownership

On first use, initialize the project owner record:

```bash
node ./.${your-name}/scripts/init_project_owner.js <your-name>
```

Creates `.${your-name}/.project-owner` (gitignored) + `.${your-name}/workspace/<project-owner>/`.

### Spec System

`.${your-name}/spec/` holds coding guidelines organized by package and layer.

- `.${your-name}/spec/<package>/<layer>/index.md` - entry point with **Pre-Development Checklist** + **Quality Check**. Actual guidelines live in the `.md` files it points to.
- `.${your-name}/spec/guides/index.md` - cross-package thinking guides.

```bash
node ./.${your-name}/scripts/get_context.js --mode packages
```

**When to update spec**: new pattern or convention found, bug-fix prevention to codify, new technical decision.

### Task System

Every task has its own directory under `.${your-name}/tasks/{MM-DD-name}/` holding `prd.md`, `implement.jsonl`, `check.jsonl`, `task.json`, optional `research/`, and `info.md`.

```bash
# Task lifecycle
node ./.${your-name}/scripts/task.js create "<title>" [--slug <name>] [--parent <dir>]
node ./.${your-name}/scripts/task.js start <name>
node ./.${your-name}/scripts/task.js current --source
node ./.${your-name}/scripts/task.js finish
node ./.${your-name}/scripts/task.js archive <name>
node ./.${your-name}/scripts/task.js list [--mine] [--status <s>]
node ./.${your-name}/scripts/task.js list-archive

# Code-spec context
node ./.${your-name}/scripts/task.js add-context <name> <action> <file> <reason>
node ./.${your-name}/scripts/task.js list-context <name> [action]
node ./.${your-name}/scripts/task.js validate <name>

# Task metadata
node ./.${your-name}/scripts/task.js set-branch <name> <branch>
node ./.${your-name}/scripts/task.js set-base-branch <name> <branch>
node ./.${your-name}/scripts/task.js set-scope <name> <scope>

# Hierarchy
node ./.${your-name}/scripts/task.js add-subtask <parent> <child>
node ./.${your-name}/scripts/task.js remove-subtask <parent> <child>

# PR creation
node ./.${your-name}/scripts/task.js create-pr [name] [--dry-run]
```

> Run `node ./.${your-name}/scripts/task.js --help` to see the authoritative, up-to-date list.

### Workspace System

Records every AI session for cross-session tracking under `.${your-name}/workspace/<project-owner>/`.

- `journal-N.md` - session log. **Max 2000 lines per file**; a new `journal-(N+1).md` is auto-created when exceeded.
- `index.md` - project-owner index (total sessions, last active).

```bash
node ./.${your-name}/scripts/add_session.js --title "Title" --commit "hash" --summary "Summary"
```

### Context Script

```bash
node ./.${your-name}/scripts/get_context.js
node ./.${your-name}/scripts/get_context.js --mode packages
node ./.${your-name}/scripts/get_context.js --mode phase --step <X.Y>
```

---

## Phase Index

```text
Phase 1: Plan    -> figure out what to do (brainstorm + research -> prd.md)
Phase 2: Execute -> write code and pass quality checks
Phase 3: Finish  -> distill lessons + wrap-up
```

[workflow-state:no_task]
No active task.
**A Direct answer** - pure Q&A, explanation, lookup, or chat; no file writes and a one-line answer.
**B Create a task** - any implementation, code change, build, or refactor work. Start with `node ./.${your-name}/scripts/task.js create "<title>"`, then use the brainstorm flow.
**C Inline change** - only when the user's current message explicitly says to skip the workflow and do it directly.
[/workflow-state:no_task]

### Phase 1: Plan

- 1.0 Create task `[required · once]`
- 1.1 Requirement exploration `[required · repeatable]`
- 1.2 Research `[optional · repeatable]`
- 1.3 Configure context `[required · once]`
- 1.4 Activate task `[required · once]`
- 1.5 Completion criteria

[workflow-state:planning]
Load the `harness-brainstorm` skill and iterate on `prd.md` with the user.
Phase 1.3: before `task.js start`, curate `implement.jsonl` and `check.jsonl` so sub-agents get the right spec context.
Then run `node ./.${your-name}/scripts/task.js start <task-dir>` to flip status to in-progress.
[/workflow-state:planning]

### Phase 2: Execute

- 2.1 Implement `[required · repeatable]`
- 2.2 Quality check `[required · repeatable]`
- 2.3 Rollback `[on demand]`

[workflow-state:in_progress]
**Tools**: `harness-implement` and `harness-research` are sub-agent types, not skills. `harness-update-spec` is a skill. `harness-check` exists as both; prefer the agent form when verifying after code changes.
**Flow**: harness-implement -> harness-check -> harness-update-spec -> commit -> `/harness-spec:finish-work`.
**Main-session default**: dispatch `harness-implement` and `harness-check` sub-agents. The main agent does not edit code by default.
**Sub-agent self-exemption**: if you are already running as `harness-implement` or `harness-check`, work directly and do not spawn another one.
[/workflow-state:in_progress]

### Phase 3: Finish

- 3.1 Quality verification `[required · repeatable]`
- 3.2 Debug retrospective `[on demand]`
- 3.3 Spec update `[required · once]`
- 3.4 Commit changes `[required · once]`
- 3.5 Wrap-up reminder

[workflow-state:completed]
Code committed via Phase 3.4; run `/harness-spec:finish-work` to wrap up by archiving the task and recording the session.
If you reach this state with uncommitted code, return to Phase 3.4 first.
[/workflow-state:completed]

### Rules

1. Identify which phase you are in, then continue from the next step there.
2. Run steps in order inside each phase; `[required]` steps cannot be skipped.
3. Phases can roll back when new findings require it.
4. Steps tagged `[once]` are skipped if the output already exists.

### Skill Routing

| User intent | Route |
|---|---|
| Wants a new feature or requirements are unclear | `harness-brainstorm` |
| About to write code or start implementing | Dispatch the `harness-implement` sub-agent |
| Finished writing or wants to verify | Dispatch the `harness-check` sub-agent |
| Stuck or fixed the same bug several times | `harness-break-loop` |
| Spec needs update | `harness-update-spec` |
