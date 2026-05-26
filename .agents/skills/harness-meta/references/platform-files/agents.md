# Agents

Agent files define specialized roles. Common local agents in a user project are:

- research
- implement
- check

File locations and formats differ by platform, but responsibility boundaries should stay consistent.

## Agent Responsibilities

| Agent | Responsibility |
| --- | --- |
| research | Investigate the question and write findings into the current task's `research/`. |
| implement | Implement against `prd.md`, `info.md`, `implement.jsonl`, and related spec/research. |
| check | Review changes, fix discovered issues, and run necessary checks. |

Agent files should not become generic chat prompts. They should define input sources, write boundaries, whether code may be changed, and how results are reported.

## Common Paths

| Platform | Agent path |
| --- | --- |
| Claude Code | `.claude/agents/` |
| Codex | `.codex/agents/` |
| Gemini CLI | `.gemini/agents/` |

Main-session workflow platforms may not have separate agent files. They rely on workflows or skills to guide the main session.

## Two Context Loading Modes

### Hook Push

The platform hook injects task context before the agent starts. The agent file itself can focus more on responsibilities and boundaries.

### Agent Pull

The agent file instructs the agent to read after startup:

- `node ./.harness/scripts/task.js current --source`
- current task `prd.md`
- `info.md`
- `implement.jsonl` or `check.jsonl`
- spec/research files referenced by JSONL

This mode fits platforms whose hooks cannot reliably rewrite sub-agent prompts.

## Local Change Scenarios

| User need | Edit location |
| --- | --- |
| Implement agent must follow extra restrictions | The platform's implement agent file. |
| Check agent must run project-specific commands | The check agent file, and `spec/` if needed. |
| Research agent must output a fixed format | The research agent file. |
| Agent cannot read task context | Agent prelude or `inject-subagent-context` hook. |
| Add a project-specific agent | Platform agent directory + related workflow/command/skill entry point. |

## Modification Principles

1. Keep responsibilities single-purpose.
2. Specify the read order.
3. Specify write boundaries.
4. Keep semantics synchronized in multi-platform projects.

## Do Not Default To Editing Upstream Templates

Local AI should default to modifying platform agent files inside the user project. Discuss upstream template source only when the user explicitly wants to contribute the change back upstream.
