/**
 * Path constants for the generated workflow structure.
 *
 * The workflow root is personalized at init time (for example `.alice`), so
 * this module exposes both a template placeholder and helpers that render
 * concrete paths from a workflow root.
 */

export const DIR_NAMES = {
  /** Placeholder key used by static path templates */
  WORKFLOW: "WORKFLOW_ROOT",
  /** Workspace directory (under workflow root) - project-owner work areas */
  WORKSPACE: "workspace",
  /** Tasks directory (under workflow root) - unified task storage */
  TASKS: "tasks",
  /** Archive directory (under tasks/) */
  ARCHIVE: "archive",
  /** Spec/guidelines directory (under workflow root) */
  SPEC: "spec",
  /** Scripts directory (under workflow root) */
  SCRIPTS: "scripts",
} as const;

// File names
export const FILE_NAMES = {
  /** Root agent instructions file */
  AGENTS: "AGENTS.md",
  /** Project owner record file */
  PROJECT_OWNER: ".project-owner",
  /** Current task pointer */
  CURRENT_TASK: ".current-task",
  /** Task metadata */
  TASK_JSON: "task.json",
  /** Requirements document */
  PRD: "prd.md",
  /** Workflow guide */
  WORKFLOW_GUIDE: "workflow.md",
  /** Journal file prefix */
  JOURNAL_PREFIX: "journal-",
} as const;

export interface WorkflowPaths {
  WORKFLOW: string;
  WORKSPACE: string;
  TASKS: string;
  SPEC: string;
  SCRIPTS: string;
  PROJECT_OWNER_FILE: string;
  CURRENT_TASK_FILE: string;
  WORKFLOW_GUIDE_FILE: string;
}

// Constructed template paths (relative to project root)
export const PATHS = {
  /** Workflow root placeholder */
  WORKFLOW: DIR_NAMES.WORKFLOW,
  /** WORKFLOW_ROOT/workspace/ */
  WORKSPACE: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.WORKSPACE}`,
  /** WORKFLOW_ROOT/tasks/ */
  TASKS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.TASKS}`,
  /** WORKFLOW_ROOT/spec/ */
  SPEC: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SPEC}`,
  /** WORKFLOW_ROOT/scripts/ */
  SCRIPTS: `${DIR_NAMES.WORKFLOW}/${DIR_NAMES.SCRIPTS}`,
  /** WORKFLOW_ROOT/.project-owner */
  PROJECT_OWNER_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.PROJECT_OWNER}`,
  /** WORKFLOW_ROOT/.current-task */
  CURRENT_TASK_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.CURRENT_TASK}`,
  /** WORKFLOW_ROOT/workflow.md */
  WORKFLOW_GUIDE_FILE: `${DIR_NAMES.WORKFLOW}/${FILE_NAMES.WORKFLOW_GUIDE}`,
} satisfies WorkflowPaths;

export function getWorkflowDir(projectName: string): string {
  const trimmed = projectName.trim();
  return `.${trimmed}`;
}

export function getPathsForWorkflowRoot(workflowRoot: string): WorkflowPaths {
  return {
    WORKFLOW: workflowRoot,
    WORKSPACE: `${workflowRoot}/${DIR_NAMES.WORKSPACE}`,
    TASKS: `${workflowRoot}/${DIR_NAMES.TASKS}`,
    SPEC: `${workflowRoot}/${DIR_NAMES.SPEC}`,
    SCRIPTS: `${workflowRoot}/${DIR_NAMES.SCRIPTS}`,
    PROJECT_OWNER_FILE: `${workflowRoot}/${FILE_NAMES.PROJECT_OWNER}`,
    CURRENT_TASK_FILE: `${workflowRoot}/${FILE_NAMES.CURRENT_TASK}`,
    WORKFLOW_GUIDE_FILE: `${workflowRoot}/${FILE_NAMES.WORKFLOW_GUIDE}`,
  };
}

/**
 * Get project owner workspace directory path
 * @example getWorkspaceDir("john", ".alice") => ".alice/workspace/john"
 */
export function getWorkspaceDir(
  projectOwner: string,
  workflowRoot = PATHS.WORKFLOW,
): string {
  return `${workflowRoot}/${DIR_NAMES.WORKSPACE}/${projectOwner}`;
}

/**
 * Get task directory path
 * @example getTaskDir("01-21-my-task", ".alice") => ".alice/tasks/01-21-my-task"
 */
export function getTaskDir(
  taskName: string,
  workflowRoot = PATHS.WORKFLOW,
): string {
  return `${workflowRoot}/${DIR_NAMES.TASKS}/${taskName}`;
}

/**
 * Get archive directory path
 * @example getArchiveDir(".alice") => ".alice/tasks/archive"
 */
export function getArchiveDir(workflowRoot = PATHS.WORKFLOW): string {
  return `${workflowRoot}/${DIR_NAMES.TASKS}/${DIR_NAMES.ARCHIVE}`;
}
