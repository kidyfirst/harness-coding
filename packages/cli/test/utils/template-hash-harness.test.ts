import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadHashes, saveHashes } from "../../src/utils/template-hash.js";

describe("template hashes use the personalized harness workflow root", () => {
  let tmpDir: string;
  const unsupportedRoot = ".legacy-workflow";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-hashes-"));
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

  it("reads and writes .template-hashes.json beneath the personalized root", () => {
    saveHashes(tmpDir, { "AGENTS.md": "abc123" });

    expect(
      fs.existsSync(path.join(tmpDir, ".alice", ".template-hashes.json")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpDir, unsupportedRoot, ".template-hashes.json"),
      ),
    ).toBe(false);

    expect(loadHashes(tmpDir)).toEqual({ "AGENTS.md": "abc123" });
  });
});
