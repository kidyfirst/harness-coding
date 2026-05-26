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
node ./.${your-name}/scripts/init_project_owner.js <your-name>
```

会创建 `.${your-name}/.project-owner` 和 `.${your-name}/workspace/<project-owner>/`。

### Spec 系统

`.${your-name}/spec/` 用来存放按包、按层组织的开发规范。

```bash
node ./.${your-name}/scripts/get_context.js --mode packages
```

### Task 系统

每个任务位于 `.${your-name}/tasks/{MM-DD-name}/`，包含 `prd.md`、`implement.jsonl`、`check.jsonl`、`task.json`、可选 `research/`、`info.md`。

```bash
node ./.${your-name}/scripts/task.js create "<title>"
node ./.${your-name}/scripts/task.js start <name>
node ./.${your-name}/scripts/task.js current --source
node ./.${your-name}/scripts/task.js finish
node ./.${your-name}/scripts/task.js archive <name>
```

### Workspace 系统

所有 AI 会话记录都存放在 `.${your-name}/workspace/<project-owner>/`。

```bash
node ./.${your-name}/scripts/add_session.js --title "Title" --commit "hash" --summary "Summary"
```

### 上下文脚本

```bash
node ./.${your-name}/scripts/get_context.js
node ./.${your-name}/scripts/get_context.js --mode packages
node ./.${your-name}/scripts/get_context.js --mode phase --step <X.Y>
```
