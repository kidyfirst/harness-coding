# Platform Files Overview

The generated workflow connects the same local architecture to different AI tools. The personalized workflow root stores the shared runtime; platform directories store adapter files that define how each AI tool enters the workflow.

When local AI modifies behavior, it should distinguish two file categories first:

- Shared files: `workflow.md`, `tasks/`, `spec/`, `scripts/`.
- Platform files: `.claude/`, `.codex/`, `.gemini/`, and `.agents/skills/`.

Platform files do not store business state. They let the corresponding AI tool read workflow state, call workflow scripts, and load local skills or agents.

## Platform File Categories

| Category | Common paths | Purpose |
| --- | --- | --- |
| settings/config | `.claude/settings.json`, `.codex/hooks.json`, `.gemini/settings.json` | Register hooks, plugins, extensions, or platform behavior. |
| hooks/plugins/extensions | `.claude/hooks/`, `.codex/hooks/`, `.gemini/hooks/` | Inject context at session start, user input, agent startup, shell execution, and similar events. |
| agents | `.claude/agents/`, `.codex/agents/`, `.gemini/agents/` | Define research, implement, and check roles. |
| skills | `.claude/skills/`, `.agents/skills/` | Capability descriptions that auto-trigger or can be read on demand. |
| commands/prompts/workflows | `.claude/commands/`, `.codex/skills/`, `.gemini/commands/` | Entry points explicitly invoked by the user. |

## Three Platform Integration Modes

### 1. Hook Or Extension Driven

These platforms can trigger scripts or plugins on specific events and actively inject context into AI.

Common capabilities:

- session-start injection of a workflow overview
- workflow-state hints for each user turn
- PRD/spec/research injection when sub-agents start
- shell commands inheriting session identity

To change "when the AI knows what," inspect hooks/extensions and settings first.

### 2. Agent Prelude Or Pull-Based

Some platforms cannot reliably let hooks rewrite sub-agent prompts, so the agent file itself instructs the agent to read the active task, PRD, and JSONL context after startup.

To change how sub-agents load context, inspect the agent files themselves.

### 3. Main-Session Workflow

Some platforms do not have full sub-agent or hook capabilities. They rely on workflows, skills, or commands to guide the main-session AI to read files, run scripts, and move tasks forward.

To change behavior, inspect platform workflows/skills/commands and `workflow.md`.

## Local Modification Order

When the user asks to customize behavior for a platform, inspect files in this order:

1. Read `workflow.md` to confirm the shared flow.
2. Read the target platform's settings/config to see which hooks, agents, skills, or commands are registered.
3. Read the target platform's agents, skills, commands, or hooks.
4. Modify the local file closest to the user's need.
5. If the change affects the shared flow, synchronize `workflow.md` or `spec/`.

Do not modify only platform files and forget the shared workflow. Do not modify only `workflow.md` and forget that platform entry points may still contain old descriptions.
