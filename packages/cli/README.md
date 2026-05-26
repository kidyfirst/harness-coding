# harness-coding

`harness-coding` is a monorepo. Its CLI package is `@kidyfirst/harness-spec`.

## Usage

Install the CLI:

```bash
npm install -g @kidyfirst/harness-spec
```

Initialize a project:

```bash
harness-spec init -p your-name -l en --codex
harness-spec init -p your-name -l cn --codex
harness-spec init -p your-name -l en --claude
harness-spec init -p your-name -l cn --gemini
```

`-p` is required every time you run `init`.
Do not omit it.
`-p your-name` is the personalization key for the project and defines the workflow root that the tool manages.
`-l` is also required every time you run `init`.
Use `-l en` or `-l cn` to choose the generated markdown language, and this choice is stored in the project metadata.

On first init, `harness-spec` writes this into the project root `package.json`:

```json
{
  "harness": {
    "spec-name": "your-name",
    "language": "en"
  }
}
```

## Working Model

`harness-spec` currently supports only 3 platforms:

- Codex
- Claude Code
- Gemini CLI

After `init`, the tool generates a personalized workflow root such as `.${your-name}/`.
The personalization is stable because later commands read `package.json > harness.spec-name` instead of guessing.

Typical flow:

```bash
harness-spec init -p your-name -l en --codex
harness-spec update
harness-spec uninstall
```

Inside this monorepo, when using the local unpublished CLI, use:

```bash
pnpm spec:init -p your-name -l en
pnpm spec:update
pnpm spec:uninstall
```

`update` does not require `-p` again.
It reads `package.json > harness.spec-name` and `package.json > harness.language`,
resolves `.${your-name}`, and updates the matching generated files for that personalized workflow root in the stored language.
