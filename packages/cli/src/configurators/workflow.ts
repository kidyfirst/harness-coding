import path from "node:path";
import type { TemplateLanguage } from "../commands/init.js";

import {
  DIR_NAMES,
  PATHS,
  getPathsForWorkflowRoot,
  type WorkflowPaths,
} from "../constants/paths.js";
import { copyHarnessSpecDir } from "../templates/extract.js";

// Import workflow templates (generic, not project-specific)
import {
  getWorkflowMdTemplate,
  getConfigYamlTemplate,
  gitignoreTemplate,
} from "../templates/harness-spec/index.js";

// Import markdown templates
import {
  getAgentProgressIndexContent,
  getBackendDocs,
  getFrontendDocs,
  getGuidesDocs,
} from "../templates/markdown/index.js";

import { writeFile, ensureDir } from "../utils/file-writer.js";
import { replaceCommandLiterals } from "./shared.js";
import {
  sanitizePkgName,
  type ProjectType,
  type DetectedPackage,
} from "../utils/project-detector.js";

interface DocDefinition {
  name: string;
  content: string;
}

/**
 * Options for creating workflow structure
 */
export interface WorkflowOptions {
  /** Detected or specified project type */
  projectType: ProjectType;
  /** Personalized workflow root (for example `.alice`) */
  workflowRoot?: string;
  /** Markdown template language */
  language?: TemplateLanguage;
  /** Skip creating local spec templates (when using remote template) — single-repo mode */
  skipSpecTemplates?: boolean;
  /** Detected monorepo packages (enables monorepo spec creation) */
  packages?: DetectedPackage[];
  /** Package names that use remote templates (skip blank spec for these) */
  remoteSpecPackages?: Set<string>;
}

/**
 * Create workflow structure based on project type
 *
 * This function creates the personalized workflow directory structure by:
 * 1. Copying scripts/ directory directly (dogfooding)
 * 2. Copying workflow.md and .gitignore (dogfooding)
 * 3. Creating workspace/ with index.md
 * 4. Creating tasks/ directory
 * 5. Creating spec/ with templates (not dogfooded - generic templates)
 *
 * @param cwd - Current working directory
 * @param options - Workflow options including project type
 */
export async function createWorkflowStructure(
  cwd: string,
  options?: WorkflowOptions,
): Promise<void> {
  const projectType = options?.projectType ?? "fullstack";
  const workflowRoot = options?.workflowRoot ?? PATHS.WORKFLOW;
  const language = options?.language ?? "en";
  const workflowPaths = getPathsForWorkflowRoot(workflowRoot);
  const skipSpecTemplates = options?.skipSpecTemplates ?? false;
  const packages = options?.packages;
  const remoteSpecPackages = options?.remoteSpecPackages;

  // Create base workflow directory
  ensureDir(path.join(cwd, workflowRoot));

  // Copy scripts/ directory from templates
  await copyHarnessSpecDir("scripts", path.join(cwd, workflowPaths.SCRIPTS), {
    executable: true,
  });

  // Copy workflow.md from templates
  await writeFile(
    path.join(cwd, workflowPaths.WORKFLOW_GUIDE_FILE),
    replaceCommandLiterals(getWorkflowMdTemplate(language)),
  );

  // Copy .gitignore from templates
  await writeFile(
    path.join(cwd, workflowRoot, ".gitignore"),
    gitignoreTemplate,
  );

  // Copy config.yaml from templates
  await writeFile(
    path.join(cwd, workflowRoot, "config.yaml"),
    replaceCommandLiterals(getConfigYamlTemplate(language)),
  );

  // Create workspace/ with index.md
  ensureDir(path.join(cwd, workflowPaths.WORKSPACE));
  await writeFile(
    path.join(cwd, workflowPaths.WORKSPACE, "index.md"),
    replaceCommandLiterals(getAgentProgressIndexContent(language)),
  );

  // Create tasks/ directory
  ensureDir(path.join(cwd, workflowPaths.TASKS));

  // Create spec templates based on project type
  // These are NOT dogfooded - they are generic templates for new projects
  if (packages && packages.length > 0) {
    // Monorepo mode: create per-package spec directories
    await createSpecTemplates(
      cwd,
      workflowPaths,
      projectType,
      language,
      packages,
      remoteSpecPackages,
    );
  } else if (!skipSpecTemplates) {
    // Single-repo mode: create global spec (skip if using remote template)
    await createSpecTemplates(cwd, workflowPaths, projectType, language);
  }
}

/**
 * Write backend spec docs into a target spec directory.
 */
async function writeBackendDocs(
  specBase: string,
  language: TemplateLanguage,
): Promise<void> {
  const backendDir = path.join(specBase, "backend");
  ensureDir(backendDir);
  const docs: DocDefinition[] = getBackendDocs(language);
  for (const doc of docs) {
    await writeFile(
      path.join(backendDir, doc.name),
      replaceCommandLiterals(doc.content),
    );
  }
}

/**
 * Write frontend spec docs into a target spec directory.
 */
async function writeFrontendDocs(
  specBase: string,
  language: TemplateLanguage,
): Promise<void> {
  const frontendDir = path.join(specBase, "frontend");
  ensureDir(frontendDir);
  const docs: DocDefinition[] = getFrontendDocs(language);
  for (const doc of docs) {
    await writeFile(
      path.join(frontendDir, doc.name),
      replaceCommandLiterals(doc.content),
    );
  }
}

/**
 * Write spec docs for a given project type into a target spec directory.
 */
async function writeSpecForType(
  specBase: string,
  projectType: ProjectType,
  language: TemplateLanguage,
): Promise<void> {
  if (projectType !== "frontend") {
    await writeBackendDocs(specBase, language);
  }
  if (projectType !== "backend") {
    await writeFrontendDocs(specBase, language);
  }
}

async function createSpecTemplates(
  cwd: string,
  workflowPaths: WorkflowPaths,
  projectType: ProjectType,
  language: TemplateLanguage,
  packages?: DetectedPackage[],
  remoteSpecPackages?: Set<string>,
): Promise<void> {
  // Ensure spec directory exists
  ensureDir(path.join(cwd, workflowPaths.SPEC));

  // Guides - always created regardless of mode
  const guidesDir = path.join(cwd, `${workflowPaths.SPEC}/guides`);
  ensureDir(guidesDir);
  const guidesDocs: DocDefinition[] = getGuidesDocs(language);
  for (const doc of guidesDocs) {
    await writeFile(
      path.join(guidesDir, doc.name),
      replaceCommandLiterals(doc.content),
    );
  }

  if (packages && packages.length > 0) {
    // Monorepo mode: create spec/<name>/ for each package
    for (const pkg of packages) {
      const dirName = sanitizePkgName(pkg.name);
      if (remoteSpecPackages?.has(dirName)) continue;
      const pkgSpecBase = path.join(cwd, `${workflowPaths.SPEC}/${dirName}`);
      ensureDir(pkgSpecBase);
      const pkgType = pkg.type === "unknown" ? "fullstack" : pkg.type;
      await writeSpecForType(pkgSpecBase, pkgType, language);
    }
  } else {
    // Single-repo mode
    await writeSpecForType(path.join(cwd, workflowPaths.SPEC), projectType, language);
  }
}
