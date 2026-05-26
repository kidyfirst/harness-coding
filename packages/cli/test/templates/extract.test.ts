import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getHarnessSpecTemplatePath,
  getClaudeTemplatePath,
  getWorkflowTemplatePath,
  readHarnessSpecFile,
  readTemplate,
  readScript,
  readMarkdown,
} from "../../src/templates/extract.js";

const RUNTIME_JS_EXT = ".js";
const LEGACY_PY_EXT = ".py";
const TASK_RUNTIME_FILE = `task${RUNTIME_JS_EXT}`;
const LEGACY_TASK_RUNTIME_FILE = `task${LEGACY_PY_EXT}`;
const RUNTIME_SCRIPT_NAMES = [
  "task",
  "get_context",
  "init_project_owner",
  "add_session",
  "get_project_owner",
] as const;

// =============================================================================
// getXxxTemplatePath — returns existing directory paths
// =============================================================================

describe("template path functions", () => {
  it("getHarnessSpecTemplatePath returns existing directory", () => {
    const p = getHarnessSpecTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getClaudeTemplatePath returns existing directory", () => {
    const p = getClaudeTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });

  it("getWorkflowTemplatePath returns the same existing directory", () => {
    const p = getWorkflowTemplatePath();
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).isDirectory()).toBe(true);
    expect(p).toBe(getHarnessSpecTemplatePath());
  });
});

// =============================================================================
// readHarnessSpecFile — reads files from workflow template directory
// =============================================================================

describe("readHarnessSpecFile", () => {
  it("reads workflow.md from harness-spec templates", () => {
    const content = readHarnessSpecFile("workflow.md");
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain("#");
  });

  it("reads a script file", () => {
    const content = readHarnessSpecFile(`scripts/${TASK_RUNTIME_FILE}`);
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });

  it("ships JavaScript runtime entry scripts from the workflow template", () => {
    const templateRoot = getHarnessSpecTemplatePath();
    for (const runtimeFile of RUNTIME_SCRIPT_NAMES.map(
      (name) => `${name}${RUNTIME_JS_EXT}`,
    )) {
      expect(
        fs.existsSync(path.join(templateRoot, "scripts", runtimeFile)),
        `${runtimeFile} should exist as a shipped runtime entry script`,
      ).toBe(true);
    }
  });

  it("throws for nonexistent file", () => {
    expect(() => readHarnessSpecFile("nonexistent.txt")).toThrow();
  });
});

// =============================================================================
// readTemplate — reads from category subdirectories
// =============================================================================

describe("readTemplate", () => {
  it("throws for nonexistent category/file", () => {
    expect(() => readTemplate("scripts", "nonexistent.txt")).toThrow();
  });
});

// =============================================================================
// readScript / readMarkdown helpers
// =============================================================================

describe("readScript", () => {
  it("reads a JavaScript runtime file from scripts/", () => {
    const content = readScript(TASK_RUNTIME_FILE);
    expect(typeof content).toBe("string");
    expect(content.length).toBeGreaterThan(0);
  });

  it("does not expose deprecated Python runtime script paths", () => {
    expect(() => readScript(LEGACY_TASK_RUNTIME_FILE)).toThrow();
  });
});

describe("readMarkdown", () => {
  it("reads workflow.md", () => {
    const content = readMarkdown("workflow.md");
    expect(typeof content).toBe("string");
    expect(content).toContain("#");
  });
});
