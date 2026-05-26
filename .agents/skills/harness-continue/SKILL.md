---
name: harness-continue
description: "Resume work on the current task. Loads the workflow Phase Index, figures out which phase or step to pick up at, then pulls the step-level detail via the generated get_context.js runtime. Use when coming back to an in-progress task and you need to know what to do next."
---

# Continue Current Task（中文）

继续当前任务，并在 `.harness/workflow.md` 中恢复到正确的阶段或步骤。

---

## 第一步：加载当前上下文

```bash
node ./.harness/scripts/get_context.js
```

确认当前任务、git 状态和最近提交。

## 第二步：读取阶段索引

```bash
node ./.harness/scripts/get_context.js --mode phase
```

查看 Plan / Execute / Finish 的阶段索引与路由说明。

## 第三步：判断当前所处位置

根据任务 `status` 和产物状态判断：

- `status=planning` 且没有 `prd.md`：进入 **1.1**
- `status=planning` 且 `prd.md` 已存在但 `implement.jsonl` 未整理：进入 **1.3**
- `status=planning` 且 `prd.md` 与 `implement.jsonl` 都已就绪：进入 **1.4**
- `status=in_progress` 且尚未开始实现：进入 **2.1**
- `status=in_progress` 且实现完成但未检查：进入 **2.2**
- `status=in_progress` 且检查已完成：进入 **3.1**
- `status=completed`：进入归档流程

## 第四步：加载具体步骤

```bash
node ./.harness/scripts/get_context.js --mode phase --step <X.X> --platform codex
```

按加载出的要求执行，并在完成后进入下一个必需步骤。

---

## 参考

完整工作流与规则以 `.harness/workflow.md` 为准，这个命令只是恢复入口。
