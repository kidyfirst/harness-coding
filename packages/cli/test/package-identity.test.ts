import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const cliRoot = path.resolve(__dirname, "..");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

describe("package identity", () => {
  it("repo root scripts target the @my/harness-spec workspace package", () => {
    const packageJson = readJson<{
      name?: string;
      scripts?: Record<string, string>;
    }>(path.join(repoRoot, "package.json"));

    expect(packageJson.name).toBe("harness-coding");
    expect(packageJson.scripts).toBeDefined();
    const filteredScripts = Object.entries(packageJson.scripts ?? {}).filter(
      ([name]) => name !== "prepare",
    );
    for (const [, script] of filteredScripts) {
      expect(script).toContain("harness-spec");
    }
    expect(packageJson.scripts?.["spec:init"]).toContain(
      "pnpm --filter @my/harness-spec build",
    );
    expect(packageJson.scripts?.["spec:init"]).toContain(
      "node ./packages/cli/bin/harness-spec.js init --yes --codex",
    );
    expect(packageJson.scripts?.apply).toBeUndefined();
    expect(packageJson.scripts?.update).toBeUndefined();
    expect(packageJson.scripts?.uninstall).toBeUndefined();
    expect(packageJson.scripts?.["spec:update"]).toContain(
      "pnpm --filter @my/harness-spec build",
    );
    expect(packageJson.scripts?.["spec:update"]).toContain(
      "node ./packages/cli/bin/harness-spec.js update",
    );
    expect(packageJson.scripts?.["spec:uninstall"]).toContain(
      "pnpm --filter @my/harness-spec build",
    );
    expect(packageJson.scripts?.["spec:uninstall"]).toContain(
      "node ./packages/cli/bin/harness-spec.js uninstall",
    );
    expect(packageJson.scripts?.["spec:publish"]).toContain(
      "pnpm --filter @my/harness-spec publish --access public --registry https://registry.npmjs.org",
    );
  });

  it("cli package exposes @my/harness-spec with harness-spec as its only bin", () => {
    const packageJson = readJson<{
      name?: string;
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>(path.join(cliRoot, "package.json"));

    expect(packageJson.name).toBe("@my/harness-spec");
    expect(packageJson.bin).toEqual({
      "harness-spec": "./bin/harness-spec.js",
    });
    expect(packageJson.scripts?.["lint:py"]).toBeUndefined();
    expect(packageJson.scripts?.["lint:all"]).not.toContain("lint:py");
    expect(packageJson.devDependencies?.basedpyright).toBeUndefined();
  });
});
