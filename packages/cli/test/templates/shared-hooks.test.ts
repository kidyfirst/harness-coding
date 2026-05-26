import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SHARED_HOOKS_BY_PLATFORM,
  getSharedHookScripts,
  getSharedHookScriptsForPlatform,
  type SharedHookPlatform,
} from "../../src/templates/shared-hooks/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");
const sharedHooksDir = path.join(
  repoRoot,
  "packages/cli/src/templates/shared-hooks",
);

const ALL_HOOK_FILES = [
  "session-start.js",
  "inject-workflow-state.js",
  "inject-subagent-context.js",
] as const;

describe("shared-hooks capability table", () => {
  it("distributes JavaScript runtime hooks only", () => {
    const distributedHooks = Object.values(SHARED_HOOKS_BY_PLATFORM).flat();
    expect(distributedHooks.length).toBeGreaterThan(0);
    expect(distributedHooks.every((hook) => hook.endsWith(".js"))).toBe(true);
  });

  it("keeps shared-hooks authoring surface limited to the real .js runtime templates", () => {
    const tsSiblings = [
      "session-start.ts",
      "inject-workflow-state.ts",
      "inject-subagent-context.ts",
    ];
    for (const tsFile of tsSiblings) {
      expect(
        fs.existsSync(path.join(sharedHooksDir, tsFile)),
        `${tsFile} should not exist as an empty authoring placeholder`,
      ).toBe(false);
    }
  });

  it("every capability-table entry names a real shared-hook file", () => {
    const realFiles = new Set(getSharedHookScripts().map((h) => h.name));
    for (const [platform, hooks] of Object.entries(
      SHARED_HOOKS_BY_PLATFORM,
    )) {
      for (const hook of hooks) {
        expect(
          realFiles.has(hook),
          `${platform} declares ${hook} but no such file exists under shared-hooks/`,
        ).toBe(true);
      }
    }
  });

  it("every shared-hook file is distributed to at least one platform", () => {
    const distributed = new Set<string>();
    for (const hooks of Object.values(SHARED_HOOKS_BY_PLATFORM)) {
      for (const h of hooks) distributed.add(h);
    }
    for (const hook of getSharedHookScripts()) {
      expect(
        distributed.has(hook.name),
        `${hook.name} exists under shared-hooks/ but no platform installs it — dead template`,
      ).toBe(true);
    }
  });

  it("statusline.js is not distributed by default", () => {
    const realFiles = new Set(getSharedHookScripts().map((h) => h.name));
    expect(realFiles.has("statusline.js")).toBe(false);
    for (const [platform, hooks] of Object.entries(
      SHARED_HOOKS_BY_PLATFORM,
    )) {
      expect(
        (hooks as readonly string[]).includes("statusline.js"),
        `${platform} must not install the generated statusline.js hook by default`,
      ).toBe(false);
    }
  });

  it("inject-subagent-context.js is restricted to class-1 push-based platforms", () => {
    // Class-2 (pull-based) platforms load context via agent-definition prelude,
    // not a hook-mutated prompt.
    const class2 = new Set(["codex", "gemini"]);
    for (const [platform, hooks] of Object.entries(
      SHARED_HOOKS_BY_PLATFORM,
    )) {
      const has = hooks.includes("inject-subagent-context.js");
      if (class2.has(platform))
        expect(
          has,
          `${platform} is class-2 pull-based and must not ship inject-subagent-context.js`,
        ).toBe(false);
    }
  });

  it("codex does not take the shared session-start.js (it bundles its own)", () => {
    expect(SHARED_HOOKS_BY_PLATFORM.codex).not.toContain("session-start.js");
  });

  it("getSharedHookScriptsForPlatform returns exactly the declared set per platform", () => {
    for (const platform of Object.keys(
      SHARED_HOOKS_BY_PLATFORM,
    ) as SharedHookPlatform[]) {
      const names = getSharedHookScriptsForPlatform(platform)
        .map((h) => h.name)
        .sort();
      const expected = [...SHARED_HOOKS_BY_PLATFORM[platform]].sort();
      expect(names).toEqual(expected);
    }
  });

  it("shared-hooks directory only contains files enumerated by ALL_HOOK_FILES", () => {
    // Guards against a new shared hook being added without the capability
    // table being updated.
    const actual = new Set(getSharedHookScripts().map((h) => h.name));
    const expected = new Set(ALL_HOOK_FILES);
    expect(actual).toEqual(expected);
  });

  it("runtime registry excludes helper and authoring files", () => {
    const actual = new Set(getSharedHookScripts().map((h) => h.name));
    expect(actual.has("session-start.ts")).toBe(false);
    expect(actual.has("inject-workflow-state.ts")).toBe(false);
    expect(actual.has("inject-subagent-context.ts")).toBe(false);
  });

  it("shared hooks do not read legacy .current-task state", () => {
    for (const hook of getSharedHookScripts()) {
      expect(
        hook.content,
        `${hook.name} must use the session-scoped active task resolver`,
      ).not.toContain(".current-task");
      expect(hook.content).not.toContain("global fallback");
    }
  });

  // A-soft (issue #234 mirror): shared session-start.js — used by Claude /
  // Gemini — must include the
  // same sub-agent self-exemption clauses that codex/hooks/session-start.js
  // carries, so a sub-agent reading inherited SessionStart guidance does not
  // spawn another harness-implement / harness-check.
  it("shared session-start.js includes sub-agent self-exemption (A-soft)", () => {
    const sessionStart = getSharedHookScripts().find(
      (h) => h.name === "session-start.js",
    );
    expect(sessionStart, "session-start.js is missing from shared-hooks/").toBeDefined();
    const content = sessionStart ? sessionStart.content : "";
    // Both READY-state status block AND <guidelines> block carry the
    // exemption phrase (kept verbatim across both writers — see workflow-
    // state-contract.md "Audit ALL Writers").
    const matches = content.match(/Sub-agent self-exemption/g);
    expect(matches, "expected at least 2 occurrences (status + guidelines)").not.toBeNull();
    expect(matches ? matches.length : 0).toBeGreaterThanOrEqual(2);
    // Anchor on the scope (does not apply / no spawn) so a future rewording
    // still has to cover the actual contract.
    expect(content).toMatch(/does NOT apply/);
    expect(content).toMatch(/spawn another sub-agent|Do NOT spawn/i);
  });

  it("shared runtime hooks are Node-based and do not invoke python", () => {
    for (const hook of getSharedHookScripts()) {
      expect(hook.content).toContain("#!/usr/bin/env node");
      expect(hook.content).not.toContain("python3");
      expect(hook.content).not.toContain("sys.executable");
    }
  });

  it("shared session-start.js keeps SessionStart payload shape and JS runtime commands", () => {
    const sessionStart = getSharedHookScripts().find(
      (h) => h.name === "session-start.js",
    );
    expect(sessionStart).toBeDefined();
    const content = sessionStart?.content ?? "";
    expect(content).toContain("hookEventName: \"SessionStart\"");
    expect(content).toContain("additionalContext: contextText");
    expect(content).toContain("node ./${WORKFLOW_DIR}/scripts/task.js create");
    expect(content).toContain("node ./${WORKFLOW_DIR}/scripts/task.js finish");
    expect(content).toContain(
      "node ./${WORKFLOW_DIR}/scripts/get_context.js --mode packages",
    );
  });
});
