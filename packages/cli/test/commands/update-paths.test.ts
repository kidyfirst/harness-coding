import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadUpdateSkipPaths } from "../../src/commands/update.js";

describe("update command personalized workflow paths", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-update-paths-"));
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify(
        {
          harness: {
            "spec-name": "alice",
          },
        },
        null,
        2,
      ) + "\n",
    );
    fs.mkdirSync(path.join(tmpDir, ".alice"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads update.skip from the personalized workflow root", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".alice", "config.yaml"),
      [
        "update:",
        "  skip:",
        "    - .claude/settings.json",
        "    - .alice/workflow.md",
        "",
      ].join("\n"),
    );

    expect(loadUpdateSkipPaths(tmpDir)).toEqual([
      ".claude/settings.json",
      ".alice/workflow.md",
    ]);
  });
});
