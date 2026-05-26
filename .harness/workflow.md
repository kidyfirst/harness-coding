# 开发工作流

---

## 核心原则

1. **先规划，再写代码**：开始前先弄清楚要做什么
2. **规范靠注入，不靠记忆**：通过 hook 或 skill 注入规范，而不是凭记忆
3. **过程都要落盘**：研究、决策、经验都写入文件
4. **增量开发**：一次只推进一个任务
5. **沉淀经验**：每个任务结束后，把新知识回写到 spec

---

## Harness Spec 系统

### 项目归属设置

首次使用时，先初始化项目归属记录：

```bash
node ./.harness/scripts/init_project_owner.js <your-name>
```

会创建 `.harness/.project-owner` 和 `.harness/workspace/<project-owner>/`。

### Spec 系统

`.harness/spec/` 用来存放按包、按层组织的开发规范。

```bash
node ./.harness/scripts/get_context.js --mode packages
```

### Task 系统

每个任务位于 `.harness/tasks/{MM-DD-name}/`，包含 `prd.md`、`implement.jsonl`、`check.jsonl`、`task.json`、可选 `research/`、`info.md`。

```bash
node ./.harness/scripts/task.js create "<title>"
node ./.harness/scripts/task.js start <name>
node ./.harness/scripts/task.js current --source
node ./.harness/scripts/task.js finish
node ./.harness/scripts/task.js archive <name>
```

### Workspace 系统

所有 AI 会话记录都存放在 `.harness/workspace/<project-owner>/`。

```bash
node ./.harness/scripts/add_session.js --title "Title" --commit "hash" --summary "Summary"
```

### 上下文脚本

```bash
node ./.harness/scripts/get_context.js
node ./.harness/scripts/get_context.js --mode packages
node ./.harness/scripts/get_context.js --mode phase --step <X.Y>
```
