# harness-coding

`harness-coding` 是一个 monorepo，其中的 CLI 包名为 `@my/harness-spec`。

## 使用方式

先安装 CLI：

```bash
npm install -g @my/harness-spec
```

初始化项目时必须显式传入 `-p`：

```bash
harness-spec init -p your-name -l en --codex
harness-spec init -p your-name -l cn --codex
harness-spec init -p your-name -l en --claude
harness-spec init -p your-name -l cn --gemini
```

`-p` 是必填项，不能省略。
`-p your-name` 代表这个项目的个性化标识，也是后续工作流目录命名的依据。
`-l` 同样是必填项，不能缺省。
通过 `-l en` 或 `-l cn` 显式指定生成内容语言，这个选择会和个性化配置一起写入项目元数据。

首次执行 `init` 时，`harness-spec` 会在项目根目录的 `package.json` 中写入：

```json
{
  "harness": {
    "spec-name": "your-name",
    "language": "cn"
  }
}
```

## 工作方式

当前 `harness-spec` 只支持 3 个平台：

- Codex
- Claude Code
- Gemini CLI

执行 `init` 后，工具会生成个性化工作流目录，例如 `.${your-name}/`。
后续 `update` 不再依赖人工重新输入名称，而是通过 `package.json > harness.spec-name` 精确找到对应的个性化目录。

典型使用流程：

```bash
harness-spec init -p your-name -l cn --codex
harness-spec update
harness-spec uninstall
```

如果是在这个 monorepo 内直接使用本地未发布的 CLI，请使用：

```bash
pnpm spec:init -p your-name -l cn
pnpm spec:update
pnpm spec:uninstall
```

`update` 不需要再次传 `-p`。
它会读取 `package.json > harness.spec-name` 和 `package.json > harness.language`，
定位到 `.${your-name}`，并按已记录的语言更新该个性化目录下对应的生成内容。
