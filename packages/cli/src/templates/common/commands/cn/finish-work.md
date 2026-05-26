# Finish Work（中文）

收尾当前会话：归档活动任务并记录 session journal。代码提交不在这里完成，提交属于工作流 Phase 3.4。

## 第一步：查看当前状态

```bash
node ./.${your-name}/scripts/get_context.js --mode record
```

查看活动任务、git 状态和最近提交。如果还有其他已完成任务，询问用户是否一并归档。

## 第二步：检查脏文件

```bash
git status --porcelain
```

忽略 `.${your-name}/workspace/` 和 `.${your-name}/tasks/` 下的路径。

- 如果剩余路径属于当前任务：停止，并提醒用户先回到 Phase 3.4 提交代码，再运行 `{{CMD_REF:finish-work}}`
- 如果剩余路径明显属于其他并行工作：告知后继续
- 如果无法判断：只问用户一次

## 第三步：归档任务

```bash
node ./.${your-name}/scripts/task.js archive <task-name>
```

归档当前任务，以及用户确认要一起清理的其他任务。

## 第四步：记录会话日志

```bash
node ./.${your-name}/scripts/add_session.js \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary"
```

`--commit` 使用 Phase 3.4 的工作提交，不要包含归档提交。
