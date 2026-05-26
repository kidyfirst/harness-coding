/**
 * Integration tests for the harness-spec init() command.
 *
 * These tests intentionally cover only the supported first-release surface:
 * Claude Code, Codex, and Gemini with a personalized workflow root.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "HARNESS SPEC") },
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({}) },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockReturnValue(""),
}));

import { init } from "../../src/commands/init.js";
import { VERSION } from "../../src/constants/version.js";
import { execSync } from "node:child_process";

const DEFAULT_PROJECT = "alice";
const DEFAULT_LANG = "en";
const UNSUPPORTED_WORKFLOW_ROOT = ".legacy-workflow";
const REMOVED_TASK_SCRIPT = "task.py";
const REMOVED_CONTEXT_SCRIPT = "get_context.py";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function listFilesRecursive(root: string): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        results.push(path.relative(root, fullPath));
      }
    }
  }

  walk(root);
  return results.sort();
}

describe("init() integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-init-int-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.mocked(execSync).mockClear();
    vi.mocked(execSync).mockImplementation((() => "") as typeof execSync);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("requires -p and rejects init without a personalized name", async () => {
    await expect(init({ yes: true, claude: true, lang: DEFAULT_LANG })).rejects.toThrow(
      /-p|--project|required/i,
    );
  });

  it("requires -l and rejects init without an explicit language", async () => {
    await expect(
      init({ yes: true, project: DEFAULT_PROJECT, claude: true }),
    ).rejects.toThrow(/-l|--lang|language|required/i);
  });

  it("rejects unsupported language values", async () => {
    await expect(
      init({
        yes: true,
        project: DEFAULT_PROJECT,
        claude: true,
        lang: "jp",
      } as never),
    ).rejects.toThrow(/-l|--lang|en|cn|language/i);
  });

  it("creates the personalized workflow root and writes harness metadata", async () => {
    await init({ yes: true, project: DEFAULT_PROJECT, claude: true, lang: DEFAULT_LANG });

    expect(fs.existsSync(path.join(tmpDir, ".alice"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".alice", "scripts"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".alice", "workspace"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".alice", "tasks"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".alice", "spec"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, UNSUPPORTED_WORKFLOW_ROOT))).toBe(
      false,
    );

    const packageJson = readJson<{
      harness?: { "spec-name"?: string; language?: string };
    }>(path.join(tmpDir, "package.json"));
    expect(packageJson.harness?.["spec-name"]).toBe(DEFAULT_PROJECT);
    expect(packageJson.harness?.language).toBe(DEFAULT_LANG);

    const agentsContent = fs.readFileSync(
      path.join(tmpDir, "AGENTS.md"),
      "utf-8",
    );
    expect(agentsContent).not.toContain(REMOVED_TASK_SCRIPT);
    expect(agentsContent).not.toContain(REMOVED_CONTEXT_SCRIPT);
    expect(agentsContent).toContain(".alice/");

    const workflowContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "workflow.md"),
      "utf-8",
    );
    expect(workflowContent).not.toContain(REMOVED_TASK_SCRIPT);
    expect(workflowContent).not.toContain(REMOVED_CONTEXT_SCRIPT);
    expect(workflowContent).toContain("node ./.alice/scripts/get_context.js");

    const runtimeFiles = listFilesRecursive(path.join(tmpDir, ".alice", "scripts"));
    expect(runtimeFiles).toEqual(
      expect.arrayContaining([
        "add_session.js",
        "get_context.js",
        "get_project_owner.js",
        "init_project_owner.js",
        "task.js",
      ]),
    );
    expect(runtimeFiles.some((file) => file.endsWith(".py"))).toBe(false);

    expect(fs.existsSync(path.join(tmpDir, ".alice", ".version"))).toBe(true);
    expect(
      fs.readFileSync(path.join(tmpDir, ".alice", ".version"), "utf-8").trim(),
    ).toBe(VERSION);

    expect(
      fs.existsSync(path.join(tmpDir, ".alice", ".template-hashes.json")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, UNSUPPORTED_WORKFLOW_ROOT, ".template-hashes.json"),
      ),
    ).toBe(false);
  });

  it("stops when the project is already initialized and tells the user to run update", async () => {
    await init({
      yes: true,
      project: DEFAULT_PROJECT,
      claude: true,
      lang: DEFAULT_LANG,
    });

    await expect(
      init({
        yes: true,
        project: DEFAULT_PROJECT,
        claude: true,
        lang: DEFAULT_LANG,
      }),
    ).rejects.toThrow(/already initialized|already configured|harness-spec update/i);
  });

  it("claude-only init writes only Claude assets from the supported platform set", async () => {
    await init({ yes: true, project: DEFAULT_PROJECT, claude: true, lang: DEFAULT_LANG });

    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".claude", "skills", "harness-meta", "SKILL.md"),
      ),
    ).toBe(true);

    expect(fs.existsSync(path.join(tmpDir, ".codex"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".gemini"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".opencode"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".kiro"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".windsurf"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".qoder"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".codebuddy"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".pi"))).toBe(false);
  });

  it("codex init writes .codex plus shared .agents skills with harness naming", async () => {
    await init({ yes: true, project: DEFAULT_PROJECT, codex: true, lang: DEFAULT_LANG });

    expect(fs.existsSync(path.join(tmpDir, ".codex", "config.toml"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(tmpDir, ".agents", "skills"))).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".agents", "skills", "harness-meta", "SKILL.md"),
      ),
    ).toBe(true);

    const hashFile = readJson<{
      __version?: number;
      hashes?: Record<string, string>;
    }>(path.join(tmpDir, ".alice", ".template-hashes.json"));
    const trackedPaths = Object.keys(hashFile.hashes ?? {});
    const unsupportedTrackedPaths = trackedPaths.filter(
      (entry) =>
        entry.startsWith(`${UNSUPPORTED_WORKFLOW_ROOT}/`) ||
        entry.endsWith(".py"),
    );
    expect(trackedPaths).toContain(".agents/skills/harness-meta/SKILL.md");
    expect(unsupportedTrackedPaths).toEqual([]);
  });

  it("codex init prunes the empty platform skills directory", async () => {
    await init({ yes: true, project: DEFAULT_PROJECT, codex: true, lang: DEFAULT_LANG });

    expect(fs.existsSync(path.join(tmpDir, ".codex", "skills"))).toBe(false);
  });

  it("gemini init writes .gemini plus shared .agents skills with harness naming", async () => {
    await init({ yes: true, project: DEFAULT_PROJECT, gemini: true, lang: DEFAULT_LANG });

    expect(
      fs.existsSync(path.join(tmpDir, ".gemini", "settings.json")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, ".agents", "skills", "harness-meta", "SKILL.md"),
      ),
    ).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".codex"))).toBe(false);
  });

  it("gemini init does not create an empty platform skills directory", async () => {
    await init({ yes: true, project: DEFAULT_PROJECT, gemini: true, lang: DEFAULT_LANG });

    expect(fs.existsSync(path.join(tmpDir, ".gemini", "skills"))).toBe(false);
  });

  it("claude init keeps the platform skills directory when it has content", async () => {
    await init({ yes: true, project: DEFAULT_PROJECT, claude: true, lang: DEFAULT_LANG });

    const claudeSkillsDir = path.join(tmpDir, ".claude", "skills");
    expect(fs.existsSync(claudeSkillsDir)).toBe(true);
    expect(fs.readdirSync(claudeSkillsDir).length).toBeGreaterThan(0);
  });

  it("multi-platform init creates exactly the supported first-release platforms", async () => {
    await init({
      yes: true,
      project: DEFAULT_PROJECT,
      claude: true,
      codex: true,
      gemini: true,
      lang: DEFAULT_LANG,
    });

    expect(fs.existsSync(path.join(tmpDir, ".claude"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".codex"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".gemini"))).toBe(true);

    expect(fs.existsSync(path.join(tmpDir, ".cursor"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".opencode"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".kiro"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".windsurf"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".qoder"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".codebuddy"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".pi"))).toBe(false);
  });

  it("writes english markdown templates when -l en is specified", async () => {
    await init({ yes: true, project: DEFAULT_PROJECT, claude: true, lang: "en" });

    const workflowContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "workflow.md"),
      "utf-8",
    );
    const workspaceIndexContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "workspace", "index.md"),
      "utf-8",
    );
    const backendIndexContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "spec", "backend", "index.md"),
      "utf-8",
    );

    expect(workflowContent).toContain("# Development Workflow");
    expect(workspaceIndexContent).toContain("# Workspace Index");
    expect(backendIndexContent).toContain("# Backend Development Guidelines");
    expect(backendIndexContent).toContain("Language");
  });

  it("writes chinese markdown templates when -l cn is specified", async () => {
    await init({ yes: true, project: DEFAULT_PROJECT, claude: true, lang: "cn" });

    const workflowContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "workflow.md"),
      "utf-8",
    );
    const workspaceIndexContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "workspace", "index.md"),
      "utf-8",
    );
    const backendIndexContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "spec", "backend", "index.md"),
      "utf-8",
    );
    const frontendIndexContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "spec", "frontend", "index.md"),
      "utf-8",
    );
    const frontendComponentGuidelinesContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "spec", "frontend", "component-guidelines.md"),
      "utf-8",
    );
    const guidesIndexContent = fs.readFileSync(
      path.join(tmpDir, ".alice", "spec", "guides", "index.md"),
      "utf-8",
    );
    const codeReuseGuideContent = fs.readFileSync(
      path.join(
        tmpDir,
        ".alice",
        "spec",
        "guides",
        "code-reuse-thinking-guide.md",
      ),
      "utf-8",
    );

    expect(workflowContent).toContain("开发工作流");
    expect(workspaceIndexContent).toContain("工作区索引");
    expect(backendIndexContent).toContain("后端开发规范");
    expect(backendIndexContent).toContain("中文");
    expect(frontendIndexContent).toContain("前端开发规范");
    expect(frontendComponentGuidelinesContent).toContain("组件规范");
    expect(guidesIndexContent).toContain("思考指南");
    expect(codeReuseGuideContent).toContain("代码复用思考指南");
  });

  it("writes chinese platform template content when -l cn is specified", async () => {
    await init({
      yes: true,
      project: DEFAULT_PROJECT,
      claude: true,
      codex: true,
      gemini: true,
      lang: "cn",
    });

    const claudeAgentContent = fs.readFileSync(
      path.join(tmpDir, ".claude", "agents", "harness-check.md"),
      "utf-8",
    );
    const codexSkillContent = fs.readFileSync(
      path.join(tmpDir, ".agents", "skills", "harness-start", "SKILL.md"),
      "utf-8",
    );
    const codexAgentToml = fs.readFileSync(
      path.join(tmpDir, ".codex", "agents", "harness-check.toml"),
      "utf-8",
    );
    const geminiAgentContent = fs.readFileSync(
      path.join(tmpDir, ".gemini", "agents", "harness-check.md"),
      "utf-8",
    );

    expect(claudeAgentContent).toContain("你是 Harness Spec 工作流中的检查代理");
    expect(codexSkillContent).toContain("开始开发前");
    expect(codexAgentToml).toContain("你是 Harness Spec 的中文检查代理");
    expect(codexAgentToml).not.toContain(
      "Required: Load Harness Spec Context First",
    );
    expect(geminiAgentContent).toContain("你是 Harness Spec 工作流中的检查代理");
  });
});
