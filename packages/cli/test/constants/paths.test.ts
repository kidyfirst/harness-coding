import { describe, expect, it } from "vitest";
import {
  DIR_NAMES,
  FILE_NAMES,
  PATHS,
  getWorkflowDir,
  getPathsForWorkflowRoot,
  getWorkspaceDir,
  getTaskDir,
  getArchiveDir,
} from "../../src/constants/paths.js";

// =============================================================================
// DIR_NAMES — constant structure
// =============================================================================

describe("DIR_NAMES", () => {
  it("has all expected keys", () => {
    expect(DIR_NAMES).toHaveProperty("WORKFLOW");
    expect(DIR_NAMES).toHaveProperty("WORKSPACE");
    expect(DIR_NAMES).toHaveProperty("TASKS");
    expect(DIR_NAMES).toHaveProperty("ARCHIVE");
    expect(DIR_NAMES).toHaveProperty("SPEC");
    expect(DIR_NAMES).toHaveProperty("SCRIPTS");
  });

  it("WORKFLOW is a placeholder key, not a rendered directory", () => {
    expect(DIR_NAMES.WORKFLOW).toBe("WORKFLOW_ROOT");
  });

  it("all values are non-empty strings", () => {
    for (const value of Object.values(DIR_NAMES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// FILE_NAMES — constant structure
// =============================================================================

describe("FILE_NAMES", () => {
  it("has all expected keys", () => {
    expect(FILE_NAMES).toHaveProperty("PROJECT_OWNER");
    expect(FILE_NAMES).toHaveProperty("CURRENT_TASK");
    expect(FILE_NAMES).toHaveProperty("TASK_JSON");
    expect(FILE_NAMES).toHaveProperty("PRD");
    expect(FILE_NAMES).toHaveProperty("WORKFLOW_GUIDE");
    expect(FILE_NAMES).toHaveProperty("JOURNAL_PREFIX");
  });

  it("all values are non-empty strings", () => {
    for (const value of Object.values(FILE_NAMES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// PATHS — derived from DIR_NAMES + FILE_NAMES
// =============================================================================

describe("PATHS", () => {
  it("WORKFLOW equals DIR_NAMES.WORKFLOW", () => {
    expect(PATHS.WORKFLOW).toBe(DIR_NAMES.WORKFLOW);
  });

  it("WORKSPACE is WORKFLOW/workspace", () => {
    expect(PATHS.WORKSPACE).toBe(`${DIR_NAMES.WORKFLOW}/${DIR_NAMES.WORKSPACE}`);
  });

  it("TASKS is WORKFLOW/tasks", () => {
    expect(PATHS.TASKS).toBe(`${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`);
  });

  it("SPEC is WORKFLOW/spec", () => {
    expect(PATHS.SPEC).toBe(`${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPEC}`);
  });

  it("SCRIPTS is WORKFLOW/scripts", () => {
    expect(PATHS.SCRIPTS).toBe(`${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SCRIPTS}`);
  });

  it("PROJECT_OWNER_FILE is WORKFLOW/.project-owner", () => {
    expect(PATHS.PROJECT_OWNER_FILE).toBe(
      `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.PROJECT_OWNER}`,
    );
  });

  it("CURRENT_TASK_FILE is WORKFLOW/.current-task", () => {
    expect(PATHS.CURRENT_TASK_FILE).toBe(
      `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.CURRENT_TASK}`,
    );
  });

  it("WORKFLOW_GUIDE_FILE is WORKFLOW/workflow.md", () => {
    expect(PATHS.WORKFLOW_GUIDE_FILE).toBe(
      `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.WORKFLOW_GUIDE}`,
    );
  });

  it("uses / separator (not backslash)", () => {
    for (const value of Object.values(PATHS)) {
      expect(value).not.toContain("\\");
    }
  });
});

// =============================================================================
// getWorkspaceDir — pure string concatenation
// =============================================================================

describe("getWorkspaceDir", () => {
  it("returns correct path for project owner name", () => {
    expect(getWorkspaceDir("john", ".john")).toBe(".john/workspace/john");
  });

  it("handles hyphenated names", () => {
    expect(getWorkspaceDir("john-doe", ".john")).toBe(
      ".john/workspace/john-doe",
    );
  });

  it("handles empty string", () => {
    expect(getWorkspaceDir("", ".john")).toBe(".john/workspace/");
  });
});

// =============================================================================
// getTaskDir — pure string concatenation
// =============================================================================

describe("getTaskDir", () => {
  it("returns correct path for task name", () => {
    expect(getTaskDir("01-21-my-task", ".john")).toBe(
      ".john/tasks/01-21-my-task",
    );
  });

  it("handles nested-looking names", () => {
    expect(getTaskDir("sub/task", ".john")).toBe(".john/tasks/sub/task");
  });

  it("handles empty string", () => {
    expect(getTaskDir("", ".john")).toBe(".john/tasks/");
  });
});

// =============================================================================
// getArchiveDir — pure, no arguments
// =============================================================================

describe("getArchiveDir", () => {
  it("returns correct archive path", () => {
    expect(getArchiveDir(".john")).toBe(".john/tasks/archive");
  });

  it("is under PATHS.TASKS", () => {
    const paths = getPathsForWorkflowRoot(".john");
    expect(getArchiveDir(".john").startsWith(paths.TASKS + "/")).toBe(true);
  });
});

describe("getWorkflowDir", () => {
  it("renders a personalized workflow root from the required user name", () => {
    expect(getWorkflowDir("john")).toBe(".john");
  });

  it("preserves user-provided hyphens", () => {
    expect(getWorkflowDir("john-doe")).toBe(".john-doe");
  });
});

describe("getPathsForWorkflowRoot", () => {
  it("renders all path constants for the personalized workflow root", () => {
    expect(getPathsForWorkflowRoot(".john")).toEqual({
      WORKFLOW: ".john",
      WORKSPACE: ".john/workspace",
      TASKS: ".john/tasks",
      SPEC: ".john/spec",
      SCRIPTS: ".john/scripts",
      PROJECT_OWNER_FILE: ".john/.project-owner",
      CURRENT_TASK_FILE: ".john/.current-task",
      WORKFLOW_GUIDE_FILE: ".john/workflow.md",
    });
  });
});
