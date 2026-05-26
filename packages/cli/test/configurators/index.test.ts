import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ALL_MANAGED_DIRS,
  CONFIG_DIRS,
  PLATFORM_IDS,
  collectPlatformTemplates,
  getConfiguredPlatforms,
  getInitToolChoices,
  isManagedPath,
  isManagedRootDir,
  resolveCliFlag,
} from "../../src/configurators/index.js";
import { AI_TOOLS } from "../../src/types/ai-tools.js";

const UNSUPPORTED_CURSOR_COMMAND = ".cursor/commands/continue.md";
const UNSUPPORTED_KIRO_SKILL = ".kiro/skills/harness-check/SKILL.md";

describe("platform registry is narrowed to the supported first release set", () => {
  it("contains only claude-code, codex, and gemini", () => {
    expect(PLATFORM_IDS).toEqual(["claude-code", "codex", "gemini"]);
  });

  it("CONFIG_DIRS match the supported platforms", () => {
    expect(CONFIG_DIRS).toEqual([".claude", ".codex", ".gemini"]);
  });

  it("init choices expose only claude/codex/gemini flags", () => {
    expect(getInitToolChoices().map((choice) => choice.key)).toEqual([
      "claude",
      "codex",
      "gemini",
    ]);
  });

  it("resolveCliFlag only resolves the supported flags", () => {
    expect(resolveCliFlag("claude")).toBe("claude-code");
    expect(resolveCliFlag("codex")).toBe("codex");
    expect(resolveCliFlag("gemini")).toBe("gemini");
    expect(resolveCliFlag("cursor")).toBeUndefined();
    expect(resolveCliFlag("opencode")).toBeUndefined();
    expect(resolveCliFlag("kiro")).toBeUndefined();
  });
});

describe("managed path detection uses harness-managed roots", () => {
  it("ALL_MANAGED_DIRS starts with the personalized workflow placeholder", () => {
    expect(ALL_MANAGED_DIRS[0]).toBe("WORKFLOW_ROOT");
  });

  it("accepts supported platform paths and rejects removed ones", () => {
    expect(isManagedPath(".claude/commands/harness-spec/continue.md")).toBe(
      true,
    );
    expect(isManagedPath(".codex/agents/harness-check.toml")).toBe(true);
    expect(isManagedPath(".gemini/commands/harness-spec/continue.toml")).toBe(
      true,
    );
    expect(isManagedPath(".agents/skills/harness-meta/SKILL.md")).toBe(true);
    expect(isManagedPath(".alice/spec/backend/index.md")).toBe(true);
    expect(isManagedPath(".alice/scripts/task.js")).toBe(true);

    expect(isManagedPath(UNSUPPORTED_CURSOR_COMMAND)).toBe(false);
    expect(isManagedPath(".opencode/config.json")).toBe(false);
    expect(isManagedPath(UNSUPPORTED_KIRO_SKILL)).toBe(false);
  });

  it("accepts supported root dirs and rejects removed root dirs", () => {
    expect(isManagedRootDir(".claude")).toBe(true);
    expect(isManagedRootDir(".codex")).toBe(true);
    expect(isManagedRootDir(".gemini")).toBe(true);
    expect(isManagedRootDir(".agents/skills")).toBe(true);
    expect(isManagedRootDir(".alice")).toBe(true);

    expect(isManagedRootDir(".cursor")).toBe(false);
    expect(isManagedRootDir(".opencode")).toBe(false);
    expect(isManagedRootDir(".kiro/skills")).toBe(false);
  });
});

describe("configured platform detection", () => {
  it("detects the three supported platforms only", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-platforms-"));
    try {
      fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, ".codex"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, ".gemini"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true });

      const detected = getConfiguredPlatforms(tmpDir);
      expect([...detected].sort()).toEqual([
        "claude-code",
        "codex",
        "gemini",
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("template collection", () => {
  it("tracks bundled harness skills for each supported platform", () => {
    const expectations = {
      "claude-code": ".claude/skills",
      codex: ".agents/skills",
      gemini: ".agents/skills",
    } as const;

    for (const [platformId, skillRoot] of Object.entries(expectations)) {
      const templates = collectPlatformTemplates(platformId as keyof typeof expectations);
      expect(templates).toBeInstanceOf(Map);
      expect(templates?.has(`${skillRoot}/harness-meta/SKILL.md`)).toBe(true);
      expect(
        templates?.has(
          `${skillRoot}/harness-meta/references/local-architecture/overview.md`,
        ),
      ).toBe(true);
    }
  });

  it("uses harness command directories for claude and gemini", () => {
    const claudeTemplates = collectPlatformTemplates("claude-code");
    expect(claudeTemplates?.has(".claude/commands/harness-spec/continue.md")).toBe(
      true,
    );

    const geminiTemplates = collectPlatformTemplates("gemini");
    expect(
      geminiTemplates?.has(".gemini/commands/harness-spec/continue.toml"),
    ).toBe(true);
  });
});

describe("AI_TOOLS registry stays aligned with the narrowed platform list", () => {
  it("AI_TOOLS keys equal PLATFORM_IDS", () => {
    expect(Object.keys(AI_TOOLS)).toEqual(PLATFORM_IDS);
  });
});
