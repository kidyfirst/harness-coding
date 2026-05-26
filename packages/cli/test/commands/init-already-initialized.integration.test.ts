import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("figlet", () => ({
  default: { textSync: vi.fn(() => "HARNESS") },
}));

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({}) },
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockReturnValue(""),
}));

import { init } from "../../src/commands/init.js";
import { FILE_NAMES, getPathsForWorkflowRoot } from "../../src/constants/paths.js";

describe("init() already-initialized projects", () => {
  let tmpDir: string;
  const workflowRoot = ".alice";
  const workflowPaths = getPathsForWorkflowRoot(workflowRoot);

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-init-stop-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeInitializedProject(): void {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify(
        {
          name: "fixture-project",
          harness: {
            "spec-name": "alice",
            language: "en",
          },
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );

    fs.mkdirSync(path.join(tmpDir, workflowRoot, "tasks"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, workflowRoot, "spec"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, workflowRoot, "workspace"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, workflowRoot, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, workflowRoot, FILE_NAMES.PROJECT_OWNER),
      "name=alice\ninitialized_at=2026-01-01T00:00:00.000Z\n",
      "utf-8",
    );
  }

  it("rejects init when the personalized workflow root already exists", async () => {
    writeInitializedProject();

    await expect(
      init({ yes: true, project: "alice", lang: "en" }),
    ).rejects.toThrow(/already initialized|harness-spec update/i);
  });

  it("does not create bootstrap tasks for an already initialized project", async () => {
    writeInitializedProject();

    await expect(
      init({ yes: true, project: "alice", lang: "en" }),
    ).rejects.toThrow(/already initialized|harness-spec update/i);

    expect(
      fs.existsSync(
        path.join(tmpDir, workflowPaths.TASKS, "00-bootstrap-guidelines"),
      ),
    ).toBe(false);
  });

  it("rejects init even when a different -p value is provided later", async () => {
    writeInitializedProject();

    await expect(
      init({ yes: true, project: "bob", lang: "en" }),
    ).rejects.toThrow(/already initialized|harness-spec update/i);

    expect(fs.existsSync(path.join(tmpDir, ".bob"))).toBe(false);
  });
});
