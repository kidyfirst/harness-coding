import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("inquirer", () => ({
  default: { prompt: vi.fn().mockResolvedValue({}) },
}));

vi.mock("../../src/utils/proxy.js", () => ({
  setupProxy: vi.fn(),
}));

global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as typeof fetch;

import { update } from "../../src/commands/update.js";
import { VERSION } from "../../src/constants/version.js";

describe("update() current personalized workflow handling", () => {
  let tmpDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-update-int-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps chinese template language on update when package metadata records cn", async () => {
    fs.mkdirSync(path.join(tmpDir, ".alice", "scripts"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".alice", "workspace"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".alice", "tasks"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".alice", "spec"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".claude", "agents"), { recursive: true });

    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify(
        {
          harness: {
            "spec-name": "alice",
            language: "cn",
          },
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(path.join(tmpDir, ".alice", ".version"), `${VERSION}\n`);
    fs.writeFileSync(
      path.join(tmpDir, "AGENTS.md"),
      "<!-- HARNESS:START -->\nplaceholder\n<!-- HARNESS:END -->\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".alice", "workflow.md"),
      "placeholder workflow\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".alice", "config.yaml"),
      "project_type: frontend\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "settings.json"),
      JSON.stringify({ hooks: {} }, null, 2) + "\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "agents", "harness-check.md"),
      "placeholder agent\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".alice", ".template-hashes.json"),
      JSON.stringify(
        {
          __version: 2,
          hashes: {},
        },
        null,
        2,
      ) + "\n",
    );

    await update({ force: true });

    const agentsContent = fs.readFileSync(
      path.join(tmpDir, "AGENTS.md"),
      "utf-8",
    );
    expect(agentsContent).toContain("本项目由 `harness-spec` 管理");
  });
});
