# Change Local Task Lifecycle

Task lifecycle includes creation, start, context configuration, finish, archive, parent/child tasks, and lifecycle hooks. The default customization targets are `tasks/`, `config.yaml`, and `scripts/` inside the personalized workflow root.

## Read These Files First

1. `workflow.md`
2. `config.yaml`
3. `scripts/task.js`
4. `scripts/common/task_store.*`
5. `scripts/common/task_utils.*`
6. The current task's `tasks/<task>/task.json`

All paths above are relative to the personalized workflow root, for example `.${your-name}/`.

## Common Needs And Edit Points

| Need | Edit point |
| --- | --- |
| Automatically sync an external system after task creation | `hooks.after_create` in `config.yaml`. |
| Automatically update status after task start | `hooks.after_start` in `config.yaml`. |
| Run a script after task finish | `hooks.after_finish` in `config.yaml`. |
| Clean external resources after archive | `hooks.after_archive` in `config.yaml`. |
| Change default task fields | `scripts/common/task_store.*`. |
| Change task parsing/search | `scripts/common/task_utils.*`. |
| Change active task behavior | `scripts/common/active_task.*`. |

## Lifecycle Hooks

`config.yaml` supports:

```yaml
hooks:
  after_create:
    - "node .${your-name}/scripts/hooks/my_sync.js create"
  after_start:
    - "node .${your-name}/scripts/hooks/my_sync.js start"
  after_finish:
    - "node .${your-name}/scripts/hooks/my_sync.js finish"
  after_archive:
    - "node .${your-name}/scripts/hooks/my_sync.js archive"
```

Hook commands receive the `TASK_JSON_PATH` environment variable, pointing to the current task's `task.json`. Hook failures should usually warn, but not block the main task operation.

## Change Task Fields

If the user wants to add project-local fields, prefer putting them under `meta` in `task.json` to avoid breaking existing scripts' assumptions about standard fields.

Example:

```json
"meta": {
  "linearIssue": "ENG-123",
  "risk": "high"
}
```

If standard fields really need to change, inspect every local script that reads `task.json`.

## Change Active Task

Active task is session-level state stored in `.runtime/sessions/`. Do not fall back to a global `.current-task` model. If the user wants to change active task behavior, edit:

- `scripts/common/active_task.*`
- platform hooks or shell session bridges
- active task descriptions in `workflow.md`

### `task.js create` Sets The Active Pointer

The create command should set the active task best-effort right after writing the new task directory.

- When the calling shell carries session identity, the per-session pointer at `.runtime/sessions/<context-key>.json` is rewritten to point at the new task. The task's `status=planning` and `[workflow-state:planning]` fire on the very next user turn.
- When session identity is unavailable, the task directory is still created and `status=planning` is still written, but the active pointer is left untouched. The user can attach the task later with `task.js start <dir>` once they are back in an AI session.

If you add a new creation path, audit whether that path also sets the active task. Without that call, created tasks will not surface as active.

## Modification Steps

1. Confirm the current task with `node ./.${your-name}/scripts/task.js current --source`.
2. Read the current task's `task.json` and confirm status and fields.
3. For configuration needs, edit `config.yaml` first.
4. For script behavior needs, then edit `scripts/`.
5. If the AI flow changed, synchronize `workflow.md`.

## Do Not

- Do not directly edit `.runtime/sessions/` to "fix" business state.
- Do not hard-code project-private fields into scripts; prefer `meta`.
- Do not default to asking the user to fork the upstream CLI.
