/**
 * Unit tests for slugifyProjectOwnerName().
 *
 * Ensures arbitrary project names produce filesystem-safe task directory
 * suffixes (task name format: `00-join-<slug>`). Must handle spaces,
 * punctuation, Unicode letters, npm scopes, and pure-symbol fallback cases.
 */

import { describe, it, expect } from "vitest";
import { slugifyProjectOwnerName } from "../../src/commands/init.js";

describe("slugifyProjectOwnerName()", () => {
  it("lowercases simple ASCII", () => {
    expect(slugifyProjectOwnerName("taosu")).toBe("taosu");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugifyProjectOwnerName("Tao Su")).toBe("tao-su");
  });

  it("collapses npm scope punctuation to hyphens", () => {
    expect(slugifyProjectOwnerName("@user/nested")).toBe("user-nested");
  });

  it("preserves Unicode letters (non-empty, filesystem-safe)", () => {
    const result = slugifyProjectOwnerName("田中 太郎");
    expect(result).not.toBe("");
    expect(result).not.toBe("project");
    // Whitespace replaced, letters preserved
    expect(result).toContain("田中");
    expect(result).toContain("太郎");
    // No leading/trailing hyphens
    expect(result.startsWith("-")).toBe(false);
    expect(result.endsWith("-")).toBe(false);
  });

  it("pure-symbol input falls back to 'project'", () => {
    expect(slugifyProjectOwnerName("---")).toBe("project");
  });

  it("empty string falls back to 'project'", () => {
    expect(slugifyProjectOwnerName("")).toBe("project");
  });

  it("trims leading and trailing separators", () => {
    expect(slugifyProjectOwnerName("  bob  ")).toBe("bob");
    expect(slugifyProjectOwnerName("--bob--")).toBe("bob");
  });

  it("collapses runs of separators into one hyphen", () => {
    expect(slugifyProjectOwnerName("a   b")).toBe("a-b");
    expect(slugifyProjectOwnerName("a!!!@@b")).toBe("a-b");
  });
});
