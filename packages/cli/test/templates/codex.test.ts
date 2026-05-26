import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAllAgents,
  getAllCodexSkills,
  getConfigTemplate,
  getAllHooks,
} from "../../src/templates/codex/index.js";
import { collectPlatformTemplates } from "../../src/configurators/index.js";
import { resolveAllAsSkills } from "../../src/configurators/shared.js";
import { AI_TOOLS } from "../../src/types/ai-tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../..");

const EXPECTED_AGENT_NAMES = [
  "harness-check",
  "harness-implement",
  "harness-research",
];
const REMOVED_TASK_SCRIPT = "task.py";

// Shared skills are now sourced from common/ via resolveAllAsSkills
describe("codex shared skills (from common source)", () => {
  it("resolves all common templates for codex context", () => {
    const skills = resolveAllAsSkills(AI_TOOLS.codex.templateContext);
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      expect(skill.content).toContain("description:");
      expect(skill.content).toContain(`name: ${skill.name}`);
    }
  });

  it("does not include platform-specific syntax in resolved output", () => {
    const skills = resolveAllAsSkills(AI_TOOLS.codex.templateContext);
    for (const skill of skills) {
      // Codex uses $ prefix, not /harness-spec:
      expect(skill.content).not.toContain("/harness-spec:");
      expect(skill.content).not.toContain(".claude/");
      expect(skill.content).not.toContain(".cursor/");
    }
  });
});

describe("codex getAllAgents", () => {
  it("returns the expected custom agent set", () => {
    const agents = getAllAgents();
    const names = agents.map((agent) => agent.name);
    expect(names).toEqual(EXPECTED_AGENT_NAMES);
  });

  it("each agent has required fields (name, description, developer_instructions)", () => {
    for (const agent of getAllAgents()) {
      expect(agent.content.length).toBeGreaterThan(0);
      expect(agent.content).toContain("name = ");
      expect(agent.content).toContain("description = ");
      expect(agent.content).toContain("developer_instructions = ");
    }
  });
});

describe("codex getAllCodexSkills (platform-specific)", () => {
  it("returns empty after parallel removal", () => {
    const skills = getAllCodexSkills();
    expect(skills).toEqual([]);
  });
});

describe("codex runtime hook templates", () => {
  it("exposes JavaScript runtime hook files only", () => {
    const codexModulePath = path.join(
      repoRoot,
      "packages/cli/src/templates/codex/index.ts",
    );
    expect(codexModulePath.endsWith(".ts")).toBe(true);

    const hooks = getAllHooks();
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.every((hook) => hook.name.endsWith(".js"))).toBe(true);
  });

  it("collectPlatformTemplates emits JavaScript hook output paths", () => {
    const templates = collectPlatformTemplates("codex");
    expect(templates).toBeDefined();
    const hookPaths = [...(templates ?? new Map()).keys()].filter((filePath) =>
      filePath.startsWith(".codex/hooks/"),
    );
    expect(hookPaths.length).toBeGreaterThan(0);
    expect(hookPaths.every((hookPath) => hookPath.endsWith(".js"))).toBe(true);
  });
});

describe("codex getConfigTemplate", () => {
  it("returns project config.toml content", () => {
    const config = getConfigTemplate();
    expect(config.targetPath).toBe("config.toml");
    expect(config.content).toContain("project_doc_fallback_filenames");
    expect(config.content).toContain("AGENTS.md");
  });

  // The structured [features.multi_agent_v2] table form is only accepted by
  // Codex CLI 0.131+. On 0.130 and earlier — including the codex CLI bundled
  // in the Codex desktop app — it aborts the whole config load with
  // `data did not match any variant of untagged enum FeatureToml`. Legacy
  // no longer writes the block; this test guards against reintroducing it.
  it("does not write a [features.multi_agent_v2] block (Codex 0.130 compat)", () => {
    const config = getConfigTemplate();
    expect(config.content).not.toMatch(/^\[features\.multi_agent_v2\]/m);
  });
});

// =============================================================================
// Issue #234 — Codex sub-agent recursion guard
// =============================================================================
//
// harness-implement / harness-check agent toml MUST contain a hard recursion
// guard that tells the sub-agent it is already the dispatched agent and must
// not spawn another harness-implement / harness-check sub-agent. Without this,
// SessionStart's "dispatch harness-implement" guidance leaks into sub-agent
// sessions and causes infinite recursion (see PRD).
describe("codex sub-agent recursion guard (issue #234)", () => {
  for (const name of ["harness-implement", "harness-check"] as const) {
    it(`${name}.toml developer_instructions forbids spawning harness-implement / harness-check`, () => {
      const tomlPath = path.join(
        repoRoot,
        "packages/cli/src/templates/codex/agents/en",
        `${name}.toml`,
      );
      const content = fs.readFileSync(tomlPath, "utf-8");
      // Hard prohibition keyword
      expect(content).toMatch(/MUST NOT spawn/i);
      // Mentions both sibling agent kinds explicitly
      expect(content).toContain("harness-implement");
      expect(content).toContain("harness-check");
      // Mentions the leakage source so the reader knows why
      expect(content).toMatch(/SessionStart|dispatch.*main session|breadcrumb/i);
    });
  }
});

// A-soft: codex/hooks/session-start.js READY-state guidance and <guidelines>
// block must include a sub-agent self-exemption clause so a Codex sub-agent
// reading the same SessionStart context realizes the dispatch instruction
// is for the main session, not for itself.
describe("codex session-start.js sub-agent self-exemption (A-soft)", () => {
  const hookPath = path.join(
    repoRoot,
    "packages/cli/src/templates/codex/hooks/session-start.js",
  );

  it("READY-state dispatch guidance includes a sub-agent self-exemption clause", () => {
    const content = fs.readFileSync(hookPath, "utf-8");
    // Distinct exemption phrase (avoid colliding with the existing
    // "User override" escape hatch).
    expect(content).toContain("Sub-agent self-exemption");
    // Calls out both sub-agent kinds
    expect(content).toMatch(/harness-implement.*harness-check|harness-check.*harness-implement/s);
    // Tells the sub-agent the dispatch does NOT apply to it
    expect(content).toMatch(/does NOT apply|not apply/);
  });

  it("does not fall back to legacy .current-task or python task commands", () => {
    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).not.toContain(".current-task");
    expect(content).not.toContain(REMOVED_TASK_SCRIPT);
    expect(content).not.toContain("python3");
    expect(content).not.toContain("suppressOutput");
    expect(content).not.toContain("systemMessage");
  });
});
