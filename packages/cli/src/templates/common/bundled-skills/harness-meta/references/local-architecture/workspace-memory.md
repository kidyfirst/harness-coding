# Local Workspace Memory System

`workspace/` stores cross-session memory. Its purpose is to let AI and humans understand what happened before across different windows and different days.

All paths below are relative to the personalized workflow root, for example `.${your-name}/`.

## Directory Structure

```text
workspace/
├── index.md
└── <project-owner>/
    ├── index.md
    ├── journal-1.md
    └── journal-2.md
```

| File | Purpose |
| --- | --- |
| `.project-owner` | Current project owner record. |
| `workspace/index.md` | Global workspace overview. |
| `workspace/<project-owner>/index.md` | Session index for the current project owner. |
| `workspace/<project-owner>/journal-N.md` | Session journal. |

## Project Ownership

The personalized workflow root should already be linked to the user identity chosen during `harness-spec init -p <your-name>`. If the project needs to initialize or repair the local project owner record, run:

```bash
node ./.${your-name}/scripts/init_project_owner.js <name>
```

This creates `.project-owner` and the corresponding workspace directory. The AI should not change project owner record casually; if the identity is wrong, first confirm who is using the current project.

## Journal

`journal-N.md` records completed or partially completed work from each session. By default, each journal holds about 2000 lines; after that it rotates to the next file.

Common command for recording a session:

```bash
node ./.${your-name}/scripts/add_session.js \
  --title "Session title" \
  --summary "What changed" \
  --commit "abc1234"
```

Planning or review work without a commit can also be recorded by using `--no-commit` or an empty commit value.

## Relationship Between Workspace Memory And Tasks

| System | What it stores |
| --- | --- |
| `tasks/` | Requirements, design, research, and state for a specific task. |
| `workspace/` | Work records across tasks and sessions. |
| `spec/` | Engineering knowledge preserved as long-term conventions. |

If information is only useful for the current task, put it in the task directory.  
If information describes what happened in the current session, put it in the workspace journal.  
If information should be followed every time code is written in the future, put it in spec.

## Local Customization Points

| Need | Edit location |
| --- | --- |
| Change maximum journal lines | `max_journal_lines` in `config.yaml`. |
| Change session auto-commit message | `session_commit_message` in `config.yaml`. |
| Change session content format | `scripts/add_session.js`. |
| Change how workspace is displayed in context | `scripts/common/session_context.*`. |

## AI Usage Rules

The AI should not treat workspace as the only source of truth. When resuming a task, read the current task first, then use workspace for background. After a task is complete, record important process notes in workspace; if long-term rules emerged, update spec.
