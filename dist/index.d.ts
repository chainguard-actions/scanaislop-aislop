import { z } from "zod/v4";
//#region src/commands/doctor.d.ts
interface DoctorEngineRow {
  engine: string;
  tool: string;
  status: "ok" | "missing" | "skipped";
  remediation?: string;
  skipReason?: string;
}
interface BuildDoctorRenderInput {
  projectName: string;
  languageLabel: string;
  rows: DoctorEngineRow[];
  invocation: string;
  printBrand?: boolean;
}
declare const buildDoctorRender: (input: BuildDoctorRenderInput) => string;
interface DoctorOptions {
  printBrand?: boolean;
}
declare const doctorCommand: (directory: string, options?: DoctorOptions) => Promise<void>;
//#endregion
//#region src/config/schema.d.ts
declare const AislopConfigSchema: z.ZodObject<{
  version: z.ZodDefault<z.ZodNumber>;
  engines: z.ZodDefault<z.ZodObject<{
    format: z.ZodDefault<z.ZodBoolean>;
    lint: z.ZodDefault<z.ZodBoolean>;
    "code-quality": z.ZodDefault<z.ZodBoolean>;
    "ai-slop": z.ZodDefault<z.ZodBoolean>;
    architecture: z.ZodDefault<z.ZodBoolean>;
    security: z.ZodDefault<z.ZodBoolean>;
  }, z.core.$strip>>;
  quality: z.ZodDefault<z.ZodObject<{
    maxFunctionLoc: z.ZodDefault<z.ZodNumber>;
    maxFileLoc: z.ZodDefault<z.ZodNumber>;
    maxNesting: z.ZodDefault<z.ZodNumber>;
    maxParams: z.ZodDefault<z.ZodNumber>;
  }, z.core.$strip>>;
  lint: z.ZodDefault<z.ZodObject<{
    typecheck: z.ZodDefault<z.ZodBoolean>;
    expoDoctor: z.ZodDefault<z.ZodBoolean>;
  }, z.core.$strip>>;
  security: z.ZodDefault<z.ZodObject<{
    audit: z.ZodDefault<z.ZodBoolean>;
    auditTimeout: z.ZodDefault<z.ZodNumber>;
  }, z.core.$strip>>;
  scoring: z.ZodDefault<z.ZodObject<{
    weights: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    thresholds: z.ZodDefault<z.ZodObject<{
      good: z.ZodDefault<z.ZodNumber>;
      ok: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    smoothing: z.ZodDefault<z.ZodNumber>;
    maxPerRule: z.ZodDefault<z.ZodNumber>;
  }, z.core.$strip>>;
  ci: z.ZodDefault<z.ZodObject<{
    failBelow: z.ZodDefault<z.ZodNumber>;
    format: z.ZodDefault<z.ZodEnum<{
      json: "json";
    }>>;
  }, z.core.$strip>>;
  telemetry: z.ZodDefault<z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
  }, z.core.$strip>>;
  rules: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodEnum<{
    error: "error";
    warning: "warning";
    off: "off";
  }>>>;
  exclude: z.ZodDefault<z.ZodArray<z.ZodString>>;
  include: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
type AislopConfig = z.infer<typeof AislopConfigSchema>;
//#endregion
//#region src/config/index.d.ts
declare const loadConfig: (directory: string) => AislopConfig;
//#endregion
//#region src/ui/rail.d.ts
type RailStepStatus = "active" | "done" | "warn" | "failed" | "skipped";
interface RailStep {
  status: RailStepStatus;
  label: string;
  notes?: string[];
}
//#endregion
//#region src/commands/fix.d.ts
interface FixOptions {
  verbose: boolean;
  force?: boolean;
  /** Restrict to reversible fixes only (imports, comment removal, safe formatter runs) */
  safe?: boolean;
  /** Agent CLI to launch with remaining issues (e.g. "claude", "codex") */
  agent?: string;
  /** Print the prompt to stdout instead of launching an agent */
  prompt?: boolean;
  showHeader?: boolean;
  printBrand?: boolean;
}
declare const fixCommand: (directory: string, config: AislopConfig, options?: FixOptions) => Promise<void>;
//#endregion
//#region src/commands/init.d.ts
interface BuildInitRenderInput {
  steps: RailStep[];
  nextCommand: string;
  includeHeader?: boolean;
  printBrand?: boolean;
}
declare const buildInitSuccessRender: (input: BuildInitRenderInput) => string;
interface InitOptions {
  printBrand?: boolean;
  strict?: boolean;
}
declare const initCommand: (directory: string, options?: InitOptions) => Promise<void>;
//#endregion
//#region src/commands/rules.d.ts
interface RuleEntry {
  id: string;
  engine: string;
  severity: "error" | "warning" | "info";
  fixable: boolean;
}
interface BuildRulesRenderInput {
  rules: RuleEntry[];
  invocation?: string;
  printBrand?: boolean;
  includeHeader?: boolean;
}
declare const buildRulesRender: (input: BuildRulesRenderInput) => string;
declare const buildRuleDetailRender: (rule: RuleEntry, input?: {
  printBrand?: boolean;
  includeHeader?: boolean;
}) => string;
interface RulesOptions {
  printBrand?: boolean;
  interactive?: boolean;
}
declare const rulesCommand: (directory: string, options?: RulesOptions) => Promise<void>;
//#endregion
//#region src/utils/discovery-coverage.d.ts
interface Coverage {
  readonly dominantUnsupported: string | null;
  readonly scoreable: boolean;
  readonly supportedFiles: number;
  readonly unsupportedFiles: number;
}
//#endregion
//#region src/utils/discover.d.ts
type Language = "typescript" | "javascript" | "python" | "go" | "rust" | "java" | "ruby" | "php";
type Framework = "nextjs" | "react" | "vite" | "remix" | "expo" | "astro" | "django" | "flask" | "fastapi" | "none";
interface ProjectInfo {
  rootDirectory: string;
  projectName: string;
  languages: Language[];
  frameworks: Framework[];
  sourceFileCount: number;
  coverage: Coverage;
  installedTools: Record<string, boolean>;
}
interface DiscoveryInputs {
  readonly includePatterns?: string[];
  readonly installedTools?: Record<string, boolean>;
  readonly projectFiles?: string[];
  readonly sourceFiles?: string[];
}
declare const discoverProject: (directory: string, excludePatterns?: string[], inputs?: DiscoveryInputs) => Promise<ProjectInfo>;
//#endregion
//#region src/engines/types.d.ts
type Severity = "error" | "warning" | "info";
type EngineName = "format" | "lint" | "code-quality" | "ai-slop" | "architecture" | "security";
interface Diagnostic {
  filePath: string;
  engine: EngineName;
  rule: string;
  severity: Severity;
  message: string;
  help: string;
  line: number;
  column: number;
  category: string;
  fixable: boolean;
  detail?: string;
}
interface EngineResult {
  engine: EngineName;
  diagnostics: Diagnostic[];
  elapsed: number;
  skipped: boolean;
  skipReason?: string;
}
//#endregion
//#region src/commands/scan.d.ts
interface ScanOptions {
  changes: boolean;
  staged: boolean;
  base?: string;
  verbose: boolean;
  json: boolean;
  sarif?: boolean;
  showHeader?: boolean;
  printBrand?: boolean;
  exclude?: string[];
  include?: string[];
  /** Used for telemetry to distinguish scan vs ci invocation */
  command?: "scan" | "ci";
}
declare const scanCommand: (directory: string, config: AislopConfig, options: ScanOptions) => Promise<{
  exitCode: number;
}>;
//#endregion
//#region src/scoring/index.d.ts
interface ScoreResult {
  score: number;
  label: string;
  effectiveSourceFileCount?: number;
  sourceFileCountMode?: "provided" | "estimated-from-diagnostics" | "not-needed";
}
declare const calculateScore: (diagnostics: Diagnostic[], weights: Record<string, number>, thresholds: {
  good: number;
  ok: number;
}, sourceFileCount?: number, smoothing?: number, maxPerRule?: number) => ScoreResult;
//#endregion
export { type AislopConfig, type Diagnostic, type EngineName, type EngineResult, type Framework, type Language, type ProjectInfo, type ScoreResult, type Severity, buildDoctorRender, buildInitSuccessRender, buildRuleDetailRender, buildRulesRender, calculateScore, discoverProject, doctorCommand, fixCommand, initCommand, loadConfig, rulesCommand, scanCommand };