import { describe, expect, it } from "vitest";
import path from "node:path";
import { PATHS } from "../src/constants/paths.js";
import {
  PLATFORM_IDS,
  collectPlatformTemplates,
  isManagedPath,
} from "../src/configurators/index.js";
import { AI_TOOLS } from "../src/types/ai-tools.js";
import {
  addSessionScript,
  configYamlTemplate,
  getAllScripts,
  taskScript,
  workflowMdTemplate,
} from "../src/templates/harness-spec/index.js";
import {
  getAllAgents as getClaudeAgents,
  settingsTemplate as claudeSettingsTemplate,
} from "../src/templates/claude/index.js";
import { getAllAgents as getCodexAgents } from "../src/templates/codex/index.js";
import { getSharedHookScripts } from "../src/templates/shared-hooks/index.js";
import fs from "node:fs";

const REMOVED_PY_EXT = ".py";
const REMOVED_TASK_SCRIPT = "task.py";
const REMOVED_ADD_SESSION_SCRIPT = "add_session.py";
const REMOVED_INIT_SCRIPT = `__init__${REMOVED_PY_EXT}`;
const UNSUPPORTED_PLATFORM_ROOTS = [".cursor/", ".opencode/", ".kiro/"];
const UNSUPPORTED_CURSOR_COMMAND = ".cursor/commands/continue.md";
const UNSUPPORTED_KIRO_AGENT = ".kiro/agents/check.json";

describe("regression: supported platform surface only", () => {
  it("keeps the registry limited to claude-code, codex, and gemini", () => {
    expect(PLATFORM_IDS).toEqual(["claude-code", "codex", "gemini"]);
    expect(Object.keys(AI_TOOLS)).toEqual(PLATFORM_IDS);
  });

  it("collects tracked templates only for the supported platforms", () => {
    const expectedTrackedPaths = {
      "claude-code": ".claude/commands/harness-spec/continue.md",
      codex: ".codex/config.toml",
      gemini: ".gemini/settings.json",
    } as const;

    for (const [platformId, trackedPath] of Object.entries(expectedTrackedPaths)) {
      const templates = collectPlatformTemplates(
        platformId as keyof typeof expectedTrackedPaths,
      );
      expect(templates).toBeInstanceOf(Map);
      expect(templates?.has(trackedPath)).toBe(true);
      expect(
        [...(templates?.keys() ?? [])].some((entry) =>
          UNSUPPORTED_PLATFORM_ROOTS.some((prefix) => entry.startsWith(prefix)),
        ),
      ).toBe(false);
    }
  });
});

describe("regression: managed path detection", () => {
  it("accepts supported managed roots with Windows separators", () => {
    expect(isManagedPath(".claude\\commands\\harness-spec\\continue.md")).toBe(
      true,
    );
    expect(isManagedPath(".codex\\agents\\harness-check.toml")).toBe(true);
    expect(isManagedPath(".gemini\\commands\\harness-spec\\continue.toml")).toBe(
      true,
    );
    expect(isManagedPath(".alice\\workflow.md")).toBe(true);
  });

  it("rejects removed platform roots even when paths use backslashes", () => {
    expect(isManagedPath(UNSUPPORTED_CURSOR_COMMAND.replaceAll("/", "\\"))).toBe(
      false,
    );
    expect(isManagedPath(".opencode\\config.json")).toBe(false);
    expect(isManagedPath(UNSUPPORTED_KIRO_AGENT.replaceAll("/", "\\"))).toBe(
      false,
    );
  });
});

describe("regression: workflow root path contract", () => {
  it("uses the personalized workflow placeholder for task storage", () => {
    expect(PATHS.TASKS).toBe("WORKFLOW_ROOT/tasks");
    expect(PATHS.TASKS).not.toContain(".alice");
    expect(PATHS.TASKS).not.toContain("workspace");
  });

  it("documents the shipped personalized-root and harness-spec entrypoints", () => {
    expect(workflowMdTemplate.toLowerCase()).toContain("harness spec system");
    expect(workflowMdTemplate).toContain(".${your-name}/spec/");
    expect(workflowMdTemplate).toContain(
      "node ./.${your-name}/scripts/get_context.js",
    );
    expect(configYamlTemplate).toContain("codex:");
  });
});

describe("regression: runtime entrypoints are JavaScript-first", () => {
  it("exposes only .js runtime entrypoints from getAllScripts()", () => {
    const runtimeScripts = getAllScripts();
    expect([...runtimeScripts.keys()].sort()).toEqual([
      "add_session.js",
      "get_context.js",
      "get_project_owner.js",
      "init_project_owner.js",
      "task.js",
    ]);
    expect(
      [...runtimeScripts.keys()].every(
        (entry) => entry.endsWith(".js") && !entry.endsWith(REMOVED_PY_EXT),
      ),
    ).toBe(true);
  });

  it("keeps task.js on the Node/current-task contract", () => {
    expect(taskScript).toContain("#!/usr/bin/env node");
    expect(taskScript).toContain('const currentTaskFile = path.join(cwd, workflowRoot, ".current-task")');
    expect(taskScript).toContain("Current task: ${workflowRoot}/tasks/${current}");
    expect(taskScript).not.toContain(REMOVED_TASK_SCRIPT);
  });

  it("keeps add_session.js on the Node/workspace journal contract", () => {
    expect(addSessionScript).toContain("#!/usr/bin/env node");
    expect(addSessionScript).toContain('const workflowRoot = scriptPath');
    expect(addSessionScript).toContain('path.join(cwd, workflowRoot, "workspace", projectOwner)');
    expect(addSessionScript).not.toContain(REMOVED_ADD_SESSION_SCRIPT);
  });

  it("stores markdown spec localization under en/cn directories only", () => {
    const markdownRoot = path.join(
      process.cwd(),
      "src",
      "templates",
      "markdown",
      "spec",
    );

    expect(fs.existsSync(path.join(markdownRoot, "backend", "cn"))).toBe(true);
    expect(fs.existsSync(path.join(markdownRoot, "frontend", "cn"))).toBe(true);
    expect(fs.existsSync(path.join(markdownRoot, "guides", "cn"))).toBe(true);

    expect(
      fs.existsSync(path.join(markdownRoot, "backend", "index.cn.md.txt")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(markdownRoot, "backend", "index.md.txt")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(markdownRoot, "guides", "index.cn.md.txt")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(markdownRoot, "frontend", "index.md.txt")),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(markdownRoot, "guides", "index.md.txt")),
    ).toBe(false);
  });
});

describe("regression: supported template naming", () => {
  it("claude and codex agent exports publish harness-* names", () => {
    expect(getClaudeAgents().length).toBeGreaterThan(0);
    expect(getCodexAgents().length).toBeGreaterThan(0);
    expect(getClaudeAgents().every((agent) => agent.name.startsWith("harness-"))).toBe(
      true,
    );
    expect(getCodexAgents().every((agent) => agent.name.startsWith("harness-"))).toBe(
      true,
    );
  });

  it("claude settings reference JavaScript hook files only", () => {
    const settings = JSON.parse(claudeSettingsTemplate) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    const commands = Object.values(settings.hooks)
      .flat()
      .flatMap((entry) => entry.hooks.map((hook) => hook.command));

    expect(commands.some((command) => command.endsWith(REMOVED_PY_EXT))).toBe(
      false,
    );
    expect(commands.some((command) => command.includes("session-start.js"))).toBe(
      true,
    );
  });

  it("shared hook registry distributes .js runtime files only", () => {
    const hookNames = getSharedHookScripts().map((hook) => hook.name);
    expect(hookNames.length).toBeGreaterThan(0);
    expect(hookNames.every((name) => name.endsWith(".js"))).toBe(true);
  });
});

describe("regression: repository fixtures stay on harness naming", () => {
  it("resolves harness-spec fixture paths without legacy package names", () => {
    const trackedPaths = [...collectPlatformTemplates("codex")!.keys()];
    const skillPath = trackedPaths.find((entry) =>
      entry.endsWith(path.join(".agents", "skills", "harness-meta", "SKILL.md")),
    );

    expect(skillPath).toBe(".agents/skills/harness-meta/SKILL.md");
  });

  it("removes legacy Python helper exports from the runtime template registry", () => {
    expect([...getAllScripts().keys()]).not.toContain(REMOVED_INIT_SCRIPT);
  });

  it("documents explicit -p and -l requirements in both README files", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf-8");
    const readmeCn = fs.readFileSync(
      path.join(repoRoot, "README_CN.md"),
      "utf-8",
    );

    expect(readme).toContain("harness-spec init -p your-name -l en");
    expect(readme).toContain("harness-spec init -p your-name -l cn");
    expect(readmeCn).toContain("harness-spec init -p your-name -l en");
    expect(readmeCn).toContain("harness-spec init -p your-name -l cn");
  });
});
