import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyHarnessSpecDir } from "../../src/templates/extract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const runtimeScriptsDir = path.join(
  repoRoot,
  "packages/cli/src/templates/harness-spec/scripts",
);
const RUNTIME_JS_EXT = ".js";
const LEGACY_PY_EXT = ".py";
const LEGACY_RUNTIME_NAMES = [
  "task",
  "get_context",
  "init_project_owner",
  "add_session",
  "get_project_owner",
] as const;
const toRuntimeName = (baseName: (typeof LEGACY_RUNTIME_NAMES)[number]): string =>
  `${baseName}${RUNTIME_JS_EXT}`;
const toLegacyRuntimeName = (runtimeFile: string): string =>
  runtimeFile.replace(/\.js$/, LEGACY_PY_EXT);

describe("harness-spec runtime script templates", () => {
  it("exposes only JavaScript runtime entrypoints", () => {
    const runtimePaths = fs
      .readdirSync(runtimeScriptsDir)
      .filter((entry) => entry.endsWith(RUNTIME_JS_EXT));
    expect(runtimePaths.length).toBeGreaterThan(0);
    expect(runtimePaths.every((runtimePath) => runtimePath.endsWith(RUNTIME_JS_EXT))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(runtimeScriptsDir, toLegacyRuntimeName(toRuntimeName("task"))))).toBe(false);
  });

  it("keeps template authoring rooted in TypeScript source modules", () => {
    const authoringModulePath = path.join(
      repoRoot,
      "packages/cli/src/templates/harness-spec/index.ts",
    );
    expect(authoringModulePath.endsWith(".ts")).toBe(true);
  });

  it("removes legacy Python entry scripts from the template tree", () => {
    for (const runtimeFile of LEGACY_RUNTIME_NAMES.map(toRuntimeName)) {
      const legacyRuntimeFile = toLegacyRuntimeName(runtimeFile);
      expect(
        fs.existsSync(path.join(runtimeScriptsDir, legacyRuntimeFile)),
        `${legacyRuntimeFile} should be removed after the JavaScript migration`,
      ).toBe(false);
    }
  });

  it("copies JavaScript runtime files without shipping TypeScript authoring sources", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-runtime-"));
    await copyHarnessSpecDir("scripts", outDir, { executable: true });

    const copiedFiles = fs.readdirSync(outDir);
    expect(copiedFiles).toContain(toRuntimeName("task"));
    expect(copiedFiles).toContain(toRuntimeName("get_context"));
    expect(copiedFiles).not.toContain(toLegacyRuntimeName(toRuntimeName("task")));
    expect(copiedFiles).not.toContain(toLegacyRuntimeName(toRuntimeName("get_context")));
    expect(copiedFiles).not.toContain("task.ts");
    expect(copiedFiles).not.toContain("get_context.ts");
  });
});
