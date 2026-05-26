# 工作区索引

> 记录所有项目归属者与 AI 协作的工作过程。

---

## 概览

该目录用于追踪项目中所有项目归属者的 AI 协作记录。

### 目录结构

```text
workspace/
|-- index.md              # 总索引
+-- {project-owner}/      # 项目归属目录
    |-- index.md          # 项目归属索引
    |-- tasks/            # 任务文件
    |   |-- *.json
    |   +-- archive/
    +-- journal-N.md      # 会话日志
```

---

## 当前项目归属者

| Project Owner | Last Active | Sessions | Active File |
|-----------|-------------|----------|-------------|
| (none yet) | - | - | - |

---

## 使用说明

### 新项目归属者

```bash
node ./.${your-name}/scripts/init_project_owner.js <your-name>
```

### 已有项目归属者

```bash
node ./.${your-name}/scripts/get_project_owner.js
cat .${your-name}/workspace/$(node ./.${your-name}/scripts/get_project_owner.js)/index.md
```
