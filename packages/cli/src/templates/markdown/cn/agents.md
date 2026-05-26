<!-- HARNESS:START -->
# Harness Spec 说明

这些说明提供给在当前项目中工作的 AI 助手。

本项目由 `harness-spec` 管理。你需要的工作流知识位于 `{{WORKFLOW_ROOT}}/`：

- `{{WORKFLOW_ROOT}}/workflow.md`：开发阶段、何时创建任务、skill 路由
- `{{WORKFLOW_ROOT}}/spec/`：按 package 和层级组织的编码规范
- `{{WORKFLOW_ROOT}}/workspace/`：按项目归属记录的会话日志与轨迹
- `{{WORKFLOW_ROOT}}/tasks/`：活跃与归档任务、PRD、研究资料和上下文

如果你的平台提供 Harness 命令，优先使用这些命令而不是手动步骤。不同平台暴露出来的命令形式不完全相同。

如果你正在使用 Codex 或其他支持 agent 的工具，项目内还可能包含这些辅助目录：
- `.agents/skills/`：可复用的 Harness skills
- `.codex/agents/`：可选的自定义子代理

由 `harness-spec` 管理。此区块外的编辑会被保留；此区块内的编辑在后续执行 `harness-spec update` 时可能被覆盖。

<!-- HARNESS:END -->
