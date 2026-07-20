#!/usr/bin/env node
import { createRequire, isBuiltin } from "node:module";
import { Command } from "commander";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto, { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import YAML from "yaml";
import { z } from "zod/v4";
import { execSync, spawn, spawnSync } from "node:child_process";
import micromatch from "micromatch";
import ts from "typescript";
import * as readline from "node:readline";
import { Writable } from "node:stream";
import pc from "picocolors";
import wcwidth from "wcwidth";
import { isCancel, multiselect, select, text } from "@clack/prompts";

//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) {
		__defProp(target, name, {
			get: all[name],
			enumerable: true
		});
	}
	if (!no_symbols) {
		__defProp(target, Symbol.toStringTag, { value: "Module" });
	}
	return target;
};

//#endregion
//#region src/version.ts
const APP_VERSION = "0.11.0";

//#endregion
//#region src/telemetry/env.ts
const detectPackageManager$1 = (env = process.env) => {
	const execPath = env.npm_execpath ?? "";
	if (execPath.includes("npx")) return "npx";
	const userAgent = env.npm_config_user_agent ?? "";
	if (userAgent.startsWith("pnpm/")) return "pnpm";
	if (userAgent.startsWith("yarn/")) return "yarn";
	if (userAgent.startsWith("bun/")) return "bun";
	if (userAgent.startsWith("npm/")) return "npm";
	if (execPath.includes("pnpm")) return "pnpm";
	if (execPath.includes("yarn")) return "yarn";
	if (execPath.includes("bun")) return "bun";
	if (execPath.includes("npm")) return "npm";
	return "unknown";
};
const CI_ENV_KEYS = [
	"CI",
	"GITHUB_ACTIONS",
	"GITLAB_CI",
	"CIRCLECI",
	"TRAVIS",
	"BUILDKITE",
	"DRONE",
	"TEAMCITY_VERSION",
	"TF_BUILD"
];
const isCiEnv = (env = process.env) => CI_ENV_KEYS.some((k) => {
	const v = env[k];
	return v === "true" || v === "1" || v != null && v.length > 0 && k !== "CI";
}) || env.CI === "true" || env.CI === "1";
const fileCountBucket = (count) => {
	if (count < 10) return "0-10";
	if (count < 50) return "10-50";
	if (count < 100) return "50-100";
	if (count < 500) return "100-500";
	if (count < 1e3) return "500-1000";
	return "1000+";
};
const scoreBucket = (score) => {
	if (score >= 75) return "75-100";
	if (score >= 50) return "50-75";
	if (score >= 25) return "25-50";
	return "0-25";
};

//#endregion
//#region src/telemetry/identity.ts
const FILE_BASENAME = "install_id";
const resolveInstallIdPath = (homedir = os.homedir(), env = process.env) => {
	if (process.platform === "linux" && env.XDG_STATE_HOME) return path.join(env.XDG_STATE_HOME, "aislop", FILE_BASENAME);
	return path.join(homedir, ".aislop", FILE_BASENAME);
};
const ensureInstallId = (idPath = resolveInstallIdPath()) => {
	if (fs.existsSync(idPath)) {
		const existing = fs.readFileSync(idPath, "utf-8").trim();
		if (existing.length > 0) return {
			installId: existing,
			created: false
		};
	}
	const dir = path.dirname(idPath);
	fs.mkdirSync(dir, { recursive: true });
	const installId = randomUUID();
	const tmpPath = `${idPath}.${process.pid}.tmp`;
	fs.writeFileSync(tmpPath, `${installId}\n`, { mode: 384 });
	try {
		fs.renameSync(tmpPath, idPath);
		return {
			installId,
			created: true
		};
	} catch {
		fs.rmSync(tmpPath, { force: true });
		return {
			installId: fs.readFileSync(idPath, "utf-8").trim(),
			created: false
		};
	}
};

//#endregion
//#region src/telemetry/redaction.ts
const SAFE_PROPERTY_NAMES = new Set([
	"aislop_version",
	"node_version",
	"os",
	"arch",
	"schema_version",
	"anonymous_install_id",
	"package_manager",
	"is_ci",
	"command",
	"language_summary",
	"lang_typescript",
	"lang_javascript",
	"lang_python",
	"lang_java",
	"file_count_bucket",
	"exit_code",
	"duration_ms",
	"error_kind",
	"score",
	"score_bucket",
	"finding_count",
	"error_count",
	"warning_count",
	"fixable_count",
	"fix_steps",
	"fix_resolved",
	"fix_score_delta",
	"engine_format_issues",
	"engine_format_ms",
	"engine_lint_issues",
	"engine_lint_ms",
	"engine_code_quality_issues",
	"engine_code_quality_ms",
	"engine_ai_slop_issues",
	"engine_ai_slop_ms",
	"engine_architecture_issues",
	"engine_architecture_ms",
	"engine_security_issues",
	"engine_security_ms",
	"tool",
	"ok",
	"agent",
	"score_delta"
]);
const redactProperties = (props) => {
	const clean = {};
	const dropped = [];
	for (const [key, value] of Object.entries(props)) {
		if (value === void 0) continue;
		if (SAFE_PROPERTY_NAMES.has(key)) clean[key] = value;
		else dropped.push(key);
	}
	return {
		clean,
		dropped
	};
};

//#endregion
//#region src/telemetry/client.ts
const POSTHOG_HOST = process.env.AISLOP_POSTHOG_HOST ?? "https://eu.i.posthog.com";
const POSTHOG_KEY = process.env.AISLOP_POSTHOG_KEY ?? "phc_eY2cOMFva9q24GrWeOuvuVIOhCIdjOALxeAR3ItrqbJ";
const SCHEMA_VERSION = "v2";
const REQUEST_TIMEOUT_MS$1 = 3e3;
const isTelemetryDisabled = (config) => {
	const env = process.env;
	if (env.AISLOP_NO_TELEMETRY === "1" || env.DO_NOT_TRACK === "1") return true;
	if (config?.enabled === false) return true;
	if (config?.enabled === true) return false;
	if (env.CI === "true" || env.CI === "1") return true;
	return false;
};
const isDebug = () => process.env.AISLOP_TELEMETRY_DEBUG === "1";
const pendingRequests = /* @__PURE__ */ new Set();
let cachedInstallId = null;
let installCreated = false;
const baseProperties = (installId) => ({
	aislop_version: APP_VERSION,
	node_version: process.version,
	os: os.platform(),
	arch: os.arch(),
	schema_version: SCHEMA_VERSION,
	anonymous_install_id: installId,
	package_manager: detectPackageManager$1(),
	is_ci: isCiEnv()
});
const track = (input) => {
	if (isTelemetryDisabled(input.config)) return { installCreated: false };
	if (cachedInstallId == null) {
		const ensured = ensureInstallId(resolveInstallIdPath());
		cachedInstallId = ensured.installId;
		installCreated = ensured.created;
	}
	const { clean, dropped } = redactProperties({
		...baseProperties(cachedInstallId),
		...input.properties
	});
	if (isDebug()) {
		const compact = JSON.stringify({
			event: input.event,
			properties: clean
		});
		process.stderr.write(`[telemetry] ${compact}\n`);
		if (dropped.length > 0) for (const key of dropped) process.stderr.write(`[telemetry] dropped non-allowlisted property: ${key}\n`);
	}
	if (process.env.AISLOP_TELEMETRY_DRY_RUN === "1") return { installCreated };
	const payload = {
		api_key: POSTHOG_KEY,
		event: input.event,
		distinct_id: cachedInstallId,
		properties: clean,
		timestamp: (/* @__PURE__ */ new Date()).toISOString()
	};
	const request = fetch(`${POSTHOG_HOST}/capture/`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS$1)
	}).then(() => {}).catch(() => {}).finally(() => {
		pendingRequests.delete(request);
	});
	pendingRequests.add(request);
	return { installCreated };
};
const flushTelemetry = async (timeoutMs) => {
	if (pendingRequests.size === 0) return;
	const all = Promise.all(pendingRequests);
	if (timeoutMs == null) {
		await all;
		return;
	}
	await Promise.race([all, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
};

//#endregion
//#region src/telemetry/language.ts
const ALL_LANGUAGES = [
	"typescript",
	"javascript",
	"python",
	"java"
];
const buildLanguageProperties = (detected) => {
	const present = new Set(detected);
	const summary = [...present].filter((l) => ALL_LANGUAGES.includes(l));
	summary.sort();
	return {
		language_summary: summary.join(","),
		lang_typescript: present.has("typescript"),
		lang_javascript: present.has("javascript"),
		lang_python: present.has("python"),
		lang_java: present.has("java")
	};
};

//#endregion
//#region src/telemetry/events.ts
const buildCommandStartedProps = (input) => {
	const props = { command: input.command };
	if (input.languages) Object.assign(props, buildLanguageProperties(input.languages));
	if (typeof input.fileCount === "number") props.file_count_bucket = fileCountBucket(input.fileCount);
	return props;
};
const ENGINE_KEY_MAP = {
	format: "engine_format",
	lint: "engine_lint",
	"code-quality": "engine_code_quality",
	"ai-slop": "engine_ai_slop",
	architecture: "engine_architecture",
	security: "engine_security"
};
const flattenEngineStats = (issues, timings) => {
	const out = {};
	for (const [engine, count] of Object.entries(issues)) {
		const key = ENGINE_KEY_MAP[engine];
		if (key != null && typeof count === "number") out[`${key}_issues`] = count;
	}
	for (const [engine, ms] of Object.entries(timings)) {
		const key = ENGINE_KEY_MAP[engine];
		if (key != null && typeof ms === "number") out[`${key}_ms`] = Math.round(ms);
	}
	return out;
};
const buildCommandCompletedProps = (input) => {
	const props = {
		...input.startProps,
		exit_code: input.exitCode,
		duration_ms: Math.round(input.durationMs)
	};
	if (input.errorKind) props.error_kind = input.errorKind;
	if (typeof input.score === "number") {
		props.score = input.score;
		props.score_bucket = scoreBucket(input.score);
	}
	if (typeof input.findingCount === "number") props.finding_count = input.findingCount;
	if (typeof input.errorCount === "number") props.error_count = input.errorCount;
	if (typeof input.warningCount === "number") props.warning_count = input.warningCount;
	if (typeof input.fixableCount === "number") props.fixable_count = input.fixableCount;
	if (input.engineIssues && input.engineTimings) Object.assign(props, flattenEngineStats(input.engineIssues, input.engineTimings));
	if (typeof input.fixSteps === "number") props.fix_steps = input.fixSteps;
	if (typeof input.fixResolved === "number") props.fix_resolved = input.fixResolved;
	if (typeof input.fixScoreDelta === "number") props.fix_score_delta = input.fixScoreDelta;
	return props;
};
const buildHookScanCompletedProps = (input) => {
	const props = {
		agent: input.agent,
		score: input.score,
		score_bucket: scoreBucket(input.score),
		finding_count: input.findingCount,
		file_count_bucket: fileCountBucket(input.fileCount)
	};
	if (typeof input.scoreDelta === "number") props.score_delta = input.scoreDelta;
	return props;
};
const errorKindFromException = (error) => {
	const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
	if (message.includes("timeout") || message.includes("timed out")) return "timeout";
	if (message.includes("invalid config") || message.includes("config_invalid")) return "config_invalid";
	if (message.includes("engine") && message.includes("crash")) return "engine_crash";
	return "unknown";
};

//#endregion
//#region src/telemetry/lifecycle.ts
const withCommandLifecycle = async (start, run) => {
	const startProps = buildCommandStartedProps({
		command: start.command,
		languages: start.languages,
		fileCount: start.fileCount
	});
	track({
		event: "cli_command_started",
		properties: startProps,
		config: start.config
	});
	const startedAt = performance.now();
	try {
		const result = await run();
		const durationMs = performance.now() - startedAt;
		track({
			event: "cli_command_completed",
			properties: buildCommandCompletedProps({
				startProps,
				exitCode: result.exitCode,
				durationMs,
				score: result.score ?? void 0,
				findingCount: result.findingCount,
				errorCount: result.errorCount,
				warningCount: result.warningCount,
				fixableCount: result.fixableCount,
				engineIssues: result.engineIssues,
				engineTimings: result.engineTimings,
				fixSteps: result.fixSteps,
				fixResolved: result.fixResolved,
				fixScoreDelta: result.fixScoreDelta
			}),
			config: start.config
		});
		await flushTelemetry();
		return result;
	} catch (error) {
		track({
			event: "cli_command_completed",
			properties: buildCommandCompletedProps({
				startProps,
				exitCode: 1,
				durationMs: performance.now() - startedAt,
				errorKind: errorKindFromException(error)
			}),
			config: start.config
		});
		await flushTelemetry();
		throw error;
	}
};

//#endregion
//#region src/hooks/feedback.ts
const fingerprintFinding = (f) => `${f.file}:${f.line}:${f.ruleId}`;
const MAX_FINDINGS = 20;
const MAX_NEW_SINCE_BASELINE = 10;
const REVIEW_TOP_N = 3;
const REGRESSION_FLAG_THRESHOLD = 5;
const toFinding = (d, rootDirectory) => {
	if (d.severity !== "error" && d.severity !== "warning") return null;
	const file = path.isAbsolute(d.filePath) ? path.relative(rootDirectory, d.filePath) : d.filePath;
	return {
		ruleId: d.rule,
		severity: d.severity,
		category: d.category,
		file,
		line: d.line,
		col: d.column || void 0,
		message: d.message
	};
};
const buildNextSteps = (findings) => {
	const steps = [];
	const errorCount = findings.filter((f) => f.severity === "error").length;
	if (errorCount > 0) steps.push(`Fix ${errorCount} error${errorCount === 1 ? "" : "s"} before the next turn.`);
	const byFile = /* @__PURE__ */ new Map();
	for (const f of findings) {
		const list = byFile.get(f.file) ?? [];
		list.push(f);
		byFile.set(f.file, list);
	}
	for (const [file, list] of Array.from(byFile.entries()).slice(0, 3)) {
		const lines = list.map((f) => f.line).slice(0, 3).join(", ");
		steps.push(`Address ${list.length} finding${list.length === 1 ? "" : "s"} in ${file} (line${list.length === 1 ? "" : "s"} ${lines}).`);
	}
	return steps;
};
const buildSuggestedActions = (diagnostics, findings, regressed, delta) => {
	const actions = [];
	const fixableDiags = diagnostics.filter((d) => d.fixable);
	if (fixableDiags.length > 0) {
		const ruleIds = Array.from(new Set(fixableDiags.map((d) => d.rule)));
		actions.push({
			id: "run_aislop_fix",
			label: `Run aislop fix to clear ${fixableDiags.length} mechanical finding${fixableDiags.length === 1 ? "" : "s"}.`,
			command: "aislop fix",
			rationale: "These findings have deterministic fixes (formatting, unused imports, trivial comments). Running this before any manual work avoids burning agent tokens on what the CLI handles for free.",
			ruleIds
		});
	}
	const archErrors = findings.filter((f) => f.ruleId.startsWith("arch/") && f.severity === "error");
	if (archErrors.length > 0) actions.push({
		id: "review_finding",
		label: `Review ${archErrors.length} architecture rule violation${archErrors.length === 1 ? "" : "s"} — these can't be auto-fixed.`,
		rationale: "Architecture rules encode intentional project structure decisions. The fix usually means moving code, not editing it.",
		ruleIds: Array.from(new Set(archErrors.map((f) => f.ruleId)))
	});
	if (regressed && typeof delta === "number" && delta <= -REGRESSION_FLAG_THRESHOLD && fixableDiags.length === 0) {
		const top = findings.filter((f) => f.severity === "error" || f.severity === "warning").slice(0, REVIEW_TOP_N);
		if (top.length > 0) actions.push({
			id: "review_finding",
			label: `Score dropped ${Math.abs(delta)} points — review the top ${top.length} finding${top.length === 1 ? "" : "s"} from this edit.`,
			rationale: "None of these are auto-fixable. Read each one against the source and decide whether the fix is to change the code or to add a justified suppression with a reason.",
			ruleIds: top.map((f) => f.ruleId)
		});
	}
	if (actions.length === 0) actions.push({
		id: "no_action",
		label: typeof delta === "number" ? delta > 0 ? `Score improved by ${delta}. No action needed.` : "Score unchanged. No action needed." : "No findings. No action needed.",
		rationale: "The current scan didn't reveal anything that requires the agent's attention."
	});
	return actions;
};
const buildAccountability = (meta, findings, regressed, newSinceBaseline) => {
	if (!meta?.agent && (!meta?.touchedFiles || meta.touchedFiles.length === 0)) return void 0;
	const touchedFiles = Array.from(new Set(meta.touchedFiles ?? []));
	const newFindingCount = newSinceBaseline?.length ?? findings.length;
	const mustFixBeforeDone = regressed || findings.some((f) => f.severity === "error");
	const reason = mustFixBeforeDone ? regressed ? "Score regressed against the captured baseline. The agent should fix or justify the new findings before finishing." : "Error-severity findings remain in files touched by this agent turn." : "No blocking regression detected for this agent turn.";
	return {
		agent: meta.agent,
		touchedFiles,
		newFindingCount,
		mustFixBeforeDone,
		reason
	};
};
const buildFeedback = (diagnostics, score, rootDirectory, baseline, meta) => {
	const all = diagnostics.map((d) => toFinding(d, rootDirectory)).filter((x) => x !== null);
	const capped = all.slice(0, MAX_FINDINGS);
	const elided = all.length > MAX_FINDINGS ? all.length - MAX_FINDINGS : void 0;
	const counts = {
		error: diagnostics.filter((d) => d.severity === "error").length,
		warning: diagnostics.filter((d) => d.severity === "warning").length,
		fixable: diagnostics.filter((d) => d.fixable).length,
		total: all.length
	};
	const baselineSnapshot = typeof baseline === "number" ? {
		score: baseline,
		findingFingerprints: []
	} : baseline;
	const baselineScore = baselineSnapshot?.score;
	const delta = typeof baselineScore === "number" ? score - baselineScore : void 0;
	const regressed = typeof delta === "number" ? delta < 0 : false;
	let newSinceBaseline;
	if (baselineSnapshot && baselineSnapshot.findingFingerprints.length > 0) {
		const known = new Set(baselineSnapshot.findingFingerprints);
		newSinceBaseline = all.filter((f) => !known.has(fingerprintFinding(f))).slice(0, MAX_NEW_SINCE_BASELINE);
	}
	return {
		schema: "aislop.hook.v2",
		score,
		baseline: baselineScore,
		delta,
		regressed,
		accountability: buildAccountability(meta, capped, regressed, newSinceBaseline),
		counts,
		findings: capped,
		elided,
		newSinceBaseline,
		nextSteps: buildNextSteps(capped),
		suggestedActions: buildSuggestedActions(diagnostics, capped, regressed, delta)
	};
};

//#endregion
//#region src/hooks/io/scan-lock.ts
const LOCK_DIR = ".aislop";
const LOCK_FILE = "hook.lock";
const STALE_MS = 3e4;
const lockPath = (cwd) => path.join(cwd, LOCK_DIR, LOCK_FILE);
const readLock = (target) => {
	try {
		const raw = fs.readFileSync(target, "utf-8");
		const parsed = JSON.parse(raw);
		if (typeof parsed.pid !== "number" || typeof parsed.ts !== "number") return null;
		return parsed;
	} catch {
		return null;
	}
};
const acquireHookLock = (cwd) => {
	const target = lockPath(cwd);
	const existing = readLock(target);
	if (existing && Date.now() - existing.ts < STALE_MS) return null;
	try {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, JSON.stringify({
			pid: process.pid,
			ts: Date.now()
		}));
	} catch {
		return null;
	}
	return () => {
		try {
			if (readLock(target)?.pid === process.pid) fs.unlinkSync(target);
		} catch {}
	};
};

//#endregion
//#region src/config/defaults.ts
const DEFAULT_CONFIG = {
	version: 1,
	exclude: [
		"node_modules",
		".git",
		"dist",
		"build",
		"coverage"
	],
	include: [],
	engines: {
		format: true,
		lint: true,
		"code-quality": true,
		"ai-slop": true,
		architecture: false,
		security: true
	},
	quality: {
		maxFunctionLoc: 80,
		maxFileLoc: 400,
		maxNesting: 5,
		maxParams: 6
	},
	lint: { typecheck: false },
	security: {
		audit: true,
		auditTimeout: 25e3
	},
	scoring: {
		weights: {
			format: .3,
			lint: .6,
			"code-quality": .8,
			"ai-slop": 2.5,
			architecture: 1,
			security: 1.5
		},
		thresholds: {
			good: 75,
			ok: 50
		},
		smoothing: 20,
		maxPerRule: 40
	},
	ci: {
		failBelow: 70,
		format: "json"
	},
	telemetry: { enabled: true },
	rules: {}
};
const GITHUB_WORKFLOW_DIR = ".github/workflows";
const GITHUB_WORKFLOW_FILE = "aislop.yml";
const DEFAULT_GITHUB_WORKFLOW_YAML = `name: aislop

on:
  push:
    branches: [main]
  pull_request:

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: scanaislop/aislop@v1
        with:
          version: latest
`;
const DEFAULT_RULES_YAML = `# Architecture rules (BYO)
# Uncomment and customize to enforce your project's conventions.
#
# rules:
#   - name: no-axios
#     type: forbid_import
#     match: "axios"
#     severity: error
#
#   - name: controller-no-db
#     type: forbid_import_from_path
#     from: "src/controllers/**"
#     forbid: "src/db/**"
#     severity: error
`;

//#endregion
//#region src/config/extends.ts
const MAX_DEPTH = 5;
const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const deepMerge = (...sources) => {
	const result = {};
	for (const source of sources) for (const key of Object.keys(source)) {
		const a = result[key];
		const b = source[key];
		result[key] = isPlainObject(a) && isPlainObject(b) ? deepMerge(a, b) : b;
	}
	return result;
};
const resolveExtendsRef = (ref, fromDir) => {
	if (ref.startsWith("http://") || ref.startsWith("https://")) throw new Error(`URL-based extends not yet supported: ${ref}`);
	if (ref.startsWith("./") || ref.startsWith("../") || path.isAbsolute(ref)) return path.resolve(fromDir, ref);
	throw new Error(`Package-name extends not yet supported: ${ref} (use a relative path for now)`);
};
const normalizeExtends = (raw) => {
	if (raw === void 0 || raw === null) return [];
	if (typeof raw === "string") return [raw];
	if (Array.isArray(raw) && raw.every((s) => typeof s === "string")) return raw;
	throw new Error("`extends` must be a string or array of strings");
};
const loadConfigChain = (configPath, visited = /* @__PURE__ */ new Set(), depth = 0) => {
	if (depth > MAX_DEPTH) throw new Error(`extends depth exceeded ${MAX_DEPTH} (cycle or runaway chain): ${configPath}`);
	const absPath = path.resolve(configPath);
	if (visited.has(absPath)) throw new Error(`circular extends detected: ${absPath}`);
	if (!fs.existsSync(absPath)) throw new Error(`extends target not found: ${absPath}`);
	const nextVisited = new Set(visited);
	nextVisited.add(absPath);
	const raw = fs.readFileSync(absPath, "utf-8");
	const parsed = YAML.parse(raw) ?? {};
	const refs = normalizeExtends(parsed.extends);
	const fromDir = path.dirname(absPath);
	const parents = refs.map((ref) => {
		return loadConfigChain(resolveExtendsRef(ref, fromDir), nextVisited, depth + 1);
	});
	const { extends: _drop, ...own } = parsed;
	return deepMerge(...parents, own);
};

//#endregion
//#region src/config/schema.ts
const DEFAULT_WEIGHTS = {
	format: .3,
	lint: .6,
	"code-quality": .8,
	"ai-slop": 2.5,
	architecture: 1,
	security: 1.5
};
const EnginesSchema = z.object({
	format: z.boolean().default(true),
	lint: z.boolean().default(true),
	"code-quality": z.boolean().default(true),
	"ai-slop": z.boolean().default(true),
	architecture: z.boolean().default(false),
	security: z.boolean().default(true)
});
const QualitySchema = z.object({
	maxFunctionLoc: z.number().positive().default(80),
	maxFileLoc: z.number().positive().default(400),
	maxNesting: z.number().positive().default(5),
	maxParams: z.number().positive().default(6)
});
const LintConfigSchema = z.object({ typecheck: z.boolean().default(false) });
const SecurityConfigSchema = z.object({
	audit: z.boolean().default(true),
	auditTimeout: z.number().positive().default(25e3)
});
const ThresholdsSchema = z.object({
	good: z.number().default(75),
	ok: z.number().default(50)
});
const ScoringSchema = z.object({
	weights: z.record(z.string(), z.number()).default(DEFAULT_WEIGHTS),
	thresholds: ThresholdsSchema.default(() => ({
		good: 75,
		ok: 50
	})),
	smoothing: z.number().nonnegative().default(20),
	maxPerRule: z.number().positive().default(40)
});
const CiSchema = z.object({
	failBelow: z.number().default(70),
	format: z.enum(["json"]).default("json")
});
const TelemetrySchema = z.object({ enabled: z.boolean().default(true) });
const RuleSeverityOverride = z.enum([
	"error",
	"warning",
	"off"
]);
const RulesSchema = z.record(z.string(), RuleSeverityOverride).default(() => ({}));
const AislopConfigSchema = z.object({
	version: z.number().default(1),
	engines: EnginesSchema.default(() => ({
		format: true,
		lint: true,
		"code-quality": true,
		"ai-slop": true,
		architecture: false,
		security: true
	})),
	quality: QualitySchema.default(() => ({
		maxFunctionLoc: 80,
		maxFileLoc: 400,
		maxNesting: 5,
		maxParams: 6
	})),
	lint: LintConfigSchema.default(() => ({ typecheck: false })),
	security: SecurityConfigSchema.default(() => ({
		audit: true,
		auditTimeout: 25e3
	})),
	scoring: ScoringSchema.default(() => ({
		weights: { ...DEFAULT_WEIGHTS },
		thresholds: {
			good: 75,
			ok: 50
		},
		smoothing: 20,
		maxPerRule: 40
	})),
	ci: CiSchema.default(() => ({
		failBelow: 70,
		format: "json"
	})),
	telemetry: TelemetrySchema.default(() => ({ enabled: true })),
	rules: RulesSchema,
	exclude: z.array(z.string()).default(() => [
		"node_modules",
		".git",
		"dist",
		"build",
		"coverage"
	]),
	include: z.array(z.string()).default(() => [])
});
const defaults = AislopConfigSchema.parse({});
/**
* Pre-merge scoring weights so partial overrides extend the defaults
* rather than replacing them entirely (z.record replaces by default).
*/
const preMergeWeights = (raw) => {
	const scoring = raw.scoring;
	if (!scoring) return;
	const userWeights = scoring.weights;
	if (!userWeights || typeof userWeights !== "object") return;
	scoring.weights = {
		...DEFAULT_WEIGHTS,
		...userWeights
	};
};
const parseConfig = (raw) => {
	if (!raw || typeof raw !== "object") return defaults;
	try {
		const input = raw;
		preMergeWeights(input);
		return AislopConfigSchema.parse(input);
	} catch {
		return defaults;
	}
};

//#endregion
//#region src/config/index.ts
const CONFIG_DIR = ".aislop";
const CONFIG_FILE = "config.yml";
const RULES_FILE = "rules.yml";
const findConfigDir = (startDir) => {
	let current = path.resolve(startDir);
	while (true) {
		const candidate = path.join(current, CONFIG_DIR);
		if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return null;
};
const loadConfig = (directory) => {
	const configDir = findConfigDir(directory);
	if (!configDir) return DEFAULT_CONFIG;
	const configPath = path.join(configDir, CONFIG_FILE);
	if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;
	try {
		return parseConfig(loadConfigChain(configPath));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		process.stderr.write(`  ⚠ Failed to parse ${configPath}: ${msg}\n  ⚠ Using default configuration.\n`);
		return DEFAULT_CONFIG;
	}
};

//#endregion
//#region src/utils/source-files.ts
const MAX_BUFFER$1 = 50 * 1024 * 1024;
const SOURCE_EXTENSIONS$1 = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".go",
	".rs",
	".rb",
	".java",
	".php"
]);
const EXCLUDED_DIRS = [
	"node_modules",
	"dist",
	"build",
	".git",
	".agents",
	".pnpm-store",
	"vendor",
	"examples",
	"example",
	"demos",
	"demo",
	"bench",
	"benches",
	"benchmarks",
	"fixtures",
	"fixture",
	"samples",
	"sample",
	"tutorials",
	"tutorial",
	"code_samples",
	"code-samples",
	"notebooks",
	"tests",
	"test",
	"__tests__",
	"__test__",
	"spec",
	"__mocks__",
	"test_data",
	".next",
	".nuxt",
	"coverage",
	".turbo",
	"public"
];
const FIND_PRUNE_DIRS = [
	"node_modules",
	"dist",
	"build",
	".git",
	".agents",
	".pnpm-store",
	"vendor",
	"examples",
	"example",
	"demos",
	"demo",
	"bench",
	"benches",
	"benchmarks",
	"fixtures",
	"fixture",
	"samples",
	"sample",
	"tutorials",
	"tutorial",
	"code_samples",
	"code-samples",
	"notebooks",
	".next",
	".nuxt",
	"coverage",
	".turbo",
	"public"
];
const BUILD_CACHE_FILE_PATTERNS = [
	/\.timestamp-\d+-[a-z0-9]+\.[mc]?js$/i,
	/\.min\.(?:js|css|mjs|cjs)$/i,
	/\.bundle\.(?:js|css|mjs|cjs)$/i
];
const isBuildCacheFile = (filePath) => BUILD_CACHE_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
const TEST_FILE_PATTERNS = [
	/(?:^|\/).*\.test\.[^/]+$/i,
	/(?:^|\/).*\.spec\.[^/]+$/i,
	/(?:^|\/)test_[^/]+\.(?:py|rb|php|js|jsx|ts|tsx|java)$/i,
	/(?:^|\/)[^/]+_test\.(?:py|go|rb|php|js|jsx|ts|tsx|java)$/i
];
const AUTO_GENERATED_PATTERNS = [
	/auto-generated/i,
	/@generated/i,
	/DO NOT (?:EDIT|MODIFY)/i,
	/this file (?:is|was) (?:auto-?)?generated/i,
	/automatically generated/i,
	/generated by/i
];
const toProjectPath = (rootDirectory, filePath) => {
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(rootDirectory, filePath);
	return path.relative(rootDirectory, absolutePath).split(path.sep).join("/");
};
const isWithinProject = (relativePath) => relativePath.length > 0 && !relativePath.startsWith("..");
const hasAllowedExtension = (filePath, extraExtensions) => {
	const extension = path.extname(filePath);
	return SOURCE_EXTENSIONS$1.has(extension) || extraExtensions.has(extension);
};
const isExcludedPath = (filePath) => EXCLUDED_DIRS.some((dir) => filePath === dir || filePath.startsWith(`${dir}/`) || filePath.includes(`/${dir}/`));
const isExcludedFromScan = (relativePath) => isExcludedPath(relativePath) || isBuildCacheFile(relativePath);
const isTestFile$2 = (filePath) => TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
const readBiomeExcludePatterns = (rootDirectory) => {
	const biomePath = path.join(rootDirectory, "biome.json");
	if (!fs.existsSync(biomePath)) return [];
	try {
		const includes = JSON.parse(fs.readFileSync(biomePath, "utf-8")).files?.includes;
		if (!Array.isArray(includes)) return [];
		return includes.filter((entry) => typeof entry === "string").filter((entry) => entry.startsWith("!") && entry.length > 1).map((entry) => entry.slice(1));
	} catch {
		return [];
	}
};
const getIgnoredPaths = (rootDirectory, files) => {
	if (files.length === 0) return /* @__PURE__ */ new Set();
	const result = spawnSync("git", [
		"check-ignore",
		"--no-index",
		"--stdin"
	], {
		cwd: rootDirectory,
		encoding: "utf-8",
		input: files.join("\n"),
		maxBuffer: MAX_BUFFER$1
	});
	if (result.error || result.status !== 0 && result.status !== 1) return /* @__PURE__ */ new Set();
	return new Set(result.stdout.split("\n").map((file) => file.trim()).filter((file) => file.length > 0));
};
const listProjectFiles = (rootDirectory) => {
	const result = spawnSync("git", [
		"ls-files",
		"--cached",
		"--others",
		"--exclude-standard"
	], {
		cwd: rootDirectory,
		encoding: "utf-8",
		maxBuffer: MAX_BUFFER$1
	});
	if (!result.error && result.status === 0) return result.stdout.split("\n").filter((file) => file.length > 0).filter((file) => fs.existsSync(path.resolve(rootDirectory, file)));
	const findResult = spawnSync("find", [
		".",
		"(",
		...FIND_PRUNE_DIRS.flatMap((dir, index) => index === 0 ? ["-name", dir] : [
			"-o",
			"-name",
			dir
		]),
		")",
		"-prune",
		"-o",
		"-type",
		"f",
		"-print"
	], {
		cwd: rootDirectory,
		encoding: "utf-8",
		maxBuffer: MAX_BUFFER$1
	});
	if (findResult.error || findResult.status !== 0) return [];
	return findResult.stdout.split("\n").filter((file) => file.length > 0).map((file) => file.replace(/^\.\//, ""));
};
const readAislopIgnorePatterns = (rootDirectory) => {
	const ignorePath = path.join(rootDirectory, ".aislopignore");
	if (!fs.existsSync(ignorePath)) return [];
	try {
		return fs.readFileSync(ignorePath, "utf-8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#"));
	} catch {
		return [];
	}
};
const normalizeExcludePatterns = (patterns) => {
	return patterns.flatMap((pattern) => {
		const p = pattern.trim();
		if (p.startsWith(".")) return [`**/*${p}`];
		if (!p.includes("*") && !p.includes(".")) return [`${p}/**`];
		return [p];
	});
};
const filterProjectFiles = (rootDirectory, files, extraExtensions = [], exclude = [], include = []) => {
	const extraSet = new Set(extraExtensions);
	const normalizedFiles = files.map((file) => {
		const absolutePath = path.isAbsolute(file) ? file : path.resolve(rootDirectory, file);
		return {
			absolutePath,
			relativePath: toProjectPath(rootDirectory, absolutePath)
		};
	}).filter(({ relativePath }) => isWithinProject(relativePath));
	const ignoredPaths = getIgnoredPaths(rootDirectory, normalizedFiles.map(({ relativePath }) => relativePath));
	const excludePatterns = [...readBiomeExcludePatterns(rootDirectory), ...exclude];
	const normalizedExcludePatterns = excludePatterns.length ? normalizeExcludePatterns(excludePatterns) : [];
	const isUserExcluded = (relativePath) => {
		if (!normalizedExcludePatterns.length) return false;
		return micromatch.isMatch(relativePath, normalizedExcludePatterns, { dot: true });
	};
	const hasIncludePatterns = include.length > 0;
	const isUserIncluded = (relativePath) => {
		if (!hasIncludePatterns) return true;
		return micromatch.isMatch(relativePath, include, { dot: true });
	};
	return normalizedFiles.filter(({ absolutePath, relativePath }) => {
		if (!fs.existsSync(absolutePath) || !isWithinProject(relativePath) || isExcludedPath(relativePath) || isTestFile$2(relativePath) || isBuildCacheFile(relativePath) || ignoredPaths.has(relativePath)) return false;
		if (!isUserIncluded(relativePath)) return false;
		if (isUserExcluded(relativePath)) return false;
		return hasAllowedExtension(relativePath, extraSet);
	}).map(({ absolutePath }) => absolutePath);
};
const filterExplicitFiles = (rootDirectory, files, extraExtensions = []) => {
	const extraSet = new Set(extraExtensions);
	return files.map((file) => {
		const absolutePath = path.isAbsolute(file) ? file : path.resolve(rootDirectory, file);
		return {
			absolutePath,
			relativePath: toProjectPath(rootDirectory, absolutePath)
		};
	}).filter(({ relativePath }) => isWithinProject(relativePath) && hasAllowedExtension(relativePath, extraSet)).map(({ absolutePath }) => absolutePath);
};
const isAutoGenerated = (filePath) => {
	let fd;
	try {
		fd = fs.openSync(filePath, "r");
		const buf = Buffer.alloc(512);
		const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
		const header = buf.toString("utf-8", 0, bytesRead);
		return AUTO_GENERATED_PATTERNS.some((pattern) => pattern.test(header));
	} catch {
		return false;
	} finally {
		if (fd !== void 0) try {
			fs.closeSync(fd);
		} catch {}
	}
};
const getSourceFilesForRoot = (rootDirectory) => filterProjectFiles(rootDirectory, listProjectFiles(rootDirectory));
const getSourceFiles = (context) => {
	if (context.files) return filterExplicitFiles(context.rootDirectory, context.files);
	return getSourceFilesForRoot(context.rootDirectory);
};
const getSourceFilesWithExtras = (context, extraExtensions) => {
	if (context.files) return filterExplicitFiles(context.rootDirectory, context.files, extraExtensions);
	return filterProjectFiles(context.rootDirectory, listProjectFiles(context.rootDirectory), extraExtensions);
};

//#endregion
//#region src/utils/source-masker.ts
const JS_EXTS$2 = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const PY_EXTS = new Set([".py"]);
const RB_EXTS = new Set([".rb"]);
const PHP_EXTS = new Set([".php"]);
const familyForExt = (ext) => {
	if (JS_EXTS$2.has(ext)) return "js";
	if (PY_EXTS.has(ext)) return "py";
	if (RB_EXTS.has(ext)) return "rb";
	if (PHP_EXTS.has(ext)) return "php";
	return "none";
};
const maskStringsAndComments = (content, ext) => {
	const family = familyForExt(ext);
	if (family === "none") return content;
	if (family === "js") return maskJs(content, true);
	return maskSimple(content, family, true);
};
const maskComments = (content, ext) => {
	const family = familyForExt(ext);
	if (family === "none") return content;
	if (family === "js") return maskJs(content, false);
	return maskSimple(content, family, false);
};
const handleQuotesAndComments = (content, i, tplStack, mask, maskStrings) => {
	const len = content.length;
	const c = content[i];
	const next = content[i + 1];
	if (c === "\"" || c === "'") {
		const strStart = i;
		const end = consumeQuotedString(content, i, c);
		if (maskStrings) mask(strStart + 1, end - 1);
		return {
			handled: true,
			nextI: end
		};
	}
	if (c === "`") {
		const scan = consumeTemplateString(content, i + 1);
		if (maskStrings) mask(i + 1, scan.maskEnd);
		if (scan.openedInterp) tplStack.push(0);
		return {
			handled: true,
			nextI: scan.resumeAt
		};
	}
	if (c === "/" && next === "/") {
		const strStart = i;
		let k = i;
		while (k < len && content[k] !== "\n") k++;
		mask(strStart, k);
		return {
			handled: true,
			nextI: k
		};
	}
	if (c === "/" && next === "*") {
		const strStart = i;
		let k = i + 2;
		while (k < len - 1 && !(content[k] === "*" && content[k + 1] === "/")) k++;
		if (k < len - 1) k += 2;
		mask(strStart, k);
		return {
			handled: true,
			nextI: k
		};
	}
	return {
		handled: false,
		nextI: i
	};
};
const maskJs = (content, maskStrings) => {
	const out = content.split("");
	const len = content.length;
	const tplStack = [];
	let i = 0;
	const mask = (start, end) => {
		for (let k = start; k < end; k++) if (out[k] !== "\n") out[k] = " ";
	};
	while (i < len) {
		const c = content[i];
		if (tplStack.length > 0) {
			if (c === "{") {
				tplStack[tplStack.length - 1]++;
				i++;
				continue;
			}
			if (c === "}") {
				if (tplStack[tplStack.length - 1] === 0) {
					tplStack.pop();
					const scan = consumeTemplateString(content, i + 1);
					if (maskStrings) mask(i + 1, scan.maskEnd);
					if (scan.openedInterp) tplStack.push(0);
					i = scan.resumeAt;
					continue;
				}
				tplStack[tplStack.length - 1]--;
				i++;
				continue;
			}
		}
		const handled = handleQuotesAndComments(content, i, tplStack, mask, maskStrings);
		if (handled.handled) {
			i = handled.nextI;
			continue;
		}
		i++;
	}
	return out.join("");
};
const consumeQuotedString = (content, start, quote) => {
	const len = content.length;
	let i = start + 1;
	while (i < len) {
		const c = content[i];
		if (c === "\\" && i + 1 < len) {
			i += 2;
			continue;
		}
		if (c === quote) return i + 1;
		if (c === "\n") return i;
		i++;
	}
	return i;
};
const consumeTemplateString = (content, start) => {
	const len = content.length;
	let i = start;
	while (i < len) {
		const c = content[i];
		if (c === "\\" && i + 1 < len) {
			i += 2;
			continue;
		}
		if (c === "`") return {
			maskEnd: i,
			resumeAt: i + 1,
			openedInterp: false
		};
		if (c === "$" && content[i + 1] === "{") return {
			maskEnd: i,
			resumeAt: i + 2,
			openedInterp: true
		};
		i++;
	}
	return {
		maskEnd: i,
		resumeAt: i,
		openedInterp: false
	};
};
const maskSimple = (content, family, maskStrings) => {
	const out = content.split("");
	const len = content.length;
	let i = 0;
	const mask = (start, end) => {
		for (let k = start; k < end; k++) if (out[k] !== "\n") out[k] = " ";
	};
	while (i < len) {
		const c = content[i];
		const next = content[i + 1];
		if (family === "py" && (c === "\"" || c === "'")) {
			if (content[i + 1] === c && content[i + 2] === c) {
				const triple = c + c + c;
				const end = content.indexOf(triple, i + 3);
				const stop = end === -1 ? len : end + 3;
				if (maskStrings) mask(i + 3, stop - 3);
				i = stop;
				continue;
			}
		}
		if (c === "\"" || c === "'") {
			const strStart = i;
			i = consumeQuotedString(content, i, c);
			if (maskStrings) mask(strStart + 1, i - 1);
			continue;
		}
		if ((family === "py" || family === "rb" || family === "php") && c === "#") {
			const strStart = i;
			while (i < len && content[i] !== "\n") i++;
			mask(strStart, i);
			continue;
		}
		if (family === "php" && c === "/" && next === "/") {
			const strStart = i;
			while (i < len && content[i] !== "\n") i++;
			mask(strStart, i);
			continue;
		}
		if (family === "php" && c === "/" && next === "*") {
			const strStart = i;
			i += 2;
			while (i < len - 1 && !(content[i] === "*" && content[i + 1] === "/")) i++;
			if (i < len - 1) i += 2;
			mask(strStart, i);
			continue;
		}
		i++;
	}
	return out.join("");
};

//#endregion
//#region src/engines/ai-slop/abstractions.ts
const JS_EXTS$1 = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const THIN_WRAPPER_PATTERNS = [
	{
		pattern: /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*\w[^{]*)?\{\s*\n?\s*return\s+\w+\([^)]*\);\s*\n?\s*\}/g,
		extensions: JS_EXTS$1
	},
	{
		pattern: /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w[^=]*)?\s*=>\s*\w+\([^)]*\);/g,
		extensions: JS_EXTS$1
	},
	{
		pattern: /def\s+(\w+)\s*\([^)]*\)(?:\s*->[^:]*)?:\s*\n\s+return\s+\w+\([^)]*\)\s*$/gm,
		extensions: new Set([".py"])
	}
];
const AI_NAMING_PATTERNS = [/(?:helper|util|handler|process|do|handle|execute|perform)_?\d+/i, /(?:data|temp|result|value|item|obj|arr|str|num|val)\d+/];
const FRAMEWORK_METHOD_NAMES = /^(?:setUp|tearDown|setUpClass|tearDownClass|setUpModule|tearDownModule)$/;
const DUNDER_PATTERN = /^__\w+__$/;
const stripParam = (p) => p.trim().split(/[:=]/)[0].trim().replace(/^[*&]+/, "");
const paramNames = (paramsText) => new Set(paramsText.split(",").map(stripParam).filter((p) => p && p !== "self" && p !== "cls"));
const isIdentityForward = (matchText) => {
	const paramsMatch = matchText.match(/\(([^)]*)\)/);
	const innerMatch = matchText.match(/(?:return\s+\w+|=>\s*\w+)\s*\(([^)]*)\)/);
	if (!paramsMatch || !innerMatch) return false;
	const params = paramNames(paramsMatch[1]);
	const args = innerMatch[1].split(",").map((a) => a.trim()).filter((a) => a.length > 0);
	if (args.length === 0) return false;
	return args.every((a) => /^[A-Za-z_$][\w$]*$/.test(a) && params.has(a));
};
const isUseContextWrapper = (matchText) => /\buse\w+/.test(matchText) && /useContext\s*\(/.test(matchText);
const detectThinWrappers = (content, relativePath, ext) => {
	const diagnostics = [];
	const lines = content.split("\n");
	for (const { pattern, extensions } of THIN_WRAPPER_PATTERNS) {
		if (!extensions.has(ext)) continue;
		const regex = new RegExp(pattern.source, pattern.flags);
		for (const match of content.matchAll(regex)) {
			const funcName = match[1];
			const matchText = match[0];
			const lineNumber = content.slice(0, match.index).split("\n").length;
			if (DUNDER_PATTERN.test(funcName)) continue;
			if (FRAMEWORK_METHOD_NAMES.test(funcName)) continue;
			if (lineNumber >= 2) {
				if ((lines[lineNumber - 2]?.trim())?.startsWith("@")) continue;
			}
			if (!isIdentityForward(matchText)) continue;
			if (isUseContextWrapper(matchText)) continue;
			diagnostics.push({
				filePath: relativePath,
				engine: "ai-slop",
				rule: "ai-slop/thin-wrapper",
				severity: "warning",
				message: `Function '${funcName}' is a thin wrapper that only calls another function`,
				help: "Consider calling the inner function directly instead of wrapping it",
				line: lineNumber,
				column: 0,
				category: "AI Slop",
				fixable: false
			});
		}
	}
	return diagnostics;
};
const detectAiNaming = (content, relativePath) => {
	const diagnostics = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const declMatch = lines[i].match(/(?:const|let|var|function|def|func|fn)\s+(\w+)/);
		if (!declMatch) continue;
		const name = declMatch[1];
		if (!AI_NAMING_PATTERNS.some((pattern) => pattern.test(name))) continue;
		diagnostics.push({
			filePath: relativePath,
			engine: "ai-slop",
			rule: "ai-slop/generic-naming",
			severity: "info",
			message: `'${name}' uses generic AI-style naming`,
			help: "Use descriptive names that explain what the code does",
			line: i + 1,
			column: 0,
			category: "AI Slop",
			fixable: false
		});
	}
	return diagnostics;
};
const detectOverAbstraction = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relativePath = path.relative(context.rootDirectory, filePath);
		const ext = path.extname(filePath);
		const codeOnly = maskComments(content, ext);
		diagnostics.push(...detectThinWrappers(codeOnly, relativePath, ext));
		diagnostics.push(...detectAiNaming(codeOnly, relativePath));
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/narrative-comments-patterns.ts
const DECORATIVE_SEPARATOR = /^[-=─━~_*#]{6,}$/;
const DECORATIVE_SECTION_HEADER = /^[-=─━~_*#]{3,}[\s\S]+?[-=─━~_*#]{3,}$/;
const SECTION_HEADER = /^(Phase|Step|Section|Part)\s+\d+[:.-]/i;
const CROSS_REFERENCE_PHRASES = [
	/\bwill then be\b/i,
	/\bused by\b/i,
	/\bcalled from\b/i,
	/\bcalled later\b/i,
	/\bsee (?:above|below|later|earlier)\b/i,
	/\breplaces the\b/i,
	/\bmatches the one\b/i,
	/\bwe moved\b/i,
	/\bwe used to\b/i,
	/\brefactor(?:ed)? from\b/i,
	/\bcombined with\b.*\bthis\b/i
];
const JUSTIFICATION_OPENERS = [
	/^(The idea here|The trick is|This was needed|Originally,?)/i,
	/^This\s+(?:function|method|class|module|component|hook|util|helper|handler|service)\b/i,
	/^It\s+(?:does|handles|takes|returns|processes|reads|writes|sends|fetches|loads|creates|deletes|updates|parses|validates)\b/i,
	/^(?:First|Then|Finally|Next|Lastly|Subsequently),?\s+(?:it|we|the\s+(?:function|method|class))\b/i
];
const EXPLANATORY_OPENERS = /^(Matches|Detects|Represents|Holds|Stores|Tracks|Handles|Manages|Controls|Contains|Captures|Encapsulates|Wraps|Describes)\s+[A-Za-z`'"]/;
const EXPLANATORY_WHY_MARKERS = /\b(?:because|since|otherwise|workaround|caveat|warning|important|assumes?|note:|bug|issue|see\s+(?:issue|above|below)|in\s+prod|in\s+production|breaks?\s+when|fails?\s+when|must\s+run|must\s+be|has\s+to\s+be|hack\s+for|fix\s+for|reason:|to\s+avoid|to\s+ensure|to\s+prevent|in\s+order\s+to|necessary|guarantee[sd]?|prevents?|regardless\s+of|required\s+(?:for|to|by)|for\s+example|e\.g\.|i\.e\.|useful\s+(?:for|when)|intended\s+to|on\s+purpose|by\s+design|ideally|however|although|even\s+though|despite|whereas|unfortunately|trade-?off|first\s+need)\b/i;
const MEANINGFUL_JSDOC_TAGS = new Set([
	"deprecated",
	"see",
	"example",
	"type",
	"returns",
	"return",
	"param",
	"throws",
	"typedef",
	"callback",
	"override",
	"template",
	"internal",
	"public",
	"private",
	"protected",
	"experimental",
	"alpha",
	"beta",
	"since",
	"todo",
	"link",
	"license",
	"preserve",
	"swagger",
	"openapi",
	"route",
	"group",
	"summary",
	"description",
	"operationid",
	"response",
	"responses",
	"request",
	"requestbody",
	"security",
	"tag",
	"tags",
	"path",
	"body",
	"query",
	"queryparam",
	"header",
	"headers",
	"produces",
	"accept",
	"middleware",
	"api",
	"apiname",
	"apidefine",
	"apigroup",
	"apiparam",
	"apiquery",
	"apibody",
	"apiheader",
	"apisuccess",
	"apierror",
	"apiexample",
	"apiversion",
	"apidescription",
	"apipermission",
	"apiuse",
	"apiignore",
	"apiprivate",
	"namespace",
	"category"
]);
const SUPPORTED_EXTS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".go",
	".rs",
	".rb",
	".java",
	".php"
]);
const DECL_START = /^(\s*)(export\s+)?(async\s+)?(const|let|var|function|class|type|interface|enum|abstract\s+class)\s+/;
const EXPORT_DEFAULT = /^\s*export\s+default\b/;
const TS_MEMBER_DECL_START = /^\s*(?:readonly\s+|static\s+|public\s+|private\s+|protected\s+|abstract\s+|override\s+)*[\w$]+\??\s*:/;
const PY_DECL_START = /^\s*(async\s+def|def|class)\s+/;
const GO_DECL_START = /^\s*(func|type|var|const|import)\b/;
const RUST_DECL_START = /^\s*(pub\s+)?(async\s+)?(fn|struct|enum|trait|impl|const|static|type|mod)\s+/;
const RUBY_DECL_START = /^\s*(class|module|def)\s+/;
const JAVA_DECL_START = /^\s*(?:public|private|protected|static|final|abstract|sealed|non-sealed|\s)+(?:class|interface|enum|record|@interface|\w[^(){};=]*\s+\w+\s*\()/;
const JAVA_DECL_START_FALLBACK = /^\s*(class|interface|enum|record|@interface)\s+/;
const PHP_DECL_START = /^\s*(?:(?:public|private|protected|static|final|abstract|readonly)\s+)*(function|class|interface|trait|enum|const)\s+/;

//#endregion
//#region src/engines/ai-slop/non-production-paths.ts
const DIR_PATTERN = /(?:^|\/)(?:scripts|bin|examples?|demos?|docs?|bench|benches|benchmarks?|fixtures?|__fixtures__|__mocks__|__tests__|prototypes?|experiments?|vendor|_vendor|vendored|third_party|blib2to3|lib2to3|cli|cli-[\w-]+|[\w-]+-cli)\//i;
const BASENAME_PATTERN = /(?:^|\/)(?:(?:prototype|experiment)(?:[-_.][^/]*)?|(?:benchmark|bench|demo|example|script|seed|migrate|profile|smoke|stress|load|debug|repro)[-_.][^/]*)\.[mc]?[jt]sx?$|(?:^|\/)[^/]+[-_](?:benchmark|bench|demo|example|prototype|experiment)\.[mc]?[jt]sx?$/i;
const isNonProductionPath = (relativePath) => DIR_PATTERN.test(relativePath) || BASENAME_PATTERN.test(relativePath);

//#endregion
//#region src/engines/ai-slop/comments.ts
const TRIVIAL_VERB_STEMS = "Import|Defin|Initializ|Setting|Set\\s+up|Setup|Return|Check|Loop|Iterat|Creat|Updat|Delet|Remov|Handl|Get|Fetch|Increment|Decrement|Writ|Runn|Run|Pars|Execut|Extract|Sav|Load|Build|Start|Stopp|Stop|Clean(?:up|\\s+up)?|Configur|Validat|Process|Queue|Fire|Emit|Dispatch|Log|Print|Render";
const TRIVIAL_JS_COMMENT_PATTERNS = [/\/\/\s*This (?:function|method|class|variable|constant) (?:will |is used to |is responsible for )?/i, new RegExp(`\\/\\/\\s*(?:${TRIVIAL_VERB_STEMS})(?:e|es|ing|s)?\\b`, "i")];
const TRIVIAL_PYTHON_COMMENT_PATTERNS = [/^#\s*This (?:function|method|class) (?:will |is used to )?/i, new RegExp(`^#\\s*(?:${TRIVIAL_VERB_STEMS})(?:e|es|ing|s)?\\b`, "i")];
const EXPLANATORY_KEYWORDS = /\b(?:because|since|note|todo|fixme|hack|warn|warning|workaround|caveat|important|assumes?|if|when|unless|until|only|except|otherwise|needs?|must|should|ensure|avoid|prevent|requires?)\b/i;
const COMMENTED_CODE_CHARS = /[({=;}\]>]/;
const MAX_TRIVIAL_COMMENT_LENGTH = 60;
const isJsComment = (trimmed) => trimmed.startsWith("//") && !trimmed.startsWith("///") && !trimmed.startsWith("//!");
const isPythonComment = (trimmed) => trimmed.startsWith("#") && !trimmed.startsWith("#!");
const isLineComment = (trimmed) => isJsComment(trimmed) || isPythonComment(trimmed);
const isInMultiLineCommentRun = (lines, index) => {
	const prev = index > 0 ? lines[index - 1].trim() : "";
	const next = index + 1 < lines.length ? lines[index + 1].trim() : "";
	return isLineComment(prev) || isLineComment(next);
};
/**
* Extract just the comment text after the comment marker.
*/
const getCommentBody = (trimmed) => {
	if (trimmed.startsWith("//")) return trimmed.slice(2).trim();
	if (trimmed.startsWith("#")) return trimmed.slice(1).trim();
	return trimmed;
};
const isTrivialComment = (trimmed, nextLine) => {
	const isJs = isJsComment(trimmed);
	const isPy = isPythonComment(trimmed);
	if (!isJs && !isPy) return false;
	const commentBody = getCommentBody(trimmed);
	if (commentBody.length > MAX_TRIVIAL_COMMENT_LENGTH) return false;
	if (EXPLANATORY_KEYWORDS.test(commentBody)) return false;
	if (commentBody.includes("(") && commentBody.includes(")")) return false;
	if (COMMENTED_CODE_CHARS.test(commentBody)) return false;
	if (nextLine !== void 0 && nextLine.trim() === "") return false;
	if (/[─━═╌╍┄┅│┃]/.test(commentBody)) return false;
	if (/^-{3,}|─{3,}/.test(commentBody)) return false;
	return (isJs ? TRIVIAL_JS_COMMENT_PATTERNS : TRIVIAL_PYTHON_COMMENT_PATTERNS).some((pattern) => pattern.test(trimmed));
};
const declStartForExt = (ext) => {
	switch (ext) {
		case ".rb": return [RUBY_DECL_START];
		case ".java": return [JAVA_DECL_START, JAVA_DECL_START_FALLBACK];
		case ".php": return [PHP_DECL_START];
		default: return [];
	}
};
const isCommentLineForExt = (line, ext) => {
	const trimmed = line.trim();
	if (ext === ".rb") return trimmed.startsWith("#") && !trimmed.startsWith("#!");
	if (ext === ".java" || ext === ".php") return trimmed.startsWith("//") || trimmed.startsWith("#");
	return false;
};
const isDocCommentForDeclaration = (lines, lineIdx, ext) => {
	const patterns = declStartForExt(ext);
	if (patterns.length === 0) return false;
	for (let j = lineIdx + 1; j < lines.length; j++) {
		const candidate = lines[j];
		if (candidate.trim() === "") continue;
		if (isCommentLineForExt(candidate, ext)) continue;
		return patterns.some((re) => re.test(candidate));
	}
	return false;
};
const scanFileForTrivialComments = (content, relativePath, ext) => {
	const diagnostics = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (!isTrivialComment(lines[i].trim(), i + 1 < lines.length ? lines[i + 1] : void 0)) continue;
		if (isInMultiLineCommentRun(lines, i)) continue;
		if (isDocCommentForDeclaration(lines, i, ext)) continue;
		diagnostics.push({
			filePath: relativePath,
			engine: "ai-slop",
			rule: "ai-slop/trivial-comment",
			severity: "warning",
			message: "Trivial comment that restates the code",
			help: "Remove comments that don't add information beyond what the code already expresses",
			line: i + 1,
			column: 0,
			category: "AI Slop",
			fixable: true
		});
	}
	return diagnostics;
};
const detectTrivialComments = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		if (isAutoGenerated(filePath)) continue;
		const relativePath = path.relative(context.rootDirectory, filePath);
		if (isNonProductionPath(relativePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		diagnostics.push(...scanFileForTrivialComments(content, relativePath, path.extname(filePath)));
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/dead-patterns.ts
const JS_EXTENSIONS$4 = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const CONSOLE_CALL_PATTERN = /\bconsole\.(log|debug|info|trace|dir|table)\s*\(/;
const slop = (filePath, line, rule, severity, message, help, fixable) => ({
	filePath,
	engine: "ai-slop",
	rule,
	severity,
	message,
	help,
	line,
	column: 0,
	category: "AI Slop",
	fixable
});
const LOGGER_FILE_PATTERN = /(?:^|\/)(?:logger|logging|log)\.[^/]+$/i;
const CLI_ENTRYPOINT_PATTERN = /(?:^|\/)(?:cli|cli[-_.][^/]*|[^/]+[-_]cli)\.[mc]?[jt]sx?$/i;
const ENTRYPOINT_GUARD_PATTERN = /\b(?:import\.meta\.main|require\.main\s*===\s*module)\b/;
const OPERATIONAL_LOG_PATTERN = /\bconsole\.(?:log|info)\s*\(\s*(?:`|["'])\s*\[[^\]\n]{1,48}\]/;
const DEBUG_SIGNAL_PATTERN = /\b(?:debug|dbg|trace|dump|inspect|todo|tmp|temp|remove\s+me|leftover|here|checkpoint)\b/i;
const shouldFlagConsoleCall = (trimmed) => {
	const match = CONSOLE_CALL_PATTERN.exec(trimmed);
	if (!match) return false;
	const method = match[1];
	if (method === "trace" || method === "dir" || method === "table") return true;
	if (method === "debug") return DEBUG_SIGNAL_PATTERN.test(trimmed) || !OPERATIONAL_LOG_PATTERN.test(trimmed);
	if (method === "info" || method === "log") {
		if (/console\.log\(\s*JSON\.stringify\b/.test(trimmed)) return false;
		if (OPERATIONAL_LOG_PATTERN.test(trimmed)) return false;
		return true;
	}
	return false;
};
const detectConsoleLeftovers = (content, relativePath, ext) => {
	if (!JS_EXTENSIONS$4.has(ext)) return [];
	if (LOGGER_FILE_PATTERN.test(relativePath)) return [];
	if (isNonProductionPath(relativePath) || CLI_ENTRYPOINT_PATTERN.test(relativePath)) return [];
	if (content.startsWith("#!")) return [];
	if (ENTRYPOINT_GUARD_PATTERN.test(content)) return [];
	const diagnostics = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
		if (shouldFlagConsoleCall(trimmed)) diagnostics.push(slop(relativePath, i + 1, "ai-slop/console-leftover", "warning", "console.log/debug/info statement left in production code", "Remove debugging console statements or replace with a proper logger", true));
	}
	return diagnostics;
};
const TODO_PATTERN = new RegExp(`\\b(?:${[
	"TODO",
	"FIXME",
	"HACK",
	"XXX"
].join("|")})\\b[:\\s]|\\b(?:${[
	"TEMP",
	"PLACEHOLDER",
	"STUB"
].join("|")})[:\\s]`);
const TODO_TRACKING_RE = /https?:\/\/|#\d+|\bgh-\d+\b|\b[A-Z][A-Z0-9]+-\d+\b|\b(?:issue|ticket|jira)\b/i;
const isBlockCloserAfterReturn = (line) => line.startsWith("}") || line.startsWith("};") || line.startsWith("),") || line.startsWith(");") || line.startsWith("],") || line.startsWith("]);");
const isGuardedSingleLineExit = (lines, lineIndex) => {
	const contextLines = [];
	for (let i = lineIndex - 1; i >= 0 && contextLines.length < 16; i--) {
		const trimmed = lines[i].trim();
		if (!trimmed || trimmed.startsWith("//")) continue;
		contextLines.unshift(trimmed);
		if (/^(?:if|else\s+if|for|while)\b/.test(trimmed) || /^}\s*else\s+if\b/.test(trimmed)) break;
		if (/;\s*$/.test(trimmed)) break;
	}
	const control = contextLines.join(" ");
	return /(?:^|[}\s])(?:if|else\s+if|for|while)\s*\(/.test(control) && !/{\s*$/.test(control);
};
const isPropertyNoopAssignment = (trimmed) => /^(?:[\w$]+\.)+[\w$]+\s*=\s*(?:function\s*)?\([^)]*\)\s*(?:=>)?\s*\{\s*\}\s*;?$/.test(trimmed);
const detectTodoStubs = (content, relativePath) => {
	const diagnostics = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (!trimmed.startsWith("//") && !trimmed.startsWith("#") && !trimmed.startsWith("*") && !trimmed.startsWith("/*")) continue;
		if (TODO_PATTERN.test(trimmed)) {
			if (TODO_TRACKING_RE.test(trimmed)) continue;
			diagnostics.push(slop(relativePath, i + 1, "ai-slop/todo-stub", "info", "Unresolved TODO/FIXME/HACK comment indicates incomplete code", "Resolve the TODO or create a tracked issue for it", false));
		}
	}
	return diagnostics;
};
const detectDeadCodePatterns = (content, relativePath, ext) => {
	const diagnostics = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		const nextLine = i + 1 < lines.length ? lines[i + 1]?.trim() : void 0;
		if (JS_EXTENSIONS$4.has(ext) && /^(?:return|throw)\b/.test(trimmed) && trimmed.endsWith(";") && nextLine && nextLine.length > 0 && !isGuardedSingleLineExit(lines, i) && !isBlockCloserAfterReturn(nextLine) && !nextLine.startsWith("//") && !nextLine.startsWith("/*") && !nextLine.startsWith("case ") && !nextLine.startsWith("default:") && !nextLine.startsWith("if ") && !nextLine.startsWith("if(") && !nextLine.startsWith("else")) diagnostics.push(slop(relativePath, i + 2, "ai-slop/unreachable-code", "warning", "Code after return/throw statement is unreachable", "Remove the unreachable code or restructure the control flow", false));
		if (/\bif\s*\(\s*(?:false|true|0|1)\s*\)/.test(trimmed) && !trimmed.startsWith("//") && !trimmed.startsWith("*") && !/["'`].*\bif\s*\(/.test(trimmed) && !/\/.*\bif\s*\(/.test(trimmed.replace(/\/\/.*$/, ""))) diagnostics.push(slop(relativePath, i + 1, "ai-slop/constant-condition", "warning", "Conditional with a constant value — likely debugging leftover", "Remove the constant condition or replace with proper logic", false));
		if (JS_EXTENSIONS$4.has(ext) && /(?:function\s+\w+\s*\([^)]*\)|=>\s*)\s*\{\s*\}\s*;?\s*$/.test(trimmed) && !trimmed.startsWith("interface") && !trimmed.startsWith("type ") && !isPropertyNoopAssignment(trimmed)) diagnostics.push(slop(relativePath, i + 1, "ai-slop/empty-function", "info", "Empty function body — possible stub or unfinished implementation", "Implement the function body or add a comment explaining why it's empty", false));
	}
	return diagnostics;
};
const asAnyPattern = new RegExp(`\\bas\\s+any\\b`);
const doubleAssertPattern = new RegExp(`\\bas\\s+unknown\\s+as\\s+`);
const detectUnsafeTypePatterns = (content, relativePath, ext) => {
	if (ext !== ".ts" && ext !== ".tsx") return [];
	if (isNonProductionPath(relativePath)) return [];
	const diagnostics = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (/\/\/\s*@ts-(?:ignore|expect-error)/.test(trimmed) || /\/\*\s*@ts-(?:ignore|expect-error)/.test(trimmed)) diagnostics.push(slop(relativePath, i + 1, "ai-slop/ts-directive", "info", "@ts-ignore/@ts-expect-error suppresses type checking — review if still needed", "Fix the underlying type issue instead of suppressing the error", false));
		if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
		if (/\bRegExp\b|new\s+RegExp|\/.*\\b/.test(trimmed)) continue;
		if (/["'`].*\\b.*["'`]/.test(trimmed)) continue;
		if (asAnyPattern.test(trimmed)) diagnostics.push(slop(relativePath, i + 1, "ai-slop/unsafe-type-assertion", "warning", `'as any' bypasses type safety`, "Use a proper type or a more specific assertion", false));
		if (doubleAssertPattern.test(trimmed)) {
			if (!(/\.query[(<]/.test(trimmed) || /result\[0\]/.test(trimmed) || /rows\s/.test(trimmed))) diagnostics.push(slop(relativePath, i + 1, "ai-slop/double-type-assertion", "warning", `Double type assertion (as unknown as X) bypasses type checking`, "Refactor to avoid needing a double assertion. If this is an ORM query return, consider a typed wrapper function", false));
		}
	}
	return diagnostics;
};
const detectDeadPatterns = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const ext = path.extname(filePath);
		const relativePath = path.relative(context.rootDirectory, filePath);
		const codeOnly = maskComments(content, ext);
		diagnostics.push(...detectConsoleLeftovers(codeOnly, relativePath, ext));
		diagnostics.push(...detectTodoStubs(content, relativePath));
		diagnostics.push(...detectDeadCodePatterns(codeOnly, relativePath, ext));
		diagnostics.push(...detectUnsafeTypePatterns(content, relativePath, ext));
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/defensive-patterns.ts
const JS_TS_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const TS_EXTENSIONS = new Set([".ts", ".tsx"]);
const COERCION_CTORS = {
	string: "String",
	number: "Number",
	boolean: "Boolean"
};
const scriptKindFor = (ext) => {
	switch (ext) {
		case ".tsx": return ts.ScriptKind.TSX;
		case ".jsx": return ts.ScriptKind.JSX;
		case ".js":
		case ".mjs":
		case ".cjs": return ts.ScriptKind.JS;
		default: return ts.ScriptKind.TS;
	}
};
const lineFor = (sourceFile, node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
const makeDiagnostic = (filePath, line, rule, message, help) => ({
	filePath,
	engine: "ai-slop",
	rule,
	severity: "warning",
	message,
	help,
	line,
	column: 0,
	category: "AI Slop",
	fixable: false
});
const isFunctionNode = (node) => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
const primitiveKindOf = (node) => {
	if (!node) return null;
	switch (node.kind) {
		case ts.SyntaxKind.StringKeyword: return "string";
		case ts.SyntaxKind.NumberKeyword: return "number";
		case ts.SyntaxKind.BooleanKeyword: return "boolean";
		default: return null;
	}
};
const hasExportModifier = (node) => node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
const primitiveParamsOf = (node) => {
	const params = /* @__PURE__ */ new Map();
	for (const param of node.parameters) {
		if (!ts.isIdentifier(param.name)) continue;
		const kind = primitiveKindOf(param.type);
		if (!kind) continue;
		params.set(param.name.text, kind);
	}
	return params;
};
const isRethrowStatement = (statement, errorName) => ts.isThrowStatement(statement) && statement.expression !== void 0 && ts.isIdentifier(statement.expression) && statement.expression.text === errorName;
const isPromiseRejectRethrow = (statement, errorName) => {
	if (!ts.isReturnStatement(statement) || !statement.expression) return false;
	const expression = statement.expression;
	if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) return false;
	const [arg] = expression.arguments;
	if (!ts.isIdentifier(arg) || arg.text !== errorName) return false;
	if (!ts.isPropertyAccessExpression(expression.expression)) return false;
	const target = expression.expression;
	return ts.isIdentifier(target.expression) && target.expression.text === "Promise" && target.name.text === "reject";
};
const detectRedundantTryCatch = (sourceFile, relativePath) => {
	const diagnostics = [];
	const visit = (node) => {
		if (ts.isTryStatement(node) && node.catchClause && !node.finallyBlock) {
			const catchNameNode = node.catchClause.variableDeclaration?.name;
			const [onlyStatement] = node.catchClause.block.statements;
			if (catchNameNode && ts.isIdentifier(catchNameNode) && node.catchClause.block.statements.length === 1 && onlyStatement && (isRethrowStatement(onlyStatement, catchNameNode.text) || isPromiseRejectRethrow(onlyStatement, catchNameNode.text))) diagnostics.push(makeDiagnostic(relativePath, lineFor(sourceFile, node.catchClause), "ai-slop/redundant-try-catch", "Catch block only rethrows the same error", "Remove the try/catch or add useful context, cleanup, or recovery. Rethrowing unchanged errors is usually defensive agent noise."));
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return diagnostics;
};
const detectPrimitiveCoercions = (sourceFile, relativePath) => {
	const diagnostics = [];
	const scanFunctionBody = (node, params) => {
		const body = node.body;
		if (!body || params.size === 0) return;
		const visitBody = (child) => {
			if (child !== body && isFunctionNode(child)) return;
			if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
				const [arg] = child.arguments;
				if (arg && ts.isIdentifier(arg)) {
					const primitive = params.get(arg.text);
					if (primitive && child.expression.text === COERCION_CTORS[primitive]) diagnostics.push(makeDiagnostic(relativePath, lineFor(sourceFile, child), "ai-slop/redundant-type-coercion", `Parameter '${arg.text}' is already typed as ${primitive} but is coerced again`, "Trust the typed boundary or validate unknown input before this function. Re-coercing already typed parameters is usually defensive agent noise."));
				}
			}
			ts.forEachChild(child, visitBody);
		};
		visitBody(body);
	};
	const visit = (node) => {
		if (isFunctionNode(node)) scanFunctionBody(node, primitiveParamsOf(node));
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return diagnostics;
};
const normalizedTypeDeclaration = (sourceFile, node) => sourceFile.text.slice(node.getStart(sourceFile), node.getEnd()).replace(/\bexport\b/g, "").replace(/\bdeclare\b/g, "").replace(/\s+/g, " ").trim();
const exportedTypesOf = (parsed) => {
	const declarations = [];
	const visit = (node) => {
		if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && hasExportModifier(node)) declarations.push({
			name: node.name.text,
			signature: normalizedTypeDeclaration(parsed.sourceFile, node),
			filePath: parsed.relativePath,
			line: lineFor(parsed.sourceFile, node)
		});
		ts.forEachChild(node, visit);
	};
	visit(parsed.sourceFile);
	return declarations;
};
const duplicateTypeKeyOf = (declaration) => `${declaration.name}\0${declaration.signature}`;
const detectDuplicateExportedTypes = (parsedSources) => {
	const diagnostics = [];
	const seen = /* @__PURE__ */ new Map();
	for (const parsed of parsedSources) {
		if (!TS_EXTENSIONS.has(parsed.ext)) continue;
		for (const declaration of exportedTypesOf(parsed)) {
			const key = duplicateTypeKeyOf(declaration);
			const previous = seen.get(key);
			if (!previous) {
				seen.set(key, declaration);
				continue;
			}
			if (previous.filePath === declaration.filePath) continue;
			diagnostics.push(makeDiagnostic(declaration.filePath, declaration.line, "ai-slop/duplicate-type-declaration", `Exported type '${declaration.name}' duplicates an existing declaration`, `Reuse or import the existing type from ${previous.filePath} instead of re-declaring the same shape in another file.`));
		}
	}
	return diagnostics;
};
const detectDefensivePatterns = async (context) => {
	const diagnostics = [];
	const parsedSources = [];
	for (const filePath of getSourceFiles(context)) {
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relativePath = path.relative(context.rootDirectory, filePath);
		if (isNonProductionPath(relativePath)) continue;
		const ext = path.extname(filePath);
		if (!JS_TS_EXTENSIONS.has(ext)) continue;
		const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKindFor(ext));
		parsedSources.push({
			sourceFile,
			relativePath,
			ext
		});
		diagnostics.push(...detectRedundantTryCatch(sourceFile, relativePath));
		if (TS_EXTENSIONS.has(ext)) diagnostics.push(...detectPrimitiveCoercions(sourceFile, relativePath));
	}
	diagnostics.push(...detectDuplicateExportedTypes(parsedSources));
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/duplicate-imports.ts
const JS_EXTENSIONS$3 = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const IMPORT_FROM_RE$1 = /^\s*import\s+([^;]*?)\s+from\s+["']([^"']+)["']/;
const TYPE_ONLY_RE = /^\s*type\b/;
const VALUE_BINDING_RE = /\{([^}]*)\}/;
const NAMESPACE_RE = /\*\s+as\s+/;
const isTypeOnly = (clause) => {
	if (TYPE_ONLY_RE.test(clause)) return true;
	const braces = VALUE_BINDING_RE.exec(clause);
	if (!braces) return false;
	const members = braces[1].split(",").map((member) => member.trim()).filter((member) => member.length > 0);
	return members.length > 0 && members.every((member) => /^type\b/.test(member));
};
const extractImportLines = (content) => {
	const lines = content.split("\n");
	const results = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = IMPORT_FROM_RE$1.exec(line);
		if (!match) continue;
		results.push({
			spec: match[2],
			line: i + 1,
			typeOnly: isTypeOnly(match[1]),
			namespace: NAMESPACE_RE.test(match[1])
		});
	}
	return results;
};
const detectDuplicateImports = async (context) => {
	const diagnostics = [];
	const files = getSourceFiles(context);
	for (const filePath of files) {
		if (!JS_EXTENSIONS$3.has(path.extname(filePath))) continue;
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const imports = extractImportLines(maskComments(content, path.extname(filePath)));
		if (imports.length < 2) continue;
		const byBucket = /* @__PURE__ */ new Map();
		for (const imp of imports) {
			const key = `${imp.namespace ? "ns" : imp.typeOnly ? "type" : "value"}\0${imp.spec}`;
			const list = byBucket.get(key) ?? [];
			list.push(imp);
			byBucket.set(key, list);
		}
		const relPath = path.relative(context.rootDirectory, filePath);
		for (const occurrences of byBucket.values()) {
			const { spec } = occurrences[0];
			if (occurrences.length < 2) continue;
			for (const dup of occurrences.slice(1)) {
				const firstLine = occurrences[0].line;
				diagnostics.push({
					filePath: relPath,
					engine: "ai-slop",
					rule: "ai-slop/duplicate-import",
					severity: "warning",
					message: `"${spec}" is also imported on line ${firstLine}. Merge into a single import statement.`,
					help: "Two imports from the same module split readers' attention and grow the import block. Run aislop fix to merge them automatically.",
					line: dup.line,
					column: 1,
					category: "AI Slop",
					fixable: true
				});
			}
		}
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/exceptions.ts
const SWALLOWED_EXCEPTION_PATTERNS = [
	{
		pattern: /catch\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*)?\s*\}/,
		languages: [
			".ts",
			".tsx",
			".js",
			".jsx",
			".mjs",
			".cjs"
		],
		message: "Empty catch block swallows errors silently"
	},
	{
		pattern: /catch\s*\([^)]*\)\s*\{\s*console\.log\([^)]*\);\s*\}/,
		languages: [
			".ts",
			".tsx",
			".js",
			".jsx",
			".mjs",
			".cjs"
		],
		message: "Catch block only logs error without proper handling"
	},
	{
		pattern: /except(?:\s+\w+)?:\s*\n\s*pass/,
		languages: [".py"],
		message: "Bare except with pass swallows errors silently"
	},
	{
		pattern: /except\s+\w+(?:\s+as\s+\w+)?:\s*\n\s*print\(/,
		languages: [".py"],
		message: "Catch block only prints error without proper handling"
	},
	{
		pattern: /\w+,\s*_\s*:?=\s*\w+\(/,
		languages: [".go"],
		message: "Error return value is being ignored"
	},
	{
		pattern: /rescue(?:\s+\w+)?\s*(?:=>?\s*\w+)?\s*\n\s*(?:nil|#)/,
		languages: [".rb"],
		message: "Rescue block swallows errors silently"
	},
	{
		pattern: /catch\s*\(\w+\s+\w+\)\s*\{\s*(?:\/\/[^\n]*)?\s*\}/,
		languages: [".java"],
		message: "Empty catch block swallows errors silently"
	}
];
const INTENTIONAL_IGNORE_NAMES = new Set([
	"ignored",
	"ignore",
	"tolerated",
	"expected",
	"unused",
	"_",
	"_e",
	"_err",
	"_ex",
	"_t"
]);
const CATCH_PARAM_RE = /catch\s*\(\s*(?:\w+\s+)?([\w$]+)/;
const RESCUE_PARAM_RE = /rescue(?:\s+[\w:]+)?\s*=>\s*([\w$]+)/;
const isIntentionalIgnore = (matchText, ext) => {
	const m = (ext === ".rb" ? RESCUE_PARAM_RE : CATCH_PARAM_RE).exec(matchText);
	if (!m) return false;
	return INTENTIONAL_IGNORE_NAMES.has(m[1].toLowerCase());
};
const detectSwallowedExceptions = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const ext = path.extname(filePath);
		const relativePath = path.relative(context.rootDirectory, filePath);
		for (const { pattern, languages, message } of SWALLOWED_EXCEPTION_PATTERNS) {
			if (!languages.includes(ext)) continue;
			const regex = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes("g") ? "" : "g"));
			for (const match of content.matchAll(regex)) {
				if (isIntentionalIgnore(match[0], ext)) continue;
				const line = content.slice(0, match.index).split("\n").length;
				diagnostics.push({
					filePath: relativePath,
					engine: "ai-slop",
					rule: "ai-slop/swallowed-exception",
					severity: "error",
					message,
					help: "Handle errors explicitly: log with context, rethrow, or return an error value",
					line,
					column: 0,
					category: "AI Slop",
					fixable: false
				});
			}
		}
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/go-patterns.ts
const GO_EXTENSIONS = new Set([".go"]);
const PACKAGE_DECL_RE = /^\s*package\s+(\w+)/;
const PANIC_CALL_RE = /\bpanic\s*\(/;
const COMMENT_LINE_RE$1 = /^\s*\/\//;
const NIL_GUARD_RE = /^\s*if\s+[\w.]+(?:\(\))?\s*==\s*nil\s*\{?\s*$/;
const SHORT_STRING_PANIC_RE = /\bpanic\s*\(\s*"[^"]{1,40}"\s*\)/;
const detectPackageName = (lines) => {
	for (const line of lines) {
		const m = PACKAGE_DECL_RE.exec(line);
		if (m) return m[1];
	}
	return null;
};
const PANIC_INTENT_LOOKBACK = 3;
const hasIntentComment$1 = (lines, panicLineIdx) => {
	for (let j = panicLineIdx - 1; j >= Math.max(0, panicLineIdx - PANIC_INTENT_LOOKBACK); j--) if (COMMENT_LINE_RE$1.test(lines[j])) return true;
	return false;
};
const isNilGuardPanic = (lines, panicLineIdx, line) => {
	if (!SHORT_STRING_PANIC_RE.test(line)) return false;
	for (let j = panicLineIdx - 1; j >= Math.max(0, panicLineIdx - 2); j--) {
		const prev = lines[j];
		if (prev.trim() === "") continue;
		return NIL_GUARD_RE.test(prev);
	}
	return false;
};
const flagLibraryPanic = (lines, relPath, pkg, out) => {
	if (pkg === "main") return;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (COMMENT_LINE_RE$1.test(line)) continue;
		PANIC_CALL_RE.lastIndex = 0;
		if (!PANIC_CALL_RE.test(line)) continue;
		if (hasIntentComment$1(lines, i)) continue;
		if (isNilGuardPanic(lines, i, line)) continue;
		out.push({
			filePath: relPath,
			engine: "ai-slop",
			rule: "ai-slop/go-library-panic",
			severity: "warning",
			message: `\`panic()\` in package \`${pkg}\` (non-main, non-test). Library code should return errors, not unwind the goroutine.`,
			help: "Convert to `return fmt.Errorf(...)` (or a wrapped error) and let the caller decide. Reserve `panic` for genuinely-impossible states (corrupt internal invariants), and mark those with a comment so future readers know it's intentional.",
			line: i + 1,
			column: 1,
			category: "AI Slop",
			fixable: false
		});
	}
};
const detectGoPatterns = async (context) => {
	const diagnostics = [];
	const files = getSourceFiles(context);
	for (const filePath of files) {
		if (!GO_EXTENSIONS.has(path.extname(filePath))) continue;
		if (isAutoGenerated(filePath)) continue;
		if (filePath.endsWith("_test.go")) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const lines = content.split("\n");
		const pkg = detectPackageName(lines);
		if (!pkg) continue;
		flagLibraryPanic(lines, path.relative(context.rootDirectory, filePath), pkg, diagnostics);
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/js-import-aliases.ts
const TS_CONFIG_FILES = ["tsconfig.json", "jsconfig.json"];
const JS_RESOLUTION_EXTENSIONS = [
	"",
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json",
	"/index.ts",
	"/index.tsx",
	"/index.js",
	"/index.jsx"
];
const readJson$3 = (filePath) => {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
};
const buildAliasMatcher = (key) => {
	const starIdx = key.indexOf("*");
	if (starIdx === -1) return (spec) => spec === key;
	const before = key.slice(0, starIdx);
	const after = key.slice(starIdx + 1);
	return (spec) => spec.length >= before.length + after.length && spec.startsWith(before) && spec.endsWith(after);
};
const collectAliasMatchersFromConfig = (configPath, matchers) => {
	const opts = readJson$3(configPath)?.compilerOptions;
	if (!opts || typeof opts !== "object") return;
	const configDir = path.dirname(configPath);
	const paths = opts.paths;
	if (paths && typeof paths === "object") for (const key of Object.keys(paths)) matchers.push(buildAliasMatcher(key));
	const baseUrl = opts.baseUrl;
	if (typeof baseUrl === "string") {
		const baseDir = path.resolve(configDir, baseUrl);
		matchers.push((spec) => {
			if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("@")) return false;
			return JS_RESOLUTION_EXTENSIONS.some((suffix) => fs.existsSync(path.join(baseDir, `${spec}${suffix}`)));
		});
	}
};
const collectTsPathAliases = (rootDir, workspaceDirs) => {
	const matchers = [];
	const dirs = [rootDir, ...workspaceDirs];
	for (const dir of dirs) for (const fname of TS_CONFIG_FILES) collectAliasMatchersFromConfig(path.join(dir, fname), matchers);
	return matchers;
};

//#endregion
//#region src/engines/ai-slop/js-workspaces.ts
const readJson$2 = (filePath) => {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
};
const readWorkspaceGlobs = (rootDir, rootPkg) => {
	const globs = [];
	if (rootPkg && typeof rootPkg === "object") {
		const ws = rootPkg.workspaces;
		if (Array.isArray(ws)) {
			for (const g of ws) if (typeof g === "string") globs.push(g);
		} else if (ws && typeof ws === "object") {
			const pkgs = ws.packages;
			if (Array.isArray(pkgs)) {
				for (const g of pkgs) if (typeof g === "string") globs.push(g);
			}
		}
	}
	const lerna = readJson$2(path.join(rootDir, "lerna.json"));
	if (lerna && Array.isArray(lerna.packages)) {
		for (const g of lerna.packages) if (typeof g === "string") globs.push(g);
	}
	try {
		const pnpmWs = fs.readFileSync(path.join(rootDir, "pnpm-workspace.yaml"), "utf-8");
		let inPackages = false;
		for (const rawLine of pnpmWs.split("\n")) {
			if (/^packages\s*:\s*$/.test(rawLine)) {
				inPackages = true;
				continue;
			}
			if (!inPackages) continue;
			if (/^\S/.test(rawLine)) break;
			const m = rawLine.match(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/);
			if (m) globs.push(m[1].trim());
		}
	} catch {
		return globs;
	}
	return globs;
};
const readWorkspaceEntries = (dir) => {
	try {
		return fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}
};
const expandWorkspaceDirs = (rootDir, globs) => {
	const dirs = [];
	for (const glob of globs) if (glob.endsWith("/*")) {
		const parent = path.join(rootDir, glob.slice(0, -2));
		for (const entry of readWorkspaceEntries(parent)) if (entry.isDirectory()) dirs.push(path.join(parent, entry.name));
	} else if (!glob.includes("*")) dirs.push(path.join(rootDir, glob));
	return dirs;
};
const collectWorkspaceDirs = (rootDir, rootPkg) => expandWorkspaceDirs(rootDir, readWorkspaceGlobs(rootDir, rootPkg));

//#endregion
//#region src/engines/ai-slop/python-data.ts
const PYTHON_STDLIB = new Set([
	"__future__",
	"_thread",
	"abc",
	"argparse",
	"array",
	"ast",
	"asyncio",
	"atexit",
	"base64",
	"binascii",
	"bisect",
	"builtins",
	"bz2",
	"calendar",
	"code",
	"codecs",
	"codeop",
	"collections",
	"concurrent",
	"configparser",
	"contextlib",
	"contextvars",
	"copy",
	"csv",
	"ctypes",
	"dataclasses",
	"datetime",
	"decimal",
	"difflib",
	"dis",
	"doctest",
	"email",
	"encodings",
	"enum",
	"errno",
	"faulthandler",
	"filecmp",
	"fileinput",
	"fnmatch",
	"fractions",
	"functools",
	"gc",
	"getopt",
	"getpass",
	"gettext",
	"glob",
	"graphlib",
	"gzip",
	"hashlib",
	"heapq",
	"hmac",
	"html",
	"http",
	"imaplib",
	"importlib",
	"inspect",
	"io",
	"ipaddress",
	"itertools",
	"json",
	"keyword",
	"linecache",
	"locale",
	"logging",
	"lzma",
	"mailbox",
	"math",
	"mimetypes",
	"mmap",
	"multiprocessing",
	"numbers",
	"operator",
	"os",
	"pathlib",
	"pdb",
	"pickle",
	"platform",
	"plistlib",
	"pprint",
	"profile",
	"pstats",
	"pty",
	"queue",
	"quopri",
	"random",
	"re",
	"readline",
	"reprlib",
	"resource",
	"rlcompleter",
	"secrets",
	"select",
	"selectors",
	"shelve",
	"shlex",
	"shutil",
	"signal",
	"site",
	"smtplib",
	"socket",
	"socketserver",
	"sqlite3",
	"ssl",
	"stat",
	"statistics",
	"string",
	"stringprep",
	"struct",
	"subprocess",
	"sunau",
	"symtable",
	"sys",
	"sysconfig",
	"syslog",
	"tarfile",
	"telnetlib",
	"tempfile",
	"termios",
	"test",
	"textwrap",
	"threading",
	"time",
	"timeit",
	"tkinter",
	"token",
	"tokenize",
	"tomllib",
	"trace",
	"traceback",
	"tracemalloc",
	"tty",
	"turtle",
	"types",
	"typing",
	"unicodedata",
	"unittest",
	"urllib",
	"uu",
	"uuid",
	"venv",
	"warnings",
	"wave",
	"weakref",
	"webbrowser",
	"winreg",
	"winsound",
	"wsgiref",
	"xml",
	"xmlrpc",
	"zipapp",
	"zipfile",
	"zipimport",
	"zlib",
	"zoneinfo"
]);
const PYTHON_IMPORT_TO_PIP = {
	yaml: ["pyyaml"],
	PIL: ["pillow"],
	dateutil: ["python-dateutil"],
	cv2: [
		"opencv-python",
		"opencv-python-headless",
		"opencv-contrib-python"
	],
	sklearn: ["scikit-learn"],
	bs4: ["beautifulsoup4"],
	typing_extensions: ["typing-extensions"],
	dotenv: ["python-dotenv"],
	genai: ["google-genai"],
	google: [
		"google-genai",
		"google-generativeai",
		"google-api-python-client",
		"google-cloud-storage",
		"google-cloud-aiplatform",
		"google-auth",
		"protobuf"
	],
	jose: ["python-jose"],
	jwt: ["pyjwt"],
	OpenSSL: ["pyopenssl"],
	Crypto: ["pycryptodome", "pycryptodomex"],
	Cryptodome: ["pycryptodomex", "pycryptodome"],
	magic: ["python-magic"],
	docx: ["python-docx"],
	pptx: ["python-pptx"],
	git: ["gitpython"],
	socks: ["pysocks"],
	psycopg2: ["psycopg2-binary", "psycopg2"],
	redis: ["redis"],
	cairo: ["pycairo"],
	serial: ["pyserial"],
	usb: ["pyusb"],
	gi: ["pygobject"],
	Xlib: ["python-xlib"],
	ldap: ["python-ldap"],
	slugify: ["python-slugify"],
	memcache: ["python-memcached"],
	dns: ["dnspython"],
	attr: ["attrs"],
	attrs: ["attrs"],
	zoneinfo_data: ["tzdata"],
	pkg_resources: ["setuptools"],
	setuptools: ["setuptools"],
	wx: ["wxpython"],
	skimage: ["scikit-image"],
	OpenGL: ["pyopengl"],
	win32api: ["pywin32"],
	win32con: ["pywin32"],
	win32com: ["pywin32"],
	pythoncom: ["pywin32"],
	pywintypes: ["pywin32"],
	rest_framework: ["djangorestframework"],
	allauth: ["django-allauth"],
	corsheaders: ["django-cors-headers"],
	debug_toolbar: ["django-debug-toolbar"],
	environ: ["django-environ"],
	flask_cors: ["flask-cors"],
	flask_sqlalchemy: ["flask-sqlalchemy"],
	flask_migrate: ["flask-migrate"],
	flask_login: ["flask-login"],
	jwt_extended: ["flask-jwt-extended"],
	dateparser: ["dateparser"],
	yaml_include: ["pyyaml-include"],
	lxml_html_clean: ["lxml-html-clean"],
	grpc: ["grpcio"],
	grpc_status: ["grpcio-status"],
	google_crc32c: ["google-crc32c"],
	pkg_about: ["pkg-about"],
	mpl_toolkits: ["matplotlib"],
	dotmap: ["dotmap"],
	pydantic_settings: ["pydantic-settings"],
	telegram: ["python-telegram-bot"],
	discord: ["discord-py"],
	nacl: ["pynacl"],
	jwcrypto: ["jwcrypto"],
	humanfriendly: ["humanfriendly"],
	multipart: ["python-multipart"]
};

//#endregion
//#region src/engines/ai-slop/python-manifest.ts
const addPyDep = (pyDeps, name) => {
	const normalized = name.toLowerCase().replace(/_/g, "-");
	pyDeps.add(normalized);
};
const collectFromRequirementsTxt = (rootDir, pyDeps) => {
	const reqPath = path.join(rootDir, "requirements.txt");
	if (!fs.existsSync(reqPath)) return false;
	try {
		const content = fs.readFileSync(reqPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
			const match = trimmed.match(/^([a-zA-Z0-9_\-.]+)/);
			if (match) addPyDep(pyDeps, match[1]);
		}
		return true;
	} catch {
		return false;
	}
};
const collectFromPyproject = (rootDir, pyDeps) => {
	const pyprojPath = path.join(rootDir, "pyproject.toml");
	if (!fs.existsSync(pyprojPath)) return false;
	try {
		const content = fs.readFileSync(pyprojPath, "utf-8");
		const projectNameMatch = content.match(/\[project\][\s\S]*?^\s*name\s*=\s*["']([^"']+)/m);
		if (projectNameMatch) addPyDep(pyDeps, projectNameMatch[1]);
		const poetryNameMatch = content.match(/\[tool\.poetry\][\s\S]*?^\s*name\s*=\s*["']([^"']+)/m);
		if (poetryNameMatch) addPyDep(pyDeps, poetryNameMatch[1]);
		const pep621 = content.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m);
		if (pep621) for (const line of pep621[1].split("\n")) {
			const m = line.match(/["']\s*([a-zA-Z0-9_\-.]+)/);
			if (m) addPyDep(pyDeps, m[1]);
		}
		const extras = content.match(/\[project\.optional-dependencies\]([\s\S]*?)(?=\n\[|$)/);
		if (extras) for (const m of extras[1].matchAll(/["']\s*([a-zA-Z][a-zA-Z0-9_\-.]+)/g)) addPyDep(pyDeps, m[1]);
		const groups = content.match(/\[dependency-groups\]([\s\S]*?)(?=\n\[[^[]|$)/);
		if (groups) for (const m of groups[1].matchAll(/["']\s*([a-zA-Z][a-zA-Z0-9_\-.]+)/g)) addPyDep(pyDeps, m[1]);
		const poetryRe = /\[tool\.poetry(?:\.group\.[a-z]+)?\.dependencies\]([\s\S]*?)(?=\n\[|$)/g;
		let match = poetryRe.exec(content);
		while (match !== null) {
			for (const line of match[1].split("\n")) {
				const m = line.trim().match(/^([a-zA-Z0-9_\-.]+)\s*=/);
				if (m && m[1] !== "python") addPyDep(pyDeps, m[1]);
			}
			match = poetryRe.exec(content);
		}
		return true;
	} catch {
		return false;
	}
};
const collectFromPipfile = (rootDir, pyDeps) => {
	const pipfilePath = path.join(rootDir, "Pipfile");
	if (!fs.existsSync(pipfilePath)) return false;
	try {
		const content = fs.readFileSync(pipfilePath, "utf-8");
		const sectionRe = /\[(packages|dev-packages)\]([\s\S]*?)(?=\n\[|$)/g;
		let match = sectionRe.exec(content);
		while (match !== null) {
			for (const line of match[2].split("\n")) {
				const m = line.trim().match(/^([a-zA-Z0-9_\-.]+)\s*=/);
				if (m) addPyDep(pyDeps, m[1]);
			}
			match = sectionRe.exec(content);
		}
		return true;
	} catch {
		return false;
	}
};
const LOCAL_PACKAGE_ROOTS = [
	"",
	"src",
	"lib"
];
const collectLocalPythonPackages = (rootDir, pyDeps) => {
	for (const sub of LOCAL_PACKAGE_ROOTS) {
		const dir = sub ? path.join(rootDir, sub) : rootDir;
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name.startsWith(".")) continue;
			if (entry.name === "node_modules" || entry.name === "__pycache__") continue;
			const initPath = path.join(dir, entry.name, "__init__.py");
			if (fs.existsSync(initPath)) addPyDep(pyDeps, entry.name);
		}
	}
};
const collectPythonDeps = (rootDir) => {
	const pyDeps = /* @__PURE__ */ new Set();
	const hasReq = collectFromRequirementsTxt(rootDir, pyDeps);
	const hasPyproject = collectFromPyproject(rootDir, pyDeps);
	const hasPipfile = collectFromPipfile(rootDir, pyDeps);
	collectLocalPythonPackages(rootDir, pyDeps);
	return {
		pyDeps,
		hasPyManifest: hasReq || hasPyproject || hasPipfile
	};
};

//#endregion
//#region src/engines/ai-slop/hallucinated-imports.ts
const JS_EXTENSIONS$2 = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const PY_EXTENSIONS$2 = new Set([".py"]);
const readJson$1 = (filePath) => {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
};
const PKG_DEP_SECTIONS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies"
];
const addDepsFromPkg = (pkg, jsDeps) => {
	for (const section of PKG_DEP_SECTIONS) {
		const deps = pkg[section];
		if (deps && typeof deps === "object") for (const name of Object.keys(deps)) jsDeps.add(name);
	}
};
const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"out",
	"target",
	"coverage"
]);
const NESTED_PKG_JSON_DEPTH = 4;
const collectNestedManifests = (rootDir, jsDeps) => {
	const walk = (dir, depth) => {
		if (depth > NESTED_PKG_JSON_DEPTH) return;
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".") && entry.name !== ".github") continue;
			if (SKIP_DIRS.has(entry.name)) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full, depth + 1);
			else if (entry.name === "package.json" && depth > 0) {
				const wsPkg = readJson$1(full);
				if (!wsPkg) continue;
				if (typeof wsPkg.name === "string") jsDeps.add(wsPkg.name);
				addDepsFromPkg(wsPkg, jsDeps);
			}
		}
	};
	walk(rootDir, 0);
};
const collectJsDeps = (rootDir, jsDeps) => {
	const pkgPath = path.join(rootDir, "package.json");
	if (!fs.existsSync(pkgPath)) return false;
	const pkg = readJson$1(pkgPath);
	if (!pkg || typeof pkg !== "object") return false;
	addDepsFromPkg(pkg, jsDeps);
	if (typeof pkg.name === "string") jsDeps.add(pkg.name);
	const workspaceDirs = collectWorkspaceDirs(rootDir, pkg);
	for (const wsDir of workspaceDirs) {
		const wsPkg = readJson$1(path.join(wsDir, "package.json"));
		if (!wsPkg) continue;
		if (typeof wsPkg.name === "string") jsDeps.add(wsPkg.name);
		addDepsFromPkg(wsPkg, jsDeps);
	}
	collectNestedManifests(rootDir, jsDeps);
	return true;
};
const loadManifest = (rootDir) => {
	const jsDeps = /* @__PURE__ */ new Set();
	const hasJsManifest = collectJsDeps(rootDir, jsDeps);
	const { pyDeps, hasPyManifest } = collectPythonDeps(rootDir);
	return {
		jsDeps,
		pyDeps,
		hasJsManifest,
		hasPyManifest
	};
};
const isJsRelativeOrAbsolute = (spec) => spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("~/");
const RUNTIME_BUILTINS = new Set(["bun"]);
const isJsBuiltin = (spec) => {
	if (RUNTIME_BUILTINS.has(spec)) return true;
	return isBuiltin(spec.startsWith("node:") ? spec.slice(5) : spec) || isBuiltin(spec);
};
const VIRTUAL_MODULE_PREFIXES = [
	"astro:",
	"virtual:",
	"bun:",
	"file:",
	"http:",
	"https:",
	"jsr:",
	"npm:"
];
const isJsVirtualModule = (spec, manifest) => {
	if (VIRTUAL_MODULE_PREFIXES.some((p) => spec.startsWith(p))) return true;
	if (spec === "bun") return true;
	if (spec === "unfonts.css" && manifest.jsDeps.has("unplugin-fonts")) return true;
	if (spec.startsWith("~icons/") && manifest.jsDeps.has("unplugin-icons")) return true;
	return false;
};
const stripImportQuery = (spec) => {
	const idx = spec.indexOf("?");
	return idx === -1 ? spec : spec.slice(0, idx);
};
const TEMPLATE_PLACEHOLDER_RE = /\$\{/;
const isLikelyRealImportSpec = (spec) => {
	if (spec.length === 0) return false;
	if (TEMPLATE_PLACEHOLDER_RE.test(spec)) return false;
	if (spec.includes("\\")) return false;
	if (/\s/.test(spec)) return false;
	return true;
};
const packageNameFromImport = (spec) => {
	if (spec.startsWith("@")) {
		const parts = spec.split("/");
		return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
	}
	return spec.split("/")[0];
};
const typesPackageName = (pkg) => {
	if (pkg.startsWith("@types/")) return pkg;
	if (pkg.startsWith("@")) return `@types/${pkg.slice(1).replace("/", "__")}`;
	return `@types/${pkg}`;
};
const STATIC_IMPORT_RE = /^\s*import\s+(?:[\w*{},\s]+\s+from\s+)?["']([^"']+)["']/;
const DYNAMIC_IMPORT_RE = /(?:import|require)\s*\(\s*["']([^"']+)["']/g;
const extractJsImports = (content) => {
	const lines = content.split("\n");
	const results = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
		const staticMatch = STATIC_IMPORT_RE.exec(line);
		if (staticMatch && isLikelyRealImportSpec(staticMatch[1])) results.push({
			spec: staticMatch[1],
			line: i + 1
		});
		DYNAMIC_IMPORT_RE.lastIndex = 0;
		let dyn = DYNAMIC_IMPORT_RE.exec(line);
		while (dyn !== null) {
			if (isLikelyRealImportSpec(dyn[1])) results.push({
				spec: dyn[1],
				line: i + 1
			});
			dyn = DYNAMIC_IMPORT_RE.exec(line);
		}
	}
	return results;
};
const extractPyImports = (content) => {
	const lines = content.split("\n");
	const results = [];
	let inDoc = null;
	let typeCheckIndent = -1;
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const line = raw.trim();
		if (inDoc) {
			if (line.includes(inDoc)) inDoc = null;
			continue;
		}
		if (line === "" || line.startsWith("#")) continue;
		const triples = line.match(/"""|'''/g);
		if (triples) {
			if (triples.length % 2 === 1) inDoc = triples[triples.length - 1];
			continue;
		}
		const indent = raw.length - raw.trimStart().length;
		if (typeCheckIndent >= 0 && indent <= typeCheckIndent) typeCheckIndent = -1;
		if (/^if\s+(?:[\w.]+\.)?TYPE_CHECKING\b/.test(line)) {
			typeCheckIndent = indent;
			continue;
		}
		if (typeCheckIndent >= 0) continue;
		const fromMatch = line.match(/^from\s+([\w.]+)\s+import\b/);
		if (fromMatch && !fromMatch[1].startsWith(".")) {
			results.push({
				spec: fromMatch[1],
				line: i + 1
			});
			continue;
		}
		const importMatch = line.match(/^import\s+([\w.,\s]+?)(?:\s+as\s+\w+)?\s*$/);
		if (importMatch) for (const part of importMatch[1].split(",")) {
			const cleaned = part.trim().split(/\s+as\s+/)[0];
			if (cleaned && !cleaned.startsWith(".")) results.push({
				spec: cleaned,
				line: i + 1
			});
		}
	}
	return results;
};
const checkJsImport = (rawSpec, manifest, tsAliasMatchers) => {
	const spec = stripImportQuery(rawSpec);
	if (spec.length === 0) return null;
	if (isJsRelativeOrAbsolute(spec)) return null;
	if (isJsBuiltin(spec)) return null;
	if (isJsVirtualModule(spec, manifest)) return null;
	if (tsAliasMatchers.some((m) => m(spec))) return null;
	const pkg = packageNameFromImport(spec);
	if (manifest.jsDeps.has(pkg)) return null;
	if (pkg.startsWith("@types/")) {
		const realPkg = pkg.slice(7);
		if (manifest.jsDeps.has(realPkg)) return null;
	}
	if (manifest.jsDeps.has(typesPackageName(pkg))) return null;
	return pkg;
};
const normalizePyName = (name) => name.toLowerCase().replace(/_/g, "-");
const checkPyImport = (spec, manifest) => {
	const root = spec.split(".")[0];
	if (PYTHON_STDLIB.has(root)) return null;
	const normalized = normalizePyName(root);
	if (manifest.pyDeps.has(normalized)) return null;
	if ((PYTHON_IMPORT_TO_PIP[root] ?? PYTHON_IMPORT_TO_PIP[normalized])?.some((dist) => manifest.pyDeps.has(normalizePyName(dist)))) return null;
	return root;
};
const detectHallucinatedImports = async (context) => {
	const rootPkg = readJson$1(path.join(context.rootDirectory, "package.json"));
	const workspaceDirs = collectWorkspaceDirs(context.rootDirectory, rootPkg);
	const manifest = loadManifest(context.rootDirectory);
	if (!manifest.hasJsManifest && !manifest.hasPyManifest) return [];
	const tsAliasMatchers = manifest.hasJsManifest ? collectTsPathAliases(context.rootDirectory, workspaceDirs) : [];
	const diagnostics = [];
	const files = getSourceFiles(context);
	for (const filePath of files) {
		const ext = path.extname(filePath);
		const isJs = JS_EXTENSIONS$2.has(ext);
		const isPy = PY_EXTENSIONS$2.has(ext);
		if (!isJs && !isPy) continue;
		if (isJs && !manifest.hasJsManifest) continue;
		if (isPy && !manifest.hasPyManifest) continue;
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relPath = path.relative(context.rootDirectory, filePath);
		if (isNonProductionPath(relPath)) continue;
		const imports = isJs ? extractJsImports(content) : extractPyImports(content);
		for (const { spec, line } of imports) {
			const hallucinated = isJs ? checkJsImport(spec, manifest, tsAliasMatchers) : checkPyImport(spec, manifest);
			if (!hallucinated) continue;
			const manifestLabel = isJs ? "package.json" : "requirements.txt / pyproject.toml / Pipfile";
			diagnostics.push({
				filePath: relPath,
				engine: "ai-slop",
				rule: "ai-slop/hallucinated-import",
				severity: "error",
				message: `Imports "${hallucinated}" but it's not declared in ${manifestLabel}${isPy ? " and isn't Python stdlib" : ""}`,
				help: "Most often this is an LLM hallucinating a plausible-sounding package name. Either add the package to your manifest, or correct the import.",
				line,
				column: 1,
				category: "AI Slop",
				fixable: false
			});
		}
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/hardcoded-config.ts
const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".go",
	".rs",
	".rb",
	".java",
	".php"
]);
const URL_LITERAL_RE = /(["'`])(https?:\/\/[^"'`\s<>]+)\1/g;
const ID_LITERAL_RE = /(["'])([A-Za-z][A-Za-z0-9_-]{15,})\1/g;
const ENV_REFERENCE_RE = /\b(?:process\.env|import\.meta\.env|Deno\.env|os\.environ|getenv|env\()\b/i;
const DOC_URL_CONTEXT_RE = /\b(?:docs?|documentation|homepage|repository|bugs|license|readme|source|svgUrl|pageUrl|href|link|install)\b/i;
const URL_CONFIG_CONTEXT_RE = /\b(?:api|base[_-]?url|baseUrl|endpoint|host|origin|webhook|callback|redirect|server|service|domain|url)\b/i;
const ENVIRONMENT_HOST_RE = /(?:^|[.-])(?:api|app|admin|auth|staging|stage|prod|dev|sandbox|webhook|internal)(?:[.-]|$)|^(?:localhost|127\.0\.0\.1|0\.0\.0\.0)$/i;
const ID_CONTEXT_RE = /(?:^|[^A-Za-z0-9])(?:api[_-]?key|client[_-]?id|project[_-]?id|org(?:anization)?[_-]?id|workspace[_-]?id|tenant[_-]?id|price[_-]?id|product[_-]?id|customer[_-]?id|subscription[_-]?id|account[_-]?id|app[_-]?id|key|token|secret)(?:$|[^A-Za-z0-9])/i;
const MIGRATION_PATH_RE$1 = /(?:^|[\\/])(?:migrations?|db[\\/]migrate)[\\/]/i;
const PLACEHOLDER_HOSTS = new Set([
	"example.com",
	"example.org",
	"example.net"
]);
const LOOPBACK_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	"0.0.0.0",
	"::1"
]);
const VENDOR_API_DOMAINS = [
	"github.com",
	"githubusercontent.com",
	"googleapis.com",
	"accounts.google.com",
	"stripe.com",
	"openai.com",
	"anthropic.com",
	"slack.com",
	"twilio.com",
	"sendgrid.com",
	"mailgun.net",
	"cloudflare.com",
	"discord.com",
	"telegram.org",
	"login.microsoftonline.com",
	"graph.microsoft.com",
	"twitter.com",
	"x.com",
	"twimg.com",
	"t.co",
	"api.telegram.org"
];
const isVendorApiHost = (host) => VENDOR_API_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
const PLACEHOLDER_ID_RE = /^(?:changeme|replace[_-]?me|your[_-]|example|placeholder|todo)/i;
const PROVIDER_ID_RE = /^(?:price|prod|cus|sub|acct|org|app|tenant|workspace|project|client|key|tok|token|sk|pk)_[A-Za-z0-9][A-Za-z0-9_-]{7,}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READABLE_KEY_RE = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+){2,}$/;
const HARDCODED_URL_FINDING = {
	rule: "ai-slop/hardcoded-url",
	message: "Hardcoded environment URL in production code",
	help: "Move deployment-specific URLs to environment variables or a typed config module. Keep only stable documentation/public links inline."
};
const HARDCODED_ID_FINDING = {
	rule: "ai-slop/hardcoded-id",
	message: "Hardcoded provider/project ID in production code",
	help: "Move provider IDs, tenant IDs, price IDs, and similar deployment-specific identifiers to env/config so agents do not bake one environment into source."
};
const makeFinding = (filePath, line, spec) => ({
	filePath,
	engine: "ai-slop",
	rule: spec.rule,
	severity: "warning",
	message: spec.message,
	help: spec.help,
	line,
	column: 0,
	category: "AI Slop",
	fixable: false
});
const isCommentOnlyLine = (trimmed) => trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*") || trimmed.startsWith("/*");
const commentStartsBefore = (line, index, ext) => {
	const prefix = line.slice(0, index);
	if (ext === ".py" || ext === ".rb") return prefix.includes("#");
	if (ext === ".php") return prefix.includes("//") || prefix.includes("#");
	return prefix.includes("//") || prefix.includes("/*");
};
const safeUrlHost = (urlText) => {
	try {
		return new URL(urlText).hostname.toLowerCase();
	} catch {
		return null;
	}
};
const isEnvBackedLine = (line) => ENV_REFERENCE_RE.test(line);
const TEMPLATE_INTERPOLATION_START = "${";
const shouldFlagUrlLiteral = (line, urlText) => {
	if (isEnvBackedLine(line)) return false;
	if (urlText.includes(TEMPLATE_INTERPOLATION_START) && /\bnew\s+URL\s*\(/.test(line)) return false;
	const host = safeUrlHost(urlText);
	if (!host) return false;
	if (PLACEHOLDER_HOSTS.has(host)) return false;
	if (LOOPBACK_HOSTS.has(host)) return false;
	if (isVendorApiHost(host)) return false;
	if (DOC_URL_CONTEXT_RE.test(line) && !ENVIRONMENT_HOST_RE.test(host)) return false;
	return URL_CONFIG_CONTEXT_RE.test(line) || ENVIRONMENT_HOST_RE.test(host);
};
const ENV_VAR_NAME_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
const hasUsefulIdShape = (value) => {
	if (PLACEHOLDER_ID_RE.test(value)) return false;
	if (ENV_VAR_NAME_RE.test(value)) return false;
	if (/^https?:\/\//i.test(value)) return false;
	if (/^[A-Za-z]+$/.test(value)) return false;
	if (READABLE_KEY_RE.test(value) && !PROVIDER_ID_RE.test(value)) return false;
	if (PROVIDER_ID_RE.test(value)) return true;
	if (UUID_RE.test(value)) return true;
	if (!/[0-9]/.test(value)) return false;
	return value.length >= 24 && !/[_-]/.test(value) && /[a-z]/.test(value) && /[A-Z]/.test(value);
};
const scanLineForConfigLiterals = (line, relativePath, ext, lineNumber) => {
	const diagnostics = [];
	if (isCommentOnlyLine(line.trim())) return diagnostics;
	for (const urlMatch of line.matchAll(URL_LITERAL_RE)) {
		const urlText = urlMatch[2];
		if (commentStartsBefore(line, urlMatch.index, ext)) continue;
		if (!shouldFlagUrlLiteral(line, urlText)) continue;
		diagnostics.push(makeFinding(relativePath, lineNumber, HARDCODED_URL_FINDING));
	}
	if (!ID_CONTEXT_RE.test(line) || isEnvBackedLine(line) || DOC_URL_CONTEXT_RE.test(line)) return diagnostics;
	for (const idMatch of line.matchAll(ID_LITERAL_RE)) {
		const value = idMatch[2];
		if (commentStartsBefore(line, idMatch.index, ext)) continue;
		if (!hasUsefulIdShape(value)) continue;
		diagnostics.push(makeFinding(relativePath, lineNumber, HARDCODED_ID_FINDING));
	}
	return diagnostics;
};
const scanFileForConfigLiterals = (content, relativePath, ext) => {
	if (!SOURCE_EXTENSIONS.has(ext)) return [];
	if (isNonProductionPath(relativePath)) return [];
	if (MIGRATION_PATH_RE$1.test(relativePath)) return [];
	return content.split("\n").flatMap((line, index) => scanLineForConfigLiterals(line, relativePath, ext, index + 1));
};
const detectHardcodedConfigLiterals = async (context) => {
	const diagnostics = [];
	for (const filePath of getSourceFiles(context)) {
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relativePath = path.relative(context.rootDirectory, filePath);
		const ext = path.extname(filePath);
		diagnostics.push(...scanFileForConfigLiterals(maskComments(content, ext), relativePath, ext));
	}
	return diagnostics;
};

//#endregion
//#region src/utils/suppress.ts
const DIRECTIVE_RE = /(?:\/\/|\/\*|#|<!--|\*)\s*aislop-ignore-(next-line|line|file)\b([^\n]*)/;
const isAislopDirectiveLine = (line) => DIRECTIVE_RE.test(line);
const parseDirective = (rest) => {
	const tokens = rest.split("--")[0].match(/[A-Za-z0-9@][\w@/.-]*/g) ?? [];
	if (tokens.length === 0) return {
		rules: /* @__PURE__ */ new Set(),
		all: true
	};
	return {
		rules: new Set(tokens),
		all: false
	};
};
const covers = (directive, rule) => directive.all || [...directive.rules].some((r) => r === rule || rule.endsWith(`/${r}`));
const parseFileDirectives = (content) => {
	const lines = content.split(/\r?\n/);
	const file = [];
	const byLine = /* @__PURE__ */ new Map();
	const addLine = (target, directive) => {
		const list = byLine.get(target) ?? [];
		list.push(directive);
		byLine.set(target, list);
	};
	for (let i = 0; i < lines.length; i++) {
		const match = DIRECTIVE_RE.exec(lines[i]);
		if (!match) continue;
		const scope = match[1];
		const directive = parseDirective(match[2] ?? "");
		if (scope === "file") file.push(directive);
		else if (scope === "next-line") addLine(i + 2, directive);
		else addLine(i + 1, directive);
	}
	return {
		file,
		byLine
	};
};
const applySuppressions = (results, rootDirectory) => {
	const cache = /* @__PURE__ */ new Map();
	let suppressedCount = 0;
	const load = (filePath) => {
		const cached = cache.get(filePath);
		if (cached !== void 0) return cached;
		const absolute = path.isAbsolute(filePath) ? filePath : path.join(rootDirectory, filePath);
		let parsed = null;
		try {
			parsed = parseFileDirectives(fs.readFileSync(absolute, "utf-8"));
		} catch {
			parsed = null;
		}
		cache.set(filePath, parsed);
		return parsed;
	};
	const isSuppressed = (diagnostic) => {
		const directives = load(diagnostic.filePath);
		if (!directives) return false;
		if (directives.file.some((d) => covers(d, diagnostic.rule))) return true;
		return (directives.byLine.get(diagnostic.line) ?? []).some((d) => covers(d, diagnostic.rule));
	};
	return {
		results: results.map((result) => {
			const kept = result.diagnostics.filter((diagnostic) => {
				if (isSuppressed(diagnostic)) {
					suppressedCount += 1;
					return false;
				}
				return true;
			});
			return {
				...result,
				diagnostics: kept
			};
		}),
		suppressedCount
	};
};

//#endregion
//#region src/engines/ai-slop/comment-blocks.ts
const stripJsdocLine = (line) => line.replace(/^\s*\/\*\*+\s?/, "").replace(/\s*\*+\/\s*$/, "").replace(/^\s*\*\s?/, "").trim();
const stripLineComment = (line) => line.replace(/^\s*(?:(?:\/\/)|#)\s?/, "");
const getCommentSyntax = (ext) => {
	switch (ext) {
		case ".ts":
		case ".tsx":
		case ".js":
		case ".jsx":
		case ".mjs":
		case ".cjs":
		case ".go":
		case ".rs":
		case ".java": return { linePrefixes: ["//"] };
		case ".py":
		case ".rb": return { linePrefixes: ["#"] };
		case ".php": return { linePrefixes: ["//", "#"] };
		default: return null;
	}
};
const getMatchedLinePrefix = (line, syntax) => {
	const trimmed = line.trimStart();
	if (isAislopDirectiveLine(trimmed)) return null;
	for (const prefix of syntax.linePrefixes) {
		if (!trimmed.startsWith(prefix)) continue;
		if (prefix === "#" && trimmed.startsWith("#!")) return null;
		return prefix;
	}
	return null;
};
const isRustDocCommentLine = (line) => {
	const trimmed = line.trimStart();
	return trimmed.startsWith("///") || trimmed.startsWith("//!");
};
const collectBlocks = (sourceLines, syntax) => {
	const blocks = [];
	let i = 0;
	while (i < sourceLines.length) {
		const line = sourceLines[i];
		const trimmed = line.trim();
		if (getMatchedLinePrefix(line, syntax) !== null) {
			const start = i;
			const raw = [];
			while (i < sourceLines.length && getMatchedLinePrefix(sourceLines[i], syntax) !== null) {
				raw.push(sourceLines[i]);
				i += 1;
			}
			let next = i;
			while (next < sourceLines.length && sourceLines[next].trim() === "") next += 1;
			const docCandidates = raw.filter((l) => l.trim().length > 0);
			const isRustDoc = docCandidates.length > 0 && docCandidates.every((l) => isRustDocCommentLine(l));
			blocks.push({
				kind: "line",
				startLine: start + 1,
				endLine: start + raw.length,
				rawLines: raw,
				prose: raw.map(stripLineComment),
				hasMeaningfulJsdocTag: false,
				isRustDoc,
				nextNonBlankLine: next < sourceLines.length ? sourceLines[next] : null
			});
			continue;
		}
		if (trimmed.startsWith("/**")) {
			const start = i;
			const raw = [sourceLines[i]];
			let hasClose = /\*\/\s*$/.test(sourceLines[i]) && sourceLines[i].trim() !== "/**";
			i += 1;
			while (!hasClose && i < sourceLines.length) {
				raw.push(sourceLines[i]);
				if (/\*\/\s*$/.test(sourceLines[i])) hasClose = true;
				i += 1;
			}
			let next = i;
			while (next < sourceLines.length && sourceLines[next].trim() === "") next += 1;
			const prose = raw.map(stripJsdocLine).filter((l) => l.length > 0 && !l.startsWith("@"));
			const tagNames = [];
			for (const line of raw) {
				const stripped = stripJsdocLine(line);
				if (stripped.startsWith("@")) {
					const tagMatch = stripped.match(/^@(\w+)/);
					if (tagMatch) tagNames.push(tagMatch[1].toLowerCase());
				}
			}
			const hasMeaningful = tagNames.some((t) => MEANINGFUL_JSDOC_TAGS.has(t));
			blocks.push({
				kind: "jsdoc",
				startLine: start + 1,
				endLine: start + raw.length,
				rawLines: raw,
				prose,
				hasMeaningfulJsdocTag: hasMeaningful,
				isRustDoc: false,
				nextNonBlankLine: next < sourceLines.length ? sourceLines[next] : null
			});
			continue;
		}
		i += 1;
	}
	return blocks;
};

//#endregion
//#region src/engines/ai-slop/meta-comment.ts
const PLAN_REFERENCE_RES = [
	/^(?:stage|step|phase)\s+\d+\s*[:.\-–—]/i,
	/\bstep\s+\d+\s+of\s+the\s+plan\b/i,
	/\bas\s+(?:per|requested)\s+(?:the\s+)?(?:requirements?|spec|task|ticket|prompt|instructions?)\b/i,
	/\bper\s+the\s+(?:spec|requirements?|task|ticket|plan|prompt|instructions?)\b/i,
	/\bfrom\s+the\s+(?:task|todo|plan|spec|ticket|prompt|requirements?)\b/i,
	/\bimplement(?:ing|s|ed)?\s+use\s*case\s+\d*/i,
	/\b(?:requirements?\s+doc|requirement\s+\d+)\b/i,
	/\bas\s+(?:instructed|specified|outlined)\s+(?:above|below|in\s+the)\b/i
];
const BEFORE_AFTER_RES = [
	/\bpreviously[,:]?\s+(?:this|we|it|the)\b/i,
	/\bused\s+to\s+(?:be|use|call|return|do|have|rely)\b/i,
	/\bchanged\s+(?:\w+\s+){0,3}from\s+.+\bto\b/i,
	/\bno\s+longer\s+(?:needed|used|required|necessary|calls?|returns?|does)\b/i,
	/\bthis\s+was\s+.+\bbut\s+now\b/i,
	/\bwe\s+(?:now|used\s+to)\s+(?:no\s+longer\s+)?(?:use|call|return|do|have)\b/i,
	/\breplaced\s+the\s+(?:old|previous|former)\b/i,
	/\b(?:was|were)\s+(?:renamed|moved|removed|refactored|extracted)\s+(?:from|to|out\s+of)\b/i
];
const WHY_OR_TODO_RE = /\b(?:because|since|otherwise|todo|fixme|hack|note:|reason:|workaround|see\s+(?:issue|#))\b/i;
const looksLikeLicenseHeader$1 = (block) => {
	if (block.startLine !== 1) return false;
	const text = block.rawLines.join(" ").toLowerCase();
	return text.includes("copyright") || text.includes("license") || text.includes("spdx-license-identifier");
};
const looksLikeSuppressDirective$1 = (block) => block.rawLines.some((line) => /\b(?:biome-ignore|eslint-disable|ts-ignore|ts-expect-error|@ts-\w+|noqa|pylint:\s*disable|rubocop:disable|noinspection|phpcs:disable)\b/.test(line));
const matchMetaSignal = (block) => {
	if (looksLikeLicenseHeader$1(block)) return null;
	if (looksLikeSuppressDirective$1(block)) return null;
	if (block.kind === "jsdoc" && block.hasMeaningfulJsdocTag) return null;
	if (block.isRustDoc) return null;
	const joined = block.prose.join(" ");
	if (joined.trim().length === 0) return null;
	if (WHY_OR_TODO_RE.test(joined)) return null;
	if (PLAN_REFERENCE_RES.some((re) => re.test(joined))) return "plan/process reference";
	if (BEFORE_AFTER_RES.some((re) => re.test(joined))) return "before/after state narration";
	return null;
};
const detectMetaComments = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		const ext = path.extname(filePath);
		if (!SUPPORTED_EXTS.has(ext)) continue;
		if (isAutoGenerated(filePath)) continue;
		const syntax = getCommentSyntax(ext);
		if (!syntax) continue;
		const relativePath = path.relative(context.rootDirectory, filePath);
		if (isNonProductionPath(relativePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const blocks = collectBlocks(content.split("\n"), syntax);
		for (const block of blocks) {
			const reason = matchMetaSignal(block);
			if (!reason) continue;
			diagnostics.push({
				filePath: relativePath,
				engine: "ai-slop",
				rule: "ai-slop/meta-comment",
				severity: "warning",
				message: `Meta/plan comment (${reason})`,
				help: "Remove — references to the build plan or before/after code state belong in PR descriptions and commit messages, not source.",
				line: block.startLine,
				column: 0,
				category: "Comments",
				fixable: false
			});
		}
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/narrative-comments.ts
const looksLikeDeclarationPreamble = (nextLine, ext) => {
	if (nextLine === null) return false;
	if (DECL_START.test(nextLine) || EXPORT_DEFAULT.test(nextLine)) return true;
	switch (ext) {
		case ".py": return PY_DECL_START.test(nextLine);
		case ".go": return GO_DECL_START.test(nextLine);
		case ".rs": return RUST_DECL_START.test(nextLine);
		case ".rb": return RUBY_DECL_START.test(nextLine);
		case ".java": return JAVA_DECL_START.test(nextLine) || JAVA_DECL_START_FALLBACK.test(nextLine);
		case ".php": return PHP_DECL_START.test(nextLine);
		case ".ts":
		case ".tsx":
		case ".js":
		case ".jsx":
		case ".mjs":
		case ".cjs": return TS_MEMBER_DECL_START.test(nextLine);
		default: return false;
	}
};
const looksLikeLicenseHeader = (block) => {
	if (block.startLine !== 1) return false;
	const text = block.rawLines.join(" ").toLowerCase();
	return text.includes("copyright") || text.includes("license") || text.includes("spdx-license-identifier");
};
const looksLikeSuppressDirective = (block) => block.rawLines.some((l) => /\b(biome-ignore|eslint-disable|ts-ignore|ts-expect-error|@ts-\w+|noqa|pylint:\s*disable|rubocop:disable|noinspection|phpcs:disable)\b/.test(l));
const GO_DECL_NAME_RE = /^(?:func|type|var|const)\s+(?:\([^)]*\)\s*)?(\w+)/;
const GO_FIELD_LEAD_RE = /^(\w+)\s+/;
const GO_KEYWORDS = new Set([
	"return",
	"if",
	"for",
	"switch",
	"case",
	"default",
	"go",
	"select",
	"defer",
	"else",
	"break",
	"continue",
	"goto",
	"package",
	"import",
	"map",
	"chan",
	"range"
]);
const looksLikeGoDocComment = (block, ext) => {
	if (ext !== ".go" || block.kind !== "line") return false;
	const next = block.nextNonBlankLine;
	if (!next) return false;
	const trimmedNext = next.trim();
	const firstWord = (block.prose.find((l) => l.length > 0) ?? "").split(/\s+/)[0] ?? "";
	const declMatch = GO_DECL_NAME_RE.exec(trimmedNext);
	if (declMatch && firstWord === declMatch[1]) return true;
	const fieldMatch = GO_FIELD_LEAD_RE.exec(trimmedNext);
	if (fieldMatch && !GO_KEYWORDS.has(fieldMatch[1]) && firstWord === fieldMatch[1]) return true;
	return false;
};
const RUBY_DOC_INDICATORS = /^\s*#\s*(?:#|@\w+|:[\w-]+:|=begin|=end)/;
const looksLikeRubyDocBlock = (block, ext) => {
	if (ext !== ".rb" || block.kind !== "line") return false;
	return block.rawLines.some((line) => RUBY_DOC_INDICATORS.test(line));
};
const DOC_INDICATOR_RE = /`[^`]+`|\|\s*[-:]+\s*\||```|\b(?:note|warning|warn|caveat|example|caution|see|todo|fixme|hack|reason|deprecated|deprecation|migration|legacy|historical|context):|\(e\.g\.[^)]+\)|\(i\.e\.[^)]+\)|\b\w+\.\w+(?:\.\w+)+\b|\[[\w/.-]+\]/i;
const hasDocIndicator = (block) => {
	const joined = block.prose.join(" ");
	if (DOC_INDICATOR_RE.test(joined)) return true;
	for (const l of block.prose) if (/^[-]\s/.test(l)) return true;
	return false;
};
const hasPreambleSlopSignal = (block) => {
	const joined = block.prose.join(" ");
	for (const l of block.prose) {
		if (EXPLANATORY_OPENERS.test(l)) return true;
		if (JUSTIFICATION_OPENERS.some((re) => re.test(l))) return true;
	}
	return CROSS_REFERENCE_PHRASES.some((re) => re.test(joined));
};
const detectNarrativeInBlock = (block, ext) => {
	if (looksLikeLicenseHeader(block)) return {
		matched: false,
		reason: ""
	};
	if (looksLikeSuppressDirective(block)) return {
		matched: false,
		reason: ""
	};
	if (block.kind === "jsdoc" && block.hasMeaningfulJsdocTag) return {
		matched: false,
		reason: ""
	};
	if (block.isRustDoc) return {
		matched: false,
		reason: ""
	};
	if (looksLikeGoDocComment(block, ext)) return {
		matched: false,
		reason: ""
	};
	if (looksLikeRubyDocBlock(block, ext)) return {
		matched: false,
		reason: ""
	};
	if (block.kind === "line" && block.prose.some((l) => DECORATIVE_SEPARATOR.test(l) || DECORATIVE_SECTION_HEADER.test(l))) return {
		matched: true,
		reason: "decorative separator"
	};
	if (block.kind === "line" && block.prose.some((l) => SECTION_HEADER.test(l))) return {
		matched: true,
		reason: "phase/section header"
	};
	const joined = block.prose.join(" ");
	const hasWhyMarker = EXPLANATORY_WHY_MARKERS.test(joined);
	if (hasWhyMarker || hasDocIndicator(block)) return {
		matched: false,
		reason: ""
	};
	if (block.kind === "line" && block.prose.length >= 3 && looksLikeDeclarationPreamble(block.nextNonBlankLine, ext) && hasPreambleSlopSignal(block)) return {
		matched: true,
		reason: "multi-line preamble before declaration"
	};
	if (block.kind === "jsdoc" && block.prose.length >= 3 && looksLikeDeclarationPreamble(block.nextNonBlankLine, ext) && hasPreambleSlopSignal(block)) return {
		matched: true,
		reason: "JSDoc preamble with slop signal"
	};
	if (CROSS_REFERENCE_PHRASES.some((re) => re.test(joined))) return {
		matched: true,
		reason: "cross-reference commentary"
	};
	if (block.kind === "line") {
		for (const l of block.prose) if (JUSTIFICATION_OPENERS.some((re) => re.test(l))) return {
			matched: true,
			reason: "justification prose"
		};
	}
	if (block.kind === "line" && block.rawLines.length === 1 && EXPLANATORY_OPENERS.test(block.prose[0] ?? "") && looksLikeDeclarationPreamble(block.nextNonBlankLine, ext)) return {
		matched: true,
		reason: "explanatory preamble"
	};
	const nonEmptyProseCount = block.prose.filter((l) => l.length > 0).length;
	const isAboveDeclaration = looksLikeDeclarationPreamble(block.nextNonBlankLine, ext);
	if (nonEmptyProseCount >= 5 && !isAboveDeclaration && hasPreambleSlopSignal(block)) return {
		matched: true,
		reason: "long narrative block"
	};
	if (nonEmptyProseCount >= 3 && !hasWhyMarker && block.kind === "line" && !isAboveDeclaration && hasPreambleSlopSignal(block)) return {
		matched: true,
		reason: "multi-line narrative prose"
	};
	return {
		matched: false,
		reason: ""
	};
};
const detectNarrativeComments = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		const ext = path.extname(filePath);
		if (!SUPPORTED_EXTS.has(ext)) continue;
		if (isAutoGenerated(filePath)) continue;
		const syntax = getCommentSyntax(ext);
		if (!syntax) continue;
		const relativePath = path.relative(context.rootDirectory, filePath);
		if (isNonProductionPath(relativePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const blocks = collectBlocks(content.split("\n"), syntax);
		for (const block of blocks) {
			const { matched, reason } = detectNarrativeInBlock(block, ext);
			if (!matched) continue;
			diagnostics.push({
				filePath: relativePath,
				engine: "ai-slop",
				rule: "ai-slop/narrative-comment",
				severity: "warning",
				message: `Narrative comment block (${reason})`,
				help: "Remove — narrative/decorative comments belong in PR descriptions, not source. Code should be self-explanatory.",
				line: block.startLine,
				column: 0,
				category: "Comments",
				fixable: true
			});
		}
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/python-patterns.ts
const PY_EXTENSIONS$1 = new Set([".py"]);
const BARE_EXCEPT_RE = /^\s*except\s*:\s*(?:#.*)?$/;
const BROAD_EXCEPT_RE = /^\s*except\s+(Exception|BaseException)\s*(?:as\s+\w+)?\s*:\s*(?:#.*)?$/;
const PRINT_RE = /^\s*print\s*\(/;
const DEF_RE = /^\s*(?:async\s+)?def\s+\w+\s*\(/;
const MUTABLE_DEFAULT_RE = /(\w+)\s*(?::\s*[^,)=]+)?\s*=\s*(\[\s*\]|\{\s*\}|set\(\s*\))/;
const RANGE_LEN_LOOP_RE = /^\s*for\s+([A-Za-z_]\w*)\s+in\s+range\s*\(\s*len\s*\(\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\)\s*\)\s*:\s*(?:#.*)?$/;
const CHAINED_DICT_GET_RE = /\.get\s*\([^)]*,\s*\{\s*\}\s*\)\s*\.get\s*\(/;
const SAME_VALUE_BRANCH_RE = /^(\s*)(?:if|elif)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*==\s*["'][^"']+["']\s*:/;
const INSTANCE_BRANCH_RE = /^(\s*)(?:if|elif)\s+isinstance\s*\(\s*([A-Za-z_]\w*)\s*,\s*[^)]+\)\s*:/;
const BRANCH_LADDER_THRESHOLD = 4;
const isTestFile$1 = (relPath, basename) => basename.startsWith("test_") || basename.endsWith("_test.py") || basename === "conftest.py" || relPath.split(path.sep).some((seg) => seg === "tests" || seg === "test");
const isScriptOrEntrypoint = (basename) => basename === "__main__.py" || basename === "manage.py" || basename === "setup.py";
const SCRIPT_DIR_NAMES = new Set([
	"scripts",
	"bin",
	".github",
	"action",
	"docs",
	"docs_src",
	"examples",
	"example"
]);
const isInScriptDir = (relPath) => relPath.split(path.sep).some((seg) => SCRIPT_DIR_NAMES.has(seg));
const isTutorialFile = (basename) => basename.startsWith("tutorial") && basename.endsWith(".py");
const MAIN_GUARD_RE = /^\s*if\s+__name__\s*==\s*["']__main__["']\s*:/;
const hasMainGuard = (lines) => lines.some((l) => MAIN_GUARD_RE.test(l));
const buildDocstringRanges = (lines) => {
	const inside = /* @__PURE__ */ new Set();
	let openDelim = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (openDelim) {
			inside.add(i);
			if (line.includes(openDelim)) openDelim = null;
			continue;
		}
		for (const delim of ["\"\"\"", "'''"]) {
			const first = line.indexOf(delim);
			if (first === -1) continue;
			if (line.indexOf(delim, first + 3) === -1) {
				openDelim = delim;
				inside.add(i);
				break;
			}
		}
	}
	return inside;
};
const pushFinding = (out, a) => {
	out.push({
		filePath: a.relPath,
		engine: "ai-slop",
		rule: a.rule,
		severity: a.severity,
		message: a.message,
		help: a.help,
		line: a.line,
		column: 1,
		category: "AI Slop",
		fixable: false
	});
};
const pushLineFinding = (out, relPath, line, finding) => {
	pushFinding(out, {
		relPath,
		line,
		...finding
	});
};
const flagBareExcept = (lines, relPath, out) => {
	for (let i = 0; i < lines.length; i++) {
		if (!BARE_EXCEPT_RE.test(lines[i])) continue;
		pushFinding(out, {
			relPath,
			rule: "ai-slop/python-bare-except",
			severity: "warning",
			message: "Bare `except:` swallows every exception including KeyboardInterrupt and SystemExit.",
			help: "Catch the specific exception type you actually expect (`except ValueError:`, `except (KeyError, IndexError):`). If you genuinely want everything, `except BaseException:` plus a re-raise or log makes the intent explicit.",
			line: i + 1
		});
	}
};
const flagBroadExceptWithSilentBody = (lines, relPath, out) => {
	for (let i = 0; i < lines.length; i++) {
		const match = BROAD_EXCEPT_RE.exec(lines[i]);
		if (!match) continue;
		const trimmedNext = (lines[i + 1] ?? "").trim();
		if (!(trimmedNext === "pass" || trimmedNext.startsWith("#") && (lines[i + 2] ?? "").trim() === "pass")) continue;
		pushFinding(out, {
			relPath,
			rule: "ai-slop/python-broad-except",
			severity: "warning",
			message: `\`except ${match[1]}: pass\` silently drops every exception. Failures vanish without a trace.`,
			help: "Either narrow the exception class (`except ValueError:`), log the error, or re-raise. If you genuinely intend to swallow, add a comment naming the specific failure mode you're handling — auditors will thank you.",
			line: i + 1
		});
	}
};
const flagMutableDefaults = (lines, relPath, out) => {
	let i = 0;
	while (i < lines.length) {
		if (!DEF_RE.test(lines[i])) {
			i++;
			continue;
		}
		const startLine = i;
		let signature = lines[i];
		let parenDepth = 0;
		for (const ch of signature) if (ch === "(") parenDepth++;
		else if (ch === ")") parenDepth--;
		while (parenDepth > 0 && i + 1 < lines.length) {
			i++;
			signature += `\n${lines[i]}`;
			for (const ch of lines[i]) if (ch === "(") parenDepth++;
			else if (ch === ")") parenDepth--;
		}
		MUTABLE_DEFAULT_RE.lastIndex = 0;
		const found = MUTABLE_DEFAULT_RE.exec(signature);
		if (found) pushFinding(out, {
			relPath,
			rule: "ai-slop/python-mutable-default",
			severity: "warning",
			message: `Mutable default argument \`${found[1]}=${found[2]}\`. The default is shared across all calls — bugs that look like state-leakage.`,
			help: "Use `None` as the default and create the mutable value inside the body: `def f(items=None): items = items if items is not None else []`. Standard Python idiom; anything else is the AI agent shortcutting.",
			line: startLine + 1
		});
		i++;
	}
};
const flagPrintInProduction = (lines, relPath, basename, out) => {
	if (isTestFile$1(relPath, basename) || isScriptOrEntrypoint(basename)) return;
	if (isInScriptDir(relPath)) return;
	if (isTutorialFile(basename)) return;
	if (hasMainGuard(lines)) return;
	const docstringLines = buildDocstringRanges(lines);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!PRINT_RE.test(line)) continue;
		if (line.trim().startsWith("#")) continue;
		if (docstringLines.has(i)) continue;
		pushFinding(out, {
			relPath,
			rule: "ai-slop/python-print-debug",
			severity: "warning",
			message: "`print()` in production code — usually a leftover debug statement.",
			help: "Use the project's logger (`logging.getLogger(__name__).info(...)`). If this file is genuinely a CLI entry point (typer/click/argparse), it's safe to ignore — but rename to `__main__.py` or move under `scripts/` so the rule skips it next time.",
			line: i + 1
		});
	}
};
const flagRangeLenLoops = (lines, relPath, out) => {
	for (let i = 0; i < lines.length; i++) {
		const match = RANGE_LEN_LOOP_RE.exec(lines[i]);
		if (!match) continue;
		pushLineFinding(out, relPath, i + 1, {
			rule: "ai-slop/python-range-len-loop",
			severity: "info",
			message: `\`range(len(${match[2]}))\` loop — usually a hand-rolled iteration pattern.`,
			help: "Prefer direct iteration (`for item in items`) or `enumerate(items)` when the index is needed. Keeping index plumbing out of the loop reduces checkpoint-to-checkpoint bloat."
		});
	}
};
const flagChainedDictGets = (lines, relPath, out) => {
	for (let i = 0; i < lines.length; i++) {
		if (!CHAINED_DICT_GET_RE.test(lines[i])) continue;
		pushLineFinding(out, relPath, i + 1, {
			rule: "ai-slop/python-chained-dict-get",
			severity: "warning",
			message: "Chained `.get(..., {})` defaults hide missing-data cases.",
			help: "Normalize the input at the boundary, use a typed object, or split the lookup into explicit steps. Empty-dict fallback chains are a common agent shortcut that becomes brittle as schemas evolve."
		});
	}
};
const countBranchLadder = (lines, start, pattern, selector, indent) => {
	let count = 1;
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const match = pattern.exec(line);
		if (match?.[1] === indent && match[2] === selector) {
			count++;
			continue;
		}
		if (line.startsWith(`${indent}elif `)) break;
		if (line.length - line.trimStart().length <= indent.length && !line.startsWith(`${indent}else`)) break;
	}
	return count;
};
const flagBranchLadders = (lines, relPath, out) => {
	const reported = /* @__PURE__ */ new Set();
	for (let i = 0; i < lines.length; i++) {
		if (reported.has(i)) continue;
		const valueMatch = SAME_VALUE_BRANCH_RE.exec(lines[i]);
		if (valueMatch) {
			const count = countBranchLadder(lines, i, SAME_VALUE_BRANCH_RE, valueMatch[2], valueMatch[1]);
			if (count >= BRANCH_LADDER_THRESHOLD) {
				reported.add(i);
				pushLineFinding(out, relPath, i + 1, {
					rule: "ai-slop/python-repetitive-dispatch",
					severity: "warning",
					message: `${count} repeated branches dispatch on \`${valueMatch[2]}\`.`,
					help: "Use a table, set membership, or handler map when branches share the same shape. SlopCodeBench highlights these selector ladders as code that keeps growing instead of absorbing new cases cleanly."
				});
			}
			continue;
		}
		const instanceMatch = INSTANCE_BRANCH_RE.exec(lines[i]);
		if (!instanceMatch) continue;
		const count = countBranchLadder(lines, i, INSTANCE_BRANCH_RE, instanceMatch[2], instanceMatch[1]);
		if (count < BRANCH_LADDER_THRESHOLD) continue;
		reported.add(i);
		pushLineFinding(out, relPath, i + 1, {
			rule: "ai-slop/python-isinstance-ladder",
			severity: "warning",
			message: `${count} repeated \`isinstance(${instanceMatch[2]}, ...)\` branches.`,
			help: "Prefer a handler map, protocol, or normalized intermediate representation when each type branch has the same role. Repeated type ladders are one of the maintainability smells SCBench-style checks look for."
		});
	}
};
const detectPythonPatterns = async (context) => {
	const diagnostics = [];
	const files = getSourceFiles(context);
	for (const filePath of files) {
		if (!PY_EXTENSIONS$1.has(path.extname(filePath))) continue;
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relPath = path.relative(context.rootDirectory, filePath);
		const basename = path.basename(filePath);
		const lines = content.split("\n");
		flagBareExcept(lines, relPath, diagnostics);
		flagBroadExceptWithSilentBody(lines, relPath, diagnostics);
		flagMutableDefaults(lines, relPath, diagnostics);
		flagPrintInProduction(lines, relPath, basename, diagnostics);
		flagRangeLenLoops(lines, relPath, diagnostics);
		flagChainedDictGets(lines, relPath, diagnostics);
		flagBranchLadders(lines, relPath, diagnostics);
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/rust-patterns.ts
const RUST_EXTENSIONS = new Set([".rs"]);
const UNWRAP_CALL_RE = /\.unwrap\s*\(\s*\)/;
const TODO_MACRO_RE = /\b(todo|unimplemented)\s*!\s*\(/;
const COMMENT_LINE_RE = /^\s*\/\//;
const TEST_ATTR_RE = /^\s*#\s*\[\s*(?:cfg\s*\(\s*test\s*\)|test|tokio::test)/;
const WRITELN_UNWRAP_RE = /\b(?:writeln|write)\s*!\s*\([^)]*\)\s*\.unwrap\s*\(\s*\)/;
const TEST_BASENAMES = new Set([
	"tests.rs",
	"testutil.rs",
	"test_util.rs",
	"test_utils.rs",
	"build.rs"
]);
const TEST_CRATE_SEGMENT_RE = /(?:^|[-_])tests?(?:$|[-_])/;
const isTestFile = (relPath) => {
	const segments = relPath.split(path.sep);
	if (segments.some((s) => TEST_CRATE_SEGMENT_RE.test(s))) return true;
	const basename = segments[segments.length - 1] ?? "";
	if (TEST_BASENAMES.has(basename)) return true;
	return basename.endsWith("_tests.rs") || basename.endsWith("_test.rs") || basename.endsWith("_testutil.rs");
};
const buildBlockCommentRanges = (lines) => {
	const ranges = [];
	let openLine = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (openLine === -1) {
			const openIdx = line.indexOf("/*");
			if (openIdx !== -1 && line.indexOf("*/", openIdx + 2) === -1) openLine = i;
		} else if (line.indexOf("*/") !== -1) {
			ranges.push([openLine, i]);
			openLine = -1;
		}
	}
	if (openLine !== -1) ranges.push([openLine, lines.length - 1]);
	return ranges;
};
const isExampleFile = (relPath) => relPath.split(path.sep).some((seg) => seg === "examples" || seg === "benches");
const UNWRAP_INTENT_LOOKBACK = 2;
const hasIntentComment = (lines, lineIdx) => {
	for (let j = lineIdx - 1; j >= Math.max(0, lineIdx - UNWRAP_INTENT_LOOKBACK); j--) if (COMMENT_LINE_RE.test(lines[j])) return true;
	return false;
};
const buildTestRanges = (lines) => {
	const ranges = [];
	for (let i = 0; i < lines.length; i++) {
		if (!TEST_ATTR_RE.test(lines[i])) continue;
		const openLine = i;
		let depth = 0;
		let started = false;
		for (let j = i; j < lines.length; j++) {
			const line = lines[j];
			for (const ch of line) if (ch === "{") {
				depth++;
				started = true;
			} else if (ch === "}") depth--;
			if (started && depth === 0) {
				ranges.push([openLine, j]);
				i = j;
				break;
			}
		}
	}
	return ranges;
};
const isInRange = (ranges, lineIdx) => ranges.some(([start, end]) => lineIdx >= start && lineIdx <= end);
const flagNonTestUnwrap = (lines, relPath, testRanges, blockCommentRanges, out) => {
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (COMMENT_LINE_RE.test(line)) continue;
		if (isInRange(testRanges, i)) continue;
		if (isInRange(blockCommentRanges, i)) continue;
		if (!UNWRAP_CALL_RE.test(line)) continue;
		if (WRITELN_UNWRAP_RE.test(line)) continue;
		if (hasIntentComment(lines, i)) continue;
		out.push({
			filePath: relPath,
			engine: "ai-slop",
			rule: "ai-slop/rust-non-test-unwrap",
			severity: "warning",
			message: "`.unwrap()` in non-test code panics on None/Err. Surfaces as a hard crash for the caller.",
			help: "Use `?` to propagate, `.expect(\"context\")` if you really mean it (and the message names the invariant), or pattern-match the variant you care about. Reserve raw `.unwrap()` for tests and prototypes.",
			line: i + 1,
			column: 1,
			category: "AI Slop",
			fixable: false
		});
	}
};
const flagTodoMacro = (lines, relPath, out) => {
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (COMMENT_LINE_RE.test(line)) continue;
		const match = TODO_MACRO_RE.exec(line);
		if (!match) continue;
		out.push({
			filePath: relPath,
			engine: "ai-slop",
			rule: "ai-slop/rust-todo-stub",
			severity: "warning",
			message: `\`${match[1]}!()\` panics at runtime — almost certainly a stub the agent forgot to fill in.`,
			help: "Implement the missing path or remove it. If the work is genuinely deferred, file a ticket and put the number in a comment next to the macro so it doesn't ship invisibly.",
			line: i + 1,
			column: 1,
			category: "AI Slop",
			fixable: false
		});
	}
};
const detectRustPatterns = async (context) => {
	const diagnostics = [];
	const files = getSourceFiles(context);
	for (const filePath of files) {
		if (!RUST_EXTENSIONS.has(path.extname(filePath))) continue;
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relPath = path.relative(context.rootDirectory, filePath);
		const lines = content.split("\n");
		if (isExampleFile(relPath)) continue;
		if (isTestFile(relPath)) {
			flagTodoMacro(lines, relPath, diagnostics);
			continue;
		}
		flagNonTestUnwrap(lines, relPath, buildTestRanges(lines), buildBlockCommentRanges(lines), diagnostics);
		flagTodoMacro(lines, relPath, diagnostics);
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/silent-recovery.ts
const JS_EXTS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const CATCH_HEAD_RE = /\bcatch\s*(?:\(\s*([^)]*?)\s*\))?\s*\{/g;
const isIdentifier = (s) => /^[A-Za-z_$][\w$]*$/.test(s);
const recoveryDropsError = (binding, body) => {
	const name = binding?.trim() ?? "";
	if (name === "") return true;
	if (!isIdentifier(name)) return false;
	return !new RegExp(`\\b${name}\\b`).test(body);
};
const LOG_STATEMENT_RE = /^(?:console|[\w$]+(?:\.[\w$]+)*)\.(?:log|info|warn|warning|error|debug|trace)\s*\(/;
const HANDLING_TOKEN_RE = /\b(?:throw|return|reject|next|process\.exit|continue|break)\b/;
const stripBlockComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const extractCatchBody = (content, openBraceIndex) => {
	let depth = 0;
	let inString = null;
	for (let i = openBraceIndex; i < content.length; i += 1) {
		const ch = content[i];
		const prev = content[i - 1];
		if (inString) {
			if (ch === inString && prev !== "\\") inString = null;
			continue;
		}
		if (ch === "\"" || ch === "'" || ch === "`") {
			inString = ch;
			continue;
		}
		if (ch === "{") depth += 1;
		else if (ch === "}") {
			depth -= 1;
			if (depth === 0) return content.slice(openBraceIndex + 1, i);
		}
	}
	return null;
};
const isLogOnlyBody = (body) => {
	const statements = stripBlockComments(body).split("\n").map((line) => line.replace(/\/\/.*$/, "").trim()).filter((line) => line.length > 0 && line !== ";");
	if (statements.length === 0) return false;
	if (statements.some((line) => HANDLING_TOKEN_RE.test(line))) return false;
	let sawLog = false;
	for (const statement of statements) {
		const normalized = statement.replace(/;+$/, "");
		if (LOG_STATEMENT_RE.test(normalized)) {
			sawLog = true;
			continue;
		}
		if (/^[\w$"'`{[(),.\s+:-]+$/.test(normalized) && !/[=(]\s*(?:async\s+)?\(/.test(normalized)) continue;
		return false;
	}
	return sawLog;
};
const detectJsSilentRecovery = (content, relPath) => {
	const out = [];
	for (const match of content.matchAll(CATCH_HEAD_RE)) {
		const body = extractCatchBody(content, match.index + match[0].length - 1);
		if (body === null) continue;
		if (!isLogOnlyBody(body)) continue;
		if (!recoveryDropsError(match[1], body)) continue;
		const line = content.slice(0, match.index).split("\n").length;
		out.push({
			filePath: relPath,
			engine: "ai-slop",
			rule: "ai-slop/silent-recovery",
			severity: "warning",
			message: "Catch logs without the caught error then continues; the failure cause is lost",
			help: "Include the caught error in the log, or rethrow / recover explicitly, so the failure stays diagnosable.",
			line,
			column: 0,
			category: "AI Slop",
			fixable: false
		});
	}
	return out;
};
const PY_EXCEPT_RE = /^(\s*)except\b[^\n]*:\s*(?:#.*)?$/;
const PY_EXCEPT_BINDING_RE = /\bas\s+(\w+)\s*:/;
const PY_LOG_STATEMENT_RE = /^(?:logging|logger|log|self\.log|self\.logger|print)(?:\.(?:debug|info|warning|warn|error|exception|critical))?\s*\(/;
const PY_HANDLING_TOKEN_RE = /^(?:raise\b|return\b|continue\b|break\b|self\.|[\w.]+\s*=)/;
const detectPySilentRecovery = (content, relPath) => {
	const out = [];
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const exceptMatch = PY_EXCEPT_RE.exec(lines[i]);
		if (!exceptMatch) continue;
		const indent = exceptMatch[1].length;
		const bodyLines = [];
		let j = i + 1;
		for (; j < lines.length; j += 1) {
			const raw = lines[j];
			if (raw.trim() === "") continue;
			if (raw.length - raw.trimStart().length <= indent) break;
			bodyLines.push(raw.trim());
		}
		if (bodyLines.length === 0) continue;
		if (bodyLines.some((line) => PY_HANDLING_TOKEN_RE.test(line))) continue;
		if (bodyLines.some((line) => line === "pass")) continue;
		const allLogs = bodyLines.every((line) => PY_LOG_STATEMENT_RE.test(line) || /^[\w"'(),.\s+:%{}[\]-]+$/.test(line));
		const sawLog = bodyLines.some((line) => PY_LOG_STATEMENT_RE.test(line));
		if (!allLogs || !sawLog) continue;
		if (!recoveryDropsError(PY_EXCEPT_BINDING_RE.exec(lines[i])?.[1], bodyLines.join(" "))) continue;
		out.push({
			filePath: relPath,
			engine: "ai-slop",
			rule: "ai-slop/silent-recovery",
			severity: "warning",
			message: "except logs without the caught error then continues; the failure cause is lost",
			help: "Include the caught error in the log, or re-raise / recover explicitly, so the failure stays diagnosable.",
			line: i + 1,
			column: 0,
			category: "AI Slop",
			fixable: false
		});
	}
	return out;
};
const detectSilentRecovery = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		if (isAutoGenerated(filePath)) continue;
		const ext = path.extname(filePath);
		const isJs = JS_EXTS.has(ext);
		if (!isJs && !(ext === ".py")) continue;
		const relPath = path.relative(context.rootDirectory, filePath);
		if (isNonProductionPath(relPath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		if (isJs) diagnostics.push(...detectJsSilentRecovery(content, relPath));
		else diagnostics.push(...detectPySilentRecovery(content, relPath));
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/unused-imports.ts
const JS_EXTENSIONS$1 = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const PY_EXTENSIONS = new Set([".py"]);
const REMOVE_MARKER = "\0__AISLOP_REMOVE__";
const extractJsImportedSymbols = (lines) => {
	const symbols = [];
	const importLines = /* @__PURE__ */ new Set();
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (!trimmed.startsWith("import ")) continue;
		importLines.add(i);
		if (/^import\s+["']/.test(trimmed)) continue;
		if (/^import\s+type\s/.test(trimmed)) continue;
		let fullImport = trimmed;
		let endLine = i;
		while (!fullImport.includes("from") && endLine < lines.length - 1) {
			endLine++;
			fullImport += ` ${lines[endLine].trim()}`;
			importLines.add(endLine);
		}
		const namespaceMatch = fullImport.match(/import\s+\*\s+as\s+(\w+)\s+from/);
		if (namespaceMatch) {
			symbols.push({
				name: namespaceMatch[1],
				line: i + 1,
				isDefault: false,
				isNamespace: true
			});
			continue;
		}
		const defaultMatch = fullImport.match(/import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s+from/);
		if (defaultMatch && defaultMatch[1] !== "type") symbols.push({
			name: defaultMatch[1],
			line: i + 1,
			isDefault: true,
			isNamespace: false
		});
		const namedMatch = fullImport.match(/\{([^}]+)\}/);
		if (namedMatch) {
			const namedImports = namedMatch[1].split(",");
			for (const ni of namedImports) {
				const parts = ni.trim().split(/\s+as\s+/);
				if (parts.length === 0 || !parts[0]) continue;
				const cleanParts = parts.map((p) => p.trim().replace(/^type\s+/, ""));
				const localName = cleanParts.length > 1 ? cleanParts[1] : cleanParts[0];
				if (localName && /^\w+$/.test(localName)) symbols.push({
					name: localName,
					line: i + 1,
					isDefault: false,
					isNamespace: false
				});
			}
		}
	}
	return {
		symbols,
		importLines
	};
};
const extractPyImportedSymbols = (lines) => {
	const symbols = [];
	const importLines = /* @__PURE__ */ new Set();
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		const fromMatch = trimmed.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
		if (fromMatch) {
			importLines.add(i);
			if (fromMatch[1] === "__future__") continue;
			const importPart = fromMatch[2].replace(/#.*$/, "").trim();
			if (importPart === "*") continue;
			const cleaned = importPart.replace(/[()]/g, "");
			for (const item of cleaned.split(",")) {
				const parts = item.trim().split(/\s+as\s+/);
				const original = parts[0].trim();
				const localName = parts.length > 1 ? parts[1].trim() : original;
				if (parts.length > 1 && original === localName) continue;
				if (localName && /^\w+$/.test(localName)) symbols.push({
					name: localName,
					line: i + 1,
					isDefault: false,
					isNamespace: false
				});
			}
			continue;
		}
		const importMatch = trimmed.match(/^import\s+(.+)/);
		if (importMatch) {
			importLines.add(i);
			for (const clause of importMatch[1].replace(/#.*$/, "").split(",")) {
				const clauseMatch = clause.trim().match(/^([\w.]+)(?:\s+as\s+(\w+))?/);
				if (!clauseMatch) continue;
				const alias = clauseMatch[2];
				if (alias && alias === clauseMatch[1]) continue;
				const simpleName = (alias ?? clauseMatch[1]).split(".")[0];
				if (simpleName && /^\w+$/.test(simpleName)) symbols.push({
					name: simpleName,
					line: i + 1,
					isDefault: false,
					isNamespace: true
				});
			}
		}
	}
	return {
		symbols,
		importLines
	};
};
const isSymbolUsed = (name, content, importLines, lines) => {
	const pattern = new RegExp(`\\b${name}\\b`, "g");
	for (const match of content.matchAll(pattern)) {
		const lineIndex = content.slice(0, match.index).split("\n").length - 1;
		if (!importLines.has(lineIndex)) return true;
	}
	for (let i = 0; i < lines.length; i++) {
		if (importLines.has(i)) continue;
		if (lines[i].includes(name)) return true;
	}
	return false;
};
const analyzeFile = (filePath) => {
	if (isAutoGenerated(filePath)) return null;
	let content;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
	const ext = path.extname(filePath);
	const lines = content.split("\n");
	let symbols;
	let importLines;
	if (JS_EXTENSIONS$1.has(ext)) {
		const result = extractJsImportedSymbols(lines);
		symbols = result.symbols;
		importLines = result.importLines;
	} else if (PY_EXTENSIONS.has(ext)) {
		const result = extractPyImportedSymbols(lines);
		symbols = result.symbols;
		importLines = result.importLines;
	} else return null;
	return {
		lines,
		symbols,
		importLines,
		ext
	};
};
const getUnusedSymbols = (lines, symbols, importLines) => {
	const content = lines.join("\n");
	return symbols.filter((symbol) => !isSymbolUsed(symbol.name, content, importLines, lines));
};
const detectUnusedImports = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		const analysis = analyzeFile(filePath);
		if (!analysis) continue;
		const relativePath = path.relative(context.rootDirectory, filePath);
		const unused = getUnusedSymbols(analysis.lines, analysis.symbols, analysis.importLines);
		for (const symbol of unused) diagnostics.push({
			filePath: relativePath,
			engine: "ai-slop",
			rule: "ai-slop/unused-import",
			severity: "warning",
			message: `Imported symbol '${symbol.name}' is never used`,
			help: "Remove unused imports to keep the code clean",
			line: symbol.line,
			column: 0,
			category: "AI Slop",
			fixable: true
		});
	}
	return diagnostics;
};

//#endregion
//#region src/engines/ai-slop/index.ts
const aiSlopEngine = {
	name: "ai-slop",
	async run(context) {
		const diagnostics = [];
		const results = await Promise.allSettled([
			detectTrivialComments(context),
			detectSwallowedExceptions(context),
			detectDefensivePatterns(context),
			detectOverAbstraction(context),
			detectDeadPatterns(context),
			detectUnusedImports(context),
			detectNarrativeComments(context),
			detectDuplicateImports(context),
			detectHardcodedConfigLiterals(context),
			detectPythonPatterns(context),
			detectGoPatterns(context),
			detectRustPatterns(context),
			detectHallucinatedImports(context),
			detectSilentRecovery(context),
			detectMetaComments(context)
		]);
		for (const result of results) if (result.status === "fulfilled") diagnostics.push(...result.value);
		return {
			engine: "ai-slop",
			diagnostics,
			elapsed: 0,
			skipped: false
		};
	}
};

//#endregion
//#region src/engines/architecture/matchers.ts
const REGEX_SPECIAL_CHARS = new Set([
	".",
	"+",
	"^",
	"$",
	"{",
	"}",
	"(",
	")",
	"|",
	"\\"
]);
const minimatch = (filePath, pattern) => {
	let regex = "";
	let i = 0;
	while (i < pattern.length) {
		const ch = pattern[i];
		if (ch === "*" && pattern[i + 1] === "*") {
			regex += ".*";
			i += 2;
			if (pattern[i] === "/") i++;
		} else if (ch === "*") {
			regex += "[^/]*";
			i++;
		} else if (ch === "?") {
			regex += "[^/]";
			i++;
		} else if (ch === "[") {
			const closeIndex = pattern.indexOf("]", i + 1);
			if (closeIndex === -1) {
				regex += "\\[";
				i++;
			} else {
				regex += pattern.slice(i, closeIndex + 1);
				i = closeIndex + 1;
			}
		} else if (REGEX_SPECIAL_CHARS.has(ch)) {
			regex += `\\${ch}`;
			i++;
		} else {
			regex += ch;
			i++;
		}
	}
	return new RegExp(`^${regex}$`).test(filePath);
};
const extractImports = (content, ext) => {
	const imports = [];
	if ([
		".ts",
		".tsx",
		".js",
		".jsx",
		".mjs",
		".cjs"
	].includes(ext)) {
		for (const match of content.matchAll(/(?:import|from)\s+["']([^"']+)["']/g)) imports.push(match[1]);
		for (const match of content.matchAll(/require\s*\(\s*["']([^"']+)["']\s*\)/g)) imports.push(match[1]);
	}
	if (ext === ".py") for (const match of content.matchAll(/(?:from|import)\s+([\w.]+)/g)) imports.push(match[1]);
	if (ext === ".go") {
		for (const match of content.matchAll(/^\s*import\s+"([^"]+)"/gm)) imports.push(match[1]);
		for (const match of content.matchAll(/import\s*\(([^)]*)\)/gs)) {
			const block = match[1];
			for (const pkgMatch of block.matchAll(/"([^"]+)"/g)) imports.push(pkgMatch[1]);
		}
	}
	return imports;
};
const applyForbidImport = (rule, imports, content, relativePath) => {
	if (!rule.match) return [];
	return imports.filter((imp) => imp.includes(rule.match)).map((imp) => ({
		filePath: relativePath,
		engine: "architecture",
		rule: `arch/${rule.name}`,
		severity: rule.severity,
		message: `Forbidden import '${imp}' (rule: ${rule.name})`,
		help: `This import is not allowed by your architecture rules`,
		line: findImportLine(content, imp),
		column: 0,
		category: "Architecture",
		fixable: false
	}));
};
const applyForbidImportFromPath = (rule, imports, content, relativePath) => {
	if (!rule.from || !rule.forbid) return [];
	if (!minimatch(relativePath, rule.from)) return [];
	return imports.filter((imp) => minimatch(imp, rule.forbid) || imp.includes(rule.forbid.replace(/\*\*/g, ""))).map((imp) => ({
		filePath: relativePath,
		engine: "architecture",
		rule: `arch/${rule.name}`,
		severity: rule.severity,
		message: `Import '${imp}' is forbidden from '${rule.from}' (rule: ${rule.name})`,
		help: `Files in '${rule.from}' cannot import from '${rule.forbid}'`,
		line: findImportLine(content, imp),
		column: 0,
		category: "Architecture",
		fixable: false
	}));
};
const applyRequirePattern = (rule, content, relativePath) => {
	if (!rule.where || !rule.pattern) return [];
	if (!minimatch(relativePath, rule.where)) return [];
	if (content.includes(rule.pattern)) return [];
	return [{
		filePath: relativePath,
		engine: "architecture",
		rule: `arch/${rule.name}`,
		severity: rule.severity,
		message: `Required pattern '${rule.pattern}' not found (rule: ${rule.name})`,
		help: `Files matching '${rule.where}' must contain '${rule.pattern}'`,
		line: 0,
		column: 0,
		category: "Architecture",
		fixable: false
	}];
};
const applyRule = (rule, imports, content, relativePath) => {
	switch (rule.type) {
		case "forbid_import": return applyForbidImport(rule, imports, content, relativePath);
		case "forbid_import_from_path": return applyForbidImportFromPath(rule, imports, content, relativePath);
		case "require_pattern": return applyRequirePattern(rule, content, relativePath);
		default: return [];
	}
};
const checkRules = async (context, rules) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relativePath = path.relative(context.rootDirectory, filePath);
		const imports = extractImports(content, path.extname(filePath));
		for (const rule of rules) diagnostics.push(...applyRule(rule, imports, content, relativePath));
	}
	return diagnostics;
};
const findImportLine = (content, importPath) => {
	const lines = content.split("\n");
	for (let i = 0; i < lines.length; i++) if (lines[i].includes(importPath)) return i + 1;
	return 0;
};

//#endregion
//#region src/engines/architecture/rule-loader.ts
const loadArchitectureRules = (rulesPath) => {
	if (!fs.existsSync(rulesPath)) return [];
	try {
		const content = fs.readFileSync(rulesPath, "utf-8");
		return YAML.parse(content)?.rules ?? [];
	} catch {
		return [];
	}
};

//#endregion
//#region src/engines/architecture/index.ts
const architectureEngine = {
	name: "architecture",
	async run(context) {
		if (!context.config.architectureRulesPath) return {
			engine: "architecture",
			diagnostics: [],
			elapsed: 0,
			skipped: true,
			skipReason: "No architecture rules configured"
		};
		const rules = loadArchitectureRules(context.config.architectureRulesPath);
		if (rules.length === 0) return {
			engine: "architecture",
			diagnostics: [],
			elapsed: 0,
			skipped: true,
			skipReason: "No rules found in rules file"
		};
		return {
			engine: "architecture",
			diagnostics: await checkRules(context, rules),
			elapsed: 0,
			skipped: false
		};
	}
};

//#endregion
//#region src/engines/code-quality/function-boundaries.ts
const PYTHON_CONTROL_FLOW_RE = /^\s*(?:if|for|while|with|try|except|else|elif|finally|def|class)\b/;
const ARROW_BLOCK_RE = /=>\s*\{/;
const ARROW_END_RE = /=>\s*$/;
const BRACE_START_RE = /^\s*\{/;
const NEW_STATEMENT_RE = /^(?:export\s+)?(?:const|let|var|function|class)\s/;
const isControlFlowBrace = (lineText, braceIndex) => {
	const before = lineText.substring(0, braceIndex).trimEnd();
	if (before.endsWith(")")) return true;
	if (before.endsWith("=>")) return true;
	if (/\b(?:else|try|finally|do)$/.test(before)) return true;
	return false;
};
const findBraceFunctionEnd = (lines, startIndex) => {
	let depth = 0;
	let started = false;
	let endLine = startIndex;
	let maxNesting = 0;
	let functionStartDepth = 0;
	const braceStack = [];
	for (let j = startIndex; j < lines.length; j++) {
		const l = lines[j];
		for (let ci = 0; ci < l.length; ci++) {
			const ch = l[ci];
			if (ch === "{") {
				depth++;
				if (!started) {
					started = true;
					functionStartDepth = depth;
					braceStack.push(false);
				} else {
					const isCF = isControlFlowBrace(l, ci);
					braceStack.push(isCF);
					if (isCF) {
						let cfCount = 0;
						for (const b of braceStack) if (b) cfCount++;
						if (cfCount > maxNesting) maxNesting = cfCount;
					}
				}
			} else if (ch === "}") {
				depth--;
				braceStack.pop();
			}
		}
		if (started && depth < functionStartDepth && j > startIndex) {
			endLine = j;
			break;
		}
		if (j === lines.length - 1) endLine = j;
	}
	if (!started) return {
		endLine: startIndex,
		maxNesting: 0
	};
	return {
		endLine,
		maxNesting
	};
};
const extractPythonSignature = (lines, startIndex) => {
	let depth = 0;
	let started = false;
	let params = "";
	for (let j = startIndex; j < lines.length; j++) {
		const l = lines[j];
		for (let ci = 0; ci < l.length; ci++) {
			const ch = l[ci];
			if (ch === "(") {
				depth++;
				if (depth === 1 && !started) {
					started = true;
					continue;
				}
			} else if (ch === ")") {
				depth--;
				if (depth === 0) return {
					params,
					sigEndIndex: j
				};
			}
			if (started) params += ch;
		}
		if (started) params += " ";
	}
	return {
		params,
		sigEndIndex: startIndex
	};
};
const countPythonParams = (signature) => {
	let depth = 0;
	const parts = [];
	let current = "";
	for (const ch of signature) {
		if (ch === "(" || ch === "[" || ch === "{") depth++;
		else if (ch === ")" || ch === "]" || ch === "}") depth--;
		if (ch === "," && depth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	parts.push(current);
	let count = 0;
	for (const raw of parts) {
		const p = raw.trim();
		if (p.length === 0 || p === "*" || p === "/") continue;
		if (p.startsWith("*")) continue;
		if (p.includes("=")) continue;
		const name = p.split(":")[0].trim();
		if (name === "self" || name === "cls") continue;
		count++;
	}
	return count;
};
const countPythonBodyCodeLines = (lines, sigEndIndex, endLine) => {
	let count = 0;
	let inDoc = false;
	let delim = "";
	for (let j = sigEndIndex + 1; j <= endLine && j < lines.length; j++) {
		const t = lines[j].trim();
		if (inDoc) {
			if (t.includes(delim)) inDoc = false;
			continue;
		}
		if (t === "" || t.startsWith("#")) continue;
		const opener = t.startsWith("\"\"\"") ? "\"\"\"" : t.startsWith("'''") ? "'''" : "";
		if (opener) {
			if (!t.slice(3).includes(opener)) {
				inDoc = true;
				delim = opener;
			}
			continue;
		}
		count++;
	}
	return count;
};
const findPythonFunctionEnd = (lines, defIndex, bodyStartIndex) => {
	const baseIndent = lines[defIndex].match(/^(\s*)/)?.[1].length ?? 0;
	let endLine = bodyStartIndex;
	let maxNesting = 0;
	const controlIndentStack = [];
	for (let j = bodyStartIndex + 1; j < lines.length; j++) {
		const l = lines[j];
		if (l.trim() === "") {
			endLine = j;
			continue;
		}
		const currentIndent = l.match(/^(\s*)/)?.[1].length ?? 0;
		if (currentIndent <= baseIndent) break;
		endLine = j;
		while (controlIndentStack.length > 0 && currentIndent <= controlIndentStack[controlIndentStack.length - 1]) controlIndentStack.pop();
		if (PYTHON_CONTROL_FLOW_RE.test(l)) {
			controlIndentStack.push(currentIndent);
			const nesting = controlIndentStack.length;
			if (nesting > maxNesting) maxNesting = nesting;
		}
	}
	return {
		endLine,
		maxNesting
	};
};
const findFunctionEnd = (lines, startIndex, isPython) => {
	if (isPython) {
		const { sigEndIndex } = extractPythonSignature(lines, startIndex);
		return findPythonFunctionEnd(lines, startIndex, sigEndIndex);
	}
	return findBraceFunctionEnd(lines, startIndex);
};
const isBlockArrow = (lines, startIndex) => {
	if (ARROW_BLOCK_RE.test(lines[startIndex])) return true;
	if (ARROW_END_RE.test(lines[startIndex])) {
		const next = lines[startIndex + 1];
		if (next && BRACE_START_RE.test(next)) return true;
	}
	for (let j = startIndex + 1; j < Math.min(startIndex + 3, lines.length); j++) {
		const l = lines[j];
		if (l.trim() === "" || NEW_STATEMENT_RE.test(l.trim())) break;
		if (ARROW_BLOCK_RE.test(l)) return true;
		if (BRACE_START_RE.test(l)) return true;
	}
	return false;
};
const countTemplateLines = (bodyLines) => {
	let insideTemplate = false;
	let templateLineCount = 0;
	for (const line of bodyLines) {
		const startedInside = insideTemplate;
		let escaped = false;
		for (const ch of line) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === "\\") {
				escaped = true;
				continue;
			}
			if (ch === "`") insideTemplate = !insideTemplate;
		}
		if (startedInside) templateLineCount++;
	}
	return templateLineCount;
};

//#endregion
//#region src/engines/code-quality/complexity.ts
const FUNCTION_PATTERNS = [
	{
		regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
		langFilter: [
			".js",
			".ts",
			".jsx",
			".tsx",
			".mjs",
			".cjs"
		]
	},
	{
		regex: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*(?:=>|:\s*\w)/,
		langFilter: [
			".js",
			".ts",
			".jsx",
			".tsx",
			".mjs",
			".cjs"
		]
	},
	{
		regex: /^\s*(?:async\s+)?def\s+(\w+)\s*\(/,
		langFilter: [".py"]
	},
	{
		regex: /^\s*func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(([^)]*)\)/,
		langFilter: [".go"]
	},
	{
		regex: /^\s*fn\s+(\w+)\s*\(([^)]*)\)/,
		langFilter: [".rs"]
	},
	{
		regex: /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)(\w+)\s*\(([^)]*)\)/,
		langFilter: [
			".java",
			".cs",
			".cpp",
			".c",
			".php"
		]
	}
];
const countParams = (p) => p.trim() ? p.split(",").length : 0;
const matchFunctionOnLine = (line, ext) => {
	for (let i = 0; i < FUNCTION_PATTERNS.length; i++) {
		const pattern = FUNCTION_PATTERNS[i];
		if (!pattern.langFilter.includes(ext)) continue;
		const match = line.match(pattern.regex);
		if (match) return {
			name: match[1],
			params: match[2] ?? "",
			patternIndex: i
		};
	}
	return null;
};
const isDataFile = (content) => {
	const nonEmpty = content.split("\n").filter((l) => l.trim().length > 0);
	if (nonEmpty.length === 0) return false;
	const dataLinePattern = /^\s*[{}[\]"']/;
	return nonEmpty.filter((l) => dataLinePattern.test(l)).length / nonEmpty.length > .8;
};
const TEST_PATH_RE = /(?:^|\/)(?:tests?|spec|specs|__tests__|__spec__|src\/test)\//i;
const TEST_BASENAME_RE = /(?:^|[/.])(?:test_[\w-]+\.(?:py|rb)|[\w-]+_(?:test|spec)\.(?:py|rb|go|rs)|[\w-]+\.(?:test|spec)\.(?:[jt]sx?|mjs|cjs)|conftest\.py|[A-Z]\w*Tests?\.(?:java|cs|php))$/;
const MIGRATION_PATH_RE = /(?:^|\/)(?:migrations?|migrate|prisma\/migrations|db\/migrate)\//i;
const FIXTURE_PATH_RE = /(?:^|\/)(?:__fixtures__|__snapshots__|__mocks__|fixtures?|snapshots?|seeds?|stubs?)\//i;
const GENERATED_PATH_RE = /(?:^|\/)(?:generated|gen|build|dist|out|target|coverage|node_modules|vendor|\.next|\.nuxt|\.svelte-kit)\//i;
const isExemptFromComplexity = (relativePath) => TEST_PATH_RE.test(relativePath) || TEST_BASENAME_RE.test(relativePath) || MIGRATION_PATH_RE.test(relativePath) || FIXTURE_PATH_RE.test(relativePath) || GENERATED_PATH_RE.test(relativePath);
const analyzeFunctions = (content, ext) => {
	const lines = content.split("\n");
	const functions = [];
	for (let i = 0; i < lines.length; i++) {
		const fnMatch = matchFunctionOnLine(lines[i], ext);
		if (!fnMatch) continue;
		const isPython = fnMatch.patternIndex === 2;
		if (fnMatch.patternIndex === 1 && !isBlockArrow(lines, i)) continue;
		const { endLine, maxNesting } = findFunctionEnd(lines, i, isPython);
		let templateLines;
		let paramCount;
		if (isPython) {
			const sig = extractPythonSignature(lines, i);
			const codeLines = countPythonBodyCodeLines(lines, sig.sigEndIndex, endLine);
			templateLines = endLine - i + 1 - codeLines;
			paramCount = countPythonParams(sig.params);
		} else {
			templateLines = countTemplateLines(lines.slice(i + 1, endLine));
			paramCount = countParams(fnMatch.params);
		}
		functions.push({
			name: fnMatch.name,
			startLine: i + 1,
			lineCount: endLine - i + 1,
			maxNesting,
			paramCount,
			templateLines
		});
	}
	return functions;
};
const FILE_LOC_MULTIPLIERS = {
	".tsx": 1.5,
	".jsx": 1.5,
	".rs": 2.5,
	".go": 1.5
};
const DECLARATION_FILE_RE = /\.d\.ts$/i;
const fileLocBudget = (ext, relativePath, base) => {
	if (DECLARATION_FILE_RE.test(relativePath)) return Number.POSITIVE_INFINITY;
	const multiplier = FILE_LOC_MULTIPLIERS[ext] ?? 1;
	return Math.ceil(base * multiplier);
};
const checkFileDiagnostics = (relativePath, content, limits) => {
	const results = [];
	const lineCount = content.split("\n").length;
	const ext = path.extname(relativePath).toLowerCase();
	if (isDataFile(content)) return results;
	const configuredMax = fileLocBudget(ext, relativePath, limits.maxFileLoc);
	if (!Number.isFinite(configuredMax)) return results;
	if (lineCount > Math.ceil(configuredMax * 1.1)) results.push({
		filePath: relativePath,
		engine: "code-quality",
		rule: "complexity/file-too-large",
		severity: "warning",
		message: `File too large (max: ${configuredMax})`,
		help: "Consider splitting this file into smaller modules",
		line: 0,
		column: 0,
		category: "Complexity",
		fixable: false,
		detail: `${lineCount} lines`
	});
	return results;
};
const JSX_EXTENSIONS = new Set([".tsx", ".jsx"]);
const isComponentFunction = (name, ext) => JSX_EXTENSIONS.has(ext) && /^[A-Z]/.test(name);
const functionLocBudget = (fn, ext, base) => {
	if (isComponentFunction(fn.name, ext)) return Math.ceil(base * 2);
	if (ext === ".rs") return Math.ceil(base * 1.5);
	return base;
};
const checkFunctionDiagnostics = (relativePath, fn, limits, ext) => {
	const results = [];
	const fnMax = functionLocBudget(fn, ext, limits.maxFunctionLoc);
	if (fn.lineCount - fn.templateLines > Math.ceil(fnMax * 1.1)) results.push({
		filePath: relativePath,
		engine: "code-quality",
		rule: "complexity/function-too-long",
		severity: "warning",
		message: `Function too long (max: ${fnMax})`,
		help: "Consider breaking this function into smaller pieces",
		line: fn.startLine,
		column: 0,
		category: "Complexity",
		fixable: false,
		detail: `${fn.name} · ${fn.lineCount} lines`
	});
	if (fn.maxNesting > limits.maxNesting) results.push({
		filePath: relativePath,
		engine: "code-quality",
		rule: "complexity/deep-nesting",
		severity: "warning",
		message: `Function nested too deeply (max: ${limits.maxNesting})`,
		help: "Consider using early returns or extracting nested logic",
		line: fn.startLine,
		column: 0,
		category: "Complexity",
		fixable: false,
		detail: `${fn.name} · depth ${fn.maxNesting}`
	});
	if (fn.paramCount > limits.maxParams) results.push({
		filePath: relativePath,
		engine: "code-quality",
		rule: "complexity/too-many-params",
		severity: "warning",
		message: `Function has too many parameters (max: ${limits.maxParams})`,
		help: "Consider using an options object parameter",
		line: fn.startLine,
		column: 0,
		category: "Complexity",
		fixable: false,
		detail: `${fn.name} · ${fn.paramCount} params`
	});
	return results;
};
const checkFileComplexity = (filePath, rootDirectory, limits) => {
	const relativePath = path.relative(rootDirectory, filePath);
	if (isExemptFromComplexity(relativePath)) return [];
	let content;
	try {
		content = fs.readFileSync(filePath, "utf-8");
	} catch {
		return [];
	}
	const ext = path.extname(filePath).toLowerCase();
	const diagnostics = checkFileDiagnostics(relativePath, content, limits);
	for (const fn of analyzeFunctions(content, ext)) diagnostics.push(...checkFunctionDiagnostics(relativePath, fn, limits, ext));
	return diagnostics;
};
const checkComplexity = async (context) => {
	const files = getSourceFiles(context);
	const limits = context.config.quality;
	const diagnostics = [];
	for (const filePath of files) {
		if (isAutoGenerated(filePath)) continue;
		diagnostics.push(...checkFileComplexity(filePath, context.rootDirectory, limits));
	}
	return diagnostics;
};

//#endregion
//#region src/engines/code-quality/duplicate-block.ts
const WINDOW_SIZE = 10;
const MIN_DISTINCT_LINES = 7;
const SOURCE_EXTS$1 = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const MEANINGFUL_LINE = /\S/;
const normaliseLine = (line) => line.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "\"L\"").replace(/\b\d+(?:\.\d+)?\b/g, "0").replace(/\s+/g, " ").trim();
const isTrivialLine = (line) => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return true;
	if (trimmed === "{" || trimmed === "}" || trimmed === "});" || trimmed === "},") return true;
	if (trimmed.startsWith("//")) return true;
	if (trimmed.startsWith("/*") || trimmed.startsWith("*")) return true;
	return false;
};
const SVG_MARKUP_RE = /<\/?(?:svg|path|polyline|line|circle|rect|g)\b|(?:xmlns|viewBox|stroke(?:-width|-linecap|-linejoin)?|fill|fill-opacity|d|points|x1|x2|y1|y2)=/;
const DATA_LITERAL_RE = /^\s*(?:[A-Za-z_$][\w$-]*:\s*(?:["'`[{]|\d|true\b|false\b|null\b)|["'`][^"'`]*["'`],?\s*$|[{}\]],?\s*$|\),?\s*$)/;
const SUPPRESS_RE = /aislop[- ]ignore(?:-next-block|-file)?\b.*\b(?:duplicate-block|code-quality\/duplicate-block)\b/;
const FILE_SUPPRESS_RE = /aislop[- ]ignore-file\b.*\b(?:duplicate-block|code-quality\/duplicate-block)\b/;
const fileHasSuppression = (content) => FILE_SUPPRESS_RE.test(content);
const isLowSignalMarkupWindow = (lines) => {
	return lines.filter((line) => SVG_MARKUP_RE.test(line)).length >= Math.ceil(WINDOW_SIZE / 2);
};
const isLowSignalDataWindow = (lines) => {
	return lines.filter((line) => DATA_LITERAL_RE.test(line)).length >= WINDOW_SIZE - 1;
};
const findSuppressedLines = (lines) => {
	const suppressed = /* @__PURE__ */ new Set();
	for (let i = 0; i < lines.length; i++) {
		if (!SUPPRESS_RE.test(lines[i])) continue;
		let depth = 0;
		let started = false;
		for (let j = i + 1; j < lines.length; j++) {
			suppressed.add(j + 1);
			const opens = (lines[j].match(/\{/g) ?? []).length;
			const closes = (lines[j].match(/\}/g) ?? []).length;
			depth += opens - closes;
			if (opens > 0) started = true;
			if (started && depth <= 0) break;
		}
	}
	return suppressed;
};
const collectMeaningfulLines = (content) => {
	if (fileHasSuppression(content)) return [];
	const lines = content.split("\n");
	const suppressed = findSuppressedLines(lines);
	const hits = [];
	for (let i = 0; i < lines.length - WINDOW_SIZE + 1; i++) {
		if (suppressed.has(i + 1)) continue;
		const window = lines.slice(i, i + WINDOW_SIZE);
		if (window.some((l) => !MEANINGFUL_LINE.test(l))) continue;
		if (isLowSignalMarkupWindow(window)) continue;
		if (isLowSignalDataWindow(window)) continue;
		if (window.every(isTrivialLine)) continue;
		const normalised = window.map(normaliseLine);
		if (normalised.filter((n) => n.length > 0 && n !== "}" && n !== "{").length < WINDOW_SIZE - 1) continue;
		if (new Set(normalised).size < MIN_DISTINCT_LINES) continue;
		hits.push({
			startLine: i + 1,
			normalised
		});
	}
	return hits;
};
const findDuplicateBlocks = (content, relativePath) => {
	const blocks = collectMeaningfulLines(content);
	const seen = /* @__PURE__ */ new Map();
	const reports = [];
	const reportedCurrent = /* @__PURE__ */ new Set();
	for (const block of blocks) {
		const key = block.normalised.join("\n");
		const prior = seen.get(key);
		if (prior === void 0) {
			seen.set(key, block.startLine);
			continue;
		}
		if (block.startLine - prior < WINDOW_SIZE) continue;
		if (reportedCurrent.has(prior)) continue;
		const last = reports[reports.length - 1];
		if (last && block.startLine - last.currentStart < WINDOW_SIZE && prior - last.priorStart < WINDOW_SIZE) {
			last.priorEnd = Math.max(last.priorEnd, prior + WINDOW_SIZE - 1);
			last.currentEnd = Math.max(last.currentEnd, block.startLine + WINDOW_SIZE - 1);
			continue;
		}
		reportedCurrent.add(prior);
		reports.push({
			priorStart: prior,
			priorEnd: prior + WINDOW_SIZE - 1,
			currentStart: block.startLine,
			currentEnd: block.startLine + WINDOW_SIZE - 1
		});
	}
	return reports.map((r) => {
		const span = r.currentEnd - r.currentStart + 1;
		return {
			filePath: relativePath,
			engine: "code-quality",
			rule: "code-quality/duplicate-block",
			severity: "warning",
			message: "Duplicate code block — extract a shared helper",
			help: `Pull the shared logic into a function both sites can call. Keeps one version of the truth and makes future changes one-shot instead of N-shot.`,
			line: r.currentStart,
			column: 0,
			category: "Complexity",
			fixable: false,
			detail: `${span} lines duplicate block at L${r.priorStart}`
		};
	});
};
const detectDuplicateBlocks = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		const ext = path.extname(filePath).toLowerCase();
		if (!SOURCE_EXTS$1.has(ext)) continue;
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relative = path.relative(context.rootDirectory, filePath);
		diagnostics.push(...findDuplicateBlocks(content, relative));
	}
	return diagnostics;
};

//#endregion
//#region src/utils/subprocess.ts
const runSubprocess = (command, args, options = {}) => {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: {
				...process.env,
				...options.env
			},
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			windowsHide: true
		});
		const stdoutBuffers = [];
		const stderrBuffers = [];
		child.stdout?.on("data", (buffer) => stdoutBuffers.push(buffer));
		child.stderr?.on("data", (buffer) => stderrBuffers.push(buffer));
		let settled = false;
		let timer;
		const finalize = (callback) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			callback();
		};
		if (options.timeout && options.timeout > 0) {
			timer = setTimeout(() => {
				child.kill("SIGTERM");
				setTimeout(() => child.kill("SIGKILL"), 1e3).unref();
				finalize(() => reject(/* @__PURE__ */ new Error(`Command timed out after ${options.timeout}ms: ${command}`)));
			}, options.timeout);
			timer.unref();
		}
		child.once("error", (error) => finalize(() => reject(/* @__PURE__ */ new Error(`Failed to run ${command}: ${error.message}`))));
		child.once("close", (code) => {
			finalize(() => resolve({
				stdout: Buffer.concat(stdoutBuffers).toString("utf-8").trim(),
				stderr: Buffer.concat(stderrBuffers).toString("utf-8").trim(),
				exitCode: code
			}));
		});
	});
};
const isToolInstalled = async (tool) => {
	try {
		const result = await runSubprocess("which", [tool]);
		return result.exitCode === 0 && result.stdout.length > 0;
	} catch {
		return false;
	}
};

//#endregion
//#region src/engines/code-quality/knip.ts
const KNIP_MESSAGE_MAP = {
	files: "Unused file",
	dependencies: "Unused dependency",
	devDependencies: "Unused devDependency",
	unlisted: "Unlisted dependency",
	unresolved: "Unresolved import",
	binaries: "Unlisted binary",
	exports: "Unused export",
	types: "Unused type",
	duplicates: "Duplicate export"
};
const DEPENDENCY_TYPES = [
	"dependencies",
	"devDependencies",
	"unlisted",
	"unresolved",
	"binaries"
];
const isDependencyType = (type) => DEPENDENCY_TYPES.includes(type);
const getIssueItems = (fileIssue, issueType) => {
	const items = fileIssue[issueType];
	return Array.isArray(items) ? items : [];
};
const shouldIncludeIssue = (issueType, filePath) => {
	if (issueType !== "binaries") return true;
	return !filePath.replace(/\\/g, "/").includes(".github/workflows/");
};
const DEPENDENCY_HELP = {
	dependencies: "This package is listed in package.json but not imported anywhere. Remove it with `npm uninstall` or `aislop fix`.",
	devDependencies: "This package is listed in package.json but not imported anywhere. Remove it with `npm uninstall` or `aislop fix`.",
	unlisted: "This package is imported in code but not declared in package.json. Run `npm install` to add it.",
	unresolved: "This import cannot be resolved. Check for typos or missing packages.",
	binaries: "This binary is used but its package is not in package.json."
};
const collectIssues = (fileIssue, issueType, rootDir, knipCwd) => {
	const diagnostics = [];
	if (!shouldIncludeIssue(issueType, fileIssue.file)) return diagnostics;
	const issues = getIssueItems(fileIssue, issueType);
	const category = isDependencyType(issueType) ? "Dependencies" : "Dead Code";
	const severity = issueType === "unlisted" || issueType === "unresolved" ? "error" : "warning";
	const fixable = issueType === "dependencies" || issueType === "devDependencies" || issueType === "exports" || issueType === "types" || issueType === "duplicates";
	const help = DEPENDENCY_HELP[issueType] ?? "";
	for (const issue of issues) {
		const symbol = issue.name ?? issue.symbol ?? "unknown";
		const absolutePath = path.resolve(knipCwd, fileIssue.file);
		diagnostics.push({
			filePath: path.relative(rootDir, absolutePath),
			engine: "code-quality",
			rule: `knip/${issueType}`,
			severity,
			message: `${KNIP_MESSAGE_MAP[issueType]}: ${symbol}`,
			help,
			line: issue.line ?? 0,
			column: issue.col ?? 0,
			category,
			fixable
		});
	}
	return diagnostics;
};
const findMonorepoRoot = (directory) => {
	let current = directory;
	while (current !== path.dirname(current)) {
		if (fs.existsSync(path.join(current, "pnpm-workspace.yaml")) || (() => {
			const pkgPath = path.join(current, "package.json");
			if (!fs.existsSync(pkgPath)) return false;
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
			return Array.isArray(pkg.workspaces) || pkg.workspaces?.packages;
		})()) return current;
		current = path.dirname(current);
	}
	return null;
};
const KNIP_RELATIVE_BIN = path.join("node_modules", "knip", "bin", "knip.js");
const findKnipBin = (rootDirectory, monorepoRoot) => {
	const localPath = path.join(rootDirectory, KNIP_RELATIVE_BIN);
	if (fs.existsSync(localPath)) return {
		binPath: localPath,
		cwd: rootDirectory
	};
	if (monorepoRoot) {
		const monorepoPath = path.join(monorepoRoot, KNIP_RELATIVE_BIN);
		if (fs.existsSync(monorepoPath)) return {
			binPath: monorepoPath,
			cwd: monorepoRoot
		};
	}
	return null;
};
const runKnipDependencyCheck = async (rootDirectory) => {
	return (await runKnip(rootDirectory)).filter((d) => d.rule === "knip/dependencies" || d.rule === "knip/devDependencies");
};
const fixUnusedDependencies = async (rootDirectory) => {
	const diagnostics = await runKnipDependencyCheck(rootDirectory);
	if (diagnostics.length === 0) return;
	const pkgPath = path.join(rootDirectory, "package.json");
	if (!fs.existsSync(pkgPath)) return;
	const raw = fs.readFileSync(pkgPath, "utf-8");
	const pkg = JSON.parse(raw);
	const unusedDeps = /* @__PURE__ */ new Set();
	const unusedDevDeps = /* @__PURE__ */ new Set();
	for (const d of diagnostics) {
		const pkgName = d.message.replace(/^Unused (dev)?[Dd]ependency: /, "");
		if (d.rule === "knip/dependencies") unusedDeps.add(pkgName);
		if (d.rule === "knip/devDependencies") unusedDevDeps.add(pkgName);
	}
	let changed = false;
	if (pkg.dependencies) {
		for (const name of unusedDeps) if (name in pkg.dependencies) {
			delete pkg.dependencies[name];
			changed = true;
		}
	}
	if (pkg.devDependencies) {
		for (const name of unusedDevDeps) if (name in pkg.devDependencies) {
			delete pkg.devDependencies[name];
			changed = true;
		}
	}
	if (changed) fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, "	")}\n`);
};
const runKnipUnusedFiles = async (rootDirectory) => {
	return (await runKnip(rootDirectory)).filter((d) => d.rule === "knip/files");
};
const fixUnusedFiles = async (rootDirectory) => {
	const diagnostics = await runKnipUnusedFiles(rootDirectory);
	for (const d of diagnostics) {
		const absolutePath = path.resolve(rootDirectory, d.filePath);
		if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
	}
};
const runKnip = async (rootDirectory) => {
	const knipRuntime = findKnipBin(rootDirectory, findMonorepoRoot(rootDirectory));
	if (!knipRuntime) return [];
	try {
		const args = [
			knipRuntime.binPath,
			"--no-progress",
			"--reporter",
			"json",
			"--no-exit-code"
		];
		const result = await runSubprocess(process.execPath, args, {
			cwd: knipRuntime.cwd,
			timeout: 6e4,
			env: { FORCE_COLOR: "0" }
		});
		if (!result.stdout) return [];
		const parsed = JSON.parse(result.stdout);
		const diagnostics = [];
		const files = parsed.files ?? [];
		for (const unusedFile of files) diagnostics.push({
			filePath: path.relative(rootDirectory, path.resolve(knipRuntime.cwd, unusedFile)),
			engine: "code-quality",
			rule: "knip/files",
			severity: "warning",
			message: KNIP_MESSAGE_MAP.files,
			help: "This file is not imported by any other file in the project.",
			line: 0,
			column: 0,
			category: "Dead Code",
			fixable: false
		});
		const issues = parsed.issues ?? [];
		const issueTypes = [
			...DEPENDENCY_TYPES,
			"exports",
			"types",
			"duplicates"
		];
		for (const fileIssue of issues) for (const type of issueTypes) diagnostics.push(...collectIssues(fileIssue, type, rootDirectory, knipRuntime.cwd));
		return diagnostics;
	} catch {
		return [];
	}
};

//#endregion
//#region src/engines/code-quality/repeated-chained-call.ts
const METHOD_CALL_RE = /^\s*\.([A-Za-z_$][\w$]*)\s*\(/;
const CHAIN_THRESHOLD = 5;
const hasOnlyLiteralDifferences = (lines) => {
	const normalised = lines.map((l) => l.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "\"L\"").trim().replace(/;\s*$/, ""));
	return new Set(normalised).size === 1;
};
const findRepeatedChains = (content, relativePath) => {
	const diagnostics = [];
	const lines = content.split("\n");
	let i = 0;
	while (i < lines.length) {
		const match = lines[i].match(METHOD_CALL_RE);
		if (!match) {
			i += 1;
			continue;
		}
		const methodName = match[1];
		const runStart = i;
		let runEnd = i;
		while (runEnd + 1 < lines.length) {
			const next = lines[runEnd + 1].match(METHOD_CALL_RE);
			if (!next || next[1] !== methodName) break;
			runEnd += 1;
		}
		const runLength = runEnd - runStart + 1;
		if (runLength >= CHAIN_THRESHOLD && hasOnlyLiteralDifferences(lines.slice(runStart, runEnd + 1))) {
			diagnostics.push({
				filePath: relativePath,
				engine: "code-quality",
				rule: "code-quality/repeated-chained-call",
				severity: "warning",
				message: `${runLength} consecutive \`.${methodName}()\` calls that differ only in string literals. Extract a data table + loop.`,
				help: `Move the per-call args into an array and call \`.${methodName}()\` in a \`for\` loop. Keeps the registration in one place and lets you document the table once.`,
				line: runStart + 1,
				column: 0,
				category: "Complexity",
				fixable: false
			});
			i = runEnd + 1;
		} else i += 1;
	}
	return diagnostics;
};
const SOURCE_EXTS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const detectRepeatedChainedCalls = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		const ext = path.extname(filePath).toLowerCase();
		if (!SOURCE_EXTS.has(ext)) continue;
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relative = path.relative(context.rootDirectory, filePath);
		diagnostics.push(...findRepeatedChains(content, relative));
	}
	return diagnostics;
};

//#endregion
//#region src/engines/code-quality/index.ts
const codeQualityEngine = {
	name: "code-quality",
	async run(context) {
		const diagnostics = [];
		const promises = [];
		if (context.languages.includes("typescript") || context.languages.includes("javascript")) promises.push(runKnip(context.rootDirectory));
		promises.push(checkComplexity(context));
		promises.push(detectRepeatedChainedCalls(context));
		promises.push(detectDuplicateBlocks(context));
		const results = await Promise.allSettled(promises);
		for (const result of results) if (result.status === "fulfilled") diagnostics.push(...result.value);
		return {
			engine: "code-quality",
			diagnostics,
			elapsed: 0,
			skipped: false
		};
	}
};

//#endregion
//#region src/engines/format/biome.ts
const esmRequire$2 = createRequire(import.meta.url);
const resolveLocalBiomeScript = () => {
	try {
		const packageJsonPath = esmRequire$2.resolve("@biomejs/biome/package.json");
		return path.join(path.dirname(packageJsonPath), "bin", "biome");
	} catch {
		return null;
	}
};
const runBiome = async (args, rootDirectory, timeout) => {
	const localScript = resolveLocalBiomeScript();
	if (localScript) return runSubprocess(process.execPath, [localScript, ...args], {
		cwd: rootDirectory,
		timeout
	});
	return runSubprocess("biome", args, {
		cwd: rootDirectory,
		timeout
	});
};
const BIOME_EXTENSIONS = new Set([
	".js",
	".jsx",
	".ts",
	".tsx",
	".mjs",
	".cjs"
]);
const projectHasBiomeConfig = (rootDir) => {
	try {
		const biomePath = path.join(rootDir, "biome.json");
		return fs.existsSync(biomePath);
	} catch {
		return false;
	}
};
const getBiomeLineWidth = (rootDir) => {
	try {
		const biomePath = path.join(rootDir, "biome.json");
		if (!fs.existsSync(biomePath)) return 120;
		const content = fs.readFileSync(biomePath, "utf-8");
		return JSON.parse(content).formatter?.lineWidth ?? 120;
	} catch {
		return 120;
	}
};
const getBiomeTargets = (context) => getSourceFiles(context).filter((filePath) => BIOME_EXTENSIONS.has(path.extname(filePath))).filter((filePath) => fs.existsSync(filePath)).map((filePath) => path.relative(context.rootDirectory, filePath));
const projectUsesDecorators = (rootDir) => {
	try {
		const tsconfigPath = path.join(rootDir, "tsconfig.json");
		if (!fs.existsSync(tsconfigPath)) return false;
		const content = fs.readFileSync(tsconfigPath, "utf-8");
		return /experimentalDecorators.*true/i.test(content);
	} catch {
		return false;
	}
};
const runBiomeFormat = async (context) => {
	const targets = getBiomeTargets(context);
	if (targets.length === 0) return [];
	if (!projectHasBiomeConfig(context.rootDirectory)) return [];
	const args = [
		"format",
		"--reporter=json",
		`--line-width=${getBiomeLineWidth(context.rootDirectory)}`,
		...targets
	];
	try {
		const result = await runBiome(args, context.rootDirectory, 6e4);
		const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
		if (!output) return [];
		let diagnostics = parseBiomeJsonOutput(output, context.rootDirectory);
		if (projectUsesDecorators(context.rootDirectory)) diagnostics = diagnostics.filter((d) => {
			const msg = d.message.toLowerCase();
			return !msg.includes("decorator") && !msg.includes("parsing error");
		});
		return diagnostics;
	} catch {
		return [];
	}
};
const parseBiomeJsonOutput = (output, rootDir) => {
	const diagnostics = [];
	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;
		let parsed = null;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			parsed = null;
		}
		if (!parsed || !Array.isArray(parsed.diagnostics)) continue;
		for (const entry of parsed.diagnostics) {
			const rawPath = entry.location?.path;
			if (!rawPath) continue;
			const severity = "warning";
			const rawMessage = entry.message ?? "";
			const message = !rawMessage || rawMessage.toLowerCase().includes("would have printed") ? "File is not formatted correctly" : rawMessage;
			diagnostics.push({
				filePath: path.isAbsolute(rawPath) ? path.relative(rootDir, rawPath) : rawPath,
				engine: "format",
				rule: "formatting",
				severity,
				message,
				help: "Run `aislop fix` to auto-format",
				line: entry.location?.start?.line ?? 0,
				column: entry.location?.start?.column ?? 0,
				category: "Format",
				fixable: true
			});
		}
	}
	return diagnostics;
};
const fixBiomeFormat = async (context) => {
	const targets = getBiomeTargets(context);
	if (targets.length === 0) return;
	await runBiome([
		"format",
		"--write",
		`--line-width=${getBiomeLineWidth(context.rootDirectory)}`,
		...targets
	], context.rootDirectory, 6e4);
};

//#endregion
//#region src/engines/format/generic.ts
const FORMATTERS = {
	rust: {
		command: "cargo",
		checkArgs: ["fmt", "--check"],
		fixArgs: ["fmt"],
		parseOutput: (output, _rootDir) => {
			const diagnostics = [];
			const lines = output.split("\n").filter((l) => l.startsWith("Diff in"));
			for (const line of lines) {
				const match = line.match(/Diff in (.+) at line (\d+)/);
				if (match) diagnostics.push({
					filePath: match[1],
					engine: "format",
					rule: "rust-formatting",
					severity: "warning",
					message: "Rust file is not formatted correctly",
					help: "Run `aislop fix` to auto-format with rustfmt",
					line: parseInt(match[2], 10),
					column: 0,
					category: "Format",
					fixable: true
				});
			}
			return diagnostics;
		}
	},
	ruby: {
		command: "rubocop",
		checkArgs: [
			"--format",
			"json",
			"--only",
			"Layout"
		],
		fixArgs: [
			"--auto-correct",
			"--only",
			"Layout"
		],
		parseOutput: (output) => {
			try {
				const parsed = JSON.parse(output);
				const diagnostics = [];
				for (const file of parsed.files ?? []) for (const offense of file.offenses ?? []) diagnostics.push({
					filePath: file.path,
					engine: "format",
					rule: offense.cop_name ?? "ruby-formatting",
					severity: "warning",
					message: offense.message ?? "Ruby formatting issue",
					help: "Run `aislop fix` to auto-format",
					line: offense.location?.start_line ?? 0,
					column: offense.location?.start_column ?? 0,
					category: "Format",
					fixable: offense.correctable ?? false
				});
				return diagnostics;
			} catch {
				return [];
			}
		}
	},
	php: {
		command: "php-cs-fixer",
		checkArgs: [
			"fix",
			"--dry-run",
			"--format=json",
			"."
		],
		fixArgs: ["fix", "."],
		parseOutput: (output) => {
			try {
				const parsed = JSON.parse(output);
				const diagnostics = [];
				for (const file of parsed.files ?? []) diagnostics.push({
					filePath: file.name,
					engine: "format",
					rule: "php-formatting",
					severity: "warning",
					message: "PHP file is not formatted correctly",
					help: "Run `aislop fix` to auto-format",
					line: 0,
					column: 0,
					category: "Format",
					fixable: true
				});
				return diagnostics;
			} catch {
				return [];
			}
		}
	}
};
const runGenericFormatter = async (context, language) => {
	const config = FORMATTERS[language];
	if (!config) return [];
	try {
		const result = await runSubprocess(config.command, config.checkArgs, {
			cwd: context.rootDirectory,
			timeout: 6e4
		});
		const output = result.stdout || result.stderr;
		if (!output) return [];
		return config.parseOutput(output, context.rootDirectory);
	} catch {
		return [];
	}
};
const fixGenericFormatter = async (rootDirectory, language) => {
	const config = FORMATTERS[language];
	if (!config) return;
	const result = await runSubprocess(config.command, config.fixArgs, {
		cwd: rootDirectory,
		timeout: 6e4
	});
	if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `${config.command} exited with code ${result.exitCode}`);
};

//#endregion
//#region src/engines/format/gofmt.ts
const runGofmt = async (context) => {
	try {
		const result = await runSubprocess("gofmt", ["-l", context.rootDirectory], {
			cwd: context.rootDirectory,
			timeout: 6e4
		});
		if (!result.stdout) return [];
		return result.stdout.split("\n").filter((f) => f.length > 0).map((file) => ({
			filePath: path.relative(context.rootDirectory, file),
			engine: "format",
			rule: "go-formatting",
			severity: "warning",
			message: "Go file is not formatted correctly",
			help: "Run `aislop fix` to auto-format with gofmt",
			line: 0,
			column: 0,
			category: "Format",
			fixable: true
		}));
	} catch {
		return [];
	}
};
const fixGofmt = async (rootDirectory) => {
	const result = await runSubprocess("gofmt", ["-w", rootDirectory], {
		cwd: rootDirectory,
		timeout: 6e4
	});
	if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `gofmt exited with code ${result.exitCode}`);
};

//#endregion
//#region src/utils/tooling.ts
const THIS_FILE = fileURLToPath(import.meta.url);
createRequire(import.meta.url);
const resolvePackageRoot = (startFile) => {
	let current = path.dirname(startFile);
	while (true) {
		const packageJsonPath = path.join(current, "package.json");
		if (fs.existsSync(packageJsonPath)) try {
			if (JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")).name === "aislop") return current;
		} catch {}
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return path.resolve(path.dirname(startFile), "..", "..");
};
const PACKAGE_ROOT = resolvePackageRoot(THIS_FILE);
const TOOLS_BIN_DIR = path.join(PACKAGE_ROOT, "tools", "bin");
const BUNDLED_TOOL_NAMES = new Set(["ruff", "golangci-lint"]);
const withExecutableExtension = (toolName) => process.platform === "win32" ? `${toolName}.exe` : toolName;
const getBundledToolPath = (toolName) => {
	if (!BUNDLED_TOOL_NAMES.has(toolName)) return null;
	const candidate = path.join(TOOLS_BIN_DIR, withExecutableExtension(toolName));
	return fs.existsSync(candidate) ? candidate : null;
};
const resolveToolBinary = (toolName) => getBundledToolPath(toolName) ?? toolName;
const isBundledTool = (toolName) => getBundledToolPath(toolName) !== null;
const isToolAvailable = async (toolName) => {
	if (isBundledTool(toolName)) return true;
	return isToolInstalled(toolName);
};

//#endregion
//#region src/engines/python-targets.ts
const PYTHON_EXTENSIONS = new Set([".py", ".pyi"]);
const normalizeProjectPath = (filePath) => filePath.split(path.sep).join("/");
const getPythonTargets = (context) => {
	const targets = (context.files ?? getSourceFiles(context)).filter((filePath) => PYTHON_EXTENSIONS.has(path.extname(filePath).toLowerCase())).map((filePath) => {
		const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(context.rootDirectory, filePath);
		return normalizeProjectPath(path.relative(context.rootDirectory, absolutePath));
	}).filter((filePath) => filePath.length > 0 && !filePath.startsWith(".."));
	return [...new Set(targets)];
};
const getRuffDiagnosticPath = (rootDirectory, filePath) => {
	const normalizedPath = filePath.replace(/^a\//, "");
	return normalizeProjectPath(path.isAbsolute(normalizedPath) ? path.relative(rootDirectory, normalizedPath) : normalizedPath);
};

//#endregion
//#region src/engines/format/ruff-format.ts
const runRuffFormat = async (context) => {
	const ruffBinary = resolveToolBinary("ruff");
	const targets = getPythonTargets(context);
	if (targets.length === 0) return [];
	try {
		const result = await runSubprocess(ruffBinary, [
			"format",
			"--check",
			"--diff",
			...targets
		], {
			cwd: context.rootDirectory,
			timeout: 6e4
		});
		if (result.exitCode === 0) return [];
		return parseRuffFormatOutput(result.stdout || result.stderr, context.rootDirectory);
	} catch {
		return [];
	}
};
const parseRuffFormatOutput = (output, rootDir) => {
	const diagnostics = [];
	for (const match of output.matchAll(/^--- (.+)$/gm)) {
		const filePath = getRuffDiagnosticPath(rootDir, match[1]);
		diagnostics.push({
			filePath,
			engine: "format",
			rule: "python-formatting",
			severity: "warning",
			message: "Python file is not formatted correctly",
			help: "Run `aislop fix` to auto-format with ruff",
			line: 0,
			column: 0,
			category: "Format",
			fixable: true
		});
	}
	return diagnostics;
};
const fixRuffFormat = async (rootDirectory) => {
	const result = await runSubprocess(resolveToolBinary("ruff"), ["format", rootDirectory], {
		cwd: rootDirectory,
		timeout: 6e4
	});
	if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `ruff format exited with code ${result.exitCode}`);
};

//#endregion
//#region src/engines/format/index.ts
const formatEngine = {
	name: "format",
	async run(context) {
		const diagnostics = [];
		const { languages, installedTools } = context;
		const promises = [];
		if (languages.includes("typescript") || languages.includes("javascript")) promises.push(runBiomeFormat(context));
		if (languages.includes("python") && installedTools.ruff) promises.push(runRuffFormat(context));
		if (languages.includes("go") && installedTools.gofmt) promises.push(runGofmt(context));
		if (languages.includes("rust") && installedTools.rustfmt) promises.push(runGenericFormatter(context, "rust"));
		if (languages.includes("ruby") && installedTools.rubocop) promises.push(runGenericFormatter(context, "ruby"));
		if (languages.includes("php") && installedTools["php-cs-fixer"]) promises.push(runGenericFormatter(context, "php"));
		const results = await Promise.allSettled(promises);
		for (const result of results) if (result.status === "fulfilled") diagnostics.push(...result.value);
		return {
			engine: "format",
			diagnostics,
			elapsed: 0,
			skipped: false
		};
	}
};

//#endregion
//#region src/engines/lint/generic.ts
var generic_exports = /* @__PURE__ */ __exportAll({
	fixRubyLint: () => fixRubyLint,
	runGenericLinter: () => runGenericLinter
});
const runGenericLinter = async (context, language) => {
	switch (language) {
		case "rust": return runClippy(context);
		case "ruby": return runRubocop(context);
		default: return [];
	}
};
const fixRubyLint = async (rootDirectory) => {
	const result = await runSubprocess("rubocop", [
		"-a",
		"--except",
		"Layout"
	], {
		cwd: rootDirectory,
		timeout: 6e4
	});
	if (result.exitCode !== null && result.exitCode > 1) throw new Error(result.stderr || result.stdout || `rubocop exited with code ${result.exitCode}`);
};
const runClippy = async (context) => {
	try {
		return parseClippyDiagnostics((await runSubprocess("cargo", [
			"clippy",
			"--message-format=json",
			"--quiet"
		], {
			cwd: context.rootDirectory,
			timeout: 12e4
		})).stdout);
	} catch {
		return [];
	}
};
const parseClippyEntry = (line) => {
	if (!line.startsWith("{")) return null;
	try {
		return JSON.parse(line);
	} catch {
		return null;
	}
};
const toClippyDiagnostic = (entry) => {
	if (entry.reason !== "compiler-message" || !entry.message) return null;
	const message = entry.message;
	const span = message.spans?.[0];
	return {
		filePath: span?.file_name ?? "",
		engine: "lint",
		rule: `clippy/${message.code?.code ?? "unknown"}`,
		severity: message.level === "error" ? "error" : "warning",
		message: message.message ?? "",
		help: message.children?.[0]?.message ?? "",
		line: span?.line_start ?? 0,
		column: span?.column_start ?? 0,
		category: "Rust Lint",
		fixable: false
	};
};
const parseClippyDiagnostics = (output) => {
	const diagnostics = [];
	for (const line of output.split("\n")) {
		const entry = parseClippyEntry(line);
		if (!entry) continue;
		const diagnostic = toClippyDiagnostic(entry);
		if (diagnostic) diagnostics.push(diagnostic);
	}
	return diagnostics;
};
const runRubocop = async (context) => {
	try {
		const output = (await runSubprocess("rubocop", [
			"--format",
			"json",
			"--except",
			"Layout"
		], {
			cwd: context.rootDirectory,
			timeout: 6e4
		})).stdout;
		if (!output) return [];
		const parsed = JSON.parse(output);
		const diagnostics = [];
		for (const file of parsed.files ?? []) for (const offense of file.offenses ?? []) diagnostics.push({
			filePath: file.path,
			engine: "lint",
			rule: `rubocop/${offense.cop_name}`,
			severity: offense.severity === "error" || offense.severity === "fatal" ? "error" : "warning",
			message: offense.message,
			help: "",
			line: offense.location?.start_line ?? 0,
			column: offense.location?.start_column ?? 0,
			category: "Ruby Lint",
			fixable: offense.correctable ?? false
		});
		return diagnostics;
	} catch {
		return [];
	}
};

//#endregion
//#region src/engines/lint/golangci.ts
const runGolangciLint = async (context) => {
	const golangciBinary = resolveToolBinary("golangci-lint");
	try {
		const output = (await runSubprocess(golangciBinary, [
			"run",
			"--out-format=json",
			"./..."
		], {
			cwd: context.rootDirectory,
			timeout: 12e4
		})).stdout;
		if (!output) return [];
		let parsed;
		try {
			parsed = JSON.parse(output);
		} catch {
			return [];
		}
		return (parsed.Issues ?? []).map((issue) => ({
			filePath: path.relative(context.rootDirectory, issue.Pos.Filename),
			engine: "lint",
			rule: `go/${issue.FromLinter}`,
			severity: "warning",
			message: issue.Text,
			help: "",
			line: issue.Pos.Line,
			column: issue.Pos.Column,
			category: "Go Lint",
			fixable: false
		}));
	} catch {
		return [];
	}
};

//#endregion
//#region src/engines/code-quality/unused-var-rename-ast.ts
const getLineOfIdentifier = (sourceFile, node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
/**
* Walk the AST and collect every Identifier whose text matches `name` and
* whose line is within ±1 of `targetLine`.
*/
const findCandidateIdentifiers = (sourceFile, name, targetLine) => {
	const matches = [];
	const visit = (n) => {
		if (ts.isIdentifier(n) && n.text === name) {
			const line = getLineOfIdentifier(sourceFile, n);
			if (Math.abs(line - targetLine) <= 1) matches.push(n);
		}
		ts.forEachChild(n, visit);
	};
	visit(sourceFile);
	return matches;
};
const classifyBindingElement = (identifier, bindingElement) => {
	const pattern = bindingElement.parent;
	if (bindingElement.dotDotDotToken !== void 0 && bindingElement.name === identifier) return {
		kind: "restElement",
		identifier
	};
	if (ts.isObjectBindingPattern(pattern)) {
		if (bindingElement.propertyName !== void 0 && bindingElement.name === identifier) return {
			kind: "aliasedDestructure",
			identifier
		};
		if (bindingElement.propertyName === void 0 && bindingElement.name === identifier) return {
			kind: "shorthandDestructure",
			identifier
		};
	}
	if (ts.isArrayBindingPattern(pattern) && bindingElement.name === identifier) return {
		kind: "arrayBindingElement",
		identifier
	};
	return {
		kind: "unsupported",
		reason: "binding element context not supported"
	};
};
const classifyIdentifier = (identifier) => {
	const parent = identifier.parent;
	if (ts.isParameter(parent) && parent.name === identifier) return {
		kind: "positionalParameter",
		identifier
	};
	if (ts.isBindingElement(parent)) return classifyBindingElement(identifier, parent);
	if (ts.isVariableDeclaration(parent) && parent.parent && ts.isCatchClause(parent.parent) && parent.name === identifier) return {
		kind: "catchParameter",
		identifier
	};
	if (ts.isVariableDeclaration(parent) && parent.name === identifier) return {
		kind: "variableDeclaration",
		identifier
	};
	return {
		kind: "unsupported",
		reason: "identifier context not supported"
	};
};
const renameIdentifierInPlace = (sourceFile, identifier) => {
	const name = identifier.text;
	if (name.startsWith("_")) return {
		edit: null,
		skipReason: "already prefixed"
	};
	return { edit: {
		start: identifier.getStart(sourceFile),
		end: identifier.getEnd(),
		replacement: `_${name}`
	} };
};
const shorthandToAliased = (sourceFile, identifier) => {
	const name = identifier.text;
	if (name.startsWith("_")) return {
		edit: null,
		skipReason: "already prefixed"
	};
	return { edit: {
		start: identifier.getStart(sourceFile),
		end: identifier.getEnd(),
		replacement: `${name}: _${name}`
	} };
};
const computeEdit = (sourceFile, shape) => {
	switch (shape.kind) {
		case "unsupported": return {
			edit: null,
			skipReason: shape.reason
		};
		case "positionalParameter":
		case "catchParameter":
		case "restElement":
		case "arrayBindingElement": return renameIdentifierInPlace(sourceFile, shape.identifier);
		case "shorthandDestructure": return shorthandToAliased(sourceFile, shape.identifier);
		case "aliasedDestructure": return renameIdentifierInPlace(sourceFile, shape.identifier);
		case "variableDeclaration": return {
			edit: null,
			skipReason: "unused variable binding outside parameter/destructure"
		};
	}
};

//#endregion
//#region src/engines/code-quality/unused-var-rename.ts
const hasSyntaxDiagnostics$1 = (filePath, content) => {
	const diagnostics = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics;
	return Array.isArray(diagnostics) && diagnostics.length > 0;
};
const pickBestCandidate = (sourceFile, candidates, target) => {
	let best = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const c of candidates) {
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(c.getStart(sourceFile));
		const oneBasedCol = character + 1;
		const distance = Math.abs(line + 1 - target.line) * 1e3 + Math.abs(oneBasedCol - target.column);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = c;
		}
	}
	return best;
};
const applyEditsDescending = (content, edits) => {
	const ordered = [...edits].sort((a, b) => b.start - a.start);
	let output = content;
	for (const e of ordered) output = output.slice(0, e.start) + e.replacement + output.slice(e.end);
	return output;
};
const processFile = (filePath, fileTargets, result) => {
	if (!fs.existsSync(filePath)) {
		for (const t of fileTargets) result.skipped.push({
			target: t,
			reason: "file not found"
		});
		return;
	}
	const original = fs.readFileSync(filePath, "utf-8");
	const originalHadSyntaxErrors = hasSyntaxDiagnostics$1(filePath, original);
	const sourceFile = ts.createSourceFile(filePath, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
	const edits = [];
	const pendingSkips = [];
	const seenRanges = /* @__PURE__ */ new Set();
	for (const target of fileTargets) {
		const candidates = findCandidateIdentifiers(sourceFile, target.name, target.line);
		if (candidates.length === 0) {
			pendingSkips.push({
				target,
				reason: "target node not found"
			});
			continue;
		}
		const best = pickBestCandidate(sourceFile, candidates, target);
		if (!best) {
			pendingSkips.push({
				target,
				reason: "target node not found"
			});
			continue;
		}
		const { edit, skipReason } = computeEdit(sourceFile, classifyIdentifier(best));
		if (!edit) {
			pendingSkips.push({
				target,
				reason: skipReason ?? "unable to compute edit"
			});
			continue;
		}
		const rangeKey = `${edit.start}:${edit.end}`;
		if (seenRanges.has(rangeKey)) continue;
		seenRanges.add(rangeKey);
		edits.push(edit);
	}
	if (edits.length === 0) {
		for (const s of pendingSkips) result.skipped.push(s);
		return;
	}
	const updated = applyEditsDescending(original, edits);
	if (updated === original) {
		for (const s of pendingSkips) result.skipped.push(s);
		return;
	}
	if (!originalHadSyntaxErrors && hasSyntaxDiagnostics$1(filePath, updated)) {
		for (const t of fileTargets) if (!pendingSkips.some((p) => p.target === t)) result.skipped.push({
			target: t,
			reason: "rename would break file syntax"
		});
		for (const s of pendingSkips) result.skipped.push(s);
		return;
	}
	fs.writeFileSync(filePath, updated);
	result.renamed += edits.length;
	for (const s of pendingSkips) result.skipped.push(s);
};
const prefixUnusedVars = (rootDirectory, targets) => {
	const result = {
		renamed: 0,
		skipped: []
	};
	const byFile = /* @__PURE__ */ new Map();
	for (const t of targets) {
		const absolute = path.isAbsolute(t.filePath) ? t.filePath : path.join(rootDirectory, t.filePath);
		const arr = byFile.get(absolute) ?? [];
		arr.push({
			...t,
			filePath: absolute
		});
		byFile.set(absolute, arr);
	}
	for (const [filePath, fileTargets] of byFile) processFile(filePath, fileTargets, result);
	return result;
};

//#endregion
//#region src/engines/lint/oxlint-config.ts
const buildBaseRules = () => ({
	"no-unused-vars": "warn",
	"no-undef": "error",
	"no-constant-condition": "warn",
	"no-control-regex": "off",
	"no-debugger": "warn",
	"no-empty": "warn",
	"no-extra-boolean-cast": "warn",
	"no-irregular-whitespace": "warn",
	"no-loss-of-precision": "error",
	"import/no-duplicates": "warn",
	"unicorn/no-unnecessary-await": "warn"
});
const hasReact = (framework) => framework === "react" || framework === "nextjs" || framework === "vite" || framework === "remix";
const buildFrameworkPlugins = (framework) => {
	const extra = [];
	if (hasReact(framework)) extra.push("react", "react-hooks", "jsx-a11y");
	if (framework === "nextjs") extra.push("nextjs");
	return extra;
};
const buildReactRules = () => ({
	"react/no-direct-mutation-state": "error",
	"react-hooks/rules-of-hooks": "error",
	"react-hooks/exhaustive-deps": "warn"
});
const TEST_GLOBALS_COMMON = [
	"describe",
	"it",
	"expect",
	"test",
	"beforeAll",
	"afterAll",
	"beforeEach",
	"afterEach"
];
const buildTestGlobals = (testFramework) => {
	const globals = {};
	const setAll = (names) => {
		for (const name of names) globals[name] = "readonly";
	};
	if (testFramework === "jest") {
		setAll(TEST_GLOBALS_COMMON);
		globals.jest = "readonly";
	} else if (testFramework === "vitest") {
		setAll(TEST_GLOBALS_COMMON);
		globals.vi = "readonly";
	} else if (testFramework === "mocha") setAll([
		"describe",
		"it",
		"before",
		"after",
		"beforeEach",
		"afterEach"
	]);
	return globals;
};
const createOxlintConfig = (options) => {
	const rules = buildBaseRules();
	if (hasReact(options.framework)) Object.assign(rules, buildReactRules());
	if (options.mode === "fix") {
		rules["no-unused-vars"] = "off";
		rules["react-hooks/exhaustive-deps"] = "off";
		rules["jsx-a11y/no-aria-hidden-on-focusable"] = "off";
		rules["unicorn/no-useless-fallback-in-spread"] = "off";
	}
	const plugins = [
		"import",
		"unicorn",
		"typescript",
		...buildFrameworkPlugins(options.framework)
	];
	const globals = buildTestGlobals(options.testFramework ?? null);
	for (const name of [
		"__DEV__",
		"__TEST__",
		"__BROWSER__",
		"__NODE__",
		"__GLOBAL__",
		"__SSR__",
		"__ESM_BROWSER__",
		"__ESM_BUNDLER__",
		"__VERSION__",
		"__COMMIT__",
		"__BUILD__"
	]) globals[name] = "readonly";
	for (const globalName of options.globals ?? []) globals[globalName] = "readonly";
	if (options.framework === "astro") {
		globals.Astro = "readonly";
		rules["no-undef"] = "off";
		rules["no-unused-expressions"] = "off";
	}
	return {
		plugins,
		rules,
		env: {
			browser: true,
			node: true,
			es2022: true
		},
		globals,
		settings: {}
	};
};

//#endregion
//#region src/engines/lint/oxlint-context-filters.ts
const AMBIENT_GLOBAL_DEPS = [
	"unplugin-icons",
	"@types/bun",
	"bun-types"
];
const SST_PLATFORM_REF_RE = /\/\/\/\s*<reference\s+path=["'][^"']*sst[\\/]+platform[\\/]+config\.d\.ts["']/;
const ICON_AUTOIMPORT_RE = /^Icon[A-Z]/;
const NO_UNDEF_IDENT_RE = /^['‘"`]([^'’"`]+)['’"`]/;
const SUPABASE_FUNCTION_PATH_RE = /(?:^|\/)supabase\/functions\/[^/]+\/.+\.[cm]?[jt]sx?$/;
const detectAmbientSources = (rootDir) => {
	const found = /* @__PURE__ */ new Set();
	const skipDirs = new Set([
		"node_modules",
		".git",
		"dist",
		"build",
		"out",
		"target",
		"coverage",
		".next",
		".turbo"
	]);
	const walk = (dir, depth) => {
		if (depth > 4 || found.size === AMBIENT_GLOBAL_DEPS.length) return;
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (found.size === AMBIENT_GLOBAL_DEPS.length) return;
			if (entry.name.startsWith(".") && entry.name !== ".github") continue;
			if (skipDirs.has(entry.name)) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full, depth + 1);
			else if (entry.name === "package.json") try {
				const pkg = JSON.parse(fs.readFileSync(full, "utf-8"));
				const allDeps = {
					...pkg.dependencies ?? {},
					...pkg.devDependencies ?? {},
					...pkg.peerDependencies ?? {}
				};
				for (const dep of AMBIENT_GLOBAL_DEPS) if (dep in allDeps) found.add(dep);
			} catch {}
		}
	};
	walk(rootDir, 0);
	return found;
};
const extractNoUndefIdentifier = (message) => {
	return NO_UNDEF_IDENT_RE.exec(message)?.[1] ?? null;
};
const looksLikeChromeExtensionManifest = (filePath) => {
	try {
		const manifest = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		return typeof manifest.manifest_version === "number" && ("background" in manifest || "content_scripts" in manifest || "permissions" in manifest);
	} catch {
		return false;
	}
};
const chromeExtensionFileCache = /* @__PURE__ */ new Map();
const isChromeExtensionFile = (rootDir, relativeFilePath) => {
	const cacheKey = `${rootDir}:${relativeFilePath.split(path.sep).join("/")}`;
	const cached = chromeExtensionFileCache.get(cacheKey);
	if (cached !== void 0) return cached;
	const absolute = path.isAbsolute(relativeFilePath) ? relativeFilePath : path.join(rootDir, relativeFilePath);
	const root = path.resolve(rootDir);
	let dir = path.dirname(path.resolve(absolute));
	let matched = false;
	while (true) {
		const relativeToRoot = path.relative(root, dir);
		if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) break;
		if (looksLikeChromeExtensionManifest(path.join(dir, "manifest.json"))) {
			matched = true;
			break;
		}
		if (dir === root) break;
		dir = path.dirname(dir);
	}
	chromeExtensionFileCache.set(cacheKey, matched);
	return matched;
};
const isAmbientFalsePositive = (rule, message, sources) => {
	if (rule !== "eslint/no-undef") return false;
	const ident = extractNoUndefIdentifier(message);
	if (!ident) return false;
	if (sources.has("unplugin-icons") && ICON_AUTOIMPORT_RE.test(ident)) return true;
	if ((sources.has("@types/bun") || sources.has("bun-types")) && ident === "Bun") return true;
	return false;
};
const isRuntimeGlobalFalsePositive = (rule, message, rootDir, relativeFilePath) => {
	if (rule !== "eslint/no-undef") return false;
	const ident = extractNoUndefIdentifier(message);
	if (!ident) return false;
	const normalized = relativeFilePath.split(path.sep).join("/");
	if (ident === "Deno" && SUPABASE_FUNCTION_PATH_RE.test(normalized)) return true;
	if (ident === "chrome" && isChromeExtensionFile(rootDir, relativeFilePath)) return true;
	return false;
};
const sstReferencedFiles = /* @__PURE__ */ new Map();
const clearSstReferenceCache = () => {
	sstReferencedFiles.clear();
	chromeExtensionFileCache.clear();
};
const fileReferencesSstPlatform = (rootDir, relativeFilePath) => {
	const cached = sstReferencedFiles.get(relativeFilePath);
	if (cached !== void 0) return cached;
	const absolute = path.isAbsolute(relativeFilePath) ? relativeFilePath : path.join(rootDir, relativeFilePath);
	let referenced = false;
	try {
		const fd = fs.openSync(absolute, "r");
		try {
			const buf = Buffer.alloc(512);
			const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
			referenced = SST_PLATFORM_REF_RE.test(buf.toString("utf-8", 0, bytesRead));
		} finally {
			fs.closeSync(fd);
		}
	} catch {
		referenced = false;
	}
	sstReferencedFiles.set(relativeFilePath, referenced);
	return referenced;
};

//#endregion
//#region src/engines/lint/oxlint-globals.ts
const readTextFile$1 = (filePath) => {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
};
const collectPackageNames = (dir) => {
	const names = /* @__PURE__ */ new Set();
	const raw = readTextFile$1(path.join(dir, "package.json"));
	if (!raw) return names;
	try {
		const pkg = JSON.parse(raw);
		for (const section of [
			"dependencies",
			"devDependencies",
			"peerDependencies",
			"optionalDependencies"
		]) {
			const deps = pkg[section];
			if (deps && typeof deps === "object") for (const name of Object.keys(deps)) names.add(name);
		}
	} catch {
		return names;
	}
	return names;
};
const readJson = (filePath) => {
	const raw = readTextFile$1(filePath);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
};
const hasBunRuntime = (rootDir, projectFiles) => {
	if (fs.existsSync(path.join(rootDir, "bun.lock")) || fs.existsSync(path.join(rootDir, "bun.lockb")) || fs.existsSync(path.join(rootDir, "bunfig.toml"))) return true;
	const hasBunFiles = projectFiles.some((filePath) => /(?:^|\/)bunfig\.toml$|(?:^|\/)bun\.lockb?$/.test(filePath));
	const pkg = readJson(path.join(rootDir, "package.json"));
	if (!pkg) return hasBunFiles;
	if (typeof pkg.packageManager === "string" && /^bun@/i.test(pkg.packageManager)) return true;
	const scripts = pkg.scripts;
	if (scripts && typeof scripts === "object") {
		for (const command of Object.values(scripts)) if (typeof command === "string" && /(?:^|[;&|()\s])bunx?\s/.test(command)) return true;
	}
	return hasBunFiles;
};
const hasDenoRuntime = (rootDir, projectFiles) => {
	if (fs.existsSync(path.join(rootDir, "deno.json")) || fs.existsSync(path.join(rootDir, "deno.jsonc"))) return true;
	return projectFiles.some((filePath) => /(?:^|\/)deno\.jsonc?$/.test(filePath));
};
const AMBIENT_GLOBAL_RE = /^\s*(?:declare\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
const collectAmbientGlobals = (rootDir) => {
	const globals = /* @__PURE__ */ new Set();
	const projectFiles = listProjectFiles(rootDir);
	for (const relativePath of projectFiles) {
		if (!relativePath.endsWith(".d.ts")) continue;
		const content = readTextFile$1(path.join(rootDir, relativePath));
		if (!content) continue;
		for (const match of content.matchAll(AMBIENT_GLOBAL_RE)) globals.add(match[1]);
	}
	const deps = collectPackageNames(rootDir);
	if (deps.has("@types/bun") || deps.has("bun-types") || hasBunRuntime(rootDir, projectFiles)) globals.add("Bun");
	if (hasDenoRuntime(rootDir, projectFiles)) globals.add("Deno");
	if (projectFiles.some((filePath) => /(?:^|\/)sst\.config\.ts$/.test(filePath))) for (const name of [
		"$app",
		"$config",
		"$dev",
		"$interpolate",
		"$resolve",
		"$jsonParse",
		"$jsonStringify",
		"aws",
		"cloudflare",
		"docker",
		"random",
		"sst",
		"vercel",
		"pulumi"
	]) globals.add(name);
	return [...globals];
};

//#endregion
//#region src/engines/lint/oxlint.ts
const esmRequire$1 = createRequire(import.meta.url);
const OXLINT_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const resolveOxlintBinary = () => {
	try {
		const oxlintMainPath = esmRequire$1.resolve("oxlint");
		const oxlintDir = path.resolve(path.dirname(oxlintMainPath), "..");
		return path.join(oxlintDir, "bin", "oxlint");
	} catch {
		return "oxlint";
	}
};
const VITE_QUERY_RE = /["'][^"']*\?(worker|sharedworker|worker-url|url|raw|inline|init)\b/;
const isViteVirtualImportFalsePositive = (rule, message) => rule.startsWith("import/") && VITE_QUERY_RE.test(message);
const UNUSED_VAR_IDENT_RE = /(?:Variable|Parameter|Catch parameter) '([^']+)' (?:is declared but never used|is caught but never used)/;
const isUnderscoreUnusedVar = (rule, message) => {
	if (rule !== "eslint/no-unused-vars") return false;
	const match = UNUSED_VAR_IDENT_RE.exec(message);
	return match ? match[1].startsWith("_") : false;
};
const readTextFile = (filePath) => {
	try {
		return fs.readFileSync(filePath, "utf-8");
	} catch {
		return null;
	}
};
const isSolidRefFalsePositive = (context, diagnostic) => {
	if (diagnostic.rule !== "eslint/no-unassigned-vars") return false;
	const name = diagnostic.message.match(/^'([^']+)' is always 'undefined'/)?.[1];
	if (!name) return false;
	const content = readTextFile(path.isAbsolute(diagnostic.filePath) ? diagnostic.filePath : path.join(context.rootDirectory, diagnostic.filePath));
	if (!content) return false;
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\bref=\\{\\s*${escaped}\\s*\\}`).test(content);
};
const isContextualTypeScriptFalsePositive = (diagnostic) => diagnostic.rule === "typescript-eslint/triple-slash-reference" && (diagnostic.filePath.endsWith(".d.ts") || /(?:^|\/)sst\.config\.ts$/.test(diagnostic.filePath));
const parseRuleCode = (code) => {
	if (!code) return {
		plugin: "eslint",
		rule: "syntax-error"
	};
	const match = code.match(/^(.+)\((.+)\)$/);
	if (!match) return {
		plugin: "eslint",
		rule: code
	};
	return {
		plugin: match[1].replace(/^eslint-plugin-/, ""),
		rule: match[2]
	};
};
const detectTestFramework = (rootDir) => {
	try {
		const raw = fs.readFileSync(path.join(rootDir, "package.json"), "utf-8");
		const pkg = JSON.parse(raw);
		const allDeps = {
			...pkg.dependencies,
			...pkg.devDependencies
		};
		if (allDeps.vitest) return "vitest";
		if (allDeps.jest || allDeps["ts-jest"] || allDeps["@jest/core"]) return "jest";
		if (allDeps.mocha) return "mocha";
		if (fs.existsSync(path.join(rootDir, "jest.config.js")) || fs.existsSync(path.join(rootDir, "jest.config.ts")) || fs.existsSync(path.join(rootDir, "jest.config.mjs"))) return "jest";
		if (fs.existsSync(path.join(rootDir, "vitest.config.ts")) || fs.existsSync(path.join(rootDir, "vitest.config.js"))) return "vitest";
		if (fs.existsSync(path.join(rootDir, ".mocharc.yml"))) return "mocha";
	} catch {}
	return null;
};
const getOxlintTargets = (context) => getSourceFiles(context).filter((filePath) => OXLINT_EXTENSIONS.has(path.extname(filePath).toLowerCase())).filter((filePath) => !isAutoGenerated(filePath)).map((filePath) => path.relative(context.rootDirectory, filePath).split(path.sep).join("/"));
const extractUnusedVarName = (message) => {
	const variableMatch = message.match(/Variable '([^']+)' is declared but never used/);
	if (variableMatch?.[1]) return {
		name: variableMatch[1],
		type: "variable"
	};
	const paramMatch = message.match(/Parameter '([^']+)' is declared but never used/);
	if (paramMatch?.[1]) return {
		name: paramMatch[1],
		type: "parameter"
	};
	const catchMatch = message.match(/Catch parameter '([^']+)' is caught but never used/);
	if (catchMatch?.[1]) return {
		name: catchMatch[1],
		type: "parameter"
	};
	return null;
};
const collectUnusedVarCandidates = (diagnostics) => diagnostics.filter((d) => d.rule === "eslint/no-unused-vars").map((d) => {
	const extracted = extractUnusedVarName(d.message);
	if (!extracted || extracted.name.startsWith("_")) return null;
	return {
		filePath: d.filePath,
		line: d.line,
		column: d.column,
		name: extracted.name,
		type: extracted.type
	};
}).filter((candidate) => candidate !== null);
const removeDuplicateKeyLines = (rootDirectory, diagnostics) => {
	const byFile = /* @__PURE__ */ new Map();
	for (const d of diagnostics) {
		const keyMatch = d.message.match(/Duplicate key '([^']+)'/);
		if (!keyMatch) continue;
		const absolute = path.isAbsolute(d.filePath) ? d.filePath : path.join(rootDirectory, d.filePath);
		const entries = byFile.get(absolute) ?? [];
		entries.push({
			key: keyMatch[1],
			line: d.line
		});
		byFile.set(absolute, entries);
	}
	for (const [filePath, dupes] of byFile) {
		if (!fs.existsSync(filePath)) continue;
		const lines = fs.readFileSync(filePath, "utf-8").split("\n");
		const toRemove = /* @__PURE__ */ new Set();
		for (const { key } of dupes) {
			const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const keyPattern = new RegExp(`^\\s*['"]?${escaped}['"]?\\s*:|^\\s*${escaped}\\s*:`);
			const matches = [];
			for (let i = 0; i < lines.length; i++) if (keyPattern.test(lines[i])) matches.push(i);
			for (let j = 1; j < matches.length; j++) toRemove.add(matches[j]);
		}
		if (toRemove.size === 0) continue;
		const filtered = lines.filter((_, i) => !toRemove.has(i));
		fs.writeFileSync(filePath, filtered.join("\n"));
	}
};
const toDiagnostic = (d) => {
	const { plugin, rule } = parseRuleCode(d.code);
	const label = d.labels[0];
	return {
		filePath: d.filename,
		engine: "lint",
		rule: `${plugin}/${rule}`,
		severity: d.severity,
		message: d.message.replace(/\S+\.\w+:\d+:\d+[\s\S]*$/, "").trim() || d.message,
		help: d.help || "",
		line: label?.span.line ?? 0,
		column: label?.span.column ?? 0,
		category: plugin === "react" ? "React" : plugin === "import" ? "Imports" : "Lint",
		fixable: false
	};
};
const shouldKeepOxlintDiagnostic = (context, ambientSources, seen, d) => {
	const relativePath = path.isAbsolute(d.filePath) ? path.relative(context.rootDirectory, d.filePath) : d.filePath;
	if (isExcludedFromScan(relativePath)) return false;
	if (isViteVirtualImportFalsePositive(d.rule, d.message)) return false;
	if (isAmbientFalsePositive(d.rule, d.message, ambientSources)) return false;
	if (isRuntimeGlobalFalsePositive(d.rule, d.message, context.rootDirectory, relativePath)) return false;
	if (isSolidRefFalsePositive(context, d)) return false;
	if (isContextualTypeScriptFalsePositive(d)) return false;
	if (isUnderscoreUnusedVar(d.rule, d.message)) return false;
	if (d.rule === "eslint/no-undef" && fileReferencesSstPlatform(context.rootDirectory, d.filePath)) return false;
	const key = `${d.filePath}:${d.line}:${d.rule}:${d.message}`;
	if (seen.has(key)) return false;
	seen.add(key);
	return true;
};
const runOxlint = async (context) => {
	const configPath = path.join(os.tmpdir(), `aislop-oxlintrc-${process.pid}.json`);
	const framework = context.frameworks.find((f) => f !== "none");
	const testFramework = detectTestFramework(context.rootDirectory);
	const targets = getOxlintTargets(context);
	if (targets.length === 0) return [];
	const config = createOxlintConfig({
		framework,
		testFramework,
		globals: collectAmbientGlobals(context.rootDirectory)
	});
	const ambientSources = detectAmbientSources(context.rootDirectory);
	clearSstReferenceCache();
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		const args = [
			resolveOxlintBinary(),
			"-c",
			configPath,
			"--format",
			"json"
		];
		if (context.languages.includes("typescript") && fs.existsSync(path.join(context.rootDirectory, "tsconfig.json"))) args.push("--tsconfig", "./tsconfig.json");
		args.push(...targets);
		const result = await runSubprocess(process.execPath, args, {
			cwd: context.rootDirectory,
			timeout: 12e4
		});
		if (!result.stdout) return [];
		let output;
		try {
			output = JSON.parse(result.stdout);
		} catch {
			return [];
		}
		const seen = /* @__PURE__ */ new Set();
		return output.diagnostics.map(toDiagnostic).filter((d) => shouldKeepOxlintDiagnostic(context, ambientSources, seen, d));
	} finally {
		if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
	}
};
const fixOxlint = async (context, options = {}) => {
	const dangerous = options.force ?? false;
	const configPath = path.join(os.tmpdir(), `aislop-oxlintrc-fix-${process.pid}.json`);
	const framework = context.frameworks.find((f) => f !== "none");
	const testFramework = detectTestFramework(context.rootDirectory);
	const targets = getOxlintTargets(context);
	if (targets.length === 0) return;
	const config = createOxlintConfig({
		framework,
		testFramework,
		mode: "fix",
		globals: collectAmbientGlobals(context.rootDirectory)
	});
	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		const binary = resolveOxlintBinary();
		const args = dangerous ? [
			binary,
			"-c",
			configPath,
			"--fix",
			"--fix-suggestions",
			"--fix-dangerously",
			...targets
		] : [
			binary,
			"-c",
			configPath,
			"--fix",
			...targets
		];
		const result = await runSubprocess(process.execPath, args, {
			cwd: context.rootDirectory,
			timeout: 12e4
		});
		if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `Oxlint exited with code ${result.exitCode}`);
		const remaining = await runOxlint(context);
		const candidates = collectUnusedVarCandidates(remaining);
		if (candidates.length > 0) {
			const targets = candidates.map((c) => ({
				filePath: path.isAbsolute(c.filePath) ? c.filePath : path.join(context.rootDirectory, c.filePath),
				line: c.line,
				column: c.column,
				name: c.name,
				type: c.type
			}));
			prefixUnusedVars(context.rootDirectory, targets);
		}
		const duplicateKeys = remaining.filter((d) => d.message.startsWith("Duplicate key"));
		if (duplicateKeys.length > 0) removeDuplicateKeyLines(context.rootDirectory, duplicateKeys);
	} finally {
		if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
	}
};

//#endregion
//#region src/engines/lint/ruff.ts
const runRuffLint = async (context) => {
	const ruffBinary = resolveToolBinary("ruff");
	const targets = getPythonTargets(context);
	if (targets.length === 0) return [];
	try {
		const output = (await runSubprocess(ruffBinary, [
			"check",
			"--output-format=json",
			...targets
		], {
			cwd: context.rootDirectory,
			timeout: 6e4
		})).stdout;
		if (!output) return [];
		return JSON.parse(output).map((d) => ({
			filePath: getRuffDiagnosticPath(context.rootDirectory, d.filename),
			engine: "lint",
			rule: `ruff/${d.code}`,
			severity: d.code.startsWith("E") || d.code.startsWith("F") ? "error" : "warning",
			message: d.message,
			help: "",
			line: d.location.row,
			column: d.location.column,
			category: "Python Lint",
			fixable: d.fix?.applicability === "safe"
		}));
	} catch {
		return [];
	}
};
const fixRuffLint = async (rootDirectory) => {
	const result = await runSubprocess(resolveToolBinary("ruff"), [
		"check",
		"--fix",
		rootDirectory
	], {
		cwd: rootDirectory,
		timeout: 6e4
	});
	if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `ruff check --fix exited with code ${result.exitCode}`);
};
const fixRuffLintForce = async (rootDirectory) => {
	const result = await runSubprocess(resolveToolBinary("ruff"), [
		"check",
		"--fix",
		"--unsafe-fixes",
		rootDirectory
	], {
		cwd: rootDirectory,
		timeout: 6e4
	});
	if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout || `ruff check --fix exited with code ${result.exitCode}`);
};

//#endregion
//#region src/engines/lint/index.ts
const lintEngine = {
	name: "lint",
	async run(context) {
		const diagnostics = [];
		const { languages, installedTools } = context;
		const promises = [];
		if (languages.includes("typescript") || languages.includes("javascript")) {
			promises.push(runOxlint(context));
			if (context.config.lint.typecheck) promises.push(import("./typecheck-yOGXIIGU.js").then((mod) => mod.runTypecheck(context)));
		}
		if (context.frameworks.includes("expo")) promises.push(Promise.resolve().then(() => expo_doctor_exports).then((mod) => mod.runExpoDoctor(context)));
		if (languages.includes("python") && installedTools.ruff) promises.push(runRuffLint(context));
		if (languages.includes("go") && installedTools["golangci-lint"]) promises.push(runGolangciLint(context));
		if (languages.includes("rust") && installedTools.cargo) promises.push(runGenericLinter(context, "rust"));
		if (languages.includes("ruby") && installedTools.rubocop) promises.push(runGenericLinter(context, "ruby"));
		const results = await Promise.allSettled(promises);
		for (const result of results) if (result.status === "fulfilled") diagnostics.push(...result.value);
		return {
			engine: "lint",
			diagnostics,
			elapsed: 0,
			skipped: false
		};
	}
};

//#endregion
//#region src/ui/invocation.ts
const detectInvocation = () => "aislop";

//#endregion
//#region src/engines/security/audit.ts
const withFixHint = (rest) => {
	return `Run \`${detectInvocation()} fix -f\` to apply this fix${rest ? ` — ${rest}` : ""}`;
};
const runDependencyAudit = async (context) => {
	const diagnostics = [];
	const timeout = context.config.security.auditTimeout;
	const promises = [];
	if (context.languages.includes("typescript") || context.languages.includes("javascript")) {
		if (fs.existsSync(path.join(context.rootDirectory, "pnpm-lock.yaml"))) promises.push(runPnpmAuditWithFallback(context.rootDirectory, timeout));
		else if (fs.existsSync(path.join(context.rootDirectory, "package-lock.json")) || fs.existsSync(path.join(context.rootDirectory, "package.json"))) promises.push(runNpmAudit(context.rootDirectory, timeout));
	}
	if (context.languages.includes("python") && context.installedTools["pip-audit"]) promises.push(runPipAudit(context.rootDirectory, timeout));
	if (context.languages.includes("go") && context.installedTools.govulncheck) promises.push(runGovulncheck(context.rootDirectory, timeout));
	if (context.languages.includes("rust")) promises.push(runCargoAudit(context.rootDirectory, timeout));
	const results = await Promise.allSettled(promises);
	for (const result of results) if (result.status === "fulfilled") diagnostics.push(...result.value);
	return diagnostics;
};
const runNpmAudit = async (rootDir, timeout) => {
	try {
		return parseJsAudit((await runSubprocess("npm", ["audit", "--json"], {
			cwd: rootDir,
			timeout
		})).stdout, "npm audit");
	} catch {
		return [];
	}
};
const runPnpmAuditWithFallback = async (rootDir, timeout) => {
	const canFallbackToNpm = fs.existsSync(path.join(rootDir, "package-lock.json"));
	try {
		const diagnostics = parseJsAudit((await runSubprocess("pnpm", ["audit", "--json"], {
			cwd: rootDir,
			timeout
		})).stdout, "pnpm audit");
		if (diagnostics.some((d) => d.rule === "security/dependency-audit-skipped")) {
			if (canFallbackToNpm) return runNpmAudit(rootDir, timeout);
			return [];
		}
		return diagnostics;
	} catch {
		if (canFallbackToNpm) return runNpmAudit(rootDir, timeout);
		return [];
	}
};
const SEVERITY_RANK = {
	critical: 4,
	high: 3,
	moderate: 2,
	low: 1
};
const toSeverity = (value) => value === "critical" || value === "high" ? "error" : "warning";
const upsertVuln = (bucket, packageName, severity, recommendation) => {
	const existing = bucket.get(packageName);
	if (existing) {
		existing.advisories++;
		if ((SEVERITY_RANK[severity] ?? 0) > (SEVERITY_RANK[existing.worstSeverity] ?? 0)) existing.worstSeverity = severity;
		if (recommendation) existing.recommendations.add(recommendation);
	} else bucket.set(packageName, {
		packageName,
		worstSeverity: severity,
		advisories: 1,
		recommendations: recommendation ? new Set([recommendation]) : /* @__PURE__ */ new Set()
	});
};
const SEMVER_RE = /(\d+)\.(\d+)\.(\d+)/;
const cmpSemver = (a, b) => {
	const [, a1, a2, a3] = SEMVER_RE.exec(a) ?? [
		"",
		"0",
		"0",
		"0"
	];
	const [, b1, b2, b3] = SEMVER_RE.exec(b) ?? [
		"",
		"0",
		"0",
		"0"
	];
	if (Number(a1) !== Number(b1)) return Number(a1) - Number(b1);
	if (Number(a2) !== Number(b2)) return Number(a2) - Number(b2);
	return Number(a3) - Number(b3);
};
const pickBestRecommendation = (recs) => {
	if (recs.length <= 1) return recs[0] ?? "";
	const versioned = recs.filter((r) => SEMVER_RE.test(r));
	if (versioned.length === 0) return recs[0];
	return versioned.reduce((best, r) => cmpSemver(r, best) > 0 ? r : best);
};
const cleanRecommendation = (raw) => {
	const t = raw.trim();
	if (!t || t.toLowerCase() === "none") return "no fix available";
	return t;
};
const aggregateToDiagnostic = (agg, source) => {
	const best = cleanRecommendation(pickBestRecommendation([...agg.recommendations]));
	const countLabel = agg.advisories > 1 ? ` (${agg.advisories} advisories)` : "";
	const recLabel = best ? ` — ${best}` : "";
	return {
		filePath: "package.json",
		engine: "security",
		rule: "security/vulnerable-dependency",
		severity: toSeverity(agg.worstSeverity),
		message: `${agg.packageName} (${agg.worstSeverity})${recLabel}${countLabel}`,
		help: "",
		line: 0,
		column: 0,
		category: "Security",
		fixable: false,
		detail: source === "npm audit" ? "npm" : "pnpm"
	};
};
const parseLegacyAdvisories = (advisories, source) => {
	const bucket = /* @__PURE__ */ new Map();
	for (const [key, advisory] of Object.entries(advisories)) upsertVuln(bucket, advisory.module_name ?? advisory.name ?? advisory.package ?? key, (advisory.severity ?? "moderate").toLowerCase(), advisory.recommendation ?? advisory.title ?? "");
	return [...bucket.values()].map((agg) => aggregateToDiagnostic(agg, source));
};
const carriesAdvisory = (vulnerability) => Array.isArray(vulnerability.via) && vulnerability.via.some((entry) => entry !== null && typeof entry === "object");
const parseModernVulnerabilities = (vulnerabilities, source) => {
	const bucket = /* @__PURE__ */ new Map();
	const hasRootCauses = Object.values(vulnerabilities).some(carriesAdvisory);
	for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
		if (hasRootCauses && !carriesAdvisory(vulnerability)) continue;
		const severity = (vulnerability.severity ?? "moderate").toLowerCase();
		const fixAvailable = vulnerability.fixAvailable;
		const isDirect = vulnerability.isDirect === true;
		let recommendation = "";
		if (fixAvailable === false) recommendation = isDirect ? "no automatic fix" : "transitive — needs override or parent upgrade";
		else if (!isDirect && fixAvailable === true) recommendation = "transitive — may need override or parent upgrade";
		else if (fixAvailable && typeof fixAvailable === "object" && "name" in fixAvailable && "version" in fixAvailable) {
			const target = fixAvailable;
			if (target.name && target.version) recommendation = `upgrade to ${target.name}@${target.version}`;
		}
		upsertVuln(bucket, packageName, severity, recommendation);
	}
	return [...bucket.values()].map((agg) => aggregateToDiagnostic(agg, source));
};
const parseJsAudit = (output, source) => {
	if (!output) return [];
	try {
		const parsed = JSON.parse(output);
		const error = parsed.error;
		if (error?.code === "ENOLOCK") return [{
			filePath: "package.json",
			engine: "security",
			rule: "security/dependency-audit-skipped",
			severity: "info",
			message: `Dependency audit skipped (${source}): lockfile is missing`,
			help: error.detail ?? "Generate a lockfile, then re-run `aislop scan` for dependency vulnerability checks.",
			line: 0,
			column: 0,
			category: "Security",
			fixable: false
		}];
		if (error?.summary || error?.code) return [{
			filePath: "package.json",
			engine: "security",
			rule: "security/dependency-audit-skipped",
			severity: "info",
			message: `Dependency audit did not complete (${source})`,
			help: error.detail ?? error.summary ?? "Re-run dependency audit directly to inspect the underlying error.",
			line: 0,
			column: 0,
			category: "Security",
			fixable: false
		}];
		const advisories = parsed.advisories;
		if (advisories && typeof advisories === "object") return parseLegacyAdvisories(advisories, source);
		const vulnerabilities = parsed.vulnerabilities;
		if (vulnerabilities && typeof vulnerabilities === "object") return parseModernVulnerabilities(vulnerabilities, source);
		return [];
	} catch {
		return [];
	}
};
const runPipAudit = async (rootDir, timeout) => {
	try {
		const result = await runSubprocess("pip-audit", ["--format=json"], {
			cwd: rootDir,
			timeout
		});
		if (!result.stdout) return [];
		return (JSON.parse(result.stdout).dependencies ?? []).filter((d) => Array.isArray(d.vulns) && d.vulns.length > 0).map((d) => ({
			filePath: "requirements.txt",
			engine: "security",
			rule: "security/vulnerable-dependency",
			severity: "error",
			message: `Vulnerable Python dependency: ${d.name}`,
			help: withFixHint(`Upgrade ${d.name} to fix known vulnerabilities`),
			line: 0,
			column: 0,
			category: "Security",
			fixable: false
		}));
	} catch {
		return [];
	}
};
const runGovulncheck = async (rootDir, timeout) => {
	try {
		const result = await runSubprocess("govulncheck", ["-json", "./..."], {
			cwd: rootDir,
			timeout
		});
		if (!result.stdout) return [];
		return parseGovulncheckOutput(result.stdout);
	} catch {
		return [];
	}
};
const toGovulnDiagnostic = (entry) => {
	if (!entry.vulnerability) return null;
	return {
		filePath: "go.mod",
		engine: "security",
		rule: "security/vulnerable-dependency",
		severity: "error",
		message: `Go vulnerability: ${entry.vulnerability.id ?? "unknown"}`,
		help: withFixHint(entry.vulnerability.details ?? ""),
		line: 0,
		column: 0,
		category: "Security",
		fixable: false
	};
};
const parseGovulncheckOutput = (output) => {
	const diagnostics = [];
	for (const line of output.split("\n")) {
		if (!line.startsWith("{")) continue;
		let parsed = null;
		try {
			parsed = JSON.parse(line);
		} catch {
			parsed = null;
		}
		if (!parsed) continue;
		const diagnostic = toGovulnDiagnostic(parsed);
		if (diagnostic) diagnostics.push(diagnostic);
	}
	return diagnostics;
};
const runCargoAudit = async (rootDir, timeout) => {
	try {
		const result = await runSubprocess("cargo", ["audit", "--json"], {
			cwd: rootDir,
			timeout
		});
		if (!result.stdout) return [];
		return (JSON.parse(result.stdout).vulnerabilities?.list ?? []).map((v) => ({
			filePath: "Cargo.toml",
			engine: "security",
			rule: "security/vulnerable-dependency",
			severity: "error",
			message: `Rust vulnerability: ${v.advisory?.id ?? "unknown"}`,
			help: withFixHint(v.advisory?.title ?? ""),
			line: 0,
			column: 0,
			category: "Security",
			fixable: false
		}));
	} catch {
		return [];
	}
};

//#endregion
//#region src/engines/security/html-safety.ts
const SAFE_EMPTY_INNER_HTML_RE = /^\.innerHTML\s*=\s*(?:""|''|``)\s*;?/;
const SAFE_SANITIZED_INNER_HTML_RE = /^\.innerHTML\s*=\s*(?:escapeHtml|sanitizeHtml|sanitizeHTML|DOMPurify\.sanitize)\s*\([^;\n]*\)\s*;?(?:\n|$)/;
const SANITIZER_EXPR_RE = /^(?:escapeHtml|escapeHTML|sanitizeHtml|sanitizeHTML|DOMPurify\.sanitize)\s*\([^;\n]*\)$/;
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
const STATIC_STRING_RE = /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\$])*`)$/;
const NUMERICISH_EXPR_RE = /^(?:[-+]?\d+(?:\.\d+)?|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*\|\|\s*[-+]?\d+(?:\.\d+)?)?)$/;
const NUMERICISH_NAME_RE = /(?:^|\.)(?:count|length|size|width|height|top|right|bottom|left|duration|elapsed|timestamp|time|ms|port|pid|attempt|attempts|index|total|x|y)$|(?:count|length|size|width|height|duration|elapsed|timestamp|time|port|pid|attempt|index|total)$/i;
const SAFE_FORMAT_CALL_RE = /^(?:format[A-Z]\w*|fmt[A-Z]?\w*)\s*\((.*)\)$/;
const consumeQuotedLiteral = (content, startIndex, quote) => {
	let i = startIndex + 1;
	while (i < content.length) {
		const char = content[i];
		if (char === "\\") {
			i += 2;
			continue;
		}
		if (char === quote) return { endIndex: i };
		if (char === "\n") return null;
		i++;
	}
	return null;
};
const consumeTemplateLiteral = (content, startIndex) => {
	const openIndex = content.indexOf("`", startIndex);
	if (openIndex === -1) return null;
	let i = openIndex + 1;
	while (i < content.length) {
		const char = content[i];
		if (char === "\\") {
			i += 2;
			continue;
		}
		if (char === "`") return {
			body: content.slice(openIndex + 1, i),
			endIndex: i
		};
		i++;
	}
	return null;
};
const assignmentTailIsClosed = (content, endIndex) => /^\s*(?:;[^\n]*)?(?:\n|$)/.test(content.slice(endIndex + 1));
const assignmentRhsStart = (content, matchIndex) => {
	const match = /^\.innerHTML\s*=\s*/.exec(content.slice(matchIndex));
	return match ? matchIndex + match[0].length : null;
};
const templateExpressions = (templateBody) => [...templateBody.matchAll(/\$\{\s*([^}]+?)\s*\}/g)].map((match) => match[1].trim());
const staticTernaryRe = /^\s*[^?]+\?\s*(?:"[^"]*"|'[^']*'|`[^`$]*`)\s*:\s*(?:"[^"]*"|'[^']*'|`[^`$]*`)\s*$/;
const splitTopLevelTernary = (expr) => {
	let quote = null;
	let depth = 0;
	let question = -1;
	let colon = -1;
	for (let i = 0; i < expr.length; i++) {
		const char = expr[i];
		if (char === "\\") {
			i++;
			continue;
		}
		if ((char === "'" || char === "\"" || char === "`") && quote === null) {
			quote = char;
			continue;
		}
		if (char === quote) {
			quote = null;
			continue;
		}
		if (quote) continue;
		if (char === "(" || char === "[" || char === "{") depth++;
		else if (char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);
		else if (char === "?" && depth === 0 && question === -1) question = i;
		else if (char === ":" && depth === 0 && question !== -1) {
			colon = i;
			break;
		}
	}
	if (question === -1 || colon === -1) return null;
	return {
		whenTrue: expr.slice(question + 1, colon).trim(),
		whenFalse: expr.slice(colon + 1).trim()
	};
};
const isNumericishExpression = (expr) => {
	const normalized = expr.trim();
	if (/^(?:Math\.\w+|Number|parseInt|parseFloat)\s*\(/.test(normalized)) return true;
	if (!NUMERICISH_EXPR_RE.test(normalized)) return false;
	return /\d/.test(normalized) || NUMERICISH_NAME_RE.test(normalized);
};
const isSafeTemplateLiteralExpression = (expr, safeNames) => {
	if (!expr.startsWith("`") || !expr.endsWith("`")) return false;
	return templateExpressions(expr.slice(1, -1)).every((part) => isSafeHtmlExpression(part, safeNames));
};
const collectSafeHtmlNames = (content, matchIndex) => {
	const safeNames = /* @__PURE__ */ new Set();
	const prefix = content.slice(Math.max(0, matchIndex - 8e3), matchIndex);
	for (const rawLine of prefix.split("\n")) {
		const line = rawLine.trim();
		let match = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;?$/.exec(line);
		if (match) {
			const [, name, expr] = match;
			if (isSafeHtmlExpression(expr.trim(), safeNames)) safeNames.add(name);
			else safeNames.delete(name);
			continue;
		}
		match = /^([A-Za-z_$][\w$]*)\s*\+=\s*(.+?)\s*;?$/.exec(line);
		if (match) {
			const [, name, expr] = match;
			if (safeNames.has(name) && isSafeHtmlExpression(expr.trim(), safeNames)) safeNames.add(name);
			else safeNames.delete(name);
			continue;
		}
		match = /^([A-Za-z_$][\w$]*)\s*=\s*(.+?)\s*;?$/.exec(line);
		if (match) {
			const [, name, expr] = match;
			if (isSafeHtmlExpression(expr.trim(), safeNames)) safeNames.add(name);
			else safeNames.delete(name);
		}
	}
	return safeNames;
};
const isSafeHtmlExpression = (expr, safeNames) => {
	const normalized = expr.trim();
	if (SANITIZER_EXPR_RE.test(normalized)) return true;
	if (STATIC_STRING_RE.test(normalized)) return true;
	if (staticTernaryRe.test(expr)) return true;
	if (isNumericishExpression(normalized)) return true;
	if (IDENT_RE.test(normalized) && safeNames.has(normalized)) return true;
	if (isSafeTemplateLiteralExpression(normalized, safeNames)) return true;
	const ternary = splitTopLevelTernary(normalized);
	if (ternary && isSafeHtmlExpression(ternary.whenTrue, safeNames) && isSafeHtmlExpression(ternary.whenFalse, safeNames)) return true;
	const formatCall = SAFE_FORMAT_CALL_RE.exec(normalized);
	if (formatCall) return formatCall[1].split(",").map((arg) => arg.trim()).filter((arg) => arg.length > 0).every((arg) => isNumericishExpression(arg) || IDENT_RE.test(arg) && safeNames.has(arg));
	return false;
};
const readSingleLineRhs = (content, rhsStart) => {
	const lineEnd = content.indexOf("\n", rhsStart);
	const line = content.slice(rhsStart, lineEnd === -1 ? content.length : lineEnd);
	let quote = null;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === "\\") {
			i++;
			continue;
		}
		if ((char === "'" || char === "\"" || char === "`") && quote === null) {
			quote = char;
			continue;
		}
		if (char === quote) {
			quote = null;
			continue;
		}
		if (char === ";" && quote === null) return line.slice(0, i).trim();
	}
	return line.trim();
};
const isSafeMapJoinHtmlAssignment = (content, rhsStart) => {
	const head = content.slice(rhsStart);
	const mapMatch = /^[A-Za-z_$][\w$.]*\.map\(\s*[A-Za-z_$][\w$]*\s*=>\s*`/.exec(head);
	if (!mapMatch) return false;
	const template = consumeTemplateLiteral(content, rhsStart + mapMatch[0].length - 1);
	if (!template) return false;
	if (!/^\s*\)\.join\(\s*(?:""|'')\s*\)/.test(content.slice(template.endIndex + 1))) return false;
	const safeNames = collectSafeHtmlNames(content, rhsStart);
	return templateExpressions(template.body).every((expr) => isSafeHtmlExpression(expr, safeNames));
};
const isSafeInnerHtmlAssignment = (content, matchIndex) => {
	const tail = content.slice(matchIndex);
	if (SAFE_EMPTY_INNER_HTML_RE.test(tail) || SAFE_SANITIZED_INNER_HTML_RE.test(tail)) return true;
	const rhsStart = assignmentRhsStart(content, matchIndex);
	if (rhsStart === null) return false;
	const first = content[rhsStart];
	const safeNames = collectSafeHtmlNames(content, matchIndex);
	if (isSafeHtmlExpression(readSingleLineRhs(content, rhsStart), safeNames)) return true;
	if (isSafeMapJoinHtmlAssignment(content, rhsStart)) return true;
	if (first === "'" || first === "\"") {
		const quoted = consumeQuotedLiteral(content, rhsStart, first);
		return Boolean(quoted && assignmentTailIsClosed(content, quoted.endIndex));
	}
	if (first !== "`") return false;
	const template = consumeTemplateLiteral(content, rhsStart);
	if (!template || !assignmentTailIsClosed(content, template.endIndex)) return false;
	const expressions = templateExpressions(template.body);
	if (expressions.length === 0) return true;
	return expressions.every((expr) => isSafeHtmlExpression(expr, safeNames));
};

//#endregion
//#region src/engines/security/risky.ts
const ev = "eval";
const Fn = "Function";
const DB_RECEIVER = "(?:db|database|knex|client|connection|conn|pool|sql|prisma|trx|tx|sequelize|mongoose|typeorm|postgres|pg|mysql|sqlite|model|orm|datasource)";
const DB_METHOD = "(?:query|execute|exec|raw|\\$queryRaw|\\$queryRawUnsafe|\\$executeRaw|\\$executeRawUnsafe)";
const RISKY_PATTERNS = [
	{
		pattern: new RegExp(`(?<![\\w.>:\\\\])\\b${ev}\\s*\\(`, "g"),
		extensions: [
			".ts",
			".tsx",
			".js",
			".jsx",
			".mjs",
			".cjs",
			".py",
			".rb",
			".php"
		],
		name: "eval",
		message: `Use of ${ev}() is a security risk`,
		help: `Avoid ${ev} — use safer alternatives like JSON.parse, Function constructor, or AST-based approaches`
	},
	{
		pattern: new RegExp(`new\\s+${Fn}\\s*\\(`, "g"),
		extensions: [
			".ts",
			".tsx",
			".js",
			".jsx",
			".mjs",
			".cjs"
		],
		name: "new-function",
		message: `Use of new ${Fn}() is similar to ${ev} and can be a security risk`,
		help: "Avoid dynamic code execution — refactor to use static code paths"
	},
	{
		pattern: new RegExp(`\\.innerHTML\\s*=`, "g"),
		extensions: [
			".ts",
			".tsx",
			".js",
			".jsx"
		],
		name: "innerhtml",
		message: "Direct innerHTML assignment can lead to XSS",
		help: "Use textContent, DOM APIs, or a sanitization library instead"
	},
	{
		pattern: /dangerouslySetInnerHTML/g,
		extensions: [".tsx", ".jsx"],
		name: "dangerously-set-innerhtml",
		message: "dangerouslySetInnerHTML can lead to XSS if not sanitized",
		help: "Ensure the HTML is sanitized with DOMPurify or similar before rendering"
	},
	{
		pattern: /pickle\.loads?\s*\(/g,
		extensions: [".py"],
		name: "pickle-load",
		message: "pickle.load can execute arbitrary code — unsafe deserialization",
		help: "Use JSON, MessagePack, or other safe serialization formats for untrusted data"
	},
	{
		pattern: new RegExp(`(?<![\\w.>:\\\\])\\bexec\\s*\\(`, "g"),
		extensions: [".py"],
		name: "python-exec",
		message: "Use of exec() can execute arbitrary code",
		help: "Avoid exec — use safer alternatives"
	},
	{
		pattern: /(?:child_process|subprocess|os\.system|exec|spawn)\s*\([^)]*\$\{/g,
		extensions: [
			".ts",
			".tsx",
			".js",
			".jsx",
			".mjs",
			".cjs",
			".py"
		],
		name: "shell-injection",
		message: "Possible shell injection — user input in command execution",
		help: "Use parameterized commands or a safe shell execution library"
	},
	{
		pattern: new RegExp(`\\b${DB_RECEIVER}(?:\\.\\w+)*\\.${DB_METHOD}\\s*\\(?\\s*\`[^\`]*\\$\\{`, "g"),
		extensions: [
			".ts",
			".tsx",
			".js",
			".jsx",
			".mjs",
			".cjs"
		],
		name: "sql-injection",
		message: "Possible SQL injection — template literal in query",
		help: "Use parameterized queries or an ORM instead of string interpolation"
	},
	{
		pattern: new RegExp(`\\b${DB_RECEIVER}(?:\\.\\w+)*\\.${DB_METHOD}\\s*\\(\\s*["'][^"']*["']\\s*\\+`, "g"),
		extensions: [
			".ts",
			".tsx",
			".js",
			".jsx",
			".mjs",
			".cjs"
		],
		name: "sql-injection",
		message: "Possible SQL injection — string concatenation in query",
		help: "Use parameterized queries or an ORM instead of string concatenation"
	}
];
const hasDangerouslySetInnerHtmlIgnore = (lines, lineIndex) => {
	const start = Math.max(0, lineIndex - 2);
	return lines.slice(start, lineIndex + 1).some((line) => /(?:biome-ignore|eslint-disable|aislop-ignore).*(?:noDangerouslySetInnerHtml|dangerouslySetInnerHTML|dangerously-set-innerhtml)/i.test(line));
};
const isStructuredDataScript = (content, matchIndex) => {
	const before = content.slice(Math.max(0, matchIndex - 300), matchIndex);
	if (/type=["']application\/ld\+json["']/.test(before)) return true;
	const after = content.slice(matchIndex, Math.min(content.length, matchIndex + 180));
	return /__html\s*:\s*JSON\.stringify\s*\(/.test(after);
};
const isSafeShellSpawnArray = (content, matchIndex) => /^spawn\s*\(\s*\[/.test(content.slice(matchIndex)) && !/^\s*spawn\s*\(\s*\[\s*["'](?:sh|bash|zsh|cmd|cmd\.exe|powershell|pwsh)["']\s*,\s*["'](?:-c|\/c|\/C)["']/i.test(content.slice(matchIndex)) && !/shell\s*:\s*true\b/.test(content.slice(matchIndex, matchIndex + 500));
const PLACEHOLDER_EXPR_RE = /^(?:placeholders?|placeholderList|bindMarkers?|bindingMarkers?|bindPlaceholders?|bindingPlaceholders?|parameterPlaceholders?|sqlPlaceholders?)(?:\.\w+\([^)]*\))?$/i;
const SQL_PLACEHOLDER_LITERAL_RE = /["'](?:\?|\$\d+|\$\{[^}]+\})["']/;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isGeneratedPlaceholderList = (content, matchIndex, placeholderExpr) => {
	const name = placeholderExpr.match(/^([A-Za-z_$][\w$]*)/)?.[1];
	if (!name) return false;
	const prefix = content.slice(Math.max(0, matchIndex - 4e3), matchIndex);
	const declarationRe = new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(name)}\\s*=\\s*([^;\\n]+)`, "g");
	const declaration = [...prefix.matchAll(declarationRe)].at(-1);
	if (!declaration) return false;
	const expr = declaration[1];
	if (!/\.join\s*\(/.test(expr)) return false;
	return /\.map\s*\(/.test(expr) && /=>/.test(expr) && SQL_PLACEHOLDER_LITERAL_RE.test(expr) || /\.fill\s*\(/.test(expr) && SQL_PLACEHOLDER_LITERAL_RE.test(expr);
};
const isSafeSqlPlaceholderTemplate = (content, matchIndex) => {
	const template = consumeTemplateLiteral(content, matchIndex);
	if (!template) return false;
	const afterTemplate = content.slice(template.endIndex + 1);
	if (!(/^\s*,/.test(afterTemplate) || /^\s*\)\s*\.(?:all|get|run|values)\s*\(/.test(afterTemplate))) return false;
	const expressions = [...template.body.matchAll(/\$\{\s*([^}]+?)\s*\}/g)].map((match) => match[1].trim());
	if (expressions.length === 0) return false;
	return expressions.every((expr) => PLACEHOLDER_EXPR_RE.test(expr) && isGeneratedPlaceholderList(content, matchIndex, expr));
};
const detectRiskyConstructs = async (context) => {
	const files = getSourceFiles(context);
	const diagnostics = [];
	for (const filePath of files) {
		const ext = path.extname(filePath);
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const relativePath = path.relative(context.rootDirectory, filePath);
		const normalizedPath = relativePath.split(path.sep).join("/");
		const isMigrationOrSeeder = /(?:^|\/)(migrations|seeders|seeds|migrate)\//.test(normalizedPath);
		const masked = maskStringsAndComments(content, ext);
		const lines = content.split("\n");
		for (const { pattern, extensions, name, message, help } of RISKY_PATTERNS) {
			if (!extensions.includes(ext)) continue;
			if (isMigrationOrSeeder && name === "sql-injection") continue;
			const regex = new RegExp(pattern.source, pattern.flags);
			for (const match of masked.matchAll(regex)) {
				const line = content.slice(0, match.index).split("\n").length;
				if (name === "innerhtml") {
					const beforeMatch = content.slice(Math.max(0, match.index - 200), match.index);
					if (isSafeInnerHtmlAssignment(content, match.index)) continue;
					if (/(?:template|tmpl|tpl)$/i.test(beforeMatch.trimEnd()) || /createElement\s*\(\s*['"]template['"]\s*\)$/.test(beforeMatch.trimEnd())) continue;
				}
				if (name === "sql-injection" && isSafeSqlPlaceholderTemplate(content, match.index)) continue;
				if (name === "shell-injection" && isSafeShellSpawnArray(content, match.index)) continue;
				if (name === "dangerously-set-innerhtml") {
					if (hasDangerouslySetInnerHtmlIgnore(lines, line - 1)) continue;
					if (isStructuredDataScript(content, match.index)) continue;
				}
				diagnostics.push({
					filePath: relativePath,
					engine: "security",
					rule: `security/${name}`,
					severity: "error",
					message,
					help,
					line,
					column: 0,
					category: "Security",
					fixable: false
				});
			}
		}
	}
	return diagnostics;
};

//#endregion
//#region src/engines/security/secrets.ts
const SECRET_PATTERNS = [
	{
		pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([A-Za-z0-9_-]{20,})["']/gi,
		name: "API key",
		keywordPrefixed: true
	},
	{
		pattern: /AKIA[0-9A-Z]{16}/g,
		name: "AWS Access Key"
	},
	{
		pattern: /(?:aws[_-]?secret|secret[_-]?key)\s*[:=]\s*["']([A-Za-z0-9/+=]{40})["']/gi,
		name: "AWS Secret Key",
		keywordPrefixed: true
	},
	{
		pattern: /(?:password|passwd|pwd|secret)\s*[:=]\s*["']([^"']{8,})["']/gi,
		name: "Hardcoded password/secret",
		keywordPrefixed: true
	},
	{
		pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
		name: "Private key"
	},
	{
		pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
		name: "JWT token"
	},
	{
		pattern: /(?:token|bearer)\s*[:=]\s*["']([A-Za-z0-9_-]{20,})["']/gi,
		name: "Authentication token",
		keywordPrefixed: true
	},
	{
		pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
		name: "GitHub token"
	},
	{
		pattern: /xox[baprs]-[A-Za-z0-9-]+/g,
		name: "Slack token"
	},
	{
		pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^"'\s]+:[^"'\s]+@/gi,
		name: "Database connection string with credentials"
	}
];
const isInsideStringLiteral = (content, matchIndex) => {
	const lineStart = content.lastIndexOf("\n", matchIndex - 1) + 1;
	const prefix = content.slice(lineStart, matchIndex);
	let inDouble = false;
	let inSingle = false;
	let inBacktick = false;
	for (let i = 0; i < prefix.length; i++) {
		const ch = prefix[i];
		if (ch === "\\") {
			i++;
			continue;
		}
		if (ch === "\"" && !inSingle && !inBacktick) inDouble = !inDouble;
		else if (ch === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
		else if (ch === "`" && !inDouble && !inSingle) inBacktick = !inBacktick;
	}
	return inDouble || inSingle || inBacktick;
};
const PLACEHOLDER_EXACT = new Set([
	"changeme",
	"password",
	"secret",
	"xxx",
	"todo",
	"replace_me"
]);
const PLACEHOLDER_URL_PARTS = new Set([
	"example",
	"host",
	"localhost",
	"pass",
	"password",
	"pw",
	"user",
	"username"
]);
const isPlaceholderCredentialUrl = (matchedText) => {
	const credentialMatch = matchedText.match(/^[a-z]+:\/\/([^:@/\s]+):([^@/\s]+)@/i);
	if (credentialMatch) return PLACEHOLDER_URL_PARTS.has(credentialMatch[1].toLowerCase()) && PLACEHOLDER_URL_PARTS.has(credentialMatch[2].toLowerCase());
	try {
		const parsed = new URL(matchedText);
		return PLACEHOLDER_URL_PARTS.has(parsed.username.toLowerCase()) && PLACEHOLDER_URL_PARTS.has(parsed.password.toLowerCase()) && PLACEHOLDER_URL_PARTS.has(parsed.hostname.toLowerCase());
	} catch {
		return false;
	}
};
const isPlaceholderValue = (matchedText) => {
	if (isPlaceholderCredentialUrl(matchedText)) return true;
	if (/env\(/i.test(matchedText)) return true;
	if (matchedText.includes("process.env")) return true;
	if (matchedText.includes("os.environ")) return true;
	if (matchedText.includes("${")) return true;
	if (matchedText.includes("<") && matchedText.includes(">")) return true;
	if (/^your_/i.test(matchedText)) return true;
	if (PLACEHOLDER_EXACT.has(matchedText.toLowerCase())) return true;
	return false;
};
const scanSecrets = async (context) => {
	const files = getSourceFilesWithExtras(context, [
		".env",
		".yaml",
		".yml",
		".json",
		".toml"
	]);
	const diagnostics = [];
	for (const filePath of files) {
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		content = maskComments(content, path.extname(filePath));
		const relativePath = path.relative(context.rootDirectory, filePath);
		for (const { pattern, name, keywordPrefixed } of SECRET_PATTERNS) {
			const regex = new RegExp(pattern.source, pattern.flags);
			for (const match of content.matchAll(regex)) {
				if (isPlaceholderValue(match[1] ?? match[0])) continue;
				if (keywordPrefixed && isInsideStringLiteral(content, match.index)) continue;
				const line = content.slice(0, match.index).split("\n").length;
				diagnostics.push({
					filePath: relativePath,
					engine: "security",
					rule: "security/hardcoded-secret",
					severity: "error",
					message: `Possible ${name} detected in source code`,
					help: "Move secrets to environment variables or a secrets manager",
					line,
					column: 0,
					category: "Security",
					fixable: false
				});
			}
		}
	}
	return diagnostics;
};

//#endregion
//#region src/engines/security/index.ts
const securityEngine = {
	name: "security",
	async run(context) {
		const diagnostics = [];
		const promises = [scanSecrets(context), detectRiskyConstructs(context)];
		if (context.config.security.audit) promises.push(runDependencyAudit(context));
		const results = await Promise.allSettled(promises);
		for (const result of results) if (result.status === "fulfilled") diagnostics.push(...result.value);
		return {
			engine: "security",
			diagnostics,
			elapsed: 0,
			skipped: false
		};
	}
};

//#endregion
//#region src/engines/orchestrator.ts
const ALL_ENGINES = [
	formatEngine,
	lintEngine,
	codeQualityEngine,
	aiSlopEngine,
	architectureEngine,
	securityEngine
];
const runEngines = async (context, enabledEngines, onStart, onComplete) => {
	const engines = ALL_ENGINES.filter((e) => enabledEngines[e.name] !== false);
	return (await Promise.allSettled(engines.map(async (engine) => {
		onStart?.(engine.name);
		const start = performance.now();
		try {
			const result = await engine.run(context);
			result.elapsed = performance.now() - start;
			onComplete?.(result);
			return result;
		} catch (error) {
			const result = {
				engine: engine.name,
				diagnostics: [],
				elapsed: performance.now() - start,
				skipped: true,
				skipReason: error instanceof Error ? error.message : String(error)
			};
			onComplete?.(result);
			return result;
		}
	}))).map((r, i) => r.status === "fulfilled" ? r.value : {
		engine: engines[i].name,
		diagnostics: [],
		elapsed: 0,
		skipped: true,
		skipReason: r.reason instanceof Error ? r.reason.message : String(r.reason)
	});
};

//#endregion
//#region src/scoring/index.ts
const PERFECT_SCORE = 100;
const STYLE_RULES = new Set([
	"ai-slop/trivial-comment",
	"ai-slop/narrative-comment",
	"complexity/file-too-large",
	"complexity/function-too-long"
]);
const STYLE_WEIGHT = .5;
const COMMENT_STYLE_RULE_CAP = 12;
const COMMENT_STYLE_RULES = new Set(["ai-slop/trivial-comment", "ai-slop/narrative-comment"]);
const getEffectiveFileCount = (diagnostics, sourceFileCount) => {
	if (typeof sourceFileCount === "number" && sourceFileCount > 0) return sourceFileCount;
	const filesWithDiagnostics = new Set(diagnostics.map((d) => d.filePath)).size;
	return Math.max(1, filesWithDiagnostics);
};
const calculateScore = (diagnostics, weights, thresholds, sourceFileCount, smoothing, maxPerRule) => {
	if (diagnostics.length === 0) return {
		score: PERFECT_SCORE,
		label: "Healthy"
	};
	const deductionsByRule = /* @__PURE__ */ new Map();
	for (const d of diagnostics) {
		const engineWeight = weights[d.engine] ?? 1;
		const severityPenalty = d.severity === "error" ? 3 : d.severity === "warning" ? 1 : .25;
		const styleFactor = STYLE_RULES.has(d.rule) ? STYLE_WEIGHT : 1;
		const key = `${d.engine}:${d.rule}`;
		deductionsByRule.set(key, (deductionsByRule.get(key) ?? 0) + severityPenalty * engineWeight * styleFactor);
	}
	const defaultRuleCap = typeof maxPerRule === "number" && maxPerRule > 0 ? maxPerRule : null;
	const capForRule = (key) => {
		const rule = key.slice(key.indexOf(":") + 1);
		if (COMMENT_STYLE_RULES.has(rule)) return defaultRuleCap ? Math.min(defaultRuleCap, COMMENT_STYLE_RULE_CAP) : COMMENT_STYLE_RULE_CAP;
		return defaultRuleCap;
	};
	const deductions = [...deductionsByRule.entries()].reduce((total, [key, value]) => {
		const cap = capForRule(key);
		return total + (cap ? Math.min(value, cap) : value);
	}, 0);
	const effectiveFileCount = getEffectiveFileCount(diagnostics, sourceFileCount);
	const smoothingConstant = typeof smoothing === "number" ? smoothing : 10;
	const issueDensity = Math.min(1, diagnostics.length / (effectiveFileCount + smoothingConstant));
	const scaledDeductions = deductions * Math.sqrt(issueDensity);
	const score = Math.max(0, Math.round(PERFECT_SCORE - PERFECT_SCORE * Math.log1p(scaledDeductions) / Math.log1p(PERFECT_SCORE + scaledDeductions)));
	return {
		score,
		label: score >= thresholds.good ? "Healthy" : score >= thresholds.ok ? "Needs Work" : "Critical"
	};
};

//#endregion
//#region src/utils/discover.ts
const UNSUPPORTED_CODE_EXTENSIONS = {
	".c": "C/C++",
	".h": "C/C++",
	".cc": "C/C++",
	".cpp": "C/C++",
	".cxx": "C/C++",
	".hpp": "C/C++",
	".hh": "C/C++",
	".hxx": "C/C++",
	".cs": "C#",
	".swift": "Swift",
	".kt": "Kotlin",
	".kts": "Kotlin",
	".m": "Objective-C",
	".mm": "Objective-C",
	".scala": "Scala",
	".dart": "Dart",
	".ex": "Elixir",
	".exs": "Elixir",
	".erl": "Erlang",
	".hs": "Haskell",
	".clj": "Clojure",
	".cljs": "Clojure",
	".lua": "Lua",
	".jl": "Julia",
	".zig": "Zig",
	".nim": "Nim",
	".ml": "OCaml",
	".fs": "F#",
	".sol": "Solidity",
	".groovy": "Groovy"
};
const analyzeCoverage = (rootDirectory, excludePatterns = []) => {
	const allFiles = listProjectFiles(rootDirectory);
	const supportedFiles = filterProjectFiles(rootDirectory, allFiles, [], excludePatterns).length;
	const counts = /* @__PURE__ */ new Map();
	let unsupportedFiles = 0;
	const candidates = filterProjectFiles(rootDirectory, allFiles, Object.keys(UNSUPPORTED_CODE_EXTENSIONS), excludePatterns);
	for (const file of candidates) {
		const lang = UNSUPPORTED_CODE_EXTENSIONS[path.extname(file).toLowerCase()];
		if (!lang) continue;
		unsupportedFiles += 1;
		counts.set(lang, (counts.get(lang) ?? 0) + 1);
	}
	let dominantUnsupported = null;
	let max = 0;
	for (const [lang, count] of counts) if (count > max) {
		max = count;
		dominantUnsupported = lang;
	}
	const negligible = supportedFiles === 0 || unsupportedFiles >= 10 && unsupportedFiles > supportedFiles * 3;
	return {
		supportedFiles,
		unsupportedFiles,
		dominantUnsupported,
		scoreable: !negligible
	};
};
const LANGUAGE_SIGNALS = {
	"tsconfig.json": "typescript",
	"go.mod": "go",
	"Cargo.toml": "rust",
	Gemfile: "ruby",
	"composer.json": "php"
};
const PYTHON_SIGNALS = [
	"requirements.txt",
	"pyproject.toml",
	"setup.py",
	"setup.cfg",
	"Pipfile",
	"poetry.lock"
];
const JAVA_SIGNALS = [
	"pom.xml",
	"build.gradle",
	"build.gradle.kts"
];
const FRAMEWORK_PACKAGES = {
	next: "nextjs",
	react: "react",
	vite: "vite",
	"@remix-run/react": "remix",
	expo: "expo",
	astro: "astro"
};
const ASTRO_CONFIG_FILENAMES = [
	"astro.config.mjs",
	"astro.config.js",
	"astro.config.ts",
	"astro.config.cjs"
];
const PYTHON_FRAMEWORKS = {
	django: "django",
	flask: "flask",
	fastapi: "fastapi"
};
const NEXT_CONFIG_FILENAMES = [
	"next.config.js",
	"next.config.mjs",
	"next.config.ts",
	"next.config.cjs"
];
const readPackageJson = (filePath) => {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
};
const countSourceFiles = (rootDirectory) => getSourceFilesForRoot(rootDirectory).length;
const detectLanguages = (directory) => {
	const languages = /* @__PURE__ */ new Set();
	for (const [file, lang] of Object.entries(LANGUAGE_SIGNALS)) if (fs.existsSync(path.join(directory, file))) languages.add(lang);
	if (readPackageJson(path.join(directory, "package.json"))) if (fs.existsSync(path.join(directory, "tsconfig.json"))) languages.add("typescript");
	else languages.add("javascript");
	for (const signal of PYTHON_SIGNALS) if (fs.existsSync(path.join(directory, signal))) {
		languages.add("python");
		break;
	}
	for (const signal of JAVA_SIGNALS) if (fs.existsSync(path.join(directory, signal))) {
		languages.add("java");
		break;
	}
	return [...languages];
};
const detectFrameworks = (directory) => {
	const frameworks = /* @__PURE__ */ new Set();
	const packageJson = readPackageJson(path.join(directory, "package.json"));
	if (packageJson) {
		const allDeps = {
			...packageJson.dependencies,
			...packageJson.devDependencies
		};
		for (const [pkg, fw] of Object.entries(FRAMEWORK_PACKAGES)) if (allDeps[pkg]) frameworks.add(fw);
	}
	for (const configFile of NEXT_CONFIG_FILENAMES) if (fs.existsSync(path.join(directory, configFile))) {
		frameworks.add("nextjs");
		break;
	}
	for (const configFile of ASTRO_CONFIG_FILENAMES) if (fs.existsSync(path.join(directory, configFile))) {
		frameworks.add("astro");
		break;
	}
	const requirementsPath = path.join(directory, "requirements.txt");
	if (fs.existsSync(requirementsPath)) try {
		const content = fs.readFileSync(requirementsPath, "utf-8").toLowerCase();
		for (const [pkg, fw] of Object.entries(PYTHON_FRAMEWORKS)) if (content.includes(pkg)) frameworks.add(fw);
	} catch {}
	if (frameworks.size === 0) frameworks.add("none");
	return [...frameworks];
};
const TOOLS_TO_CHECK = [
	"oxlint",
	"biome",
	"ruff",
	"golangci-lint",
	"npm",
	"pnpm",
	"govulncheck",
	"gofmt",
	"pip-audit",
	"cargo",
	"cargo-audit",
	"clippy-driver",
	"rustfmt",
	"rubocop",
	"phpcs",
	"php-cs-fixer"
];
const checkInstalledTools = async () => {
	const results = {};
	await Promise.all(TOOLS_TO_CHECK.map(async (tool) => {
		results[tool] = await isToolAvailable(tool);
	}));
	return results;
};
const discoverProject = async (directory, excludePatterns = []) => {
	const resolvedDir = path.resolve(directory);
	const languages = detectLanguages(resolvedDir);
	const frameworks = detectFrameworks(resolvedDir);
	const sourceFileCount = countSourceFiles(resolvedDir);
	const coverage = analyzeCoverage(resolvedDir, excludePatterns);
	const installedTools = await checkInstalledTools();
	return {
		rootDirectory: resolvedDir,
		projectName: readPackageJson(path.join(resolvedDir, "package.json"))?.name ?? path.basename(resolvedDir),
		languages,
		frameworks,
		sourceFileCount,
		coverage,
		installedTools
	};
};

//#endregion
//#region src/utils/git.ts
const MAX_BUFFER = 50 * 1024 * 1024;
const baseRefExists = (cwd, ref) => {
	const result = spawnSync("git", [
		"rev-parse",
		"--verify",
		"--quiet",
		`${ref}^{commit}`
	], {
		cwd,
		encoding: "utf-8",
		maxBuffer: MAX_BUFFER
	});
	return !result.error && result.status === 0;
};
const getChangedFiles = (cwd, base) => {
	const diff = spawnSync("git", [
		"diff",
		"--name-only",
		"--diff-filter=ACMR",
		base ?? "HEAD"
	], {
		cwd,
		encoding: "utf-8",
		maxBuffer: MAX_BUFFER
	});
	if (diff.error || diff.status !== 0) return [];
	const untracked = spawnSync("git", [
		"ls-files",
		"--others",
		"--exclude-standard"
	], {
		cwd,
		encoding: "utf-8",
		maxBuffer: MAX_BUFFER
	});
	const names = /* @__PURE__ */ new Set();
	for (const line of diff.stdout.split("\n")) if (line.length > 0) names.add(line);
	if (!untracked.error && untracked.status === 0) {
		for (const line of untracked.stdout.split("\n")) if (line.length > 0) names.add(line);
	}
	return Array.from(names).map((f) => path.resolve(cwd, f));
};
const getStagedFiles = (cwd) => {
	const result = spawnSync("git", [
		"diff",
		"--cached",
		"--name-only",
		"--diff-filter=ACMR"
	], {
		cwd,
		encoding: "utf-8",
		maxBuffer: MAX_BUFFER
	});
	if (result.error || result.status !== 0) return [];
	return result.stdout.split("\n").filter((f) => f.length > 0).map((f) => path.resolve(cwd, f));
};

//#endregion
//#region src/hooks/io/scoped-scan.ts
const existingAbsolutePaths = (cwd, files) => files.map((f) => path.isAbsolute(f) ? f : path.join(cwd, f)).filter((p) => {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
});
const resolveHookFiles = (cwd, files) => {
	const direct = existingAbsolutePaths(cwd, files);
	if (direct.length > 0) return direct;
	return existingAbsolutePaths(cwd, getChangedFiles(cwd));
};
const runScopedScan = async (cwd, filePaths) => {
	const project = await discoverProject(cwd);
	const config = loadConfig(cwd);
	const configDir = findConfigDir(project.rootDirectory);
	const rulesPath = configDir ? path.join(configDir, RULES_FILE) : void 0;
	const diagnostics = (await runEngines({
		rootDirectory: project.rootDirectory,
		languages: project.languages,
		frameworks: project.frameworks,
		files: filterProjectFiles(project.rootDirectory, filePaths),
		installedTools: project.installedTools,
		config: {
			quality: config.quality,
			security: {
				audit: false,
				auditTimeout: 0
			},
			lint: { typecheck: false },
			architectureRulesPath: config.engines.architecture ? rulesPath : void 0
		}
	}, {
		format: config.engines.format,
		lint: config.engines.lint,
		"code-quality": config.engines["code-quality"],
		"ai-slop": config.engines["ai-slop"],
		architecture: config.engines.architecture,
		security: false
	})).flatMap((r) => r.diagnostics);
	const { score } = calculateScore(diagnostics, config.scoring.weights, config.scoring.thresholds, project.sourceFileCount, config.scoring.smoothing, config.scoring.maxPerRule);
	return {
		diagnostics,
		score,
		rootDirectory: project.rootDirectory
	};
};

//#endregion
//#region src/hooks/io/atomic-write.ts
const atomicWrite = (targetPath, content) => {
	const dir = path.dirname(targetPath);
	fs.mkdirSync(dir, { recursive: true });
	const rand = Math.random().toString(36).slice(2, 10);
	const tmp = path.join(dir, `.aislop-tmp-${process.pid}-${rand}`);
	fs.writeFileSync(tmp, content, "utf-8");
	fs.renameSync(tmp, targetPath);
};
const readIfExists = (targetPath) => {
	try {
		return fs.readFileSync(targetPath, "utf-8");
	} catch {
		return null;
	}
};

//#endregion
//#region src/hooks/quality-gate/baseline.ts
const fingerprintDiagnostic = (d, rootDirectory) => {
	return `${path.isAbsolute(d.filePath) ? path.relative(rootDirectory, d.filePath) : d.filePath}:${d.line}:${d.rule}`;
};
const BASELINE_REL = path.join(".aislop", "baseline.json");
const baselinePath = (cwd) => path.join(cwd, BASELINE_REL);
const readBaseline = (cwd) => {
	const raw = readIfExists(baselinePath(cwd));
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (parsed.schema !== "aislop.baseline.v2" && parsed.schema !== "aislop.baseline.v1") return null;
		return {
			schema: "aislop.baseline.v2",
			updatedAt: parsed.updatedAt ?? "",
			score: parsed.score ?? 0,
			byEngine: parsed.byEngine ?? {},
			fileCount: parsed.fileCount ?? 0,
			commit: parsed.commit,
			findingFingerprints: parsed.findingFingerprints ?? []
		};
	} catch {
		return null;
	}
};
const writeBaseline = (cwd, baseline) => {
	const target = baselinePath(cwd);
	atomicWrite(target, `${JSON.stringify(baseline, null, 2)}\n`);
	return target;
};
const captureBaseline = async (cwd) => {
	const project = await discoverProject(cwd);
	const config = loadConfig(cwd);
	const results = await runEngines({
		rootDirectory: project.rootDirectory,
		languages: project.languages,
		frameworks: project.frameworks,
		files: [],
		installedTools: project.installedTools,
		config: {
			quality: config.quality,
			security: {
				audit: false,
				auditTimeout: 0
			},
			lint: { typecheck: false }
		}
	}, {
		format: config.engines.format,
		lint: config.engines.lint,
		"code-quality": config.engines["code-quality"],
		"ai-slop": config.engines["ai-slop"],
		architecture: config.engines.architecture,
		security: false
	});
	const diagnostics = results.flatMap((r) => r.diagnostics);
	const { score } = calculateScore(diagnostics, config.scoring.weights, config.scoring.thresholds, project.sourceFileCount, config.scoring.smoothing, config.scoring.maxPerRule);
	const byEngine = {};
	for (const r of results) {
		const { score: engineScore } = calculateScore(diagnostics.filter((d) => r.diagnostics.includes(d)), config.scoring.weights, config.scoring.thresholds, project.sourceFileCount, config.scoring.smoothing, config.scoring.maxPerRule);
		byEngine[r.engine] = engineScore;
	}
	const findingFingerprints = diagnostics.filter((d) => d.severity === "error" || d.severity === "warning").map((d) => fingerprintDiagnostic(d, project.rootDirectory));
	const target = writeBaseline(cwd, {
		schema: "aislop.baseline.v2",
		updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		score,
		byEngine,
		fileCount: project.sourceFileCount,
		findingFingerprints
	});
	return {
		score,
		fileCount: project.sourceFileCount,
		path: target
	};
};
const appendSessionFiles = (cwd, files) => {
	if (files.length === 0) return;
	const target = path.join(cwd, ".aislop", "session.jsonl");
	try {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		const line = `${JSON.stringify({
			ts: Date.now(),
			files
		})}\n`;
		fs.appendFileSync(target, line);
	} catch {}
};
const readSessionFiles = (cwd) => {
	const raw = readIfExists(path.join(cwd, ".aislop", "session.jsonl"));
	if (!raw) return [];
	const files = /* @__PURE__ */ new Set();
	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			const entry = JSON.parse(line);
			for (const f of entry.files ?? []) files.add(f);
		} catch {}
	}
	return Array.from(files);
};
const clearSessionFiles = (cwd) => {
	const target = path.join(cwd, ".aislop", "session.jsonl");
	try {
		fs.unlinkSync(target);
	} catch {}
};

//#endregion
//#region src/hooks/adapters/claude.ts
const extractFiles$2 = (stdin) => {
	const files = /* @__PURE__ */ new Set();
	const input = stdin.tool_input ?? {};
	if (typeof input.file_path === "string" && input.file_path.length > 0) files.add(input.file_path);
	if (Array.isArray(input.edits)) {
		for (const e of input.edits) if (e && typeof e.file_path === "string" && e.file_path.length > 0) files.add(e.file_path);
	}
	return Array.from(files);
};
const parseClaudeStdin = (raw) => {
	if (!raw.trim()) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
};
const readStdin$3 = async () => {
	if (process.stdin.isTTY) return "";
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString("utf-8");
};
const renderClaudeOutput = (additional, block) => {
	const out = { hookSpecificOutput: {
		hookEventName: "PostToolUse",
		additionalContext: additional
	} };
	if (block) {
		out.decision = "block";
		out.reason = block.reason;
	}
	return out;
};
const runClaudeHook = async (deps = {}) => {
	const getStdin = deps.stdin ?? readStdin$3;
	const write = deps.write ?? ((s) => process.stdout.write(s));
	const input = parseClaudeStdin(await getStdin());
	const cwd = input.cwd && path.isAbsolute(input.cwd) ? input.cwd : process.cwd();
	const files = resolveHookFiles(cwd, extractFiles$2(input));
	if (files.length === 0) return 0;
	const release = acquireHookLock(cwd);
	if (!release) return 0;
	try {
		const { diagnostics, score, rootDirectory } = await runScopedScan(cwd, files);
		const baseline = readBaseline(cwd);
		appendSessionFiles(cwd, files);
		const feedback = buildFeedback(diagnostics, score, rootDirectory, baseline ? {
			score: baseline.score,
			findingFingerprints: baseline.findingFingerprints
		} : void 0, {
			agent: "claude",
			touchedFiles: files
		});
		track({
			event: "hook_scan_completed",
			properties: buildHookScanCompletedProps({
				agent: "claude",
				score,
				scoreDelta: baseline ? score - baseline.score : null,
				findingCount: diagnostics.length,
				fileCount: files.length
			})
		});
		const envelope = renderClaudeOutput(JSON.stringify(feedback));
		write(JSON.stringify(envelope));
		return 0;
	} catch {
		return 0;
	} finally {
		release();
	}
};
const parseClaudeFileChangedStdin = (raw) => {
	if (!raw.trim()) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
};
const runClaudeFileChangedHook = async (deps = {}) => {
	const getStdin = deps.stdin ?? readStdin$3;
	const write = deps.write ?? ((s) => process.stdout.write(s));
	const input = parseClaudeFileChangedStdin(await getStdin());
	const cwd = input.cwd && path.isAbsolute(input.cwd) ? input.cwd : process.cwd();
	const release = acquireHookLock(cwd);
	if (!release) return 0;
	try {
		const result = await captureBaseline(cwd);
		const changed = input.file_path ? path.relative(cwd, input.file_path) || input.file_path : "<unknown>";
		const envelope = renderClaudeOutput(JSON.stringify({
			schema: "aislop.hook.v2",
			event: "file_changed",
			file: changed,
			message: `Watched file changed (${changed}). aislop refreshed the baseline — score: ${result.score}.`,
			baseline: {
				score: result.score,
				fileCount: result.fileCount
			}
		}));
		write(JSON.stringify(envelope));
		return 0;
	} catch {
		return 0;
	} finally {
		release();
	}
};
const parseClaudeStopStdin = (raw) => {
	if (!raw.trim()) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
};
const runClaudeStopHook = async (deps = {}) => {
	const getStdin = deps.stdin ?? readStdin$3;
	const write = deps.write ?? ((s) => process.stdout.write(s));
	const input = parseClaudeStopStdin(await getStdin());
	const cwd = input.cwd && path.isAbsolute(input.cwd) ? input.cwd : process.cwd();
	if (input.stop_hook_active) return 0;
	const baseline = readBaseline(cwd);
	if (!baseline) return 0;
	const sessionFiles = readSessionFiles(cwd);
	if (sessionFiles.length === 0) return 0;
	const release = acquireHookLock(cwd);
	if (!release) return 0;
	try {
		const { diagnostics, score, rootDirectory } = await runScopedScan(cwd, sessionFiles);
		const feedback = buildFeedback(diagnostics, score, rootDirectory, {
			score: baseline.score,
			findingFingerprints: baseline.findingFingerprints
		}, {
			agent: "claude",
			touchedFiles: sessionFiles
		});
		if (!feedback.regressed) {
			clearSessionFiles(cwd);
			return 0;
		}
		const envelope = renderClaudeOutput(JSON.stringify(feedback), { reason: `aislop: score dropped from ${baseline.score} to ${score}. Fix the ${feedback.counts.total} finding${feedback.counts.total === 1 ? "" : "s"} before finishing.` });
		write(JSON.stringify(envelope));
		return 0;
	} catch {
		return 0;
	} finally {
		release();
	}
};

//#endregion
//#region src/hooks/adapters/cursor.ts
const extractFiles$1 = (stdin) => {
	const files = /* @__PURE__ */ new Set();
	if (typeof stdin.file_path === "string" && stdin.file_path.length > 0) files.add(stdin.file_path);
	if (Array.isArray(stdin.edits)) {
		for (const e of stdin.edits) if (e && typeof e.file_path === "string" && e.file_path.length > 0) files.add(e.file_path);
	}
	const input = stdin.tool_input ?? {};
	if (typeof input.file_path === "string" && input.file_path.length > 0) files.add(input.file_path);
	if (Array.isArray(input.edits)) {
		for (const e of input.edits) if (e && typeof e.file_path === "string" && e.file_path.length > 0) files.add(e.file_path);
	}
	return Array.from(files);
};
const parseCursorStdin = (raw) => {
	if (!raw.trim()) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
};
const renderCursorOutput = (additional, event = "afterFileEdit") => ({ hookSpecificOutput: {
	hookEventName: event,
	additionalContext: additional
} });
const readStdin$2 = async () => {
	if (process.stdin.isTTY) return "";
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString("utf-8");
};
const runCursorHook = async (deps = {}) => {
	const getStdin = deps.stdin ?? readStdin$2;
	const write = deps.write ?? ((s) => process.stdout.write(s));
	const writeErr = deps.writeErr ?? ((s) => process.stderr.write(s));
	const input = parseCursorStdin(await getStdin());
	const cwd = input.cwd && path.isAbsolute(input.cwd) ? input.cwd : process.cwd();
	const files = resolveHookFiles(cwd, extractFiles$1(input));
	if (files.length === 0) return 0;
	const release = acquireHookLock(cwd);
	if (!release) return 0;
	try {
		const { diagnostics, score, rootDirectory } = await runScopedScan(cwd, files);
		const feedback = buildFeedback(diagnostics, score, rootDirectory, void 0, {
			agent: "cursor",
			touchedFiles: files
		});
		track({
			event: "hook_scan_completed",
			properties: buildHookScanCompletedProps({
				agent: "cursor",
				score,
				findingCount: diagnostics.length,
				fileCount: files.length
			})
		});
		const serialized = JSON.stringify(feedback);
		write(JSON.stringify(renderCursorOutput(serialized)));
		writeErr(`${serialized}\n`);
		return 0;
	} catch {
		return 0;
	} finally {
		release();
	}
};

//#endregion
//#region src/hooks/adapters/gemini.ts
const extractFiles = (stdin) => {
	const files = /* @__PURE__ */ new Set();
	const input = stdin.tool_input ?? {};
	if (typeof input.file_path === "string" && input.file_path.length > 0) files.add(input.file_path);
	if (typeof input.path === "string" && input.path.length > 0) files.add(input.path);
	return Array.from(files);
};
const parseGeminiStdin = (raw) => {
	if (!raw.trim()) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
};
const renderGeminiOutput = (additional) => ({ hookSpecificOutput: {
	hookEventName: "AfterTool",
	additionalContext: additional
} });
const readStdin$1 = async () => {
	if (process.stdin.isTTY) return "";
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString("utf-8");
};
const runGeminiHook = async (deps = {}) => {
	const getStdin = deps.stdin ?? readStdin$1;
	const write = deps.write ?? ((s) => process.stdout.write(s));
	const input = parseGeminiStdin(await getStdin());
	const cwd = input.cwd && path.isAbsolute(input.cwd) ? input.cwd : process.cwd();
	const files = resolveHookFiles(cwd, extractFiles(input));
	if (files.length === 0) return 0;
	const release = acquireHookLock(cwd);
	if (!release) return 0;
	try {
		const { diagnostics, score, rootDirectory } = await runScopedScan(cwd, files);
		const feedback = buildFeedback(diagnostics, score, rootDirectory, void 0, {
			agent: "gemini",
			touchedFiles: files
		});
		track({
			event: "hook_scan_completed",
			properties: buildHookScanCompletedProps({
				agent: "gemini",
				score,
				findingCount: diagnostics.length,
				fileCount: files.length
			})
		});
		write(JSON.stringify(renderGeminiOutput(JSON.stringify(feedback))));
		return 0;
	} catch {
		return 0;
	} finally {
		release();
	}
};

//#endregion
//#region src/hooks/adapters/pi.ts
const parsePiStdin = (raw) => {
	if (!raw.trim()) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
};
const readStdin = async () => {
	if (process.stdin.isTTY) return "";
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString("utf-8");
};
const formatPiMessage = (feedback) => {
	if (feedback.counts.total === 0 && !feedback.regressed) return "";
	const { error, warning } = feedback.counts;
	const header = `aislop: score ${feedback.score}/100${feedback.baseline != null ? ` (baseline ${feedback.baseline})` : ""}, ${error} error${error === 1 ? "" : "s"}, ${warning} warning${warning === 1 ? "" : "s"}.`;
	const lines = feedback.findings.map((f) => `  - ${f.file}:${f.line} [${f.severity}] ${f.ruleId}: ${f.message}`);
	if (feedback.elided && feedback.elided > 0) lines.push(`  ...and ${feedback.elided} more.`);
	const tail = feedback.nextSteps.length > 0 ? `\n${feedback.nextSteps.join("\n")}` : "";
	return `${header}\n${lines.join("\n")}${tail}`;
};
const runPiHook = async (deps = {}) => {
	const getStdin = deps.stdin ?? readStdin;
	const write = deps.write ?? ((s) => process.stdout.write(s));
	const input = parsePiStdin(await getStdin());
	const cwd = input.cwd && path.isAbsolute(input.cwd) ? input.cwd : process.cwd();
	const files = resolveHookFiles(cwd, input.file_path ? [input.file_path] : []);
	if (files.length === 0) return 0;
	const release = acquireHookLock(cwd);
	if (!release) return 0;
	try {
		const { diagnostics, score, rootDirectory } = await runScopedScan(cwd, files);
		const baseline = readBaseline(cwd);
		appendSessionFiles(cwd, files);
		const feedback = buildFeedback(diagnostics, score, rootDirectory, baseline ? {
			score: baseline.score,
			findingFingerprints: baseline.findingFingerprints
		} : void 0, {
			agent: "pi",
			touchedFiles: files
		});
		track({
			event: "hook_scan_completed",
			properties: buildHookScanCompletedProps({
				agent: "pi",
				score,
				scoreDelta: baseline ? score - baseline.score : null,
				findingCount: diagnostics.length,
				fileCount: files.length
			})
		});
		const output = {
			schema: "aislop.hook.v2",
			block: feedback.counts.error > 0 || feedback.regressed,
			message: formatPiMessage(feedback),
			feedback
		};
		write(JSON.stringify(output));
		return 0;
	} catch {
		return 0;
	} finally {
		release();
	}
};

//#endregion
//#region src/hooks/assets.ts
const AISLOP_MD_BODY = `# aislop — agent instructions

[aislop](https://github.com/scanaislop/aislop) is your guardrail for shipping clean, maintainable, production-grade code. It catches the patterns AI coding tools leave behind: dead imports, redundant code, duplicate logic, unsafe any-typed casts, narrative comments, swallowed errors, oversized functions, risky security constructs — and grades the project out of 100 so regressions are visible. Treat its findings as blocking, not advisory: the goal is code a human maintainer would happily inherit.

## On every edit

A PostToolUse hook runs \`aislop hook claude\` after every Edit, Write, or MultiEdit. It scans the touched files and returns findings as JSON \`additionalContext\` shaped like \`AislopFeedback\` (schema \`aislop.hook.v2\` — score, baseline, delta, regressed, counts, findings, newSinceBaseline, suggestedActions). Act on them the same turn; the \`suggestedActions\` field tells you exactly what to run next.

## Severity ladder

- \`error\` — MUST fix this turn.
- \`warning\` + \`fixable: true\` — MUST fix this turn.
- \`warning\` + \`fixable: false\` — fix if trivially mechanical, otherwise surface in your reply.

## Rules

- \`.aislop/config.yaml\` — thresholds and engine toggles. Treat as authoritative; don't edit without user consent.
- \`.aislop/rules.yaml\` — project-specific architecture rules (may be absent). When a finding cites \`architecture/*\`, open this file and follow it.
- Custom rules can change between sessions. Trust what the scan returns, not a cached understanding of what the rules are.

## Principles

- Do not disable rules to pass the scan. Fix the underlying issue.
- If a finding is a false positive, leave it and explain in your reply — do not delete the rule config.
- The findings payload includes \`nextSteps[]\` — treat those as your plan for the turn.
`;

//#endregion
//#region src/hooks/io/sentinel.ts
const sentinelHash = (content) => `sha256:${crypto.createHash("sha256").update(content).digest("hex").slice(0, 32)}`;
const BEGIN_RE = /<!--\s*aislop:begin\s+v(\d+)(?:\s+hash=([^\s>]+))?\s*-->/;
const END_RE = /<!--\s*aislop:end\s+v\d+\s*-->/;
const renderFence = (body, hash) => [
	`<!-- aislop:begin v1 hash=${hash} -->`,
	body.trimEnd(),
	"<!-- aislop:end v1 -->"
].join("\n");
const upsertMarkdownFence = (existing, body, hash) => {
	const fenced = renderFence(body, hash);
	if (existing == null || existing.length === 0) return {
		nextContent: `${fenced}\n`,
		replaced: false
	};
	const begin = existing.match(BEGIN_RE);
	const end = existing.match(END_RE);
	if (begin && end && (end.index ?? 0) > (begin.index ?? 0)) return {
		nextContent: `${existing.slice(0, begin.index)}${fenced}${existing.slice((end.index ?? 0) + end[0].length)}`,
		replaced: true
	};
	return {
		nextContent: `${existing}${existing.endsWith("\n") ? "" : "\n"}\n${fenced}\n`,
		replaced: false
	};
};

//#endregion
//#region src/hooks/install/types.ts
const emptyResult = () => ({
	wrote: [],
	skipped: [],
	planned: []
});
const applyContent = (result, opts, target, nextContent, summary) => {
	if (readIfExists(target) === nextContent) {
		result.skipped.push(target);
		return;
	}
	if (opts.dryRun) {
		result.planned.push({
			path: target,
			summary
		});
		return;
	}
	atomicWrite(target, nextContent);
	result.wrote.push(target);
};
const applyRemoval = (result, opts, target, nextContent) => {
	const existing = readIfExists(target);
	if (existing == null) {
		result.skipped.push(target);
		return;
	}
	if (existing === (nextContent ?? "")) {
		result.skipped.push(target);
		return;
	}
	if (opts.dryRun) {
		result.removed.push(target);
		return;
	}
	if (nextContent == null) try {
		fs.unlinkSync(target);
	} catch {}
	else atomicWrite(target, nextContent);
	result.removed.push(target);
};

//#endregion
//#region src/hooks/install/rules-only.ts
const installRulesOnly = (opts, paths, summary) => {
	const result = emptyResult();
	const next = upsertMarkdownFence(readIfExists(paths.rules), AISLOP_MD_BODY, sentinelHash(AISLOP_MD_BODY)).nextContent;
	applyContent(result, opts, paths.rules, next, summary);
	if (paths.host && paths.marker) {
		const host = readIfExists(paths.host) ?? "";
		if (!host.includes(paths.marker)) {
			const joiner = host.endsWith("\n") || host.length === 0 ? "" : "\n";
			const prefix = host.length === 0 ? "" : `${host}${joiner}\n`;
			applyContent(result, opts, paths.host, `${prefix}${paths.marker}\n`, `append ${paths.marker} reference`);
		} else result.skipped.push(paths.host);
	}
	return result;
};
const uninstallRulesOnly = (opts, paths) => {
	const result = {
		removed: [],
		skipped: []
	};
	if (readIfExists(paths.rules) != null) applyRemoval(result, opts, paths.rules, null);
	else result.skipped.push(paths.rules);
	if (paths.host && paths.marker) {
		const host = readIfExists(paths.host);
		if (host?.includes(paths.marker)) {
			const stripped = host.split("\n").filter((l) => l.trim() !== paths.marker).join("\n").replace(/\n{3,}/g, "\n\n").trim();
			applyRemoval(result, opts, paths.host, stripped.length === 0 ? null : `${stripped}\n`);
		} else result.skipped.push(paths.host);
	}
	return result;
};

//#endregion
//#region src/hooks/install/antigravity.ts
const resolveAntigravityPaths = (opts) => ({ rules: path.join(opts.cwd, ".agents", "rules", "antigravity-aislop-rules.md") });
const installAntigravity = (opts) => {
	if (opts.scope !== "project") return {
		wrote: [],
		skipped: [],
		planned: [{
			path: ".agents/rules/antigravity-aislop-rules.md",
			summary: "Antigravity is project-scope only; pass --project"
		}]
	};
	return installRulesOnly(opts, resolveAntigravityPaths(opts), "write .agents/rules/antigravity-aislop-rules.md");
};
const uninstallAntigravity = (opts) => {
	if (opts.scope !== "project") return {
		removed: [],
		skipped: []
	};
	return uninstallRulesOnly(opts, resolveAntigravityPaths(opts));
};

//#endregion
//#region src/hooks/io/json-patch.ts
const AISLOP_SENTINEL_KEY = "__aislop";
const isAislopManaged = (x) => typeof x === "object" && x !== null && AISLOP_SENTINEL_KEY in x && x[AISLOP_SENTINEL_KEY] != null;
const groupIsAislop = (group) => {
	if (typeof group !== "object" || group === null) return false;
	const hooks = group.hooks;
	if (!Array.isArray(hooks)) return false;
	return hooks.some((h) => isAislopManaged(h));
};
const upsertHookGroup = (config, event, group) => {
	const next = { ...config };
	const hooks = next.hooks && typeof next.hooks === "object" ? next.hooks : {};
	const cleaned = (Array.isArray(hooks[event]) ? hooks[event] : []).filter((g) => !groupIsAislop(g));
	next.hooks = {
		...hooks,
		[event]: [...cleaned, group]
	};
	return next;
};
const upsertFlatHook = (config, event, entry) => {
	const next = { ...config };
	const hooks = next.hooks && typeof next.hooks === "object" ? next.hooks : {};
	const cleaned = (Array.isArray(hooks[event]) ? hooks[event] : []).filter((e) => !isAislopManaged(e));
	next.hooks = {
		...hooks,
		[event]: [...cleaned, entry]
	};
	return next;
};
const removeAislopEntries = (config, event) => {
	const next = { ...config };
	const hooks = next.hooks && typeof next.hooks === "object" ? next.hooks : {};
	const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
	const cleaned = existing.filter((e) => !isAislopManaged(e) && !groupIsAislop(e));
	const removed = existing.length - cleaned.length;
	const nextHooks = { ...hooks };
	if (cleaned.length === 0) delete nextHooks[event];
	else nextHooks[event] = cleaned;
	if (Object.keys(nextHooks).length === 0) delete next.hooks;
	else next.hooks = nextHooks;
	return {
		next,
		removed
	};
};

//#endregion
//#region src/hooks/install/claude.ts
const resolveClaudePaths = (opts) => {
	const root = opts.scope === "project" ? path.join(opts.cwd, ".claude") : path.join(opts.home, ".claude");
	return {
		settings: path.join(root, "settings.json"),
		aislopMd: path.join(root, "AISLOP.md"),
		claudeMd: path.join(root, "CLAUDE.md")
	};
};
const buildHookGroup$1 = () => {
	const hashBody = JSON.stringify({
		command: "aislop hook claude",
		matcher: "Edit|Write|MultiEdit"
	});
	return {
		matcher: "Edit|Write|MultiEdit",
		hooks: [{
			type: "command",
			command: "aislop hook claude",
			[AISLOP_SENTINEL_KEY]: {
				v: 1,
				managed: true,
				hash: sentinelHash(hashBody)
			}
		}]
	};
};
const buildStopHookGroup = () => {
	const hashBody = JSON.stringify({ command: "aislop hook claude --stop" });
	return {
		matcher: "",
		hooks: [{
			type: "command",
			command: "aislop hook claude --stop",
			[AISLOP_SENTINEL_KEY]: {
				v: 1,
				managed: true,
				hash: sentinelHash(hashBody)
			}
		}]
	};
};
const FILE_CHANGED_MATCHER = ".aislop/config.yml|.aislop/rules.yml|package.json";
const buildFileChangedHookGroup = () => {
	const hashBody = JSON.stringify({
		command: "aislop hook claude --on-file-changed",
		matcher: FILE_CHANGED_MATCHER
	});
	return {
		matcher: FILE_CHANGED_MATCHER,
		hooks: [{
			type: "command",
			command: "aislop hook claude --on-file-changed",
			[AISLOP_SENTINEL_KEY]: {
				v: 1,
				managed: true,
				hash: sentinelHash(hashBody)
			}
		}]
	};
};
const renderSettings$1 = (existingRaw, qualityGate) => {
	let obj = {};
	if (existingRaw) try {
		obj = JSON.parse(existingRaw);
	} catch {
		obj = {};
	}
	let next = upsertHookGroup(obj, "PostToolUse", buildHookGroup$1());
	next = upsertHookGroup(next, "FileChanged", buildFileChangedHookGroup());
	if (qualityGate) next = upsertHookGroup(next, "Stop", buildStopHookGroup());
	else next = removeAislopEntries(next, "Stop").next;
	return `${JSON.stringify(next, null, 2)}\n`;
};
const installClaude = (opts) => {
	const paths = resolveClaudePaths(opts);
	const result = emptyResult();
	const nextSettings = renderSettings$1(readIfExists(paths.settings), Boolean(opts.qualityGate));
	applyContent(result, opts, paths.settings, nextSettings, "register PostToolUse + FileChanged hooks");
	const mdHash = sentinelHash(AISLOP_MD_BODY);
	const fenced = upsertMarkdownFence(readIfExists(paths.aislopMd), AISLOP_MD_BODY, mdHash);
	applyContent(result, opts, paths.aislopMd, fenced.nextContent, "write AISLOP.md rules");
	const existingClaudeMd = readIfExists(paths.claudeMd) ?? "";
	const marker = "@AISLOP.md";
	if (!existingClaudeMd.includes(marker)) {
		const joiner = existingClaudeMd.endsWith("\n") || existingClaudeMd.length === 0 ? "" : "\n";
		const prefix = existingClaudeMd.length === 0 ? "" : `${existingClaudeMd}${joiner}\n`;
		applyContent(result, opts, paths.claudeMd, `${prefix}${marker}\n`, "append @AISLOP.md reference");
	} else result.skipped.push(paths.claudeMd);
	return result;
};
const uninstallClaude = (opts) => {
	const paths = resolveClaudePaths({
		...opts,
		qualityGate: false
	});
	const result = {
		removed: [],
		skipped: []
	};
	const settingsRaw = readIfExists(paths.settings);
	if (settingsRaw) {
		let obj = {};
		try {
			obj = JSON.parse(settingsRaw);
		} catch {
			obj = {};
		}
		const afterPostToolUse = removeAislopEntries(obj, "PostToolUse").next;
		const afterFileChanged = removeAislopEntries(afterPostToolUse, "FileChanged").next;
		const stripped = removeAislopEntries(afterFileChanged, "Stop").next;
		const stillHasHooks = stripped.hooks && typeof stripped.hooks === "object" && Object.keys(stripped.hooks).length > 0;
		const otherKeys = Object.keys(stripped).filter((k) => k !== "hooks");
		if (!stillHasHooks && otherKeys.length === 0) applyRemoval(result, opts, paths.settings, null);
		else applyRemoval(result, opts, paths.settings, `${JSON.stringify(stripped, null, 2)}\n`);
	} else result.skipped.push(paths.settings);
	if (readIfExists(paths.aislopMd) != null) applyRemoval(result, opts, paths.aislopMd, null);
	else result.skipped.push(paths.aislopMd);
	const claudeMd = readIfExists(paths.claudeMd);
	if (claudeMd?.includes("@AISLOP.md")) {
		const stripped = claudeMd.split("\n").filter((line) => line.trim() !== "@AISLOP.md").join("\n").replace(/\n{3,}/g, "\n\n").trim();
		applyRemoval(result, opts, paths.claudeMd, stripped.length === 0 ? null : `${stripped}\n`);
	} else result.skipped.push(paths.claudeMd);
	return result;
};

//#endregion
//#region src/hooks/install/cline.ts
const resolveClinePaths = (opts) => ({ rules: path.join(opts.cwd, ".clinerules") });
const resolveRooPaths = (opts) => ({ rules: path.join(opts.cwd, ".roo", "rules", "aislop.md") });
const installCline = (opts) => {
	if (opts.scope !== "project") return {
		wrote: [],
		skipped: [],
		planned: [{
			path: ".clinerules",
			summary: "Cline is project-scope only; pass --project"
		}]
	};
	const cline = installRulesOnly(opts, resolveClinePaths(opts), "write .clinerules");
	const roo = installRulesOnly(opts, resolveRooPaths(opts), "write .roo/rules/aislop.md");
	return {
		wrote: [...cline.wrote, ...roo.wrote],
		skipped: [...cline.skipped, ...roo.skipped],
		planned: [...cline.planned, ...roo.planned]
	};
};
const uninstallCline = (opts) => {
	if (opts.scope !== "project") return {
		removed: [],
		skipped: []
	};
	const a = uninstallRulesOnly(opts, resolveClinePaths(opts));
	const b = uninstallRulesOnly(opts, resolveRooPaths(opts));
	return {
		removed: [...a.removed, ...b.removed],
		skipped: [...a.skipped, ...b.skipped]
	};
};

//#endregion
//#region src/hooks/install/codex.ts
const resolveCodexPaths = (opts) => ({ rules: opts.scope === "project" ? path.join(opts.cwd, "AGENTS.md") : path.join(opts.home, ".codex", "AGENTS.md") });
const installCodex = (opts) => installRulesOnly(opts, resolveCodexPaths(opts), "write AGENTS.md rules for Codex");
const uninstallCodex = (opts) => uninstallRulesOnly(opts, resolveCodexPaths(opts));

//#endregion
//#region src/hooks/install/copilot.ts
const resolveCopilotPaths = (opts) => ({ rules: path.join(opts.cwd, ".github", "copilot-instructions.md") });
const installCopilot = (opts) => {
	if (opts.scope !== "project") return {
		wrote: [],
		skipped: [],
		planned: [{
			path: ".github/copilot-instructions.md",
			summary: "Copilot is project-scope only; pass --project"
		}]
	};
	return installRulesOnly(opts, resolveCopilotPaths(opts), "write .github/copilot-instructions.md");
};
const uninstallCopilot = (opts) => {
	if (opts.scope !== "project") return {
		removed: [],
		skipped: []
	};
	return uninstallRulesOnly(opts, resolveCopilotPaths(opts));
};

//#endregion
//#region src/hooks/install/cursor.ts
const resolveCursorPaths = (opts) => {
	const root = opts.scope === "project" ? path.join(opts.cwd, ".cursor") : path.join(opts.home, ".cursor");
	return {
		hooks: path.join(root, "hooks.json"),
		rules: path.join(opts.cwd, ".cursor", "rules", "aislop.mdc")
	};
};
const buildHookEntry = () => {
	const hashBody = JSON.stringify({
		command: "aislop hook cursor",
		timeout: 5e3
	});
	return {
		command: "aislop hook cursor",
		type: "command",
		timeout: 5e3,
		[AISLOP_SENTINEL_KEY]: {
			v: 1,
			managed: true,
			hash: sentinelHash(hashBody)
		}
	};
};
const renderHooksJson = (existingRaw) => {
	let obj = { version: 1 };
	if (existingRaw) try {
		obj = JSON.parse(existingRaw);
	} catch {
		obj = { version: 1 };
	}
	if (typeof obj.version !== "number") obj.version = 1;
	const next = upsertFlatHook(obj, "afterFileEdit", buildHookEntry());
	return `${JSON.stringify(next, null, 2)}\n`;
};
const installCursor = (opts) => {
	const paths = resolveCursorPaths(opts);
	const result = emptyResult();
	const nextHooks = renderHooksJson(readIfExists(paths.hooks));
	applyContent(result, opts, paths.hooks, nextHooks, "register afterFileEdit hook");
	if (opts.scope === "project") {
		const rules = upsertMarkdownFence(readIfExists(paths.rules), AISLOP_MD_BODY, sentinelHash(AISLOP_MD_BODY)).nextContent;
		applyContent(result, opts, paths.rules, rules, "write .cursor/rules/aislop.mdc");
	}
	return result;
};
const uninstallCursor = (opts) => {
	const paths = resolveCursorPaths(opts);
	const result = {
		removed: [],
		skipped: []
	};
	const raw = readIfExists(paths.hooks);
	if (raw) {
		let obj = {};
		try {
			obj = JSON.parse(raw);
		} catch {
			obj = {};
		}
		const stripped = removeAislopEntries(obj, "afterFileEdit").next;
		const stillHasHooks = stripped.hooks && typeof stripped.hooks === "object" && Object.keys(stripped.hooks).length > 0;
		const otherKeys = Object.keys(stripped).filter((k) => k !== "hooks" && k !== "version");
		if (!stillHasHooks && otherKeys.length === 0) applyRemoval(result, opts, paths.hooks, null);
		else applyRemoval(result, opts, paths.hooks, `${JSON.stringify(stripped, null, 2)}\n`);
	} else result.skipped.push(paths.hooks);
	if (opts.scope === "project") applyRemoval(result, opts, paths.rules, null);
	return result;
};

//#endregion
//#region src/hooks/install/gemini.ts
const resolveGeminiPaths = (opts) => {
	const root = opts.scope === "project" ? path.join(opts.cwd, ".gemini") : path.join(opts.home, ".gemini");
	return {
		settings: path.join(root, "settings.json"),
		aislopMd: path.join(root, "AISLOP.md"),
		geminiMd: path.join(root, "GEMINI.md")
	};
};
const buildHookGroup = () => {
	const hashBody = JSON.stringify({
		command: "aislop hook gemini",
		matcher: "write_file|replace"
	});
	return {
		matcher: "write_file|replace",
		hooks: [{
			name: "aislop",
			type: "command",
			command: "aislop hook gemini",
			timeout: 5e3,
			[AISLOP_SENTINEL_KEY]: {
				v: 1,
				managed: true,
				hash: sentinelHash(hashBody)
			}
		}]
	};
};
const renderSettings = (existingRaw) => {
	let obj = {};
	if (existingRaw) try {
		obj = JSON.parse(existingRaw);
	} catch {
		obj = {};
	}
	const next = upsertHookGroup(obj, "AfterTool", buildHookGroup());
	return `${JSON.stringify(next, null, 2)}\n`;
};
const installGemini = (opts) => {
	const paths = resolveGeminiPaths(opts);
	const result = emptyResult();
	const next = renderSettings(readIfExists(paths.settings));
	applyContent(result, opts, paths.settings, next, "register AfterTool hook");
	const fenced = upsertMarkdownFence(readIfExists(paths.aislopMd), AISLOP_MD_BODY, sentinelHash(AISLOP_MD_BODY)).nextContent;
	applyContent(result, opts, paths.aislopMd, fenced, "write AISLOP.md rules");
	const existingGeminiMd = readIfExists(paths.geminiMd) ?? "";
	const marker = "@AISLOP.md";
	if (!existingGeminiMd.includes(marker)) {
		const joiner = existingGeminiMd.endsWith("\n") || existingGeminiMd.length === 0 ? "" : "\n";
		const prefix = existingGeminiMd.length === 0 ? "" : `${existingGeminiMd}${joiner}\n`;
		applyContent(result, opts, paths.geminiMd, `${prefix}${marker}\n`, "append @AISLOP.md reference");
	} else result.skipped.push(paths.geminiMd);
	return result;
};
const uninstallGemini = (opts) => {
	const paths = resolveGeminiPaths(opts);
	const result = {
		removed: [],
		skipped: []
	};
	const raw = readIfExists(paths.settings);
	if (raw) {
		let obj = {};
		try {
			obj = JSON.parse(raw);
		} catch {
			obj = {};
		}
		const stripped = removeAislopEntries(obj, "AfterTool").next;
		const stillHasHooks = stripped.hooks && typeof stripped.hooks === "object" && Object.keys(stripped.hooks).length > 0;
		const otherKeys = Object.keys(stripped).filter((k) => k !== "hooks");
		if (!stillHasHooks && otherKeys.length === 0) applyRemoval(result, opts, paths.settings, null);
		else applyRemoval(result, opts, paths.settings, `${JSON.stringify(stripped, null, 2)}\n`);
	} else result.skipped.push(paths.settings);
	if (readIfExists(paths.aislopMd) != null) applyRemoval(result, opts, paths.aislopMd, null);
	else result.skipped.push(paths.aislopMd);
	const geminiMd = readIfExists(paths.geminiMd);
	if (geminiMd?.includes("@AISLOP.md")) {
		const stripped = geminiMd.split("\n").filter((l) => l.trim() !== "@AISLOP.md").join("\n").replace(/\n{3,}/g, "\n\n").trim();
		applyRemoval(result, opts, paths.geminiMd, stripped.length === 0 ? null : `${stripped}\n`);
	} else result.skipped.push(paths.geminiMd);
	return result;
};

//#endregion
//#region src/hooks/install/kilocode.ts
const resolveKilocodePaths = (opts) => ({ rules: path.join(opts.cwd, ".kilocode", "rules", "aislop-rules.md") });
const installKilocode = (opts) => {
	if (opts.scope !== "project") return {
		wrote: [],
		skipped: [],
		planned: [{
			path: ".kilocode/rules/aislop-rules.md",
			summary: "Kilo Code is project-scope only; pass --project"
		}]
	};
	return installRulesOnly(opts, resolveKilocodePaths(opts), "write .kilocode/rules/aislop-rules.md");
};
const uninstallKilocode = (opts) => {
	if (opts.scope !== "project") return {
		removed: [],
		skipped: []
	};
	return uninstallRulesOnly(opts, resolveKilocodePaths(opts));
};

//#endregion
//#region src/hooks/install/pi.ts
const resolvePiPaths = (opts) => {
	return { extension: opts.scope === "project" ? path.join(opts.cwd, ".pi", "extensions", "aislop.js") : path.join(opts.home, ".pi", "agent", "extensions", "aislop.js") };
};
const PI_EXTENSION_SOURCE = `// aislop — auto-generated pi extension. Do not edit by hand.
// Reinstall with: aislop hook install --pi
import { spawnSync } from "node:child_process";

export default function (pi) {
	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		if (event.isError) return;
		const filePath = event.input && event.input.path;
		if (typeof filePath !== "string" || filePath.length === 0) return;

		const bin = process.env.AISLOP_BIN || "aislop";
		const payload = JSON.stringify({
			cwd: ctx.cwd,
			file_path: filePath,
			tool_name: event.toolName,
		});

		let out;
		try {
			const res = spawnSync(bin, ["hook", "pi"], {
				input: payload,
				encoding: "utf-8",
				timeout: 15000,
			});
			if (res.status !== 0 || !res.stdout) return;
			out = JSON.parse(res.stdout);
		} catch {
			return;
		}
		if (!out || !out.message) return;

		return {
			content: [...event.content, { type: "text", text: out.message }],
			isError: event.isError,
		};
	});
}
`;
const installPi = (opts) => {
	const paths = resolvePiPaths(opts);
	const result = emptyResult();
	applyContent(result, opts, paths.extension, PI_EXTENSION_SOURCE, "write pi aislop extension");
	return result;
};
const uninstallPi = (opts) => {
	const paths = resolvePiPaths(opts);
	const result = {
		removed: [],
		skipped: []
	};
	if (readIfExists(paths.extension) != null) applyRemoval(result, opts, paths.extension, null);
	else result.skipped.push(paths.extension);
	return result;
};

//#endregion
//#region src/hooks/install/windsurf.ts
const resolveWindsurfPaths = (opts) => ({ rules: path.join(opts.cwd, ".windsurfrules") });
const installWindsurf = (opts) => {
	if (opts.scope !== "project") return {
		wrote: [],
		skipped: [],
		planned: [{
			path: ".windsurfrules",
			summary: "Windsurf is project-scope only; pass --project"
		}]
	};
	return installRulesOnly(opts, resolveWindsurfPaths(opts), "write .windsurfrules");
};
const uninstallWindsurf = (opts) => {
	if (opts.scope !== "project") return {
		removed: [],
		skipped: []
	};
	return uninstallRulesOnly(opts, resolveWindsurfPaths(opts));
};

//#endregion
//#region src/hooks/install/registry.ts
const ALL_AGENTS = [
	"claude",
	"cursor",
	"gemini",
	"pi",
	"codex",
	"windsurf",
	"cline",
	"kilocode",
	"antigravity",
	"copilot"
];
const AGENTS_PROJECT_ONLY = [
	"windsurf",
	"cline",
	"kilocode",
	"antigravity",
	"copilot"
];
const AGENTS_SUPPORTING_BOTH_SCOPES = [
	"claude",
	"cursor",
	"gemini",
	"pi",
	"codex"
];
const paths = {
	claude: (opts) => {
		const p = resolveClaudePaths(opts);
		return [
			p.settings,
			p.aislopMd,
			p.claudeMd
		];
	},
	cursor: (opts) => {
		const p = resolveCursorPaths(opts);
		return opts.scope === "project" ? [p.hooks, p.rules] : [p.hooks];
	},
	gemini: (opts) => {
		const p = resolveGeminiPaths(opts);
		return [
			p.settings,
			p.aislopMd,
			p.geminiMd
		];
	},
	pi: (opts) => [resolvePiPaths(opts).extension],
	codex: (opts) => [resolveCodexPaths(opts).rules],
	windsurf: (opts) => [resolveWindsurfPaths(opts).rules],
	cline: (opts) => [resolveClinePaths(opts).rules, resolveRooPaths(opts).rules],
	kilocode: (opts) => [resolveKilocodePaths(opts).rules],
	antigravity: (opts) => [resolveAntigravityPaths(opts).rules],
	copilot: (opts) => [resolveCopilotPaths(opts).rules]
};
const REGISTRY = {
	claude: {
		install: installClaude,
		uninstall: uninstallClaude,
		paths: paths.claude
	},
	cursor: {
		install: installCursor,
		uninstall: uninstallCursor,
		paths: paths.cursor
	},
	gemini: {
		install: installGemini,
		uninstall: uninstallGemini,
		paths: paths.gemini
	},
	pi: {
		install: installPi,
		uninstall: uninstallPi,
		paths: paths.pi
	},
	codex: {
		install: installCodex,
		uninstall: uninstallCodex,
		paths: paths.codex
	},
	windsurf: {
		install: installWindsurf,
		uninstall: uninstallWindsurf,
		paths: paths.windsurf
	},
	cline: {
		install: installCline,
		uninstall: uninstallCline,
		paths: paths.cline
	},
	kilocode: {
		install: installKilocode,
		uninstall: uninstallKilocode,
		paths: paths.kilocode
	},
	antigravity: {
		install: installAntigravity,
		uninstall: uninstallAntigravity,
		paths: paths.antigravity
	},
	copilot: {
		install: installCopilot,
		uninstall: uninstallCopilot,
		paths: paths.copilot
	}
};
const defaultScopeFor = (agent) => AGENTS_PROJECT_ONLY.includes(agent) ? "project" : "global";
const detectInstalledAgents = (opts) => {
	const hits = [];
	for (const agent of ALL_AGENTS) {
		const scope = defaultScopeFor(agent);
		if (REGISTRY[agent].paths({
			home: opts.home,
			cwd: opts.cwd,
			scope
		}).some((p) => fs.existsSync(p))) hits.push(agent);
	}
	return hits;
};

//#endregion
//#region src/ui/symbols.ts
const TTY = {
	stepActive: "◇",
	stepDone: "◆",
	rail: "│",
	railEnd: "└",
	bullet: "●",
	hint: "→",
	pass: "✓",
	fail: "✗",
	warn: "!",
	pending: "•",
	engineActive: "⏵",
	neutral: "─"
};
const PLAIN = {
	stepActive: "*",
	stepDone: "*",
	rail: "|",
	railEnd: "+",
	bullet: "-",
	hint: "->",
	pass: "[ok]",
	fail: "[x]",
	warn: "[!]",
	pending: "-",
	engineActive: ">",
	neutral: "-"
};
const createSymbols = (opts = {}) => opts.plain ? PLAIN : TTY;
const isPlain = () => process.env.THEME === "plain" || Boolean(process.env.NO_COLOR) || !process.stdout.isTTY;
const symbols = createSymbols({ plain: isPlain() });

//#endregion
//#region src/ui/theme.ts
const TRUECOLOR = {
	accent: (s) => `\x1B[38;2;34;197;94m${s}\x1B[39m`,
	accentDim: (s) => `\x1B[38;2;22;163;74m${s}\x1B[39m`,
	fg: (s) => s,
	muted: (s) => `\x1B[38;2;113;113;122m${s}\x1B[39m`,
	danger: (s) => `\x1B[38;2;239;68;68m${s}\x1B[39m`,
	warn: (s) => `\x1B[38;2;234;179;8m${s}\x1B[39m`,
	info: (s) => `\x1B[38;2;56;189;248m${s}\x1B[39m`,
	success: (s) => `\x1B[38;2;34;197;94m${s}\x1B[39m`,
	bold: pc.bold,
	dim: pc.dim
};
const C256 = {
	accent: (s) => `\x1B[38;5;10m${s}\x1B[39m`,
	accentDim: (s) => `\x1B[38;5;22m${s}\x1B[39m`,
	fg: (s) => s,
	muted: (s) => `\x1B[38;5;244m${s}\x1B[39m`,
	danger: (s) => `\x1B[38;5;9m${s}\x1B[39m`,
	warn: (s) => `\x1B[38;5;11m${s}\x1B[39m`,
	info: (s) => `\x1B[38;5;14m${s}\x1B[39m`,
	success: (s) => `\x1B[38;5;10m${s}\x1B[39m`,
	bold: pc.bold,
	dim: pc.dim
};
const identity = (s) => s;
const NONE = {
	accent: identity,
	accentDim: identity,
	fg: identity,
	muted: identity,
	danger: identity,
	warn: identity,
	info: identity,
	success: identity,
	bold: identity,
	dim: identity
};
const detectMode = (tty, env) => {
	if (env.NO_COLOR) return "none";
	if (env.FORCE_COLOR === "0") return "none";
	if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return env.FORCE_COLOR === "3" ? "truecolor" : "256";
	if (!tty) return "none";
	if (env.COLORTERM === "truecolor" || env.COLORTERM === "24bit") return "truecolor";
	return "256";
};
const createTheme = (opts = {}) => {
	const env = opts.env ?? process.env;
	const tty = opts.tty ?? Boolean(process.stdout.isTTY);
	const requested = opts.color ?? "auto";
	const mode = requested === "auto" ? detectMode(tty, env) : requested;
	return {
		mode,
		paint: mode === "truecolor" ? TRUECOLOR : mode === "256" ? C256 : NONE
	};
};
const style = (theme, token, text) => theme.paint[token](text);
const theme = createTheme();

//#endregion
//#region src/ui/width.ts
const ANSI_RE = new RegExp(`\\[[0-9;]*m`, "g");
const stripAnsi = (s) => s.replace(ANSI_RE, "");
const stringWidth = (s) => {
	const bare = stripAnsi(s);
	let total = 0;
	for (const ch of bare) {
		const w = wcwidth(ch.codePointAt(0) ?? 0);
		total += w > 0 ? w : 1;
	}
	return total;
};
const padEnd = (s, target, fill = " ") => {
	const w = stringWidth(s);
	if (w >= target) return s;
	return s + fill.repeat(target - w);
};
const padStart = (s, target, fill = " ") => {
	const w = stringWidth(s);
	if (w >= target) return s;
	return fill.repeat(target - w) + s;
};
const truncate = (s, max, ellipsis = "…") => {
	if (stringWidth(s) <= max) return s;
	const limit = Math.max(0, max - stringWidth(ellipsis));
	let out = "";
	let w = 0;
	for (const ch of s) {
		const cw = wcwidth(ch.codePointAt(0) ?? 0);
		if (w + cw > limit) break;
		out += ch;
		w += cw;
	}
	return out + ellipsis;
};

//#endregion
//#region src/ui/search-select.ts
const silentOutput = new Writable({ write(_chunk, _encoding, callback) {
	callback();
} });
const filterSearchItems = (items, query) => {
	const q = query.trim().toLowerCase();
	if (q.length === 0) return items;
	return items.map((item, index) => {
		const label = item.label.toLowerCase();
		const value = String(item.value).toLowerCase();
		const hint = item.hint?.toLowerCase() ?? "";
		const keywords = (item.keywords ?? []).join(" ").toLowerCase();
		const haystack = [
			label,
			value,
			hint,
			keywords
		].filter((v) => v.length > 0).join(" ");
		if (!q.split(/\s+/).every((part) => haystack.includes(part))) return null;
		let rank = 80;
		if (label === q || value === q) rank = 0;
		else if (label.startsWith(q) || value.startsWith(q)) rank = 10;
		else if (label.includes(q) || value.includes(q)) rank = 20;
		else if (keywords.includes(q)) rank = 40;
		else if (hint.includes(q)) rank = 60;
		return {
			item,
			index,
			rank
		};
	}).filter((entry) => entry !== null).sort((a, b) => {
		if (a.rank !== b.rank) return a.rank - b.rank;
		return a.index - b.index;
	}).map((entry) => entry.item);
};
const countRows = (lines, columns) => {
	const width = columns && columns > 0 ? columns : 80;
	return lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(stringWidth(line) / width)), 0);
};
const renderSearchLines = (options) => {
	const maxVisible = options.maxVisible ?? 8;
	const filtered = filterSearchItems(options.items, options.query);
	const cursor = Math.max(0, Math.min(options.cursor, Math.max(0, filtered.length - 1)));
	const start = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), filtered.length - maxVisible));
	const visible = filtered.slice(start, start + maxVisible);
	const lines = [];
	const marker = options.state === "cancel" ? style(theme, "danger", symbols.fail) : options.state === "submit" ? style(theme, "success", symbols.stepDone) : style(theme, "accent", symbols.stepActive);
	lines.push(` ${marker} ${style(theme, "bold", options.message)}`);
	if (options.state === "cancel") {
		lines.push(` ${style(theme, "muted", symbols.rail)} ${style(theme, "muted", "Cancelled")}`);
		return lines;
	}
	if (options.state === "submit") {
		const selected = options.items.filter((item) => options.selected.has(item.value));
		const label = selected.length > 0 ? selected.map((item) => item.label).join(", ") : "No selection";
		lines.push(` ${style(theme, "muted", symbols.rail)} ${style(theme, "muted", label)}`);
		return lines;
	}
	lines.push(` ${style(theme, "muted", symbols.rail)} ${style(theme, "muted", "Search:")} ${options.query}${style(theme, "dim", "_")}`);
	lines.push(` ${style(theme, "muted", symbols.rail)} ${style(theme, "muted", options.mode === "multi" ? "type to filter, arrows move, space toggles, enter confirms" : "type to filter, arrows move, enter selects")}`);
	lines.push(` ${style(theme, "muted", symbols.rail)}`);
	if (visible.length === 0) lines.push(` ${style(theme, "muted", symbols.rail)} ${style(theme, "muted", "No matches")}`);
	else for (const [offset, item] of visible.entries()) {
		const active = start + offset === cursor;
		const selected = options.selected.has(item.value);
		const pointer = active ? style(theme, "info", symbols.engineActive) : " ";
		const radio = options.mode === "multi" ? selected ? style(theme, "success", symbols.pass) : style(theme, "muted", symbols.pending) : active ? style(theme, "accent", symbols.bullet) : style(theme, "muted", symbols.pending);
		const label = active ? style(theme, "bold", item.label) : item.label;
		const hint = item.hint ? ` ${style(theme, "muted", truncate(item.hint, 72))}` : "";
		lines.push(` ${style(theme, "muted", symbols.rail)} ${pointer} ${radio} ${label}${hint}`);
	}
	const hiddenBefore = start;
	const hiddenAfter = Math.max(0, filtered.length - (start + visible.length));
	if (hiddenBefore > 0 || hiddenAfter > 0) {
		const parts = [];
		if (hiddenBefore > 0) parts.push(`up ${hiddenBefore} more`);
		if (hiddenAfter > 0) parts.push(`down ${hiddenAfter} more`);
		lines.push(` ${style(theme, "muted", symbols.rail)} ${style(theme, "muted", parts.join(" · "))}`);
	}
	if (options.mode === "multi") {
		const picked = options.items.filter((item) => options.selected.has(item.value));
		const summary = picked.length === 0 ? "Selected: none" : picked.length <= 3 ? `Selected: ${picked.map((item) => item.label).join(", ")}` : `Selected: ${picked.slice(0, 3).map((item) => item.label).join(", ")} +${picked.length - 3} more`;
		lines.push(` ${style(theme, "muted", symbols.rail)}`);
		lines.push(` ${style(theme, "muted", symbols.rail)} ${style(theme, "success", summary)}`);
	}
	lines.push(` ${style(theme, "muted", symbols.railEnd)}`);
	return lines;
};
const runSearchPrompt = async (options) => {
	if (!process.stdin.isTTY || !process.stdout.isTTY) return options.mode === "multi" ? options.initialSelected ?? [] : null;
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: silentOutput,
			terminal: false
		});
		readline.emitKeypressEvents(process.stdin, rl);
		process.stdin.setRawMode(true);
		let query = "";
		let cursor = 0;
		let lastRows = 0;
		const selected = new Set(options.initialSelected ?? []);
		const clear = () => {
			if (lastRows === 0) return;
			process.stdout.write(`\x1b[${lastRows}A`);
			for (let i = 0; i < lastRows; i++) process.stdout.write("\x1B[2K\x1B[1B");
			process.stdout.write(`\x1b[${lastRows}A`);
		};
		const render = (state = "active") => {
			clear();
			const lines = renderSearchLines({
				...options,
				query,
				cursor,
				selected,
				state
			});
			process.stdout.write(`${lines.join("\n")}\n`);
			lastRows = countRows(lines, process.stdout.columns);
		};
		const cleanup = () => {
			process.stdin.removeListener("keypress", onKeypress);
			process.stdin.setRawMode(false);
			rl.close();
		};
		const submit = () => {
			const item = filterSearchItems(options.items, query)[cursor];
			if (options.mode === "single") {
				if (!item) {
					if (options.required) return;
					render("cancel");
					cleanup();
					resolve(null);
					return;
				}
				selected.clear();
				selected.add(item.value);
				render("submit");
				cleanup();
				resolve(item.value);
				return;
			}
			if (options.required && selected.size === 0) return;
			render("submit");
			cleanup();
			resolve([...selected]);
		};
		const cancel = () => {
			render("cancel");
			cleanup();
			resolve(null);
		};
		const onKeypress = (_str, key) => {
			if (!key) return;
			const filtered = filterSearchItems(options.items, query);
			if (key.name === "return") {
				submit();
				return;
			}
			if (key.name === "escape" || key.ctrl && key.name === "c") {
				cancel();
				return;
			}
			if (key.name === "up") {
				cursor = Math.max(0, cursor - 1);
				render();
				return;
			}
			if (key.name === "down") {
				cursor = Math.min(Math.max(0, filtered.length - 1), cursor + 1);
				render();
				return;
			}
			if (key.name === "space" && options.mode === "multi") {
				const item = filtered[cursor];
				if (item) if (selected.has(item.value)) selected.delete(item.value);
				else selected.add(item.value);
				render();
				return;
			}
			if (key.name === "backspace") {
				query = query.slice(0, -1);
				cursor = 0;
				render();
				return;
			}
			if (key.sequence && !key.ctrl && !key.meta && key.sequence.length === 1) {
				query += key.sequence;
				cursor = 0;
				render();
			}
		};
		process.stdin.on("keypress", onKeypress);
		render();
	});
};
const searchSelect = async (options) => await runSearchPrompt({
	...options,
	mode: "single"
});
const searchMultiselect = async (options) => await runSearchPrompt({
	...options,
	mode: "multi",
	initialSelected: options.initialSelected
});

//#endregion
//#region src/commands/hook.ts
const HOOK_FLUSH_TIMEOUT_MS = 1500;
const AGENT_LABELS = {
	claude: {
		label: "Claude Code",
		hint: "PostToolUse, runtime"
	},
	cursor: {
		label: "Cursor",
		hint: "afterFileEdit, runtime"
	},
	gemini: {
		label: "Gemini CLI",
		hint: "AfterTool, runtime"
	},
	pi: {
		label: "pi",
		hint: "extension, runtime"
	},
	codex: {
		label: "Codex CLI",
		hint: "rules-only"
	},
	windsurf: {
		label: "Windsurf",
		hint: "rules-only, project"
	},
	cline: {
		label: "Cline + Roo",
		hint: "rules-only, project"
	},
	kilocode: {
		label: "Kilo Code",
		hint: "rules-only, project"
	},
	antigravity: {
		label: "Antigravity",
		hint: "rules-only, project"
	},
	copilot: {
		label: "GitHub Copilot",
		hint: "rules-only, project"
	}
};
const resolveOpts = (agent, flags) => {
	const scope = AGENTS_PROJECT_ONLY.includes(agent) ? "project" : flags.scope;
	return {
		home: os.homedir(),
		cwd: process.cwd(),
		scope,
		dryRun: flags.dryRun,
		qualityGate: flags.qualityGate
	};
};
const printPlan = (agent, result) => {
	if (result.planned.length === 0) {
		process.stdout.write(`  ${agent}: already up to date\n`);
		return;
	}
	process.stdout.write(`  ${agent}:\n`);
	for (const op of result.planned) process.stdout.write(`    ${style(theme, "dim", "+")} ${op.path} — ${op.summary}\n`);
};
const hookInstall = async (flags) => {
	if (flags.dryRun) process.stdout.write("aislop hook install (dry-run)\n\n");
	for (const agent of flags.agents) {
		const opts = resolveOpts(agent, flags);
		const result = REGISTRY[agent].install(opts);
		if (flags.dryRun) {
			printPlan(agent, result);
			continue;
		}
		if (result.wrote.length === 0) {
			process.stdout.write(`${agent}: nothing to do (already up to date)\n`);
			continue;
		}
		for (const f of result.wrote) process.stdout.write(`  wrote  ${f}\n`);
		for (const f of result.skipped) process.stdout.write(`  skip   ${f}\n`);
	}
	if (flags.dryRun) process.stdout.write("\nNo files touched. Re-run without --dry-run to apply.\n");
};
const hookUninstall = async (flags) => {
	if (flags.dryRun) process.stdout.write("aislop hook uninstall (dry-run)\n\n");
	for (const agent of flags.agents) {
		const opts = resolveOpts(agent, flags);
		const result = REGISTRY[agent].uninstall(opts);
		if (result.removed.length === 0) {
			process.stdout.write(`${agent}: nothing installed\n`);
			continue;
		}
		for (const f of result.removed) process.stdout.write(`  remove  ${f}\n`);
		for (const f of result.skipped) process.stdout.write(`  skip    ${f}\n`);
	}
};
const hookStatus = async () => {
	const home = os.homedir();
	const cwd = process.cwd();
	process.stdout.write("aislop hook status\n\n");
	const installed = new Set(detectInstalledAgents({
		home,
		cwd
	}));
	for (const agent of ALL_AGENTS) {
		const scope = defaultScopeFor(agent);
		const hits = REGISTRY[agent].paths({
			home,
			cwd,
			scope
		}).filter((p) => fs.existsSync(p));
		const status = installed.has(agent) ? "installed" : "not installed";
		const marker = installed.has(agent) ? "✓" : "·";
		process.stdout.write(`  ${marker} ${agent.padEnd(12)} ${scope.padEnd(8)} ${status}\n`);
		for (const p of hits) process.stdout.write(`      ${p}\n`);
	}
};
const hookRun = async (agent, flags) => {
	if (process.stdin.isTTY) {
		process.stderr.write(`aislop hook ${agent} is an internal callback the agent invokes automatically. It reads a payload on stdin and has nothing to do interactively.\n\nYou probably want:\n  aislop hook install --${agent}     (install the hook for ${agent})\n  aislop hook status                   (see what's installed)\n  aislop hook uninstall --${agent}   (remove it)\n`);
		process.exit(0);
	}
	let exitCode = 0;
	if (agent === "claude") if (flags?.onFileChanged) exitCode = await runClaudeFileChangedHook();
	else if (flags?.stop) exitCode = await runClaudeStopHook();
	else exitCode = await runClaudeHook();
	else if (agent === "cursor") exitCode = await runCursorHook();
	else if (agent === "gemini") exitCode = await runGeminiHook();
	else if (agent === "pi") exitCode = await runPiHook();
	else {
		process.stderr.write(`hook: agent "${agent}" has no runtime adapter (rules-file-only)\n`);
		process.exit(0);
	}
	await flushTelemetry(HOOK_FLUSH_TIMEOUT_MS);
	process.exit(exitCode);
};
const hookBaseline = async () => {
	const result = await captureBaseline(process.cwd());
	process.stdout.write(`baseline captured: score=${result.score} files=${result.fileCount}\n`);
	process.stdout.write(`  -> ${result.path}\n`);
};
const parseAgentFlag = (raw, fallback) => {
	if (!raw) return fallback;
	const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
	const unknown = parts.filter((p) => !ALL_AGENTS.includes(p));
	if (unknown.length > 0) throw new Error(`Unknown agent(s): ${unknown.join(", ")}. Valid: ${ALL_AGENTS.join(", ")}`);
	return parts;
};
const defaultInstallTargets = () => {
	return AGENTS_SUPPORTING_BOTH_SCOPES;
};
const resolveAgents = (perAgentFlags, positional, agentFlag, fallback) => {
	const flagged = ALL_AGENTS.filter((a) => perAgentFlags[a] === true);
	if (flagged.length > 0) return flagged;
	if (positional.length > 0) {
		const unknown = positional.filter((p) => !ALL_AGENTS.includes(p));
		if (unknown.length > 0) throw new Error(`Unknown agent(s): ${unknown.join(", ")}. Valid: ${ALL_AGENTS.join(", ")}`);
		return positional;
	}
	return parseAgentFlag(agentFlag, fallback);
};
const hasExplicitAgentSelection = (perAgentFlags, positional, agentFlag) => {
	if (ALL_AGENTS.some((a) => perAgentFlags[a] === true)) return true;
	if (positional.length > 0) return true;
	if (typeof agentFlag === "string" && agentFlag.trim().length > 0) return true;
	return false;
};
const promptAgentSelection = async (mode, deps = {}) => {
	const installed = deps.installed ?? [];
	const pool = mode === "uninstall" ? installed : ALL_AGENTS;
	if (pool.length === 0) return [];
	const preChecked = mode === "uninstall" ? installed : AGENTS_SUPPORTING_BOTH_SCOPES;
	return await searchMultiselect({
		message: mode === "install" ? "Which agents should get aislop hooks?" : "Which agent hooks should be removed?",
		items: pool.map((a) => ({
			value: a,
			label: AGENT_LABELS[a].label,
			hint: AGENT_LABELS[a].hint,
			keywords: [a]
		})),
		initialSelected: preChecked.filter((a) => pool.includes(a)),
		required: false
	});
};

//#endregion
//#region src/cli/hook-command.ts
const AGENT_NAMES = [
	"claude",
	"cursor",
	"gemini",
	"pi",
	"codex",
	"windsurf",
	"cline",
	"kilocode",
	"antigravity",
	"copilot"
];
const resolveScope = (flags) => {
	if (flags.project) return "project";
	if (flags.global) return "global";
	return "global";
};
const promptForUninstall = async () => {
	const installed = detectInstalledAgents({
		home: os.homedir(),
		cwd: process.cwd()
	});
	if (installed.length === 0) {
		process.stdout.write("No aislop hooks installed. Nothing to uninstall.\n");
		return [];
	}
	const picked = await promptAgentSelection("uninstall", { installed });
	if (picked === null) {
		process.stdout.write("Cancelled.\n");
		return null;
	}
	if (picked.length === 0) {
		process.stdout.write("No agents selected. Nothing to uninstall.\n");
		return [];
	}
	return picked;
};
const promptForInstall = async () => {
	const picked = await promptAgentSelection("install");
	if (picked === null) {
		process.stdout.write("Cancelled.\n");
		return null;
	}
	if (picked.length === 0) {
		process.stdout.write("No agents selected. Nothing to install.\n");
		return [];
	}
	return picked;
};
const pickAgents = async (mode, opts, positional) => {
	if (hasExplicitAgentSelection(opts, positional, opts.agent)) return resolveAgents(opts, positional, opts.agent, defaultInstallTargets());
	if (!process.stdin.isTTY) return defaultInstallTargets();
	return mode === "uninstall" ? promptForUninstall() : promptForInstall();
};
const addAgentShortcutOptions = (command) => {
	for (const a of AGENT_NAMES) command.option(`--${a}`, `shortcut for --agent ${a}`);
	return command;
};
const addInstallOptions = (command) => addAgentShortcutOptions(command.option("--agent <names>", "comma-separated agent list (claude,cursor,gemini,codex,windsurf,cline,kilocode,antigravity,copilot)").option("-g, --global", "install to the user-scope config (default)").option("--project", "install to the project-scope config").option("--dry-run", "print the planned diff without writing").option("--yes", "skip the confirmation prompt (reserved)").option("--quality-gate", "add a Stop hook that blocks when score regresses below baseline (Claude only)"));
const addUninstallOptions = (command) => addAgentShortcutOptions(command.option("--agent <names>", "comma-separated agent list").option("-g, --global", "uninstall from user-scope config").option("--project", "uninstall from project-scope config").option("--dry-run", "print the planned removal without writing"));
const runInstallAction = async (positional, opts) => {
	const agents = await pickAgents("install", opts, positional);
	if (agents === null || agents.length === 0) return;
	await withCommandLifecycle({
		command: "hook_install",
		config: loadConfig(process.cwd()).telemetry
	}, async () => {
		await hookInstall({
			agents,
			scope: resolveScope(opts),
			dryRun: Boolean(opts.dryRun),
			yes: Boolean(opts.yes),
			qualityGate: Boolean(opts.qualityGate)
		});
		return { exitCode: 0 };
	});
};
const runUninstallAction = async (positional, opts) => {
	const agents = await pickAgents("uninstall", opts, positional);
	if (agents === null || agents.length === 0) return;
	await withCommandLifecycle({
		command: "hook_uninstall",
		config: loadConfig(process.cwd()).telemetry
	}, async () => {
		await hookUninstall({
			agents,
			scope: resolveScope(opts),
			dryRun: Boolean(opts.dryRun),
			yes: true,
			qualityGate: false
		});
		return { exitCode: 0 };
	});
};
const normalizeHookAliasAgents = (agents) => {
	const [first, ...rest] = agents;
	return first === "hook" || first === "hooks" ? rest : agents;
};
const registerInstall = (hook) => {
	addInstallOptions(hook.command("install [agents...]").description("Install hooks for one or more coding agents. Use positional agents, per-agent flags, or --agent.")).action(runInstallAction);
};
const registerUninstall = (hook) => {
	addUninstallOptions(hook.command("uninstall [agents...]").description("Remove hooks for one or more coding agents. Use positional agents, per-agent flags, or --agent.")).action(runUninstallAction);
};
const registerCallbacks = (hook) => {
	hook.command("status").description("Show installed agent hooks").action(async () => {
		await withCommandLifecycle({
			command: "hook_status",
			config: loadConfig(process.cwd()).telemetry
		}, async () => {
			await hookStatus();
			return { exitCode: 0 };
		});
	});
	hook.command("baseline").description("Capture the current score as the hook baseline").action(async () => {
		await withCommandLifecycle({
			command: "hook_baseline",
			config: loadConfig(process.cwd()).telemetry
		}, async () => {
			await hookBaseline();
			return { exitCode: 0 };
		});
	});
	hook.command("claude", { hidden: true }).description("Internal: Claude Code PostToolUse / Stop / FileChanged callback (reads stdin)").option("--stop", "run in Stop-hook mode for the quality gate").option("--on-file-changed", "run in FileChanged mode (refresh baseline on watched file change)").action(async (opts) => {
		await hookRun("claude", {
			stop: Boolean(opts.stop),
			onFileChanged: Boolean(opts.onFileChanged)
		});
	});
	hook.command("cursor", { hidden: true }).description("Internal: Cursor afterFileEdit callback (reads stdin)").action(async () => {
		await hookRun("cursor");
	});
	hook.command("gemini", { hidden: true }).description("Internal: Gemini CLI AfterTool callback (reads stdin)").action(async () => {
		await hookRun("gemini");
	});
	hook.command("pi", { hidden: true }).description("Internal: pi extension tool_result callback (reads stdin)").action(async () => {
		await hookRun("pi");
	});
};
const registerHookCommand = (program) => {
	const hook = program.command("hook").alias("hooks").description("Manage per-edit coding-agent hooks");
	registerInstall(hook);
	registerUninstall(hook);
	registerCallbacks(hook);
};
const registerHookAliases = (program) => {
	addInstallOptions(program.command("install [agents...]").description("Install coding-agent hooks (alias: hook install)")).action(async (agents, opts) => {
		await runInstallAction(normalizeHookAliasAgents(agents), opts);
	});
	addUninstallOptions(program.command("uninstall [agents...]").description("Remove coding-agent hooks (alias: hook uninstall)")).action(async (agents, opts) => {
		await runUninstallAction(normalizeHookAliasAgents(agents), opts);
	});
};

//#endregion
//#region src/commands/badge.ts
const GITHUB_REMOTE_RE = /^(?:git@github\.com:|https:\/\/(?:[^@]+@)?github\.com\/)([^/]+)\/([^/.\s]+?)(?:\.git)?\s*$/;
const renderBadgeOutput = ({ owner, repo, svgUrl, pageUrl }) => {
	const slug = `${owner}/${repo}`;
	const markdown = `[![aislop](${svgUrl})](${pageUrl})`;
	return [
		``,
		`  Repository:  ${slug}`,
		`  Badge URL:   ${svgUrl}`,
		``,
		`  Markdown:`,
		``,
		`    ${markdown}`,
		``,
		`  Drop the line above into your README. The badge auto-updates after every public scan.`,
		``
	].join("\n");
};
const detectGithubSlugFromGit = (directory) => {
	let raw;
	try {
		raw = execSync("git remote get-url origin", {
			cwd: path.resolve(directory),
			encoding: "utf-8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		});
	} catch {
		return null;
	}
	const match = raw.trim().match(GITHUB_REMOTE_RE);
	if (!match) return null;
	const owner = match[1];
	const repo = match[2];
	if (!owner || !repo) return null;
	return {
		owner,
		repo
	};
};
const badgeCommand = async (options = {}) => {
	let owner = options.owner?.trim();
	let repo = options.repo?.trim();
	if (!owner || !repo) {
		const detected = detectGithubSlugFromGit(options.directory ?? ".");
		if (!detected) throw new Error("Could not detect a GitHub remote. Run from a repo with `git remote get-url origin` set, or pass --owner and --repo.");
		owner ??= detected.owner;
		repo ??= detected.repo;
	}
	const svgUrl = `https://badges.scanaislop.com/score/${owner}/${repo}.svg`;
	const pageUrl = `https://scanaislop.com/${owner}/${repo}`;
	const output = renderBadgeOutput({
		owner,
		repo,
		svgUrl,
		pageUrl
	});
	if (options.json) process.stdout.write(`${JSON.stringify({
		owner,
		repo,
		svgUrl,
		pageUrl
	})}\n`);
	else process.stdout.write(output);
	return {
		owner,
		repo,
		svgUrl,
		pageUrl,
		output
	};
};

//#endregion
//#region src/ui/error.ts
const renderError = (input, deps = {}) => {
	const t = deps.theme ?? theme;
	const s = deps.symbols ?? symbols;
	const lines = [`\n ${style(t, "danger", s.fail)} ${style(t, "danger", input.message)}`];
	if (input.cause) lines.push(` ${style(t, "muted", s.rail)} ${style(t, "muted", input.cause)}`);
	if (input.hints && input.hints.length > 0 || input.docsUrl) lines.push("");
	for (const hint of input.hints ?? []) lines.push(` ${style(t, "accent", s.hint)} ${hint}`);
	if (input.docsUrl) lines.push(` ${style(t, "accent", s.hint)} Docs: ${input.docsUrl}`);
	lines.push("");
	return lines.join("\n");
};

//#endregion
//#region src/output/engine-info.ts
const ENGINE_INFO = {
	format: {
		label: "Formatting",
		description: "Whitespace, indentation, line wrapping, and import ordering"
	},
	lint: {
		label: "Linting",
		description: "Static analysis for likely bugs and bad patterns"
	},
	"code-quality": {
		label: "Code Quality",
		description: "Complexity limits, dead code detection, and duplication checks"
	},
	"ai-slop": {
		label: "AI Slop",
		description: "Narrative comments, dead patterns, unsafe type casts, TODO stubs, generic names"
	},
	architecture: {
		label: "Architecture",
		description: "Project-specific import and layering rules"
	},
	security: {
		label: "Security",
		description: "Secret leaks, risky APIs, and dependency vulnerabilities"
	}
};
const getEngineLabel = (engine) => ENGINE_INFO[engine].label;

//#endregion
//#region src/ui/logger.ts
/**
* Render a single accent-green `→` hint line, consistent across every command.
* Callers typically do: `process.stdout.write(renderHintLine("Run ..."))`.
*/
const renderHintLine = (hint, deps = {}) => {
	return ` ${style(deps.theme ?? theme, "accent", (deps.symbols ?? symbols).hint)} ${hint}\n`;
};
const createLogger = (deps = {}) => {
	const t = deps.theme ?? theme;
	const s = deps.symbols ?? symbols;
	const write = deps.write ?? ((out) => process.stdout.write(out));
	const line = (glyph, token, msg) => {
		write(` ${style(t, token, glyph)} ${msg}\n`);
	};
	return {
		success: (msg) => line(s.pass, "success", msg),
		error: (msg) => line(s.fail, "danger", msg),
		warn: (msg) => line(s.warn, "warn", msg),
		info: (msg) => line(s.bullet, "info", msg),
		hint: (msg) => line(s.hint, "accent", msg),
		muted: (msg) => write(` ${style(t, "muted", msg)}\n`),
		step: (msg) => line(s.stepActive, "accent", msg),
		break: () => write("\n"),
		raw: (msg) => write(`${msg}\n`)
	};
};
const log = createLogger();

//#endregion
//#region src/output/terminal.ts
const groupBy = (items, key) => {
	const map = /* @__PURE__ */ new Map();
	for (const item of items) {
		const k = key(item);
		const group = map.get(k) ?? [];
		group.push(item);
		map.set(k, group);
	}
	return map;
};
const colorBySeverity = (text, severity) => severity === "error" ? style(theme, "danger", text) : style(theme, "warn", text);
const toElapsedLabel = (elapsedMs) => elapsedMs < 1e3 ? `${Math.round(elapsedMs)}ms` : `${(elapsedMs / 1e3).toFixed(1)}s`;
const toSeverityLabel = (severity) => {
	if (severity === "error") return "ERROR";
	if (severity === "warning") return "WARN";
	return "INFO";
};
const toLocationLabel = (diagnostic) => {
	const line = diagnostic.line > 0 ? `:${diagnostic.line}` : "";
	const column = diagnostic.column > 0 ? `:${diagnostic.column}` : "";
	return `${diagnostic.filePath}${line}${column}`;
};
const wrapText = (text, maxWidth, firstIndentWidth, contIndent) => {
	const firstWidth = Math.max(20, maxWidth - firstIndentWidth);
	const contWidth = Math.max(20, maxWidth - contIndent.length);
	const words = text.split(/\s+/).filter((w) => w.length > 0);
	const lines = [];
	let current = "";
	for (const word of words) {
		const budget = lines.length === 0 ? firstWidth : contWidth;
		if (current.length === 0) current = word;
		else if (current.length + 1 + word.length <= budget) current = `${current} ${word}`;
		else {
			lines.push(current);
			current = word;
		}
	}
	if (current.length > 0) lines.push(current);
	return lines.map((line, i) => i === 0 ? line : `${contIndent}${line}`);
};
const wrapHelpText = (text, maxWidth, indent) => {
	return wrapText(text, maxWidth, indent.length, indent).map((seg, i) => i === 0 ? `${indent}${seg}` : seg);
};
const terminalWidth = () => {
	const raw = process.stdout.columns;
	if (typeof raw !== "number" || raw <= 0) return 120;
	return Math.min(raw, 120);
};
const renderRuleHeader = (first, count, lines) => {
	const level = toSeverityLabel(first.severity);
	const countLabel = count > 1 ? ` (${count})` : "";
	const status = colorBySeverity(level, first.severity);
	const fixableTag = first.fixable ? ` ${style(theme, "muted", "[auto]")}` : "";
	const fixableWidth = first.fixable ? 7 : 0;
	const badgePrefix = `    [${status}]${fixableTag} `;
	const badgePrefixWidth = 5 + level.length + 1 + fixableWidth + 1;
	const wrapped = wrapText(`${first.message}${countLabel}`, terminalWidth(), badgePrefixWidth, "      ");
	lines.push(`${badgePrefix}${wrapped[0]}`);
	for (let i = 1; i < wrapped.length; i++) lines.push(wrapped[i]);
};
const renderLocations = (ruleDiags, verbose, lines) => {
	const unique = [];
	const seen = /* @__PURE__ */ new Set();
	for (const d of ruleDiags) {
		const label = toLocationLabel(d);
		const detail = d.detail ?? "";
		const key = `${label}|${detail}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push({
			label,
			detail
		});
	}
	const shown = verbose ? unique : unique.slice(0, 3);
	const maxLabel = shown.reduce((w, l) => Math.max(w, l.label.length), 0);
	for (const { label, detail } of shown) {
		const padded = detail ? `${label.padEnd(maxLabel)}  ${detail}` : label;
		lines.push(style(theme, "muted", `      ${padded}`));
	}
	if (!verbose && unique.length > shown.length) lines.push(style(theme, "muted", `      +${unique.length - shown.length} more location(s), use -d for full list`));
};
const renderHiddenFooter = (sorted, maxRules, lines) => {
	const hidden = sorted.slice(maxRules);
	const hiddenErrors = hidden.reduce((acc, [, diags]) => acc + (diags[0].severity === "error" ? diags.length : 0), 0);
	const hiddenWarnings = hidden.reduce((acc, [, diags]) => acc + (diags[0].severity === "warning" ? diags.length : 0), 0);
	const parts = [];
	if (hiddenErrors > 0) parts.push(`${hiddenErrors} error${hiddenErrors === 1 ? "" : "s"}`);
	if (hiddenWarnings > 0) parts.push(`${hiddenWarnings} warning${hiddenWarnings === 1 ? "" : "s"}`);
	const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
	lines.push(style(theme, "muted", `    ... and ${hidden.length} more rules hidden${detail}. Run with -v or --verbose to see full output.`));
	lines.push("");
};
const renderDiagnostics = (diagnostics, verbose) => {
	const lines = [];
	const byEngine = groupBy(diagnostics, (d) => d.engine);
	for (const [engine, engineDiags] of byEngine) {
		const label = getEngineLabel(engine);
		lines.push(`  ${style(theme, "bold", `${symbols.engineActive} ${label}`)}`);
		const sorted = [...groupBy(engineDiags, (d) => `${d.rule}:${d.message}`).entries()].sort(([, a], [, b]) => {
			const sa = a[0].severity === "error" ? 0 : a[0].severity === "warning" ? 1 : 2;
			const sb = b[0].severity === "error" ? 0 : b[0].severity === "warning" ? 1 : 2;
			if (sa !== sb) return sa - sb;
			return b.length - a.length;
		});
		const maxRules = verbose ? Infinity : 40;
		for (const [, ruleDiags] of sorted.slice(0, maxRules)) {
			const first = ruleDiags[0];
			renderRuleHeader(first, ruleDiags.length, lines);
			renderLocations(ruleDiags, verbose, lines);
			if (first.help) {
				const wrapped = wrapHelpText(first.help, terminalWidth(), "      ");
				for (const line of wrapped) lines.push(style(theme, "muted", line));
			}
			lines.push("");
		}
		if (sorted.length > maxRules) renderHiddenFooter(sorted, maxRules, lines);
	}
	return `${lines.join("\n")}\n`;
};
const printEngineStatus = (result) => {
	const label = getEngineLabel(result.engine);
	const elapsed = toElapsedLabel(result.elapsed);
	if (result.skipped) log.warn(`${label}: skipped${result.skipReason ? ` (${result.skipReason})` : ""}`);
	else if (result.diagnostics.length === 0) log.success(`${label}: done (0 issues, ${elapsed})`);
	else {
		const errors = result.diagnostics.filter((d) => d.severity === "error").length;
		const warnings = result.diagnostics.filter((d) => d.severity === "warning").length;
		const parts = [];
		if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
		if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
		const statusText = `${parts.join(", ")}, ${elapsed}`;
		if (errors > 0) log.error(`${label}: done (${statusText})`);
		else log.warn(`${label}: done (${statusText})`);
	}
};

//#endregion
//#region src/scoring/rule-severity.ts
/**
* Apply per-rule severity overrides from config: "off" drops the diagnostic,
* "error"/"warning" rewrite its severity before scoring and rendering.
*/
const applyRuleSeverities = (diagnostics, overrides) => {
	if (Object.keys(overrides).length === 0) return diagnostics;
	const result = [];
	for (const diagnostic of diagnostics) {
		const override = overrides[diagnostic.rule];
		if (!override) {
			result.push(diagnostic);
			continue;
		}
		if (override === "off") continue;
		result.push(override === diagnostic.severity ? diagnostic : {
			...diagnostic,
			severity: override
		});
	}
	return result;
};

//#endregion
//#region src/ui/header.ts
const TAGLINE = "the quality gate for agentic coding";
const renderHeader = (input, _deps = {}) => {
	const t = _deps.theme ?? theme;
	const sep = style(t, "accent", "·");
	const brand = style(t, "accent", "aislop");
	const version = style(t, "accentDim", input.version);
	const showBrand = input.brand !== false;
	const brandLine = ` ${brand} ${version}  ${sep}  ${TAGLINE}`;
	if (input.command === "--bare") return showBrand ? `${brandLine}\n\n` : "";
	const contextParts = [input.command, ...input.context].filter((p) => p && p.length > 0);
	const subLine = contextParts.length > 0 ? ` ${contextParts.map((p, i) => i === 0 ? style(t, "fg", p) : style(t, "muted", p)).join(`  ${sep}  `)}` : "";
	if (!showBrand) return subLine ? `${subLine}\n\n` : "";
	return subLine ? `${brandLine}\n\n${subLine}\n\n` : `${brandLine}\n\n`;
};

//#endregion
//#region src/ui/live-grid.ts
const SPINNER = [
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏"
];
const fmtElapsed = (ms) => ms === void 0 ? "—" : ms < 1e3 ? `${Math.round(ms)}ms` : `${(ms / 1e3).toFixed(1)}s`;
const glyphFor$1 = (row, s, frame) => {
	if (row.status === "skipped") return {
		glyph: s.neutral,
		token: "muted"
	};
	if (row.status === "queued") return {
		glyph: s.pending,
		token: "muted"
	};
	if (row.status === "running") return {
		glyph: SPINNER[frame % SPINNER.length],
		token: "info"
	};
	if (row.outcome === "fail") return {
		glyph: s.fail,
		token: "danger"
	};
	if (row.outcome === "warn") return {
		glyph: s.warn,
		token: "warn"
	};
	return {
		glyph: s.pass,
		token: "success"
	};
};
const statusText = (row) => {
	if (row.summary) return row.summary;
	if (row.status === "running") return "running";
	if (row.status === "queued") return "queued";
	if (row.status === "skipped") return "skipped";
	return "done";
};
const renderGridFrame = (input, deps = {}) => {
	const t = deps.theme ?? theme;
	const s = deps.symbols ?? symbols;
	const labelW = deps.labelWidth ?? 18;
	const statusW = deps.statusWidth ?? 12;
	const elapsedW = deps.elapsedWidth ?? 6;
	const frame = deps.spinnerFrame ?? 0;
	return `${input.rows.map((row) => {
		const { glyph, token } = glyphFor$1(row, s, frame);
		const label = padEnd(row.label, labelW);
		const status = padEnd(statusText(row), statusW);
		const elapsed = padStart(fmtElapsed(row.elapsedMs), elapsedW);
		return ` ${style(t, token, glyph)} ${label}  ${style(t, "muted", status)}  ${style(t, "muted", elapsed)}`;
	}).join("\n")}\n`;
};
var LiveGrid = class {
	rows;
	frame = 0;
	previousLines = 0;
	timer;
	write;
	tty;
	constructor(rows, opts = {}) {
		this.rows = rows;
		this.write = opts.write ?? ((s) => process.stderr.write(s));
		this.tty = opts.tty ?? Boolean(process.stderr.isTTY);
	}
	start() {
		if (!this.tty) return;
		this.render();
		this.timer = setInterval(() => {
			this.frame += 1;
			this.render();
		}, 100);
		this.timer.unref();
	}
	update(key, patch) {
		const row = this.rows.find((r) => (r.key ?? r.label) === key);
		if (!row) return;
		Object.assign(row, patch);
		this.render();
	}
	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = void 0;
		}
		if (!this.tty) {
			for (const row of this.rows) this.write(`${row.label} ${statusText(row)} ${fmtElapsed(row.elapsedMs)}\n`);
			return;
		}
		this.render();
	}
	render() {
		if (!this.tty) return;
		if (this.previousLines > 0) {
			this.write(`\x1B[${this.previousLines}F`);
			for (let i = 0; i < this.previousLines; i += 1) {
				this.write("\x1B[2K");
				if (i < this.previousLines - 1) this.write("\x1B[1E");
			}
			if (this.previousLines > 1) this.write(`\x1B[${this.previousLines - 1}F`);
		}
		const out = renderGridFrame({ rows: this.rows }, { spinnerFrame: this.frame });
		this.write(out);
		this.previousLines = out.split("\n").length - 1;
	}
};

//#endregion
//#region src/utils/history.ts
const HISTORY_FILE = "history.jsonl";
const isHistoryDisabled = (env = process.env) => env.AISLOP_NO_HISTORY === "1";
const historyPath = (directory) => path.join(path.resolve(directory), CONFIG_DIR, HISTORY_FILE);
/**
* Append a compact scan record to .aislop/history.jsonl. Best-effort: never
* throws, so a read-only checkout or missing config dir can't break a scan.
*/
const appendHistory = (input) => {
	if (isHistoryDisabled()) return;
	const configDir = path.join(path.resolve(input.directory), CONFIG_DIR);
	if (!fs.existsSync(configDir)) return;
	const record = {
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		score: input.score,
		errors: input.errors,
		warnings: input.warnings,
		files: input.files,
		cliVersion: APP_VERSION
	};
	try {
		fs.appendFileSync(historyPath(input.directory), `${JSON.stringify(record)}\n`);
	} catch {}
};
const isHistoryRecord = (value) => {
	if (!value || typeof value !== "object") return false;
	const record = value;
	return typeof record.timestamp === "string" && typeof record.score === "number" && typeof record.errors === "number" && typeof record.warnings === "number" && typeof record.files === "number" && typeof record.cliVersion === "string";
};
const readHistory = (directory) => {
	const file = historyPath(directory);
	if (!fs.existsSync(file)) return [];
	const records = [];
	for (const line of fs.readFileSync(file, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (isHistoryRecord(parsed)) records.push(parsed);
		} catch {}
	}
	return records;
};

//#endregion
//#region src/commands/scan-coverage.ts
const coverageReason = (c) => {
	if (c.supportedFiles === 0 && c.dominantUnsupported) return `This repository is ${c.dominantUnsupported} (${c.unsupportedFiles} files), which aislop does not analyze. No score — it would not reflect this code.`;
	if (c.supportedFiles === 0) return "No files in a language aislop analyzes (TypeScript, JavaScript, Python, Go, Rust, Ruby, PHP, Java). Nothing to score.";
	const lang = c.dominantUnsupported ?? "an unsupported language";
	const files = `${c.supportedFiles} supported file${c.supportedFiles === 1 ? "" : "s"}`;
	return `This repository is mostly ${lang} (${c.unsupportedFiles} files); aislop analyzed only ${files}. Score withheld — it would represent a sliver of the codebase.`;
};
const renderCoverageNotice = (projectInfo, includeHeader) => {
	const deps = {
		theme: createTheme(),
		symbols: createSymbols({ plain: false })
	};
	return `${includeHeader === false ? "" : renderHeader({
		version: APP_VERSION,
		command: "Scan result",
		context: [
			projectInfo.projectName,
			projectInfo.languages[0] ?? "unknown",
			`${projectInfo.sourceFileCount} files`
		],
		brand: true
	}, deps)}  ${coverageReason(projectInfo.coverage)}\n\n`;
};

//#endregion
//#region src/commands/scan-exit-code.ts
const computeScanExitCode = (opts) => opts.hasErrors || opts.scoreable && opts.score < opts.failBelow ? 1 : 0;

//#endregion
//#region src/output/finding-assessment.ts
const KNIP_FORCE_RULES = new Set([
	"knip/files",
	"knip/dependencies",
	"knip/devDependencies"
]);
const isForceFixable = (diagnostic) => {
	if (diagnostic.fixable) return false;
	if (KNIP_FORCE_RULES.has(diagnostic.rule)) return true;
	if (diagnostic.rule === "security/vulnerable-dependency") return diagnostic.detail === "npm" || diagnostic.detail === "pnpm";
	if (diagnostic.rule.startsWith("expo-doctor/")) return diagnostic.rule !== "expo-doctor/config-error";
	return false;
};
const FINDING_KIND_LABELS = {
	"confirmed-defect": "confirmed defects",
	"conservative-security": "conservative security",
	"style-policy": "style/policy",
	"ai-slop-indicator": "AI-slop indicators"
};
const STYLE_POLICY_RULES = new Set([
	"ai-slop/trivial-comment",
	"ai-slop/narrative-comment",
	"ai-slop/meta-comment",
	"ai-slop/console-leftover",
	"ai-slop/ts-directive",
	"complexity/file-too-large",
	"complexity/function-too-long",
	"complexity/deep-nesting",
	"complexity/too-many-params",
	"code-quality/duplicate-block",
	"eslint/no-empty",
	"eslint/no-unused-vars",
	"eslint/no-useless-escape",
	"eslint/no-unused-expressions",
	"unicorn/no-useless-fallback-in-spread",
	"unicorn/prefer-string-starts-ends-with",
	"unicorn/no-new-array",
	"unicorn/no-useless-spread"
]);
const CONFIRMED_DEFECT_RULES = new Set([
	"ai-slop/hallucinated-import",
	"eslint/no-undef",
	"eslint/no-unreachable",
	"security/vulnerable-dependency"
]);
const LOW_CONFIDENCE_SECURITY_RULES = new Set(["security/innerhtml", "security/dangerously-set-innerhtml"]);
const confidenceFor = (diagnostic, kind) => {
	if (kind === "confirmed-defect") return "high";
	if (kind === "style-policy") return "medium";
	if (kind === "conservative-security") {
		if (LOW_CONFIDENCE_SECURITY_RULES.has(diagnostic.rule)) return "medium";
		return diagnostic.severity === "error" ? "high" : "medium";
	}
	return diagnostic.severity === "error" ? "high" : "medium";
};
const classifyKind = (diagnostic) => {
	if (CONFIRMED_DEFECT_RULES.has(diagnostic.rule)) return "confirmed-defect";
	if (diagnostic.engine === "security") return "conservative-security";
	if (STYLE_POLICY_RULES.has(diagnostic.rule)) return "style-policy";
	if (diagnostic.engine === "format" || diagnostic.engine === "code-quality") return "style-policy";
	if (diagnostic.engine === "ai-slop") return "ai-slop-indicator";
	if (diagnostic.severity === "error") return "confirmed-defect";
	return "style-policy";
};
const assessDiagnostic = (diagnostic) => {
	const kind = classifyKind(diagnostic);
	return {
		kind,
		confidence: confidenceFor(diagnostic, kind),
		label: FINDING_KIND_LABELS[kind]
	};
};
const withFindingAssessments = (diagnostics) => diagnostics.map((diagnostic) => ({
	...diagnostic,
	assessment: assessDiagnostic(diagnostic),
	forceFixable: isForceFixable(diagnostic)
}));
const summarizeFindingAssessments = (diagnostics) => {
	const byKind = {
		"confirmed-defect": 0,
		"conservative-security": 0,
		"style-policy": 0,
		"ai-slop-indicator": 0
	};
	const byConfidence = {
		high: 0,
		medium: 0,
		low: 0
	};
	const rows = /* @__PURE__ */ new Map();
	for (const diagnostic of diagnostics) {
		const assessment = assessDiagnostic(diagnostic);
		byKind[assessment.kind]++;
		byConfidence[assessment.confidence]++;
		const row = rows.get(assessment.kind) ?? {
			kind: assessment.kind,
			label: assessment.label,
			count: 0,
			errors: 0,
			warnings: 0,
			info: 0,
			fixable: 0
		};
		row.count++;
		if (diagnostic.severity === "error") row.errors++;
		else if (diagnostic.severity === "warning") row.warnings++;
		else row.info++;
		if (diagnostic.fixable) row.fixable++;
		rows.set(assessment.kind, row);
	}
	return {
		rows: [...rows.values()].sort((a, b) => b.count - a.count),
		byKind,
		byConfidence
	};
};

//#endregion
//#region src/output/rule-labels.ts
const RULE_LABELS = {
	formatting: "Code not formatted",
	"code-quality/duplicate-block": "Duplicate code block",
	"code-quality/repeated-chained-call": "Repeated chained call",
	"code-quality/unused-declaration": "Unused declaration",
	"complexity/file-too-large": "File too large",
	"complexity/function-too-long": "Function too long",
	"complexity/deep-nesting": "Deeply nested code",
	"complexity/too-many-params": "Too many parameters",
	"knip/files": "Unused file",
	"knip/dependencies": "Unused dependency",
	"knip/devDependencies": "Unused dev dependency",
	"knip/unlisted": "Used but not in package.json",
	"knip/unresolved": "Unresolved import",
	"knip/binaries": "Unused binary",
	"knip/exports": "Unused export",
	"knip/types": "Unused type",
	"knip/duplicates": "Duplicate export",
	"ai-slop/trivial-comment": "Trivial restating comment",
	"ai-slop/swallowed-exception": "Empty catch (swallowed error)",
	"ai-slop/silent-recovery": "Catch logs then continues",
	"ai-slop/meta-comment": "Meta/plan comment",
	"ai-slop/redundant-try-catch": "Redundant try/catch",
	"ai-slop/redundant-type-coercion": "Redundant type coercion",
	"ai-slop/duplicate-type-declaration": "Duplicate exported type",
	"ai-slop/thin-wrapper": "Thin function wrapper",
	"ai-slop/generic-naming": "Generic/vague identifier name",
	"ai-slop/unused-import": "Unused import",
	"ai-slop/console-leftover": "console.log left in code",
	"ai-slop/todo-stub": "Unresolved TODO/FIXME",
	"ai-slop/unreachable-code": "Unreachable code",
	"ai-slop/constant-condition": "Constant condition",
	"ai-slop/empty-function": "Empty function body",
	"ai-slop/unsafe-type-assertion": "Unsafe type cast",
	"ai-slop/double-type-assertion": "Double type cast",
	"ai-slop/ts-directive": "@ts-ignore / @ts-expect-error",
	"ai-slop/narrative-comment": "Narrative comment block",
	"ai-slop/duplicate-import": "Duplicate import statement",
	"ai-slop/hardcoded-url": "Hardcoded URL",
	"ai-slop/hardcoded-id": "Hardcoded provider ID",
	"ai-slop/python-bare-except": "Bare except",
	"ai-slop/python-broad-except": "Broad except",
	"ai-slop/python-mutable-default": "Mutable default argument",
	"ai-slop/python-print-debug": "print() left in code",
	"ai-slop/python-range-len-loop": "range(len(...)) loop",
	"ai-slop/python-chained-dict-get": "Chained dict get",
	"ai-slop/python-repetitive-dispatch": "Repetitive dispatch ladder",
	"ai-slop/python-isinstance-ladder": "isinstance ladder",
	"ai-slop/go-library-panic": "panic() in Go library code",
	"ai-slop/rust-non-test-unwrap": "Rust .unwrap() in production code",
	"ai-slop/rust-todo-stub": "Rust todo!() stub",
	"ai-slop/hallucinated-import": "Import not in package.json",
	"security/hardcoded-secret": "Possible hardcoded secret",
	"security/vulnerable-dependency": "Vulnerable dependency",
	"security/dependency-audit-skipped": "Dependency audit skipped",
	"security/eval": "eval() usage",
	"security/innerhtml": "innerHTML assignment",
	"security/dangerously-set-innerhtml": "dangerouslySetInnerHTML (XSS risk)",
	"security/sql-injection": "Possible SQL injection",
	"security/shell-injection": "Possible shell injection",
	"eslint/no-undef": "Undefined identifier",
	"eslint/no-unused-vars": "Unused variable",
	"eslint/no-unassigned-vars": "Variable never assigned",
	"eslint/no-empty": "Empty block statement",
	"eslint/no-unused-expressions": "Unused expression",
	"eslint/no-shadow-restricted-names": "Shadowing restricted name",
	"eslint/no-constant-binary-expression": "Constant binary expression",
	"eslint/no-unsafe-optional-chaining": "Unsafe optional chaining",
	"eslint/require-yield": "Generator with no yield",
	"import/no-duplicates": "Duplicate import path",
	"import/default": "Missing default export",
	"import/named": "Missing named export",
	"import/namespace": "Invalid namespace import",
	"typescript-eslint/triple-slash-reference": "Triple-slash reference",
	"unicorn/no-useless-fallback-in-spread": "Useless spread fallback",
	"unicorn/no-invalid-remove-event-listener": "Invalid removeEventListener",
	"unicorn/no-empty-file": "Empty file",
	"unicorn/no-useless-length-check": "Useless array length check",
	"unicorn/no-new-array": "Avoid new Array(n)",
	"unicorn/no-useless-spread": "Useless spread",
	"unicorn/no-single-promise-in-promise-methods": "Single-element Promise.all"
};
const RULE_DESCRIPTIONS = {
	formatting: "File needs standard formatter output.",
	"code-quality/duplicate-block": "Large repeated code block should be shared or simplified.",
	"code-quality/repeated-chained-call": "Same chained call is repeated instead of stored once.",
	"code-quality/unused-declaration": "Declared symbol is not referenced.",
	"complexity/file-too-large": "File is large enough to be hard to review safely.",
	"complexity/function-too-long": "Function is doing too much in one body.",
	"complexity/deep-nesting": "Nested branches make the path hard to follow.",
	"complexity/too-many-params": "Function takes more arguments than readers can track.",
	"knip/files": "Source file is not imported or referenced.",
	"knip/dependencies": "Production dependency is listed but unused.",
	"knip/devDependencies": "Dev dependency is listed but unused.",
	"knip/unlisted": "Code imports a package missing from package.json.",
	"knip/unresolved": "Import cannot be resolved from the project.",
	"knip/binaries": "Package binary is listed but unused.",
	"knip/exports": "Exported value is not imported anywhere.",
	"knip/types": "Exported type is not imported anywhere.",
	"knip/duplicates": "Same export is declared more than once.",
	"ai-slop/trivial-comment": "Comment repeats obvious code instead of explaining intent.",
	"ai-slop/swallowed-exception": "Catch block hides an error without handling it.",
	"ai-slop/silent-recovery": "Error path logs or defaults, then continues as if safe.",
	"ai-slop/meta-comment": "Comment describes editing steps, plans, or generated-code process.",
	"ai-slop/redundant-try-catch": "try/catch only rethrows or adds no useful handling.",
	"ai-slop/redundant-type-coercion": "Conversion does not change the value meaningfully.",
	"ai-slop/duplicate-type-declaration": "Same exported type shape appears more than once.",
	"ai-slop/thin-wrapper": "Wrapper function adds no behavior or clearer contract.",
	"ai-slop/generic-naming": "Name is too vague to explain its role.",
	"ai-slop/unused-import": "Imported symbol is never used.",
	"ai-slop/console-leftover": "console/debug output was left in application code.",
	"ai-slop/todo-stub": "TODO/FIXME/stub marks unfinished behavior.",
	"ai-slop/unreachable-code": "Code path cannot execute.",
	"ai-slop/constant-condition": "Condition is always true or always false.",
	"ai-slop/empty-function": "Function body is empty or placeholder-only.",
	"ai-slop/unsafe-type-assertion": "Type assertion bypasses useful checking.",
	"ai-slop/double-type-assertion": "Value is cast through unknown/any to force a type.",
	"ai-slop/ts-directive": "TypeScript error is suppressed with a directive.",
	"ai-slop/narrative-comment": "Comment narrates implementation instead of adding context.",
	"ai-slop/duplicate-import": "Same module is imported more than once.",
	"ai-slop/hardcoded-url": "URL-like value is embedded directly in code.",
	"ai-slop/hardcoded-id": "Provider/account/test ID is embedded directly in code.",
	"ai-slop/python-bare-except": "Bare except catches everything, including system exits.",
	"ai-slop/python-broad-except": "Broad exception catch hides specific failure modes.",
	"ai-slop/python-mutable-default": "Mutable default argument is shared across calls.",
	"ai-slop/python-print-debug": "print/debug output was left in Python source.",
	"ai-slop/python-range-len-loop": "Loop uses indexes where direct iteration is clearer.",
	"ai-slop/python-chained-dict-get": "Nested get chain hides shape assumptions.",
	"ai-slop/python-repetitive-dispatch": "Repeated if/elif dispatch should be table-driven.",
	"ai-slop/python-isinstance-ladder": "Long isinstance ladder is brittle polymorphism.",
	"ai-slop/go-library-panic": "Library code panics instead of returning an error.",
	"ai-slop/rust-non-test-unwrap": "Production Rust uses unwrap instead of handling failure.",
	"ai-slop/rust-todo-stub": "Rust todo!/unimplemented! leaves behavior unfinished.",
	"ai-slop/hallucinated-import": "Import names a package not declared by the project.",
	"security/hardcoded-secret": "Secret-looking token is embedded in source.",
	"security/vulnerable-dependency": "Dependency audit reported a known vulnerability.",
	"security/dependency-audit-skipped": "Audit could not run because inputs/tools are missing.",
	"security/eval": "Dynamic code execution can run attacker-controlled input.",
	"security/innerhtml": "Raw HTML assignment can introduce XSS.",
	"security/dangerously-set-innerhtml": "React raw HTML escape hatch can introduce XSS.",
	"security/sql-injection": "SQL is built from interpolated or concatenated input.",
	"security/shell-injection": "Shell command is built from unsanitized input.",
	"oxlint/*": "JavaScript/TypeScript lint finding from oxlint.",
	"ruff/*": "Python lint finding from ruff.",
	"go/*": "Go lint finding from bundled checks.",
	"clippy/*": "Rust lint finding from clippy.",
	"rubocop/*": "Ruby lint finding from rubocop.",
	"typescript/*": "TypeScript compiler finding.",
	"import-order": "Imports need deterministic ordering.",
	"python-formatting": "Python file needs ruff formatting.",
	"go-formatting": "Go file needs gofmt.",
	"rust-formatting": "Rust file needs rustfmt.",
	"ruby-formatting": "Ruby file needs rubocop formatting.",
	"php-formatting": "PHP file needs php-cs-fixer formatting."
};
const prettifyFallback = (ruleId) => {
	const spaced = (ruleId.includes("/") ? ruleId.slice(ruleId.indexOf("/") + 1) : ruleId).replace(/[-_]/g, " ").replace(/\//g, " · ");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
const labelForRule = (ruleId) => RULE_LABELS[ruleId] ?? prettifyFallback(ruleId);
const descriptionForRule = (ruleId) => RULE_DESCRIPTIONS[ruleId] ?? labelForRule(ruleId);

//#endregion
//#region src/ui/summary.ts
const elapsed = (ms) => ms < 1e3 ? `${Math.round(ms)}ms` : `${(ms / 1e3).toFixed(1)}s`;
const scoreToken = (score, thresholds) => {
	if (score >= thresholds.good) return "success";
	if (score >= thresholds.ok) return "warn";
	return "danger";
};
const renderFindingAssessment = (assessment, t, sep) => {
	if (assessment.rows.length === 0) return [];
	const parts = assessment.rows.filter((row) => row.count > 0).map((row) => `${row.count} ${row.label}`);
	if (parts.length === 0) return [];
	const high = assessment.byConfidence.high;
	const medium = assessment.byConfidence.medium;
	const confidenceParts = [];
	if (high > 0) confidenceParts.push(`${high} high-confidence`);
	if (medium > 0) confidenceParts.push(`${medium} medium-confidence`);
	const confidence = confidenceParts.length > 0 ? `  ${sep}  ${style(t, "muted", confidenceParts.join(", "))}` : "";
	return [`   ${style(t, "muted", "Verdict mix:")} ${parts.join(`  ${sep}  `)}${confidence}`];
};
const renderSummary = (input, deps = {}) => {
	const t = deps.theme ?? theme;
	const s = deps.symbols ?? symbols;
	const thresholds = input.thresholds ?? {
		good: 85,
		ok: 65
	};
	const tok = scoreToken(input.score, thresholds);
	const sep = style(t, "accent", "·");
	const scoreText = padEnd(`${input.score} / 100`, 10);
	const labelText = padEnd(input.label, 12);
	const counters = `${style(t, "danger", `${input.errors} error${input.errors === 1 ? "" : "s"}`)}  ${sep}  ${style(t, "warn", `${input.warnings} warning${input.warnings === 1 ? "" : "s"}`)}  ${sep}  ${style(t, "success", `${input.fixable} fixable`)}`;
	const lines = [
		"",
		`   ${style(t, tok, scoreText)}${style(t, tok, labelText)}  ${counters}`,
		`   ${style(t, "muted", `${input.files} files`)}  ${sep}  ${style(t, "muted", `${input.engines} engines`)}  ${sep}  ${style(t, "muted", elapsed(input.elapsedMs))}`,
		""
	];
	if (input.findingAssessment) {
		lines.push(...renderFindingAssessment(input.findingAssessment, t, sep));
		lines.push("");
	}
	if (input.breakdown && input.breakdown.rows.length > 0) {
		lines.push(` ${style(t, "bold", "Top findings")}`);
		const maxCountWidth = input.breakdown.rows.reduce((w, r) => Math.max(w, String(r.errors + r.warnings + r.info).length), 0);
		const labels = input.breakdown.rows.map((r) => labelForRule(r.rule));
		const maxLabelWidth = labels.reduce((w, l) => Math.max(w, l.length), 0);
		for (let i = 0; i < input.breakdown.rows.length; i++) {
			const row = input.breakdown.rows[i];
			const total = row.errors + row.warnings + row.info;
			const count = String(total).padStart(maxCountWidth);
			const label = padEnd(labels[i], maxLabelWidth);
			const tags = [];
			if (row.errors > 0) tags.push(style(t, "danger", `${row.errors} err`));
			if (row.warnings > 0) tags.push(style(t, "warn", `${row.warnings} warn`));
			if (row.info > 0) tags.push(style(t, "muted", `${row.info} info`));
			if (row.fixable > 0) tags.push(style(t, "success", `${row.fixable} fix`));
			const tagBlock = tags.length > 0 ? `  ${style(t, "muted", "·")}  ${tags.join("  ")}` : "";
			const ruleHint = style(t, "muted", `(${row.rule})`);
			lines.push(`   ${style(t, "muted", count)}  ${label}  ${ruleHint}${tagBlock}`);
		}
		if (input.breakdown.hiddenRules > 0) {
			const hiddenParts = [];
			if (input.breakdown.hiddenErrors > 0) hiddenParts.push(`${input.breakdown.hiddenErrors} error${input.breakdown.hiddenErrors === 1 ? "" : "s"}`);
			if (input.breakdown.hiddenWarnings > 0) hiddenParts.push(`${input.breakdown.hiddenWarnings} warning${input.breakdown.hiddenWarnings === 1 ? "" : "s"}`);
			const detail = hiddenParts.length > 0 ? ` (${hiddenParts.join(", ")})` : "";
			lines.push(style(t, "muted", `   +${input.breakdown.hiddenRules} more rule${input.breakdown.hiddenRules === 1 ? "" : "s"}${detail}. Run with -v for the full list.`));
		}
		lines.push("");
	}
	if (input.nextSteps.length > 0) {
		for (const step of input.nextSteps) {
			const glyph = step.emphasis === "primary" ? s.hint : s.bullet;
			const tokenFor = step.emphasis === "primary" ? "accent" : "muted";
			lines.push(` ${style(t, tokenFor, glyph)} ${step.text}`);
		}
		lines.push("");
	}
	return lines.join("\n");
};
const renderStarCta = (deps = {}) => {
	return `\n ${style(deps.theme ?? theme, "muted", "★ Found this useful? Star us at github.com/scanaislop/aislop")}\n`;
};
const renderCleanRun = (input, deps = {}) => {
	const t = deps.theme ?? theme;
	const s = deps.symbols ?? symbols;
	const sep = style(t, "accent", "·");
	const parts = [style(t, "success", `${s.pass} Clean run`)];
	if (input.score !== void 0) parts.push(style(t, "success", `${input.score} / 100`));
	if (input.label) parts.push(style(t, "success", input.label));
	parts.push(style(t, "muted", "no issues"));
	parts.push(style(t, "muted", elapsed(input.elapsedMs)));
	return `\n ${parts.join(`  ${sep}  `)}\n`;
};

//#endregion
//#region src/commands/scan-render.ts
const BREAKDOWN_TOP_N = 10;
const computeBreakdown = (diagnostics) => {
	const byRule = /* @__PURE__ */ new Map();
	for (const d of diagnostics) {
		const row = byRule.get(d.rule) ?? {
			rule: d.rule,
			errors: 0,
			warnings: 0,
			info: 0,
			fixable: 0
		};
		if (d.severity === "error") row.errors++;
		else if (d.severity === "warning") row.warnings++;
		else row.info++;
		if (d.fixable) row.fixable++;
		byRule.set(d.rule, row);
	}
	const sorted = [...byRule.values()].sort((a, b) => {
		const aTotal = a.errors + a.warnings + a.info;
		const bTotal = b.errors + b.warnings + b.info;
		if (aTotal !== bTotal) return bTotal - aTotal;
		if (a.errors !== b.errors) return b.errors - a.errors;
		return a.rule.localeCompare(b.rule);
	});
	const rows = sorted.slice(0, BREAKDOWN_TOP_N);
	const hidden = sorted.slice(BREAKDOWN_TOP_N);
	return {
		rows,
		hiddenRules: hidden.length,
		hiddenErrors: hidden.reduce((acc, r) => acc + r.errors, 0),
		hiddenWarnings: hidden.reduce((acc, r) => acc + r.warnings, 0)
	};
};
const buildScanRender = (input) => {
	const deps = {
		theme: createTheme(),
		symbols: createSymbols({ plain: false })
	};
	const invocation = detectInvocation();
	const header = input.includeHeader === false ? "" : renderHeader({
		version: APP_VERSION,
		command: "Scan result",
		context: [
			input.projectName,
			input.language,
			`${input.fileCount} files`
		],
		brand: input.printBrand !== false
	}, deps);
	const errors = input.diagnostics.filter((d) => d.severity === "error").length;
	const warnings = input.diagnostics.filter((d) => d.severity === "warning").length;
	const fixable = input.diagnostics.filter((d) => d.fixable).length;
	const hasVulnerableDeps = input.diagnostics.some((d) => d.rule === "security/vulnerable-dependency");
	const starCta = input.printBrand !== false ? renderStarCta(deps) : "";
	if (input.diagnostics.length === 0 && input.score.score === 100) return `${header}${renderCleanRun({
		score: input.score.score,
		label: input.score.label,
		elapsedMs: input.elapsedMs
	}, deps)}${starCta}`;
	const diagBlock = input.diagnostics.length === 0 ? "" : renderDiagnostics(input.diagnostics, input.verbose);
	const nextSteps = [];
	if (fixable > 0) nextSteps.push({
		emphasis: "primary",
		text: `Run ${invocation} fix to auto-fix ${fixable} issue${fixable === 1 ? "" : "s"}`
	});
	if (hasVulnerableDeps) nextSteps.push({
		emphasis: "primary",
		text: `Run ${invocation} fix -f (or --force) to apply aggressive fixes (dependency audit, unused files, framework alignment)`
	});
	if (errors + warnings > 0) nextSteps.push({
		emphasis: "primary",
		text: `Run ${invocation} fix --claude (or --codex, --cursor, --gemini, etc.) to hand off to agent`
	});
	return `${header}${diagBlock}${renderSummary({
		score: input.score.score,
		label: input.score.label,
		errors,
		warnings,
		fixable,
		files: input.fileCount,
		engines: input.results.length,
		elapsedMs: input.elapsedMs,
		nextSteps,
		breakdown: computeBreakdown(input.diagnostics),
		findingAssessment: summarizeFindingAssessments(input.diagnostics),
		thresholds: input.thresholds
	}, deps)}${starCta}`;
};

//#endregion
//#region src/commands/scan.ts
const isMachineOutput = (options) => Boolean(options.json) || Boolean(options.sarif);
const shouldUseSpinner = () => Boolean(process.stderr.isTTY) && process.env.CI !== "true" && process.env.CI !== "1";
const ALL_ENGINE_NAMES = Object.keys(ENGINE_INFO);
const scanCommand = async (directory, config, options) => {
	const resolvedDir = path.resolve(directory);
	if (!fs.existsSync(resolvedDir)) {
		const msg = `Path does not exist: ${resolvedDir}`;
		if (options.json) console.log(JSON.stringify({ error: msg }, null, 2));
		else log.error(msg);
		return { exitCode: 1 };
	}
	if (!fs.statSync(resolvedDir).isDirectory()) {
		const msg = `Not a directory: ${resolvedDir}`;
		if (options.json) console.log(JSON.stringify({ error: msg }, null, 2));
		else log.error(msg);
		return { exitCode: 1 };
	}
	if (options.changes && options.base && !baseRefExists(resolvedDir, options.base)) {
		const msg = `Could not resolve base ref "${options.base}". Make sure it exists and was fetched (e.g. \`git fetch origin ${options.base}\`).`;
		if (options.json) console.log(JSON.stringify({ error: msg }, null, 2));
		else log.error(msg);
		return { exitCode: 1 };
	}
	const projectInfo = await discoverProject(resolvedDir, [...config.exclude, ...readAislopIgnorePatterns(resolvedDir)]);
	return withCommandLifecycle({
		command: options.command ?? "scan",
		config: config.telemetry,
		languages: projectInfo.languages,
		fileCount: projectInfo.sourceFileCount
	}, () => runScanBody(resolvedDir, config, options, projectInfo));
};
const runScanBody = async (resolvedDir, config, options, projectInfo) => {
	const startTime = performance.now();
	const showHeader = options.showHeader !== false;
	const machineOutput = isMachineOutput(options);
	const useLiveProgress = !machineOutput && shouldUseSpinner();
	const projectName = projectInfo.projectName ?? "project";
	const language = projectInfo.languages[0] ?? "unknown";
	const printedHumanHeader = !machineOutput && showHeader;
	if (printedHumanHeader) process.stdout.write(renderHeader({
		version: APP_VERSION,
		command: "Scan result",
		context: [
			projectName,
			language,
			`${projectInfo.sourceFileCount} files`
		],
		brand: options.printBrand !== false
	}));
	const excludePatterns = [...config.exclude, ...readAislopIgnorePatterns(resolvedDir)];
	let files;
	if (options.staged) {
		files = filterProjectFiles(resolvedDir, getStagedFiles(resolvedDir), [], excludePatterns);
		if (!machineOutput) log.muted(`Scope: ${files.length} staged file(s)`);
	} else if (options.changes) {
		files = filterProjectFiles(resolvedDir, getChangedFiles(resolvedDir, options.base), [], excludePatterns);
		if (!machineOutput) {
			const scope = options.base ? `changed vs ${options.base}` : "changed";
			log.muted(`Scope: ${files.length} ${scope} file(s)`);
		}
	} else {
		files = filterProjectFiles(resolvedDir, listProjectFiles(resolvedDir), [], excludePatterns);
		if (!machineOutput) log.muted(`Scope: ${files.length} file(s) after exclusions`);
	}
	const configDir = findConfigDir(resolvedDir);
	const rulesPath = configDir ? path.join(configDir, RULES_FILE) : void 0;
	const engineConfig = {
		quality: config.quality,
		security: config.security,
		lint: config.lint,
		architectureRulesPath: config.engines.architecture ? rulesPath : void 0
	};
	const gridRows = ALL_ENGINE_NAMES.filter((engine) => config.engines[engine] !== false).map((engine) => ({
		label: getEngineLabel(engine),
		status: "queued",
		key: engine
	}));
	const progressRenderer = useLiveProgress ? new LiveGrid(gridRows) : null;
	progressRenderer?.start();
	const rawResults = await runEngines({
		rootDirectory: resolvedDir,
		languages: projectInfo.languages,
		frameworks: projectInfo.frameworks,
		files,
		installedTools: projectInfo.installedTools,
		config: engineConfig
	}, config.engines, (engine) => {
		progressRenderer?.update(engine, { status: "running" });
	}, (result) => {
		if (result.skipped) progressRenderer?.update(result.engine, {
			status: "skipped",
			summary: "skipped"
		});
		else {
			const errors = result.diagnostics.filter((d) => d.severity === "error").length;
			const warnings = result.diagnostics.filter((d) => d.severity === "warning").length;
			let outcome = "ok";
			let summary = "0 issues";
			if (errors > 0) {
				outcome = "fail";
				summary = `${errors} error${errors === 1 ? "" : "s"}`;
			} else if (warnings > 0) {
				outcome = "warn";
				summary = `${warnings} warning${warnings === 1 ? "" : "s"}`;
			}
			progressRenderer?.update(result.engine, {
				status: "done",
				outcome,
				summary,
				elapsedMs: result.elapsed
			});
		}
		if (!machineOutput && !progressRenderer) printEngineStatus(result);
	});
	progressRenderer?.stop();
	const { results, suppressedCount } = applySuppressions(rawResults.map((result) => ({
		...result,
		diagnostics: applyRuleSeverities(result.diagnostics, config.rules)
	})), resolvedDir);
	if (suppressedCount > 0 && !machineOutput) log.muted(`Suppressed ${suppressedCount} finding(s) via aislop-ignore directives`);
	const allDiagnostics = results.flatMap((r) => r.diagnostics);
	const elapsedMs = performance.now() - startTime;
	const scoreResult = calculateScore(allDiagnostics, config.scoring.weights, config.scoring.thresholds, projectInfo.sourceFileCount, config.scoring.smoothing, config.scoring.maxPerRule);
	const scoreable = projectInfo.coverage.scoreable;
	const exitCode = computeScanExitCode({
		hasErrors: allDiagnostics.some((d) => d.severity === "error"),
		scoreable,
		score: scoreResult.score,
		failBelow: config.ci.failBelow
	});
	const engineIssues = {};
	const engineTimings = {};
	for (const r of results) {
		engineIssues[r.engine] = r.diagnostics.length;
		engineTimings[r.engine] = Math.round(r.elapsed);
	}
	const completion = {
		exitCode,
		score: scoreable ? scoreResult.score : null,
		scoreable,
		findingCount: allDiagnostics.length,
		errorCount: allDiagnostics.filter((d) => d.severity === "error").length,
		warningCount: allDiagnostics.filter((d) => d.severity === "warning").length,
		fixableCount: allDiagnostics.filter((d) => d.fixable).length,
		engineIssues,
		engineTimings
	};
	if (options.sarif) {
		const { buildSarifLog } = await import("./sarif-CjxSBcqx.js");
		console.log(JSON.stringify(buildSarifLog(results), null, 2));
		return completion;
	}
	if (options.json) {
		const { buildJsonOutput } = await import("./json-pHsqtKkz.js");
		const jsonOut = buildJsonOutput(results, scoreResult, projectInfo.sourceFileCount, elapsedMs, projectInfo.coverage);
		console.log(JSON.stringify(jsonOut, null, 2));
		return completion;
	}
	if (!scoreable) {
		if (!machineOutput) {
			process.stdout.write(renderCoverageNotice(projectInfo, !printedHumanHeader && showHeader));
			if (allDiagnostics.length > 0) process.stdout.write(renderDiagnostics(allDiagnostics, options.verbose ?? false));
		}
		return completion;
	}
	if (!options.staged && !options.changes && options.command !== "ci" && !isCiEnv()) appendHistory({
		directory: resolvedDir,
		score: scoreResult.score,
		errors: completion.errorCount,
		warnings: completion.warningCount,
		files: projectInfo.sourceFileCount
	});
	process.stdout.write(buildScanRender({
		projectName,
		language,
		fileCount: projectInfo.sourceFileCount,
		results,
		diagnostics: allDiagnostics,
		score: scoreResult,
		elapsedMs,
		thresholds: config.scoring.thresholds,
		verbose: options.verbose,
		includeHeader: !printedHumanHeader && showHeader,
		printBrand: options.printBrand
	}));
	return completion;
};

//#endregion
//#region src/commands/ci.ts
const ciCommand = async (directory, config, options = {}) => {
	try {
		return await scanCommand(directory, config, {
			changes: Boolean(options.changes),
			staged: Boolean(options.staged),
			base: options.base,
			verbose: false,
			json: !options.human && !options.sarif,
			sarif: options.sarif,
			command: "ci"
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(renderError({
			message: "ci command failed",
			cause: message
		}));
		return { exitCode: 1 };
	}
};

//#endregion
//#region src/ui/rail.ts
const glyphFor = (status, s) => {
	switch (status) {
		case "done": return {
			glyph: s.stepDone,
			token: "accent"
		};
		case "active": return {
			glyph: s.stepActive,
			token: "accent"
		};
		case "warn": return {
			glyph: s.warn,
			token: "warn"
		};
		case "failed": return {
			glyph: s.fail,
			token: "danger"
		};
		case "skipped": return {
			glyph: s.neutral,
			token: "muted"
		};
	}
};
const renderRailStep = (step, deps = {}) => {
	const t = deps.theme ?? theme;
	const s = deps.symbols ?? symbols;
	const rail = style(t, "accentDim", s.rail);
	const { glyph, token } = glyphFor(step.status, s);
	const lines = [` ${style(t, token, glyph)} ${step.label}`];
	for (const note of step.notes ?? []) lines.push(` ${rail} ${style(t, "accent", s.hint)} ${note}`);
	return `${lines.join("\n")}\n`;
};
/**
* Render a single vertical rail connector line — used between steps and
* between the last step and the footer.
*/
const renderRailConnector = (deps = {}) => {
	return ` ${style(deps.theme ?? theme, "accentDim", (deps.symbols ?? symbols).rail)}\n`;
};
/**
* Render the rail-end footer line ("└  <footer text>").
*/
const renderRailFooter = (footer, deps = {}) => {
	return ` ${style(deps.theme ?? theme, "accentDim", (deps.symbols ?? symbols).railEnd)}  ${footer}\n`;
};
const renderRail = (input, deps = {}) => {
	const t = deps.theme ?? theme;
	const s = deps.symbols ?? symbols;
	const rail = style(t, "accentDim", s.rail);
	const railEnd = style(t, "accentDim", s.railEnd);
	const lines = [];
	input.steps.forEach((step, i) => {
		const { glyph, token } = glyphFor(step.status, s);
		lines.push(` ${style(t, token, glyph)} ${step.label}`);
		for (const note of step.notes ?? []) lines.push(` ${rail} ${style(t, "accent", s.hint)} ${note}`);
		if (i < input.steps.length - 1) lines.push(` ${rail}`);
	});
	if (input.footer !== void 0) {
		if (input.steps.length > 0) lines.push(` ${rail}`);
		lines.push(` ${railEnd}  ${input.footer}`);
	}
	return `\n${lines.join("\n")}\n`;
};

//#endregion
//#region src/commands/doctor.ts
const renderToolCell = (theme, row) => {
	if (row.status === "missing") return style(theme, "danger", row.tool);
	if (row.status === "skipped") return style(theme, "muted", row.skipReason ? `${row.tool} · ${row.skipReason}` : row.tool);
	return style(theme, "muted", row.tool);
};
const buildDoctorRender = (input) => {
	const theme = createTheme();
	const deps = {
		theme,
		symbols: createSymbols({ plain: false })
	};
	const header = renderHeader({
		version: APP_VERSION,
		command: "Doctor report",
		context: [input.projectName, input.languageLabel].filter((s) => s.length > 0),
		brand: input.printBrand !== false
	}, deps);
	const labelWidth = Math.max(12, ...input.rows.map((r) => r.engine.length)) + 2;
	const enginesRunning = input.rows.filter((r) => r.status === "ok").length;
	const missing = input.rows.filter((r) => r.status === "missing").length;
	return `${header}${renderRail({
		steps: input.rows.map((row) => {
			const label = `${padEnd(row.engine, labelWidth)}${renderToolCell(theme, row)}`;
			if (row.status === "missing") return {
				status: "failed",
				label,
				notes: row.remediation ? [row.remediation] : void 0
			};
			if (row.status === "skipped") return {
				status: "skipped",
				label
			};
			return {
				status: "done",
				label
			};
		}),
		footer: `Ready · ${enginesRunning} engines · ${missing} missing`
	}, deps)}${`\n${renderHintLine(missing > 0 ? `Install the missing tools, then run ${input.invocation} scan` : `Run ${input.invocation} scan to check this project`, deps)}`}`;
};
const hasAnyLanguage = (langs, wanted) => wanted.some((l) => langs.includes(l));
const hasJsLike = (langs) => hasAnyLanguage(langs, ["typescript", "javascript"]);
const primaryLanguage = (langs) => {
	for (const lang of [
		"typescript",
		"javascript",
		"python",
		"go",
		"rust",
		"ruby",
		"php",
		"java"
	]) if (langs.includes(lang)) return lang;
	return null;
};
const systemToolDecision = (installed, spec) => installed[spec.binary] ? {
	tool: `${spec.toolLabel} (system)`,
	status: "ok"
} : {
	tool: `${spec.toolLabel} not found`,
	status: "missing",
	remediation: spec.remediation
};
const firstMatching = (langs, installed, specs) => {
	for (const spec of specs) if (langs.includes(spec.language)) return systemToolDecision(installed, spec);
	return null;
};
const spec = (language, binary, toolLabel, remediation) => ({
	language,
	binary,
	toolLabel,
	remediation
});
const FORMAT_SPECS = [
	spec("python", "ruff", "ruff", "Install: pipx install ruff"),
	spec("go", "gofmt", "gofmt", "Install: via go toolchain — https://go.dev/dl/"),
	spec("rust", "cargo", "cargo fmt", "Install: rustup component add rustfmt"),
	spec("ruby", "rubocop", "rubocop", "Install: gem install rubocop"),
	spec("php", "php-cs-fixer", "php-cs-fixer", "Install: composer global require friendsofphp/php-cs-fixer")
];
const LINT_SPECS = [
	spec("python", "ruff", "ruff", "Install: pipx install ruff"),
	spec("go", "golangci-lint", "golangci-lint", "Install: brew install golangci-lint"),
	spec("rust", "clippy-driver", "clippy", "Install: rustup component add clippy"),
	spec("ruby", "rubocop", "rubocop", "Install: gem install rubocop")
];
const planFormat = (ctx) => {
	const { languages, installedTools } = ctx.projectInfo;
	if (hasJsLike(languages)) return {
		tool: "biome (bundled)",
		status: "ok"
	};
	return firstMatching(languages, installedTools, FORMAT_SPECS) ?? {
		tool: "no formatter",
		status: "skipped",
		skipReason: "no supported language"
	};
};
const findLocalTsc = (root) => {
	const candidate = path.join(root, "node_modules", ".bin", "tsc");
	return fs.existsSync(candidate) ? candidate : null;
};
const withTypecheckSuffix = (baseTool, ctx) => {
	if (!ctx.config.lint?.typecheck) return {
		tool: baseTool,
		status: "ok"
	};
	if (findLocalTsc(ctx.rootDirectory)) return {
		tool: `${baseTool} + tsc`,
		status: "ok"
	};
	return {
		tool: `${baseTool} + tsc not found`,
		status: "missing",
		remediation: "Install TypeScript locally (pnpm add -D typescript), or set lint.typecheck: false in .aislop/config.yml."
	};
};
const planLint = (ctx) => {
	const { languages, frameworks, installedTools } = ctx.projectInfo;
	if (frameworks.includes("expo")) return withTypecheckSuffix("expo-doctor + oxlint (bundled)", ctx);
	if (hasJsLike(languages)) return withTypecheckSuffix("oxlint (bundled)", ctx);
	return firstMatching(languages, installedTools, LINT_SPECS) ?? {
		tool: "no linter",
		status: "skipped",
		skipReason: "no supported language"
	};
};
const planCodeQuality = (ctx) => {
	if (hasJsLike(ctx.projectInfo.languages)) return {
		tool: "knip (bundled)",
		status: "ok"
	};
	return {
		tool: "built-in",
		status: "ok"
	};
};
const planAiSlop = (_ctx) => ({
	tool: "built-in",
	status: "ok"
});
const AUDIT_SPECS = [
	{
		files: ["pnpm-lock.yaml"],
		bundled: "pnpm audit"
	},
	{
		files: ["package-lock.json"],
		bundled: "npm audit"
	},
	{
		files: [
			"requirements.txt",
			"poetry.lock",
			"Pipfile.lock"
		],
		systemTool: {
			binary: "pip-audit",
			toolLabel: "pip-audit",
			remediation: "Install: pipx install pip-audit"
		}
	},
	{
		files: ["Cargo.toml"],
		systemTool: {
			binary: "cargo-audit",
			toolLabel: "cargo audit",
			remediation: "Install: cargo install cargo-audit",
			requiresBinaries: ["cargo", "cargo-audit"]
		}
	},
	{
		files: ["go.mod"],
		systemTool: {
			binary: "govulncheck",
			toolLabel: "govulncheck",
			remediation: "Install: go install golang.org/x/vuln/cmd/govulncheck@latest"
		}
	}
];
const planSecurity = (ctx) => {
	const { rootDirectory, projectInfo } = ctx;
	const { installedTools } = projectInfo;
	const hasFile = (rel) => fs.existsSync(path.join(rootDirectory, rel));
	for (const spec of AUDIT_SPECS) {
		if (!spec.files.some(hasFile)) continue;
		if (spec.bundled) return {
			tool: spec.bundled,
			status: "ok"
		};
		if (spec.systemTool) return (spec.systemTool.requiresBinaries ?? [spec.systemTool.binary]).every((b) => installedTools[b]) ? {
			tool: `${spec.systemTool.toolLabel} (system)`,
			status: "ok"
		} : {
			tool: `${spec.systemTool.toolLabel} not found`,
			status: "missing",
			remediation: spec.systemTool.remediation
		};
	}
	return {
		tool: "no auditor",
		status: "skipped",
		skipReason: "no lockfile"
	};
};
const planArchitecture = (ctx) => {
	if (!ctx.config.engines.architecture) return {
		tool: "opt-in",
		status: "skipped",
		skipReason: "not configured"
	};
	const rulesPath = path.join(ctx.rootDirectory, CONFIG_DIR, RULES_FILE);
	if (!fs.existsSync(rulesPath)) return {
		tool: "opt-in",
		status: "skipped",
		skipReason: "no rules file"
	};
	const rules = loadArchitectureRules(rulesPath);
	if (rules.length === 0) return {
		tool: "opt-in",
		status: "skipped",
		skipReason: "rules file empty"
	};
	return {
		tool: `custom rules (${rules.length} defined)`,
		status: "ok"
	};
};
const ENGINE_PLANNERS = {
	format: planFormat,
	lint: planLint,
	"code-quality": planCodeQuality,
	"ai-slop": planAiSlop,
	architecture: planArchitecture,
	security: planSecurity
};
const ENGINE_ORDER = [
	"format",
	"lint",
	"code-quality",
	"ai-slop",
	"security",
	"architecture"
];
const languageLabelFor = (info) => {
	const langs = info.languages.filter((l) => l !== "java");
	if (langs.length === 0) return info.languages[0] ?? "unknown";
	if (langs.length === 1) return langs[0];
	const primary = primaryLanguage(langs);
	return primary ? `${primary} (mixed)` : "mixed";
};
const buildRows = (ctx) => {
	const rows = [];
	for (const engine of ENGINE_ORDER) {
		if (engine !== "architecture" && ctx.config.engines[engine] === false) continue;
		const decision = ENGINE_PLANNERS[engine](ctx);
		rows.push({
			engine: getEngineLabel(engine),
			tool: decision.tool,
			status: decision.status,
			remediation: decision.remediation,
			skipReason: decision.skipReason
		});
	}
	return rows;
};
const doctorCommand = async (directory, options = {}) => {
	const resolvedDir = path.resolve(directory);
	const projectInfo = await discoverProject(resolvedDir);
	const rows = buildRows({
		rootDirectory: resolvedDir,
		projectInfo,
		config: loadConfig(resolvedDir)
	});
	process.stdout.write(buildDoctorRender({
		projectName: projectInfo.projectName,
		languageLabel: languageLabelFor(projectInfo),
		rows,
		invocation: detectInvocation(),
		printBrand: options.printBrand
	}));
};

//#endregion
//#region src/ui/live-rail.ts
const SPINNER_FRAMES = [
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏"
];
var LiveRail = class {
	frame = 0;
	activeLabel = null;
	timer;
	write;
	tty;
	theme;
	symbols;
	hasEmittedStep = false;
	constructor(deps = {}) {
		this.write = deps.write ?? ((s) => process.stdout.write(s));
		this.tty = deps.tty ?? Boolean(process.stdout.isTTY);
		this.theme = deps.theme ?? theme;
		this.symbols = deps.symbols ?? symbols;
	}
	/** Begin a new step. Emits the active-line and starts animating if TTY. */
	start(label) {
		this.activeLabel = label;
		if (this.tty) {
			this.drawActive();
			this.timer = setInterval(() => {
				this.frame += 1;
				this.drawActive(true);
			}, 80);
			this.timer.unref();
		}
	}
	/** Resolve the active step with its final state. */
	complete(step) {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = void 0;
		}
		if (this.tty && this.activeLabel !== null) this.write("\x1B[1F\x1B[2K");
		if (!this.hasEmittedStep) this.write("\n");
		else this.write(renderRailConnector({
			theme: this.theme,
			symbols: this.symbols
		}));
		this.write(renderRailStep(step, {
			theme: this.theme,
			symbols: this.symbols
		}));
		this.activeLabel = null;
		this.hasEmittedStep = true;
	}
	/** Emit the footer. Call after the last complete(). */
	finish(opts) {
		if (!this.hasEmittedStep) this.write("\n");
		this.write(renderRailConnector({
			theme: this.theme,
			symbols: this.symbols
		}));
		this.write(renderRailFooter(opts.footer, {
			theme: this.theme,
			symbols: this.symbols
		}));
	}
	/**
	* Update the label of the currently active step in place. Use this to
	* announce long sub-operations (e.g. "Dependency audit fixes · running
	* pnpm install — can take a minute") so the user knows what aislop is
	* doing. No-op if there is no active step.
	*/
	setActiveLabel(label) {
		if (this.activeLabel === null) return;
		this.activeLabel = label;
		if (this.tty) this.drawActive(true);
	}
	/** Abort the active step without emitting a final row. Rare — use if a fatal error happens mid-step. */
	abort() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = void 0;
		}
		if (this.tty && this.activeLabel !== null) this.write("\x1B[1F\x1B[2K");
		this.activeLabel = null;
	}
	drawActive(redraw = false) {
		if (!this.tty || this.activeLabel === null) return;
		if (redraw) this.write("\x1B[1F\x1B[2K");
		const glyph = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
		this.write(` ${style(this.theme, "info", glyph)} ${this.activeLabel}…\n`);
	}
};

//#endregion
//#region src/commands/fix-code.ts
const CONTEXT_LINES = 3;
const MAX_DIAGNOSTICS_PER_FILE = 10;
const MAX_FILES = 20;
const AGENT_CONFIGS = {
	claude: {
		type: "cli",
		bin: "claude",
		args: (p) => [p]
	},
	codex: {
		type: "cli",
		bin: "codex",
		args: (p) => [p]
	},
	amp: {
		type: "cli",
		bin: "amp",
		args: (p) => [p]
	},
	antigravity: {
		type: "cli",
		bin: "antigravity",
		args: (p) => [p]
	},
	"deep-agents": {
		type: "cli",
		bin: "deep-agents",
		args: (p) => [p]
	},
	gemini: {
		type: "cli",
		bin: "gemini",
		args: (p) => [p]
	},
	kimi: {
		type: "cli",
		bin: "kimi",
		args: (p) => [p]
	},
	opencode: {
		type: "cli",
		bin: "opencode",
		args: (p) => ["run", p]
	},
	warp: {
		type: "cli",
		bin: "warp",
		args: (p) => [p]
	},
	aider: {
		type: "cli",
		bin: "aider",
		args: (p) => ["--message", p]
	},
	goose: {
		type: "cli",
		bin: "goose",
		args: (p) => ["run", p]
	},
	pi: {
		type: "cli",
		bin: "pi",
		args: (p) => ["-p", p]
	},
	crush: {
		type: "cli",
		bin: "crush",
		args: (p) => ["run", p]
	},
	cursor: {
		type: "editor",
		bin: "cursor"
	},
	windsurf: {
		type: "editor",
		bin: "windsurf"
	},
	vscode: {
		type: "editor",
		bin: "code"
	}
};
const getCodeSnippet = (rootDirectory, diagnostic) => {
	if (diagnostic.line <= 0) return null;
	const absolutePath = path.resolve(rootDirectory, diagnostic.filePath);
	let content;
	try {
		content = fs.readFileSync(absolutePath, "utf-8");
	} catch {
		return null;
	}
	const lines = content.split("\n");
	const startLine = Math.max(0, diagnostic.line - 1 - CONTEXT_LINES);
	const endLine = Math.min(lines.length, diagnostic.line + CONTEXT_LINES);
	const snippet = [];
	for (let i = startLine; i < endLine; i++) {
		const lineNum = i + 1;
		const marker = lineNum === diagnostic.line ? "→" : " ";
		snippet.push(`${marker} ${String(lineNum).padStart(4)} │ ${lines[i]}`);
	}
	return snippet.join("\n");
};
const groupByFile = (diagnostics) => {
	const map = /* @__PURE__ */ new Map();
	for (const d of diagnostics) {
		const list = map.get(d.filePath) ?? [];
		list.push(d);
		map.set(d.filePath, list);
	}
	return [...map.entries()].map(([filePath, diags]) => ({
		filePath,
		diagnostics: diags
	})).sort((a, b) => {
		const aErrors = a.diagnostics.filter((d) => d.severity === "error").length;
		const bErrors = b.diagnostics.filter((d) => d.severity === "error").length;
		if (aErrors !== bErrors) return bErrors - aErrors;
		return b.diagnostics.length - a.diagnostics.length;
	});
};
const isInstalled = (bin) => {
	return spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf-8" }).status === 0;
};
const copyToClipboard = (text) => {
	const args = {
		darwin: ["pbcopy"],
		linux: [
			"xclip",
			"-selection",
			"clipboard"
		],
		win32: ["clip"]
	}[process.platform];
	if (!args) return false;
	const [bin, ...rest] = args;
	return spawnSync(bin, rest, {
		input: text,
		encoding: "utf-8"
	}).status === 0;
};
const buildAgentPrompt = (rootDirectory, diagnostics, score) => {
	const groups = groupByFile(diagnostics).slice(0, MAX_FILES);
	const errorCount = diagnostics.filter((d) => d.severity === "error").length;
	const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
	const lines = [
		`Fix the following ${diagnostics.length} code quality issue${diagnostics.length === 1 ? "" : "s"} found by aislop (current score: ${score}/100).`,
		"",
		`Summary: ${errorCount} error${errorCount === 1 ? "" : "s"}, ${warningCount} warning${warningCount === 1 ? "" : "s"} across ${groups.length} file${groups.length === 1 ? "" : "s"}.`,
		""
	];
	for (const group of groups) {
		lines.push(`## ${group.filePath}`);
		lines.push("");
		const fileDiags = group.diagnostics.slice(0, MAX_DIAGNOSTICS_PER_FILE);
		for (const d of fileDiags) {
			const severity = d.severity === "error" ? "ERROR" : d.severity === "warning" ? "WARN" : "INFO";
			const location = d.line > 0 ? ` (line ${d.line})` : "";
			lines.push(`**[${severity}]** \`${d.rule}\`${location}: ${d.message}`);
			if (d.help) lines.push(`> ${d.help}`);
			const snippet = getCodeSnippet(rootDirectory, d);
			if (snippet) {
				lines.push("```");
				lines.push(snippet);
				lines.push("```");
			}
			lines.push("");
		}
		if (group.diagnostics.length > MAX_DIAGNOSTICS_PER_FILE) {
			lines.push(`_...and ${group.diagnostics.length - MAX_DIAGNOSTICS_PER_FILE} more issue${group.diagnostics.length - MAX_DIAGNOSTICS_PER_FILE === 1 ? "" : "s"} in this file._`);
			lines.push("");
		}
	}
	const totalGroups = groupByFile(diagnostics).length;
	if (totalGroups > MAX_FILES) {
		const remaining = totalGroups - MAX_FILES;
		lines.push(`_...and ${remaining} more file${remaining === 1 ? "" : "s"} with issues._`);
		lines.push("");
	}
	lines.push("---");
	lines.push("Fix each issue following the guidance above. Prioritize errors over warnings.");
	lines.push("After making changes, run `aislop scan` to verify all issues are resolved and the score improves.");
	return lines.join("\n");
};
const SUPPORTED_AGENT_NAMES = Object.keys(AGENT_CONFIGS);
const launchAgent = (agent, rootDirectory, diagnostics, score) => {
	if (diagnostics.length === 0) {
		log.success("No remaining issues — nothing to hand off.");
		return;
	}
	const config = AGENT_CONFIGS[agent];
	if (!config) {
		log.error(`Unknown agent: ${agent}`);
		log.muted(`Supported: ${SUPPORTED_AGENT_NAMES.join(", ")}`);
		return;
	}
	if (!isInstalled(config.bin)) {
		log.error(`${agent} is not installed or not in PATH.`);
		log.muted(`Install it first, or use ${style(theme, "info", "fix -p")} to print the prompt manually.`);
		return;
	}
	const prompt = buildAgentPrompt(rootDirectory, diagnostics, score);
	if (config.type === "editor") {
		const copied = copyToClipboard(prompt);
		log.break();
		if (copied) log.raw(`  ${style(theme, "success", "✓")} Prompt copied to clipboard (${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"})`);
		else log.warn("Could not copy to clipboard. Use fix --prompt to print it instead.");
		log.raw(`  ${style(theme, "info", "→")} Opening ${style(theme, "bold", agent)}... paste the prompt into the agent chat.`);
		log.break();
		spawnSync(config.bin, ["."], {
			cwd: rootDirectory,
			stdio: "inherit"
		});
		return;
	}
	log.break();
	log.raw(`  ${style(theme, "info", "→")} Opening ${style(theme, "bold", agent)} with ${diagnostics.length} issue${diagnostics.length === 1 ? "" : "s"}...`);
	log.break();
	spawnSync(config.bin, config.args(prompt), {
		cwd: rootDirectory,
		stdio: "inherit"
	});
};
const printPrompt = (rootDirectory, diagnostics, score) => {
	if (diagnostics.length === 0) {
		log.success("No remaining issues — nothing to generate.");
		return;
	}
	const prompt = buildAgentPrompt(rootDirectory, diagnostics, score);
	if (!process.stdout.isTTY) {
		process.stdout.write(prompt);
		return;
	}
	log.break();
	log.raw(style(theme, "bold", "Agent prompt"));
	log.raw(style(theme, "dim", "  Copy the prompt below, or pipe it: fix -p | pbcopy"));
	log.raw(style(theme, "dim", "  Or launch directly: fix --claude, fix --cursor, fix --codex, etc."));
	log.raw(style(theme, "dim", "  Editor agents (--cursor, --windsurf, --vscode) auto-copy to clipboard."));
	log.break();
	log.raw(style(theme, "dim", "╭─────────────────────────────────────────────────────────╮"));
	for (const line of prompt.split("\n")) log.raw(`  ${line}`);
	log.raw(style(theme, "dim", "╰─────────────────────────────────────────────────────────╯"));
	log.break();
};

//#endregion
//#region src/engines/ai-slop/dead-patterns-fix.ts
/**
* Given a starting line that contains an opening `(`, find all lines
* through the matching `)`. Returns the set of 1-based line numbers.
*/
const findStatementSpan = (lines, startIndex) => {
	const span = /* @__PURE__ */ new Set();
	let depth = 0;
	let started = false;
	for (let i = startIndex; i < lines.length; i++) {
		const line = lines[i];
		span.add(i + 1);
		for (const ch of line) if (ch === "(") {
			depth++;
			started = true;
		} else if (ch === ")") depth--;
		if (started && depth <= 0) break;
	}
	return span;
};
/**
* Patterns that indicate a console.log is communicating an error or important
* status to the user — should be upgraded to console.error, not removed.
*/
const ERROR_MESSAGE_PATTERNS = [
	/\b(?:error|err|fail|failed|failure|fatal|crash|exception)\b/i,
	/\b(?:not found|missing|invalid|unable|cannot|couldn'?t|won'?t)\b/i,
	/\b(?:denied|unauthorized|forbidden|refused|rejected|timeout|timed?\s*out)\b/i,
	/\bno\s+(?:\w+\s+)*found\b/i,
	/\bprocess\.exit\b/
];
/**
* Extracts the full text of a console statement spanning multiple lines.
*/
const getStatementText = (lines, span) => {
	const spanLines = [];
	for (const lineNo of span) spanLines.push(lines[lineNo - 1]);
	return spanLines.join("\n");
};
/**
* Determine if a console.log should be replaced with console.error
* rather than removed entirely.
*/
const shouldUpgradeToError = (statementText) => {
	return ERROR_MESSAGE_PATTERNS.some((pattern) => pattern.test(statementText));
};
const DIAGNOSTIC_PATH_RE = /(?:^|\/)(?:tools|scripts|cli|bin)\/|(?:^|\/)test-[^/]*\.[tj]sx?$|[.-](?:test|spec)\.[tj]sx?$/i;
const isDiagnosticScriptPath = (filePath) => DIAGNOSTIC_PATH_RE.test(filePath.replace(/\\/g, "/"));
const firstNonBlank = (lines, from, step, skip) => {
	for (let i = from; i >= 0 && i < lines.length; i += step) {
		if (skip.has(i + 1)) continue;
		if (lines[i].trim() !== "") return lines[i].trim();
	}
	return "";
};
const wouldEmptyEnclosingBlock = (lines, span, removed) => {
	const sorted = [...span].sort((a, b) => a - b);
	const before = firstNonBlank(lines, sorted[0] - 2, -1, removed);
	const after = firstNonBlank(lines, sorted[sorted.length - 1], 1, removed);
	return before.endsWith("{") && after.startsWith("}");
};
const fixDeadPatterns = async (context) => {
	const fixable = [...await detectTrivialComments(context), ...await detectDeadPatterns(context)].filter((d) => d.fixable);
	if (fixable.length === 0) return;
	const byFile = /* @__PURE__ */ new Map();
	for (const d of fixable) {
		const absolute = path.isAbsolute(d.filePath) ? d.filePath : path.join(context.rootDirectory, d.filePath);
		const entries = byFile.get(absolute) ?? [];
		entries.push({
			line: d.line,
			rule: d.rule
		});
		byFile.set(absolute, entries);
	}
	for (const [filePath, entries] of byFile) fixFileDeadPatterns(filePath, entries, context.rootDirectory);
};
const fixFileDeadPatterns = (filePath, entries, rootDirectory) => {
	if (!fs.existsSync(filePath)) return;
	const lines = fs.readFileSync(filePath, "utf-8").split("\n");
	const linesToRemove = /* @__PURE__ */ new Set();
	const lineReplacements = /* @__PURE__ */ new Map();
	const skipConsole = isDiagnosticScriptPath(path.relative(rootDirectory, filePath));
	const consoleSpans = [];
	for (const entry of entries) {
		const index = entry.line - 1;
		if (index < 0 || index >= lines.length) continue;
		if (entry.rule === "ai-slop/console-leftover") {
			if (skipConsole) continue;
			const span = findStatementSpan(lines, index);
			if (shouldUpgradeToError(getStatementText(lines, span))) lineReplacements.set(entry.line, lines[index].replace(/console\.(?:log|debug|info|trace|dir|table)\s*\(/, "console.error("));
			else consoleSpans.push(span);
		} else linesToRemove.add(entry.line);
	}
	const candidateLines = /* @__PURE__ */ new Set();
	for (const span of consoleSpans) for (const lineNo of span) candidateLines.add(lineNo);
	for (const span of consoleSpans) {
		if (wouldEmptyEnclosingBlock(lines, span, candidateLines)) continue;
		for (const lineNo of span) linesToRemove.add(lineNo);
	}
	const result = applyEditsAndCollapse(lines, linesToRemove, lineReplacements);
	fs.writeFileSync(filePath, result);
};
const applyEditsAndCollapse = (lines, linesToRemove, lineReplacements) => {
	const result = [];
	for (let i = 0; i < lines.length; i++) {
		const lineNo = i + 1;
		if (linesToRemove.has(lineNo)) continue;
		result.push(lineReplacements.get(lineNo) ?? lines[i]);
	}
	const collapsed = [];
	for (const line of result) {
		const prevEmpty = collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === "";
		if (line.trim() === "" && prevEmpty) continue;
		collapsed.push(line);
	}
	return collapsed.join("\n");
};

//#endregion
//#region src/engines/ai-slop/duplicate-imports-fix.ts
const JS_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const IMPORT_FROM_RE = /^\s*import\s+(.*?)\s+from\s+["']([^"']+)["']\s*;?\s*$/;
const SIDE_EFFECT_RE = /^\s*import\s+["']([^"']+)["']\s*;?\s*$/;
const parseNamedClause = (clause) => {
	const inner = clause.trim().slice(1, -1).trim();
	if (inner.length === 0) return [];
	const items = [];
	for (const part of inner.split(",")) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		let isType = false;
		let working = trimmed;
		if (/^type\s+/.test(working)) {
			isType = true;
			working = working.replace(/^type\s+/, "");
		}
		const aliasMatch = working.match(/^(\w+)\s+as\s+(\w+)$/);
		if (aliasMatch) {
			items.push({
				name: aliasMatch[1],
				alias: aliasMatch[2],
				isType
			});
			continue;
		}
		if (/^\w+$/.test(working)) items.push({
			name: working,
			isType
		});
	}
	return items;
};
const parseImportClause = (clause) => {
	let rest = clause.trim();
	let isTypeOnly = false;
	if (/^type\s+/.test(rest)) {
		isTypeOnly = true;
		rest = rest.replace(/^type\s+/, "");
	}
	const out = {
		named: [],
		isTypeOnly
	};
	const defMatch = rest.match(/^([A-Za-z_$][\w$]*)\s*(?:,\s*(.+))?$/);
	if (defMatch && !rest.startsWith("{") && !rest.startsWith("*")) {
		out.default = defMatch[1];
		rest = defMatch[2]?.trim() ?? "";
	}
	if (rest.startsWith("*")) {
		const nsMatch = rest.match(/^\*\s+as\s+(\w+)/);
		if (nsMatch) out.namespace = nsMatch[1];
		return out;
	}
	if (rest.startsWith("{")) out.named = parseNamedClause(rest);
	return out;
};
const parseImportLine = (line, lineIndex) => {
	const sideEffect = line.match(SIDE_EFFECT_RE);
	if (sideEffect) return {
		lineIndex,
		module: sideEffect[1],
		named: [],
		isTypeOnly: false,
		isSideEffect: true
	};
	const m = line.match(IMPORT_FROM_RE);
	if (!m) return null;
	return {
		lineIndex,
		module: m[2],
		isSideEffect: false,
		...parseImportClause(m[1])
	};
};
const formatNamed = (n, stripType) => {
	const prefix = n.isType && !stripType ? "type " : "";
	const suffix = n.alias ? ` as ${n.alias}` : "";
	return `${prefix}${n.name}${suffix}`;
};
const mergeImports = (group) => {
	if (group.some((s) => s.isSideEffect)) return null;
	if (group.some((s) => s.namespace !== void 0)) return null;
	if (group.some((s) => s.isTypeOnly && s.default !== void 0)) return null;
	const defaults = group.map((s) => s.default).filter((d) => d !== void 0);
	const uniqueDefaults = Array.from(new Set(defaults));
	if (uniqueDefaults.length > 1) return null;
	const defaultName = uniqueDefaults[0];
	const merged = /* @__PURE__ */ new Map();
	for (const stmt of group) for (const nm of stmt.named) {
		const key = nm.alias ?? nm.name;
		const isType = nm.isType || stmt.isTypeOnly;
		const existing = merged.get(key);
		if (!existing) merged.set(key, {
			...nm,
			isType
		});
		else existing.isType = existing.isType && isType;
	}
	const insertionOrder = Array.from(merged.values());
	const namedList = [...insertionOrder.filter((n) => !n.isType), ...insertionOrder.filter((n) => n.isType)];
	const allTypeOnly = namedList.length > 0 && namedList.every((n) => n.isType);
	const module = group[0].module;
	if (!defaultName && namedList.length === 0) return null;
	if (!defaultName && allTypeOnly) return `import type { ${namedList.map((n) => formatNamed(n, true)).join(", ")} } from "${module}";`;
	const parts = [];
	if (defaultName) parts.push(defaultName);
	if (namedList.length > 0) {
		const items = namedList.map((n) => formatNamed(n, false)).join(", ");
		parts.push(`{ ${items} }`);
	}
	return `import ${parts.join(", ")} from "${module}";`;
};
const fixDuplicateImports = async (context) => {
	const files = getSourceFiles(context);
	for (const filePath of files) {
		if (!JS_EXTENSIONS.has(path.extname(filePath))) continue;
		if (isAutoGenerated(filePath)) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const lines = content.split("\n");
		const imports = [];
		for (let i = 0; i < lines.length; i++) {
			const stmt = parseImportLine(lines[i], i);
			if (stmt) imports.push(stmt);
		}
		if (imports.length < 2) continue;
		const groups = /* @__PURE__ */ new Map();
		for (const stmt of imports) {
			const list = groups.get(stmt.module) ?? [];
			list.push(stmt);
			groups.set(stmt.module, list);
		}
		const linesToRemove = /* @__PURE__ */ new Set();
		const replacements = /* @__PURE__ */ new Map();
		let modified = false;
		for (const group of groups.values()) {
			if (group.length < 2) continue;
			const merged = mergeImports(group);
			if (!merged) continue;
			replacements.set(group[0].lineIndex, merged);
			for (const stmt of group.slice(1)) linesToRemove.add(stmt.lineIndex);
			modified = true;
		}
		if (!modified) continue;
		const next = [...lines];
		for (const [idx, replacement] of replacements) next[idx] = replacement;
		const sortedRemove = Array.from(linesToRemove).sort((a, b) => b - a);
		for (const idx of sortedRemove) next.splice(idx, 1);
		fs.writeFileSync(filePath, next.join("\n"));
	}
};

//#endregion
//#region src/engines/ai-slop/narrative-comments-fix.ts
const fixNarrativeComments = async (context) => {
	const diagnostics = await detectNarrativeComments(context);
	if (diagnostics.length === 0) return;
	const byFile = /* @__PURE__ */ new Map();
	for (const d of diagnostics) {
		const abs = d.filePath.startsWith("/") ? d.filePath : `${context.rootDirectory}/${d.filePath}`;
		const list = byFile.get(abs) ?? [];
		list.push(d);
		byFile.set(abs, list);
	}
	for (const [filePath, diags] of byFile) {
		const syntax = getCommentSyntax(path.extname(filePath));
		if (!syntax) continue;
		let content;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}
		const lines = content.split("\n");
		const blocks = collectBlocks(lines, syntax);
		const toRemove = /* @__PURE__ */ new Set();
		for (const d of diags) {
			const block = blocks.find((b) => b.startLine === d.line);
			if (!block) continue;
			for (let ln = block.startLine; ln <= block.endLine; ln += 1) toRemove.add(ln);
			const prev = block.startLine - 1;
			const next = block.endLine + 1;
			const prevIsBlank = prev >= 1 && lines[prev - 1]?.trim() === "";
			const nextIsBlank = next <= lines.length && lines[next - 1]?.trim() === "";
			if (prevIsBlank && nextIsBlank) toRemove.add(prev);
		}
		const kept = [];
		for (let i = 0; i < lines.length; i += 1) if (!toRemove.has(i + 1)) kept.push(lines[i]);
		const newContent = kept.join("\n");
		if (newContent !== content) fs.writeFileSync(filePath, newContent);
	}
};

//#endregion
//#region src/engines/ai-slop/unused-imports-fix.ts
const fixUnusedImports = async (context) => {
	const files = getSourceFiles(context);
	for (const filePath of files) {
		const analysis = analyzeFile(filePath);
		if (!analysis) continue;
		const unused = getUnusedSymbols(analysis.lines, analysis.symbols, analysis.importLines);
		if (unused.length === 0) continue;
		const unusedNames = new Set(unused.map((u) => u.name));
		const lines = [...analysis.lines];
		const symbolsByLine = /* @__PURE__ */ new Map();
		for (const sym of analysis.symbols) {
			const arr = symbolsByLine.get(sym.line) ?? [];
			arr.push(sym);
			symbolsByLine.set(sym.line, arr);
		}
		const linesToRemove = /* @__PURE__ */ new Set();
		for (const [lineNo, syms] of symbolsByLine) {
			const lineIdx = lineNo - 1;
			const allUnused = syms.every((s) => unusedNames.has(s.name));
			const importSpan = JS_EXTENSIONS$1.has(analysis.ext) ? getJsImportSpan(lines, lineIdx) : [lineIdx];
			if (allUnused) for (const idx of importSpan) linesToRemove.add(idx);
			else if (JS_EXTENSIONS$1.has(analysis.ext)) rewriteJsImportSpan(lines, importSpan, syms, unusedNames);
			else if (PY_EXTENSIONS.has(analysis.ext)) rewritePyImportLine(lines, lineIdx, unusedNames);
		}
		if (linesToRemove.size === 0 && unused.length === 0) continue;
		const sortedRemove = [...linesToRemove].sort((a, b) => b - a);
		for (const idx of sortedRemove) lines.splice(idx, 1);
		const filtered = lines.filter((l) => l !== REMOVE_MARKER);
		while (filtered.length > 0 && filtered[0].trim() === "") filtered.shift();
		fs.writeFileSync(filePath, filtered.join("\n"));
	}
};
const getJsImportSpan = (lines, startIdx) => {
	const span = [startIdx];
	let fullImport = lines[startIdx]?.trim() ?? "";
	if (!fullImport.startsWith("import ")) return span;
	let idx = startIdx + 1;
	while (!fullImport.includes("from") && idx < lines.length) {
		span.push(idx);
		fullImport += ` ${lines[idx].trim()}`;
		idx++;
	}
	return span;
};
const rewriteJsImportSpan = (lines, span, syms, unusedNames) => {
	const fullImport = span.map((i) => lines[i]).join("\n");
	const namedMatch = fullImport.match(/\{([^}]+)\}/s);
	if (!namedMatch) return;
	const unusedNamed = syms.filter((s) => !s.isDefault && !s.isNamespace && unusedNames.has(s.name));
	const defaultUnused = syms.some((s) => s.isDefault && unusedNames.has(s.name));
	if (unusedNamed.length === 0 && !defaultUnused) return;
	const unusedNamedSet = new Set(unusedNamed.map((s) => s.name));
	const keptSpecifiers = namedMatch[1].split(",").map((s) => s.trim()).filter(Boolean).filter((spec) => {
		const parts = spec.split(/\s+as\s+/);
		const localName = parts.length > 1 ? parts[1].trim().replace(/^type\s+/, "") : parts[0].trim().replace(/^type\s+/, "");
		return !unusedNamedSet.has(localName);
	});
	const fromMatch = fullImport.match(/from\s+["']([^"']+)["'];?/);
	const fromClause = fromMatch ? `from "${fromMatch[1]}"` : "";
	if (keptSpecifiers.length === 0) {
		const usedDefault = syms.find((s) => s.isDefault && !unusedNames.has(s.name));
		if (usedDefault) {
			const defaultMatch = fullImport.match(/^import\s+(\w+)/);
			const defaultName = defaultMatch ? defaultMatch[1] : usedDefault.name;
			lines[span[0]] = `import ${defaultName} ${fromClause};`;
			for (let i = 1; i < span.length; i++) lines[span[i]] = REMOVE_MARKER;
		} else for (const idx of span) lines[idx] = REMOVE_MARKER;
		return;
	}
	if (defaultUnused) {
		lines[span[0]] = `import { ${keptSpecifiers.join(", ")} } ${fromClause};`;
		for (let i = 1; i < span.length; i++) lines[span[i]] = REMOVE_MARKER;
		return;
	}
	const importPrefix = fullImport.match(/^(import\s+(?:\w+\s*,\s*)?)/);
	const prefix = importPrefix ? importPrefix[1] : "import ";
	const wasMultiLine = span.length > 1;
	let newImport;
	if (wasMultiLine && keptSpecifiers.length > 2) {
		const indentMatch = lines[span[1]]?.match(/^(\s+)/);
		const indent = indentMatch ? indentMatch[1] : "	";
		newImport = `${prefix}{\n${keptSpecifiers.map((s) => `${indent}${s},`).join("\n")}\n} ${fromClause};`;
	} else newImport = `${prefix}{ ${keptSpecifiers.join(", ")} } ${fromClause};`;
	lines[span[0]] = newImport;
	for (let i = 1; i < span.length; i++) lines[span[i]] = REMOVE_MARKER;
};
const rewritePyImportLine = (lines, lineIdx, unusedNames) => {
	const fromMatch = lines[lineIdx].match(/^(\s*from\s+[\w.]+\s+import\s+)(.+)$/);
	if (!fromMatch) {
		rewritePlainPyImportLine(lines, lineIdx, unusedNames);
		return;
	}
	const prefix = fromMatch[1];
	const importPart = fromMatch[2].replace(/#.*$/, "").trim();
	const hasParen = importPart.startsWith("(");
	const keptSpecifiers = importPart.replace(/[()]/g, "").split(",").map((s) => s.trim()).filter((spec) => {
		const parts = spec.split(/\s+as\s+/);
		const localName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
		return !unusedNames.has(localName);
	});
	if (keptSpecifiers.length === 0) return;
	const joined = keptSpecifiers.join(", ");
	lines[lineIdx] = hasParen ? `${prefix}(${joined})` : `${prefix}${joined}`;
};
const rewritePlainPyImportLine = (lines, lineIdx, unusedNames) => {
	const match = lines[lineIdx].match(/^(\s*import\s+)(.+)$/);
	if (!match) return;
	const prefix = match[1];
	const specifiers = match[2].replace(/#.*$/, "").split(",").map((s) => s.trim()).filter(Boolean);
	const kept = specifiers.filter((spec) => {
		const parts = spec.split(/\s+as\s+/);
		const localName = parts.length > 1 ? parts[1].trim() : parts[0].trim().split(".")[0];
		return !unusedNames.has(localName);
	});
	if (kept.length === 0 || kept.length === specifiers.length) return;
	lines[lineIdx] = `${prefix}${kept.join(", ")}`;
};

//#endregion
//#region src/engines/code-quality/unused-removal-ast.ts
const getLineFromPos = (sourceFile, pos) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
const nodeContainsLine = (sourceFile, node, targetLine) => {
	const startLine = getLineFromPos(sourceFile, node.getStart(sourceFile));
	const endLine = getLineFromPos(sourceFile, node.getEnd());
	return startLine <= targetLine && targetLine <= endLine;
};
const initializerHasSideEffects = (node) => {
	if (!node) return false;
	let unsafe = false;
	const visit = (n) => {
		if (unsafe) return;
		if (ts.isCallExpression(n) || ts.isNewExpression(n) || ts.isTaggedTemplateExpression(n) || ts.isAwaitExpression(n) || ts.isYieldExpression(n) || ts.isDeleteExpression(n) || ts.isPostfixUnaryExpression(n)) {
			unsafe = true;
			return;
		}
		if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
			unsafe = true;
			return;
		}
		if (ts.isPrefixUnaryExpression(n) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) {
			unsafe = true;
			return;
		}
		if (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n)) return;
		ts.forEachChild(n, visit);
	};
	visit(node);
	return unsafe;
};
const computeRemovalRange = (sourceFile, node, content) => {
	const nodeStart = node.getStart(sourceFile);
	const end = node.getEnd();
	let start = nodeStart;
	while (start > 0 && content[start - 1] !== "\n") start--;
	const ranges = ts.getLeadingCommentRanges(content, node.getFullStart()) ?? [];
	if (ranges.length > 0) {
		let cursor = start;
		for (let i = ranges.length - 1; i >= 0; i--) {
			const r = ranges[i];
			const between = content.slice(r.end, cursor);
			if (/^\s*$/.test(between) && (between.match(/\n/g) ?? []).length <= 1) {
				let cs = r.pos;
				while (cs > 0 && content[cs - 1] !== "\n") cs--;
				cursor = cs;
			} else break;
		}
		start = cursor;
	}
	let finalEnd = end;
	if (finalEnd < content.length && content[finalEnd] === "\r") finalEnd++;
	if (finalEnd < content.length && content[finalEnd] === "\n") finalEnd++;
	return {
		start,
		end: finalEnd
	};
};
const kindOfStatement = (node) => {
	if (ts.isVariableStatement(node)) return "variable";
	if (ts.isFunctionDeclaration(node)) return "function";
	if (ts.isClassDeclaration(node)) return "class";
	if (ts.isTypeAliasDeclaration(node)) return "type";
	if (ts.isInterfaceDeclaration(node)) return "interface";
	if (ts.isEnumDeclaration(node)) return "enum";
	return null;
};
const matchStatement = (sourceFile, statement, content, decl) => {
	if (!kindOfStatement(statement)) return { type: "none" };
	if (ts.isVariableStatement(statement)) {
		const varDecls = statement.declarationList.declarations;
		if (varDecls.length === 0) return { type: "none" };
		const match = varDecls.find((vd) => {
			const nameNode = vd.name;
			if (!ts.isIdentifier(nameNode)) return false;
			if (nameNode.text !== decl.name) return false;
			return nodeContainsLine(sourceFile, vd, decl.line);
		});
		if (!match) return { type: "none" };
		if (varDecls.length > 1) return {
			type: "skip",
			reason: "multi-declaration variable statement",
			declaration: decl
		};
		if (initializerHasSideEffects(match.initializer)) return {
			type: "skip",
			reason: "initializer may have side effects",
			declaration: decl
		};
		return {
			type: "match",
			removal: {
				...computeRemovalRange(sourceFile, statement, content),
				declaration: decl
			}
		};
	}
	if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
		if (!statement.name) return { type: "none" };
		if (statement.name.text !== decl.name) return { type: "none" };
		if (!nodeContainsLine(sourceFile, statement, decl.line)) return { type: "none" };
		return {
			type: "match",
			removal: {
				...computeRemovalRange(sourceFile, statement, content),
				declaration: decl
			}
		};
	}
	if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isEnumDeclaration(statement)) {
		if (statement.name.text !== decl.name) return { type: "none" };
		if (!nodeContainsLine(sourceFile, statement, decl.line)) return { type: "none" };
		return {
			type: "match",
			removal: {
				...computeRemovalRange(sourceFile, statement, content),
				declaration: decl
			}
		};
	}
	return { type: "none" };
};
const applyRemovals = (content, removals) => {
	const ordered = [...removals].sort((a, b) => b.start - a.start);
	let output = content;
	for (const r of ordered) output = output.slice(0, r.start) + output.slice(r.end);
	return output;
};
const hasSyntaxDiagnostics = (filePath, content) => {
	const diagnostics = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true).parseDiagnostics;
	return Array.isArray(diagnostics) && diagnostics.length > 0;
};

//#endregion
//#region src/engines/code-quality/unused-removal-detect.ts
const KNIP_MESSAGE_KIND = {
	"knip/exports": "variable",
	"knip/types": "type",
	"knip/duplicates": "variable"
};
const extractNameFromKnip = (message) => {
	return message.match(/^(?:Unused export|Unused type|Duplicate export):\s*(.+)$/)?.[1]?.trim() ?? null;
};
const extractNameAndKindFromOxlint = (message) => {
	const varMatch = message.match(/Variable '([^']+)' is declared but never used/);
	if (varMatch?.[1]) return {
		name: varMatch[1],
		kind: "variable"
	};
	const funcMatch = message.match(/Function '([^']+)' is declared but never used/);
	if (funcMatch?.[1]) return {
		name: funcMatch[1],
		kind: "function"
	};
	const classMatch = message.match(/Class '([^']+)' is declared but never used/);
	if (classMatch?.[1]) return {
		name: classMatch[1],
		kind: "class"
	};
	const tsValueMatch = message.match(/'([^']+)' is declared but its value is never read/);
	if (tsValueMatch?.[1]) return {
		name: tsValueMatch[1],
		kind: "variable"
	};
	const identMatch = message.match(/'([^']+)' is (?:defined|declared) but never used/);
	if (identMatch?.[1]) return {
		name: identMatch[1],
		kind: "variable"
	};
	return null;
};
const isUnusedVarRule = (rule) => rule === "no-unused-vars" || rule.endsWith("/no-unused-vars");
const detectUnusedDeclarations = async (context) => {
	const [oxlintDiagnostics, knipDiagnostics] = await Promise.all([runOxlint(context).catch(() => []), runKnip(context.rootDirectory).catch(() => [])]);
	const merged = [];
	for (const d of oxlintDiagnostics) {
		if (!isUnusedVarRule(d.rule)) continue;
		const extracted = extractNameAndKindFromOxlint(d.message);
		if (!extracted) continue;
		if (extracted.name.startsWith("_")) continue;
		merged.push({
			filePath: d.filePath,
			engine: "code-quality",
			rule: "code-quality/unused-declaration",
			severity: "warning",
			message: `Unused ${extracted.kind}: ${extracted.name}`,
			help: "This top-level declaration is never used; aislop will remove it.",
			line: d.line,
			column: d.column,
			category: "Dead Code",
			fixable: true
		});
	}
	for (const d of knipDiagnostics) {
		if (!(d.rule in KNIP_MESSAGE_KIND)) continue;
		const name = extractNameFromKnip(d.message);
		if (!name) continue;
		const kind = KNIP_MESSAGE_KIND[d.rule];
		merged.push({
			filePath: d.filePath,
			engine: "code-quality",
			rule: "code-quality/unused-declaration",
			severity: "warning",
			message: `Unused ${kind}: ${name}`,
			help: "This top-level declaration is never imported; aislop will remove it.",
			line: d.line,
			column: d.column,
			category: "Dead Code",
			fixable: true
		});
	}
	const seen = /* @__PURE__ */ new Set();
	return merged.filter((d) => {
		const key = `${d.filePath}:${d.line}:${d.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};
/**
* Convert the detection diagnostics produced above into UnusedDeclaration
* records the remover can consume.
*/
const diagnosticsToDeclarations = (diagnostics) => {
	const result = [];
	for (const d of diagnostics) {
		const match = d.message.match(/^Unused (\w+): (.+)$/);
		if (!match) continue;
		const [, kindWord, name] = match;
		if (kindWord !== "variable" && kindWord !== "function" && kindWord !== "class" && kindWord !== "type" && kindWord !== "interface" && kindWord !== "enum") continue;
		result.push({
			filePath: d.filePath,
			line: d.line,
			column: d.column,
			name: name.trim(),
			kind: kindWord
		});
	}
	return result;
};

//#endregion
//#region src/engines/code-quality/unused-removal.ts
const removeUnusedDeclarations = (rootDirectory, declarations) => {
	const result = {
		removed: 0,
		skipped: []
	};
	const byFile = /* @__PURE__ */ new Map();
	for (const decl of declarations) {
		const absolute = path.isAbsolute(decl.filePath) ? decl.filePath : path.join(rootDirectory, decl.filePath);
		const arr = byFile.get(absolute) ?? [];
		arr.push(decl);
		byFile.set(absolute, arr);
	}
	for (const [filePath, fileDecls] of byFile) {
		if (!fs.existsSync(filePath)) {
			for (const d of fileDecls) result.skipped.push({
				declaration: d,
				reason: "file not found"
			});
			continue;
		}
		const original = fs.readFileSync(filePath, "utf-8");
		const sourceFile = ts.createSourceFile(filePath, original, ts.ScriptTarget.Latest, true);
		const originalHadSyntaxErrors = hasSyntaxDiagnostics(filePath, original);
		const pending = [];
		const pendingSkips = [];
		for (const decl of fileDecls) {
			let matched = { type: "none" };
			for (const statement of sourceFile.statements) {
				const attempt = matchStatement(sourceFile, statement, original, decl);
				if (attempt.type !== "none") {
					matched = attempt;
					break;
				}
			}
			if (matched.type === "match") pending.push(matched.removal);
			else if (matched.type === "skip") pendingSkips.push({
				declaration: matched.declaration,
				reason: matched.reason
			});
			else pendingSkips.push({
				declaration: decl,
				reason: "declaration not found at top level"
			});
		}
		if (pending.length === 0) {
			for (const s of pendingSkips) result.skipped.push(s);
			continue;
		}
		const updated = applyRemovals(original, pending);
		const normalized = updated.trim() === "" ? "\n" : updated;
		if (!originalHadSyntaxErrors && hasSyntaxDiagnostics(filePath, normalized)) {
			for (const p of pending) result.skipped.push({
				declaration: p.declaration,
				reason: "removal would break file syntax"
			});
			for (const s of pendingSkips) result.skipped.push(s);
			continue;
		}
		if (normalized !== original) {
			fs.writeFileSync(filePath, normalized);
			result.removed += pending.length;
		}
		for (const s of pendingSkips) result.skipped.push(s);
	}
	return result;
};

//#endregion
//#region src/engines/lint/expo-doctor.ts
var expo_doctor_exports = /* @__PURE__ */ __exportAll({ runExpoDoctor: () => runExpoDoctor });
const esmRequire = createRequire(import.meta.url);
const ISSUE_PREFIX = "✖ ";
const resolveExpoDoctorScript = () => {
	try {
		const packageJsonPath = esmRequire.resolve("expo-doctor/package.json");
		const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
		const binRelativePath = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["expo-doctor"];
		if (!binRelativePath) return null;
		return path.join(path.dirname(packageJsonPath), binRelativePath);
	} catch {
		return null;
	}
};
const toRuleSuffix = (title) => {
	const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	return slug.length > 0 ? slug : "issue";
};
const parseIssues = (output) => {
	const lines = output.split("\n").map((line) => line.trimEnd());
	const startIndex = lines.findIndex((line) => line.includes("Possible issues detected:"));
	if (startIndex < 0) return [];
	const issues = [];
	let current = null;
	let inAdvice = false;
	for (let i = startIndex + 1; i < lines.length; i += 1) {
		const line = lines[i].trim();
		if (/^\d+\s+checks failed/.test(line)) break;
		if (line.length === 0) continue;
		if (line.startsWith(ISSUE_PREFIX)) {
			if (current) issues.push(current);
			current = {
				title: line.slice(2).trim(),
				details: [],
				advice: []
			};
			inAdvice = false;
			continue;
		}
		if (!current) continue;
		if (line === "Advice:") {
			inAdvice = true;
			continue;
		}
		if (inAdvice) current.advice.push(line);
		else current.details.push(line);
	}
	if (current) issues.push(current);
	return issues;
};
const parseConfigError = (output) => {
	const line = output.split("\n").find((candidate) => candidate.trim().startsWith("ConfigError:"));
	return line ? line.trim() : null;
};
const toDiagnostics = (issues) => issues.map((issue) => {
	const helpParts = [issue.details.join(" ").trim(), issue.advice.join(" ").trim()].filter((part) => part.length > 0);
	return {
		filePath: "package.json",
		engine: "lint",
		rule: `expo-doctor/${toRuleSuffix(issue.title)}`,
		severity: "warning",
		message: `Expo Doctor: ${issue.title}`,
		help: helpParts.join(" "),
		line: 0,
		column: 0,
		category: "Expo",
		fixable: false
	};
});
const hasExpoInstalled = (rootDirectory) => {
	try {
		createRequire(path.join(rootDirectory, "package.json")).resolve("expo/package.json");
		return true;
	} catch {
		return false;
	}
};
const runExpoDoctor = async (context) => {
	if (!hasExpoInstalled(context.rootDirectory)) return [];
	const scriptPath = resolveExpoDoctorScript();
	let stdout = "";
	let stderr = "";
	try {
		if (scriptPath) {
			const result = await runSubprocess(process.execPath, [
				scriptPath,
				context.rootDirectory,
				"--verbose"
			], {
				cwd: context.rootDirectory,
				timeout: 12e4
			});
			stdout = result.stdout;
			stderr = result.stderr;
		} else {
			const result = await runSubprocess("npx", [
				"--yes",
				"expo-doctor",
				context.rootDirectory,
				"--verbose"
			], {
				cwd: context.rootDirectory,
				timeout: 12e4
			});
			stdout = result.stdout;
			stderr = result.stderr;
		}
	} catch {
		return [];
	}
	const output = [stdout, stderr].filter(Boolean).join("\n");
	if (!output) return [];
	const configError = parseConfigError(output);
	if (configError) return [{
		filePath: "package.json",
		engine: "lint",
		rule: "expo-doctor/config-error",
		severity: "warning",
		message: configError,
		help: "Install project dependencies, then re-run `aislop scan`.",
		line: 0,
		column: 0,
		category: "Expo",
		fixable: false
	}];
	return toDiagnostics(parseIssues(output));
};

//#endregion
//#region src/commands/fix-expo.ts
const INSTALL_TIMEOUT$1 = 1800 * 1e3;
const fixExpoDependencies = async (context, onProgress) => {
	await removeDisallowedExpoPackages(context.rootDirectory, onProgress);
	onProgress?.("Expo dependency alignment · running expo install --fix (can take a few minutes)");
	if ((await runSubprocess("npx", [
		"--yes",
		"expo",
		"install",
		"--fix"
	], {
		cwd: context.rootDirectory,
		timeout: INSTALL_TIMEOUT$1
	})).exitCode === 0) return;
	onProgress?.("Expo dependency alignment · checking remaining issues");
	const checkResult = await runSubprocess("npx", [
		"--yes",
		"expo",
		"install",
		"--check"
	], {
		cwd: context.rootDirectory,
		timeout: INSTALL_TIMEOUT$1
	});
	if (checkResult.exitCode !== 0) throw new Error(checkResult.stderr || checkResult.stdout || "expo dependency check failed");
};
/**
* Run expo-doctor to detect packages that should not be installed directly,
* then uninstall them. No hardcoded list — expo-doctor is the source of truth.
*/
const removeDisallowedExpoPackages = async (rootDir, onProgress) => {
	try {
		onProgress?.("Expo dependency alignment · running expo-doctor");
		const result = await runSubprocess("npx", [
			"--yes",
			"expo-doctor",
			rootDir
		], {
			cwd: rootDir,
			timeout: INSTALL_TIMEOUT$1
		});
		const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
		const packagePattern = /The package "([^"]+)" should not be installed directly/g;
		const toRemove = [];
		for (const match of output.matchAll(packagePattern)) toRemove.push(match[1]);
		if (toRemove.length === 0) return;
		onProgress?.(`Expo dependency alignment · uninstalling ${toRemove.length} package(s)`);
		await runSubprocess("npm", ["uninstall", ...toRemove], {
			cwd: rootDir,
			timeout: INSTALL_TIMEOUT$1
		});
	} catch {}
};

//#endregion
//#region src/commands/fix-force.ts
const INSTALL_TIMEOUT = 1800 * 1e3;
const AUDIT_TIMEOUT = 60 * 1e3;
const detectPackageManager = (rootDirectory) => {
	if (fs.existsSync(path.join(rootDirectory, "pnpm-lock.yaml"))) return "pnpm";
	if (fs.existsSync(path.join(rootDirectory, "package-lock.json")) || fs.existsSync(path.join(rootDirectory, "package.json"))) return "npm";
	return null;
};
const fixDependencyAudit = async (context, onProgress) => {
	const pm = detectPackageManager(context.rootDirectory);
	if (!pm) return;
	if (pm === "npm") {
		await runNpmAuditFix(context.rootDirectory, onProgress);
		await tryNpmOverrides(context.rootDirectory, onProgress);
		return;
	}
	if (await tryPnpmOverrides(context.rootDirectory, onProgress)) return;
	if (fs.existsSync(path.join(context.rootDirectory, "package-lock.json"))) {
		await runNpmAuditFix(context.rootDirectory, onProgress);
		await tryNpmOverrides(context.rootDirectory, onProgress);
		return;
	}
	onProgress?.("Dependency audit fixes · skipping (pnpm audit unavailable and no package-lock.json for npm fallback)");
};
const SEMVER_PREFIX_RE = /^[~^]?/;
const parseSemverMin = (spec) => {
	const match = spec.replace(SEMVER_PREFIX_RE, "").match(/^(\d+|x|X|\*)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?/);
	if (!match) return null;
	const head = match[1];
	if (!/^\d+$/.test(head)) return null;
	const toNum = (part) => {
		if (!part) return 0;
		return /^\d+$/.test(part) ? Number(part) : 0;
	};
	return [
		Number(head),
		toNum(match[2]),
		toNum(match[3])
	];
};
const isDowngrade = (oldSpec, newSpec) => {
	const oldV = parseSemverMin(oldSpec);
	const newV = parseSemverMin(newSpec);
	if (!oldV || !newV) return false;
	for (let i = 0; i < 3; i++) {
		if ((newV[i] ?? 0) < (oldV[i] ?? 0)) return true;
		if ((newV[i] ?? 0) > (oldV[i] ?? 0)) return false;
	}
	return false;
};
const DEP_BUCKETS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies"
];
const snapshotPackageVersions = (pkg) => {
	const map = /* @__PURE__ */ new Map();
	for (const bucket of DEP_BUCKETS) {
		const deps = pkg[bucket];
		if (!deps || typeof deps !== "object") continue;
		for (const [name, version] of Object.entries(deps)) if (typeof version === "string") map.set(`${bucket}:${name}`, version);
	}
	return map;
};
const revertDowngrades = (rootDir, before) => {
	const pkgPath = path.join(rootDir, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
	const reverted = [];
	for (const bucket of DEP_BUCKETS) {
		const deps = pkg[bucket];
		if (!deps) continue;
		for (const [name, version] of Object.entries(deps)) {
			const prior = before.get(`${bucket}:${name}`);
			if (!prior) continue;
			if (isDowngrade(prior, version)) {
				deps[name] = prior;
				reverted.push(`${name} ${version} → ${prior}`);
			}
		}
	}
	if (reverted.length > 0) fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
	return reverted;
};
const runNpmAuditFix = async (rootDir, onProgress) => {
	const pkgPath = path.join(rootDir, "package.json");
	const before = snapshotPackageVersions(JSON.parse(fs.readFileSync(pkgPath, "utf-8")));
	onProgress?.("Dependency audit fixes · running npm audit fix (can take a few minutes)");
	const result = await runSubprocess("npm", ["audit", "fix"], {
		cwd: rootDir,
		timeout: INSTALL_TIMEOUT
	});
	if (result.exitCode !== 0 && !result.stdout && !result.stderr) throw new Error("npm audit fix failed");
	const reverted = revertDowngrades(rootDir, before);
	if (reverted.length > 0) onProgress?.(`Dependency audit fixes · reverted ${reverted.length} downgrade(s): ${reverted.join(", ")}`);
	onProgress?.("Dependency audit fixes · running npm install");
	const installResult = await runSubprocess("npm", ["install"], {
		cwd: rootDir,
		timeout: INSTALL_TIMEOUT
	});
	if (installResult.exitCode !== 0) throw new Error(installResult.stderr || installResult.stdout || "npm install failed after audit fix");
};
const fetchLatestVersion$1 = async (rootDir, pkgName, pm) => {
	try {
		const result = await runSubprocess(pm, [
			"view",
			pkgName,
			"version",
			"--json"
		], {
			cwd: rootDir,
			timeout: 1e4
		});
		return result.stdout ? JSON.parse(result.stdout) : null;
	} catch {
		return null;
	}
};
const collectOverrides = async (rootDir, vulnerabilities, pm) => {
	const overrides = {};
	for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
		if (vuln.fixAvailable !== false || !vuln.range) continue;
		const latest = await fetchLatestVersion$1(rootDir, pkgName, pm);
		if (latest) overrides[pkgName] = latest;
	}
	return overrides;
};
const tryNpmOverrides = async (rootDir, onProgress) => {
	try {
		const auditResult = await runSubprocess("npm", ["audit", "--json"], {
			cwd: rootDir,
			timeout: AUDIT_TIMEOUT
		});
		if (!auditResult.stdout) return;
		const vulnerabilities = JSON.parse(auditResult.stdout).vulnerabilities;
		if (!vulnerabilities) return;
		const rawOverrides = await collectOverrides(rootDir, vulnerabilities, "npm");
		if (Object.keys(rawOverrides).length === 0) return;
		const overrides = guardAndReport(rootDir, rawOverrides, onProgress);
		if (Object.keys(overrides).length === 0) return;
		const pkgPath = path.join(rootDir, "package.json");
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
		pkg.overrides = {
			...pkg.overrides || {},
			...overrides
		};
		fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
		onProgress?.("Dependency audit fixes · applying npm overrides (npm install)");
		await runSubprocess("npm", ["install"], {
			cwd: rootDir,
			timeout: INSTALL_TIMEOUT
		});
	} catch {}
};
const patchedRangeToVersion = (patched) => {
	const match = patched.match(/^\s*>=?\s*([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/);
	return match ? `^${match[1]}` : null;
};
const overrideKey = (name, vulnerable, patched) => {
	if (vulnerable && vulnerable.trim().length > 0 && !/^\*$/.test(vulnerable.trim())) return `${name}@${vulnerable.trim()}`;
	const first = patched.match(/([0-9]+\.[0-9]+\.[0-9]+)/)?.[1];
	return first ? `${name}@<${first}` : name;
};
const collectPnpmOverrides = (advisories) => {
	const overrides = {};
	for (const adv of Object.values(advisories)) {
		if (!adv.module_name || !adv.patched_versions) continue;
		const target = patchedRangeToVersion(adv.patched_versions);
		if (!target) continue;
		const key = overrideKey(adv.module_name, adv.vulnerable_versions, adv.patched_versions);
		overrides[key] = target;
	}
	return overrides;
};
const overrideName = (key) => {
	const at = key.lastIndexOf("@");
	return at > 0 ? key.slice(0, at) : key;
};
const guardOverrides = (overrides, installed) => {
	const safe = {};
	const skipped = [];
	for (const [key, target] of Object.entries(overrides)) {
		const current = installed.get(overrideName(key));
		if (current && isDowngrade(current, target)) {
			skipped.push(`${overrideName(key)} ${current} → ${target}`);
			continue;
		}
		safe[key] = target;
	}
	return {
		safe,
		skipped
	};
};
const readRootNodeModulesVersion = (rootDir, name) => {
	try {
		const manifest = path.join(rootDir, "node_modules", name, "package.json");
		const version = JSON.parse(fs.readFileSync(manifest, "utf-8")).version;
		return typeof version === "string" ? version : null;
	} catch {
		return null;
	}
};
const PNPM_STORE_VERSION_RE = /^(\d+\.\d+\.\d+[^_(]*)/;
const isHigherVersion = (candidate, current) => {
	if (!current) return true;
	const a = parseSemverMin(candidate);
	const b = parseSemverMin(current);
	if (!a || !b) return false;
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
		if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
	}
	return false;
};
const readPnpmStoreVersion = (rootDir, name) => {
	let entries;
	try {
		entries = fs.readdirSync(path.join(rootDir, "node_modules", ".pnpm"));
	} catch {
		return null;
	}
	const prefix = `${name.replace(/\//g, "+")}@`;
	let best = null;
	for (const entry of entries) {
		if (!entry.startsWith(prefix)) continue;
		const match = PNPM_STORE_VERSION_RE.exec(entry.slice(prefix.length));
		if (match && isHigherVersion(match[1], best)) best = match[1];
	}
	return best;
};
const readInstalledVersions = (rootDir, names) => {
	const map = /* @__PURE__ */ new Map();
	for (const name of names) {
		const version = readRootNodeModulesVersion(rootDir, name) ?? readPnpmStoreVersion(rootDir, name);
		if (version) map.set(name, version);
	}
	return map;
};
const guardAndReport = (rootDir, rawOverrides, onProgress) => {
	const { safe, skipped } = guardOverrides(rawOverrides, readInstalledVersions(rootDir, Object.keys(rawOverrides).map(overrideName)));
	if (skipped.length > 0) onProgress?.(`Dependency audit fixes · skipped ${skipped.length} downgrade(s), verify intent: ${skipped.join(", ")}`);
	return safe;
};
const isPnpmAuditRetired = (stdout, stderr) => {
	const haystack = `${stdout}\n${stderr}`.toLowerCase();
	return haystack.includes("410") || haystack.includes("gone") || haystack.includes("retired") || haystack.includes("endpoint") || haystack.includes("err_pnpm_audit") || haystack.includes("audit endpoint");
};
const tryPnpmOverrides = async (rootDir, onProgress) => {
	onProgress?.("Dependency audit fixes · running pnpm audit");
	const auditResult = await runSubprocess("pnpm", ["audit", "--json"], {
		cwd: rootDir,
		timeout: AUDIT_TIMEOUT
	});
	if (!auditResult.stdout) {
		if (isPnpmAuditRetired(auditResult.stdout ?? "", auditResult.stderr ?? "")) return false;
		return auditResult.exitCode === 0;
	}
	let parsed;
	try {
		parsed = JSON.parse(auditResult.stdout);
	} catch {
		if (auditResult.exitCode !== 0 || isPnpmAuditRetired(auditResult.stdout, auditResult.stderr ?? "")) return false;
		return true;
	}
	const advisories = parsed.advisories;
	if (!advisories || Object.keys(advisories).length === 0) return true;
	const rawOverrides = collectPnpmOverrides(advisories);
	if (Object.keys(rawOverrides).length === 0) return true;
	const overrides = guardAndReport(rootDir, rawOverrides, onProgress);
	if (Object.keys(overrides).length === 0) return true;
	const pkgPath = path.join(rootDir, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
	const pnpmBlock = pkg.pnpm ?? {};
	const existing = pnpmBlock.overrides ?? {};
	pkg.pnpm = {
		...pnpmBlock,
		overrides: {
			...existing,
			...overrides
		}
	};
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
	onProgress?.("Dependency audit fixes · applying pnpm overrides (pnpm install)");
	await runSubprocess("pnpm", ["install"], {
		cwd: rootDir,
		timeout: INSTALL_TIMEOUT
	});
	return true;
};

//#endregion
//#region src/commands/fix-pipeline.ts
const hasJsOrTs = (projectInfo) => projectInfo.languages.includes("typescript") || projectInfo.languages.includes("javascript");
const runAiSlopSteps = async (deps) => {
	if (!deps.config.engines["ai-slop"]) return;
	await deps.runStep("Unused imports", () => detectUnusedImports(deps.context), () => fixUnusedImports(deps.context));
	await deps.runStep("Duplicate imports", () => detectDuplicateImports(deps.context), () => fixDuplicateImports(deps.context));
	if (deps.safe) {
		await deps.runStep("Narrative comments", async () => (await detectNarrativeComments(deps.context)).filter((d) => d.fixable), () => fixNarrativeComments(deps.context));
		return;
	}
	const detectFixableSlop = async () => {
		const [comments, dead, narrative] = await Promise.all([
			detectTrivialComments(deps.context),
			detectDeadPatterns(deps.context),
			detectNarrativeComments(deps.context)
		]);
		return [
			...comments,
			...dead,
			...narrative
		].filter((d) => d.fixable);
	};
	await deps.runStep("Dead code & comments", detectFixableSlop, async () => {
		await fixDeadPatterns(deps.context);
		await fixNarrativeComments(deps.context);
	});
};
const runDeclarationStep = async (deps) => {
	if (!deps.config.engines["code-quality"]) return;
	if (!hasJsOrTs(deps.projectInfo)) return;
	await deps.runStep("Unused declarations", () => detectUnusedDeclarations(deps.context), async () => {
		const declarations = diagnosticsToDeclarations(await detectUnusedDeclarations(deps.context));
		removeUnusedDeclarations(deps.resolvedDir, declarations);
	});
};
const runLintSteps = async (deps) => {
	if (!deps.config.engines.lint) return;
	if (hasJsOrTs(deps.projectInfo)) await deps.runStep("Lint fixes (js/ts)", () => runOxlint(deps.context), () => fixOxlint(deps.context, { force: deps.force }));
	if (deps.projectInfo.languages.includes("python") && deps.projectInfo.installedTools.ruff) await deps.runStep("Lint fixes (python)", () => runRuffLint(deps.context), () => deps.force ? fixRuffLintForce(deps.resolvedDir) : fixRuffLint(deps.resolvedDir));
	else if (deps.projectInfo.languages.includes("python")) log.warn("Python detected but ruff is not installed; skipping Python lint fixes.");
	if (deps.projectInfo.languages.includes("ruby") && deps.projectInfo.installedTools.rubocop) await deps.runStep("Lint fixes (ruby)", () => Promise.resolve().then(() => generic_exports).then((mod) => mod.runGenericLinter(deps.context, "ruby")), () => fixRubyLint(deps.resolvedDir));
	else if (deps.projectInfo.languages.includes("ruby")) log.warn("Ruby detected but rubocop is not installed; skipping Ruby lint fixes.");
};
const runDependencyStep = async (deps) => {
	if (!deps.config.engines["code-quality"]) return;
	if (!hasJsOrTs(deps.projectInfo)) return;
	await deps.runStep("Unused dependencies", () => runKnipDependencyCheck(deps.resolvedDir), () => fixUnusedDependencies(deps.resolvedDir));
};
const runFormattingStep = async (deps) => {
	if (!deps.config.engines.format) return;
	if (hasJsOrTs(deps.projectInfo)) await deps.runStep("Formatting (js/ts)", () => runBiomeFormat(deps.context), () => fixBiomeFormat(deps.context));
	if (deps.projectInfo.languages.includes("python") && deps.projectInfo.installedTools.ruff) await deps.runStep("Formatting (python)", () => runRuffFormat(deps.context), () => fixRuffFormat(deps.resolvedDir));
	else if (deps.projectInfo.languages.includes("python")) log.warn("Python detected but ruff is not installed; skipping Python formatting fixes.");
	if (deps.projectInfo.languages.includes("go") && deps.projectInfo.installedTools.gofmt) await deps.runStep("Formatting (go)", () => runGofmt(deps.context), () => fixGofmt(deps.resolvedDir));
	else if (deps.projectInfo.languages.includes("go")) log.warn("Go detected but gofmt is not installed; skipping Go formatting fixes.");
	if (deps.projectInfo.languages.includes("rust") && deps.projectInfo.installedTools.rustfmt) await deps.runStep("Formatting (rust)", () => runGenericFormatter(deps.context, "rust"), () => fixGenericFormatter(deps.resolvedDir, "rust"));
	else if (deps.projectInfo.languages.includes("rust")) log.warn("Rust detected but rustfmt is not installed; skipping Rust formatting fixes.");
	if (deps.projectInfo.languages.includes("ruby") && deps.projectInfo.installedTools.rubocop) await deps.runStep("Formatting (ruby)", () => runGenericFormatter(deps.context, "ruby"), () => fixGenericFormatter(deps.resolvedDir, "ruby"));
	else if (deps.projectInfo.languages.includes("ruby")) log.warn("Ruby detected but rubocop is not installed; skipping Ruby formatting fixes.");
	if (deps.projectInfo.languages.includes("php") && deps.projectInfo.installedTools["php-cs-fixer"]) await deps.runStep("Formatting (php)", () => runGenericFormatter(deps.context, "php"), () => fixGenericFormatter(deps.resolvedDir, "php"));
	else if (deps.projectInfo.languages.includes("php")) log.warn("PHP detected but php-cs-fixer is not installed; skipping PHP formatting fixes.");
};
const runForceSteps = async (deps) => {
	if (!deps.force) return;
	if (deps.config.engines["code-quality"] && hasJsOrTs(deps.projectInfo)) await deps.runStep("Remove unused files", () => runKnipUnusedFiles(deps.resolvedDir), () => fixUnusedFiles(deps.resolvedDir));
	const railUpdate = (label) => deps.rail.setActiveLabel(label);
	if (deps.config.engines.security) await deps.runStep("Dependency audit fixes", () => runDependencyAudit(deps.context), () => fixDependencyAudit(deps.context, railUpdate));
	if (deps.projectInfo.frameworks.includes("expo")) await deps.runStep("Expo dependency alignment", () => runExpoDoctor(deps.context), () => fixExpoDependencies(deps.context, railUpdate));
};

//#endregion
//#region src/commands/fix-steps.ts
const uniqueFileCount = (diagnostics) => new Set(diagnostics.map((d) => d.filePath)).size;
const runOneFixStep = async (name, detect, applyFix) => {
	const started = performance.now();
	const before = await detect();
	let applyError = null;
	if (before.length > 0) try {
		await applyFix();
	} catch (error) {
		applyError = error;
	}
	const after = before.length > 0 ? await detect() : before;
	return {
		name,
		beforeIssues: before.length,
		afterIssues: after.length,
		resolvedIssues: Math.max(0, before.length - after.length),
		beforeFiles: uniqueFileCount(before),
		failed: applyError !== null && before.length === after.length,
		elapsedMs: performance.now() - started
	};
};
const describeStep = (result) => {
	if (result.failed) return `${result.name} — failed (${result.afterIssues} remain)`;
	if (result.beforeIssues === 0) return `${result.name} — 0 issues`;
	if (result.afterIssues === 0) return `${result.name} — ${result.resolvedIssues} resolved`;
	if (result.resolvedIssues > 0) return `${result.name} — ${result.resolvedIssues} resolved, ${result.afterIssues} remaining`;
	return `${result.name} — ${result.afterIssues} remain`;
};
const statusFor = (s) => {
	if (s.failed) return "failed";
	if (s.afterIssues > 0) return "warn";
	return "done";
};

//#endregion
//#region src/commands/fix.ts
const createEngineContext = (rootDirectory, projectInfo, config) => ({
	rootDirectory,
	languages: projectInfo.languages,
	frameworks: projectInfo.frameworks,
	installedTools: projectInfo.installedTools,
	config: {
		quality: config.quality,
		security: config.security,
		lint: config.lint
	}
});
const fixCommand = async (directory, config, options = {
	verbose: false,
	showHeader: true
}) => {
	const resolvedDir = path.resolve(directory);
	if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
		const msg = !fs.existsSync(resolvedDir) ? `Path does not exist: ${resolvedDir}` : `Not a directory: ${resolvedDir}`;
		log.error(msg);
		return;
	}
	const projectInfo = await discoverProject(resolvedDir);
	await withCommandLifecycle({
		command: "fix",
		config: config.telemetry,
		languages: projectInfo.languages,
		fileCount: projectInfo.sourceFileCount
	}, () => runFixBody(resolvedDir, config, options, projectInfo));
};
const runFixBody = async (resolvedDir, config, options, projectInfo) => {
	const startTime = performance.now();
	const showHeader = options.showHeader !== false;
	const projectName = projectInfo.projectName ?? "project";
	if (showHeader) process.stdout.write(renderHeader({
		version: APP_VERSION,
		command: "Fix run",
		context: [projectName],
		brand: options.printBrand !== false
	}));
	const context = createEngineContext(resolvedDir, projectInfo, config);
	const steps = [];
	const rail = new LiveRail();
	const runStep = async (name, detect, applyFix) => {
		rail.start(name);
		const result = await runOneFixStep(name, detect, applyFix);
		steps.push(result);
		rail.complete({
			status: statusFor(result),
			label: describeStep(result)
		});
		return result;
	};
	const safe = Boolean(options.safe);
	const pipelineDeps = {
		rail,
		context,
		config,
		resolvedDir,
		projectInfo,
		force: safe ? false : Boolean(options.force),
		safe,
		runStep
	};
	await runAiSlopSteps(pipelineDeps);
	if (!safe) {
		await runDeclarationStep(pipelineDeps);
		await runLintSteps(pipelineDeps);
		await runDependencyStep(pipelineDeps);
	}
	await runFormattingStep(pipelineDeps);
	await runForceSteps(pipelineDeps);
	const totalResolved = steps.reduce((sum, s) => sum + s.resolvedIssues, 0);
	const configDir = findConfigDir(resolvedDir);
	const rulesPath = configDir ? path.join(configDir, RULES_FILE) : void 0;
	const engineConfig = {
		quality: config.quality,
		security: config.security,
		lint: config.lint,
		architectureRulesPath: config.engines.architecture ? rulesPath : void 0
	};
	rail.start("Verifying results");
	const scanResults = await runEngines({
		rootDirectory: resolvedDir,
		languages: projectInfo.languages,
		frameworks: projectInfo.frameworks,
		installedTools: projectInfo.installedTools,
		config: engineConfig
	}, config.engines, () => {}, () => {});
	rail.complete({
		status: "done",
		label: "Verification complete"
	});
	const allDiagnostics = scanResults.flatMap((r) => r.diagnostics);
	const scoreResult = calculateScore(allDiagnostics, config.scoring.weights, config.scoring.thresholds, projectInfo.sourceFileCount, config.scoring.smoothing, config.scoring.maxPerRule);
	const errors = allDiagnostics.filter((d) => d.severity === "error").length;
	const warnings = allDiagnostics.filter((d) => d.severity === "warning").length;
	const remaining = errors + warnings;
	const actionableDiagnostics = allDiagnostics.filter((d) => d.severity !== "info");
	if (steps.length === 0) rail.complete({
		status: "skipped",
		label: "No applicable auto-fixers found"
	});
	rail.finish({ footer: `Done · ${totalResolved} fixed · ${remaining} remain` });
	if (!options.agent && !options.prompt) {
		if (totalResolved > 0) {
			const t = theme;
			const arrow = style(t, "muted", "→");
			process.stdout.write(`\n ${style(t, "success", `Resolved ${totalResolved} issue${totalResolved === 1 ? "" : "s"}`)} ${arrow} ${style(t, "success", `${scoreResult.score} / 100 ${scoreResult.label}`)}\n`);
		}
		const language = projectInfo.languages[0] ?? "unknown";
		process.stdout.write(buildScanRender({
			projectName,
			language,
			fileCount: projectInfo.sourceFileCount,
			results: scanResults,
			diagnostics: actionableDiagnostics,
			score: scoreResult,
			elapsedMs: performance.now() - startTime,
			thresholds: config.scoring.thresholds,
			verbose: options.verbose,
			includeHeader: false,
			printBrand: false
		}));
	}
	if (options.agent) {
		launchAgent(options.agent, resolvedDir, actionableDiagnostics, scoreResult.score);
		return {
			exitCode: 0,
			score: scoreResult.score,
			fixSteps: steps.length,
			fixResolved: totalResolved
		};
	}
	if (options.prompt) {
		printPrompt(resolvedDir, actionableDiagnostics, scoreResult.score);
		return {
			exitCode: 0,
			score: scoreResult.score,
			fixSteps: steps.length,
			fixResolved: totalResolved
		};
	}
	return {
		exitCode: 0,
		score: scoreResult.score,
		findingCount: allDiagnostics.length,
		errorCount: errors,
		warningCount: warnings,
		fixSteps: steps.length,
		fixResolved: totalResolved
	};
};

//#endregion
//#region src/commands/init.ts
const buildInitSuccessRender = (input) => {
	const deps = {
		theme: createTheme(),
		symbols: createSymbols({ plain: false })
	};
	const header = input.includeHeader === false ? "" : renderHeader({
		version: APP_VERSION,
		command: "Setup",
		context: [],
		brand: input.printBrand !== false
	}, deps);
	const writtenCount = input.steps.filter((s) => s.status === "done").length;
	const footer = writtenCount === 0 ? "Nothing to write" : `Done · wrote ${writtenCount} file${writtenCount === 1 ? "" : "s"}`;
	return `${header}${renderRail({
		steps: input.steps,
		footer
	}, deps)}\n${renderHintLine(`Try ${input.nextCommand}`, deps)}`;
};
const ENGINE_CHOICES = [
	{
		value: "format",
		label: "format",
		hint: "Biome / gofmt / ruff"
	},
	{
		value: "lint",
		label: "lint",
		hint: "oxlint / ruff"
	},
	{
		value: "code-quality",
		label: "code-quality",
		hint: "knip / complexity"
	},
	{
		value: "ai-slop",
		label: "ai-slop",
		hint: "dead patterns, unused imports"
	},
	{
		value: "architecture",
		label: "architecture",
		hint: "BYO rules"
	},
	{
		value: "security",
		label: "security",
		hint: "dependency audit"
	}
];
const DEFAULT_ENGINE_SELECTION = Object.keys(DEFAULT_CONFIG.engines).filter((key) => DEFAULT_CONFIG.engines[key]);
const writeGithubWorkflow = (rootDirectory, enabled) => {
	const relativePath = `${GITHUB_WORKFLOW_DIR}/${GITHUB_WORKFLOW_FILE}`;
	if (!enabled) return { status: "declined" };
	const workflowDir = path.join(rootDirectory, GITHUB_WORKFLOW_DIR);
	const workflowPath = path.join(workflowDir, GITHUB_WORKFLOW_FILE);
	if (fs.existsSync(workflowPath)) return {
		status: "skipped-exists",
		relativePath
	};
	fs.mkdirSync(workflowDir, { recursive: true });
	fs.writeFileSync(workflowPath, DEFAULT_GITHUB_WORKFLOW_YAML);
	return {
		status: "written",
		relativePath
	};
};
const promptForConfigChoices = async () => {
	const enginesSelection = await multiselect({
		message: "Which engines should run?",
		options: ENGINE_CHOICES,
		initialValues: DEFAULT_ENGINE_SELECTION,
		required: false
	});
	if (isCancel(enginesSelection)) return null;
	const failBelowRaw = await text({
		message: "CI quality gate — fail the build when the score drops below (0-100)",
		initialValue: "70",
		validate: (v) => {
			const n = Number(v);
			if (!Number.isInteger(n) || n < 0 || n > 100) return "Enter a whole number 0-100";
		}
	});
	if (isCancel(failBelowRaw)) return null;
	const telemetryChoice = await select({
		message: "Share anonymous usage stats so aislop can improve?",
		options: [{
			value: "enabled",
			label: "Yes"
		}, {
			value: "disabled",
			label: "No"
		}],
		initialValue: DEFAULT_CONFIG.telemetry.enabled ? "enabled" : "disabled"
	});
	if (isCancel(telemetryChoice)) return null;
	const workflowChoice = await select({
		message: "Add a GitHub Actions workflow to run aislop on every push and PR?",
		options: [{
			value: "yes",
			label: "Yes — writes .github/workflows/aislop.yml"
		}, {
			value: "no",
			label: "No, I'll wire CI myself"
		}],
		initialValue: "yes"
	});
	if (isCancel(workflowChoice)) return null;
	return {
		engines: enginesSelection,
		failBelow: Number(failBelowRaw),
		typecheck: DEFAULT_CONFIG.lint.typecheck,
		telemetryEnabled: telemetryChoice === "enabled",
		writeGithubWorkflow: workflowChoice === "yes"
	};
};
const strictChoices = () => ({
	engines: Object.keys(DEFAULT_CONFIG.engines),
	failBelow: 85,
	typecheck: true,
	telemetryEnabled: DEFAULT_CONFIG.telemetry.enabled,
	writeGithubWorkflow: true
});
const writeAislopConfig = (configDir, configPath, choices) => {
	const selected = new Set(choices.engines);
	const engines = {
		format: selected.has("format"),
		lint: selected.has("lint"),
		"code-quality": selected.has("code-quality"),
		"ai-slop": selected.has("ai-slop"),
		architecture: selected.has("architecture"),
		security: selected.has("security")
	};
	const configDocument = {
		version: DEFAULT_CONFIG.version,
		engines,
		quality: { ...DEFAULT_CONFIG.quality },
		lint: { typecheck: choices.typecheck },
		security: { ...DEFAULT_CONFIG.security },
		scoring: {
			weights: { ...DEFAULT_CONFIG.scoring.weights },
			thresholds: { ...DEFAULT_CONFIG.scoring.thresholds },
			smoothing: DEFAULT_CONFIG.scoring.smoothing,
			maxPerRule: DEFAULT_CONFIG.scoring.maxPerRule
		},
		ci: {
			failBelow: choices.failBelow,
			format: DEFAULT_CONFIG.ci.format
		},
		telemetry: { enabled: choices.telemetryEnabled }
	};
	if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
	fs.writeFileSync(configPath, YAML.stringify(configDocument));
};
const initCommand = async (directory, options = {}) => {
	const resolvedDir = path.resolve(directory);
	const printBrand = options.printBrand !== false;
	process.stdout.write(renderHeader({
		version: APP_VERSION,
		command: "Setup",
		context: [],
		brand: printBrand
	}));
	const configDir = path.join(resolvedDir, CONFIG_DIR);
	const configPath = path.join(configDir, CONFIG_FILE);
	const rulesPath = path.join(configDir, RULES_FILE);
	const invocation = detectInvocation();
	if (fs.existsSync(configPath)) {
		const overwrite = await select({
			message: `${CONFIG_DIR}/${CONFIG_FILE} already exists. What now?`,
			options: [{
				value: "keep",
				label: "Keep existing config"
			}, {
				value: "overwrite",
				label: "Overwrite with new answers"
			}],
			initialValue: "keep"
		});
		if (isCancel(overwrite) || overwrite === "keep") {
			process.stdout.write(buildInitSuccessRender({
				steps: [{
					status: "skipped",
					label: `Kept existing ${CONFIG_DIR}/${CONFIG_FILE}`
				}],
				nextCommand: `${invocation} scan`,
				includeHeader: false
			}));
			return;
		}
	}
	const choices = options.strict ? strictChoices() : await promptForConfigChoices();
	if (!choices) return;
	writeAislopConfig(configDir, configPath, choices);
	const steps = [{
		status: "done",
		label: `Wrote ${CONFIG_DIR}/${CONFIG_FILE}`
	}];
	if (choices.engines.includes("architecture")) if (!fs.existsSync(rulesPath)) {
		fs.writeFileSync(rulesPath, DEFAULT_RULES_YAML);
		steps.push({
			status: "done",
			label: `Wrote ${CONFIG_DIR}/${RULES_FILE}`
		});
	} else steps.push({
		status: "skipped",
		label: `${CONFIG_DIR}/${RULES_FILE} already exists`
	});
	const workflowResult = writeGithubWorkflow(resolvedDir, choices.writeGithubWorkflow);
	if (workflowResult.status === "written") steps.push({
		status: "done",
		label: `Wrote ${workflowResult.relativePath}`
	});
	else if (workflowResult.status === "skipped-exists") steps.push({
		status: "skipped",
		label: `${workflowResult.relativePath} already exists`
	});
	process.stdout.write(buildInitSuccessRender({
		steps,
		nextCommand: `${invocation} scan`,
		includeHeader: false
	}));
};

//#endregion
//#region src/ui/action-frame.ts
const renderActionStart = (input) => {
	const hint = input.hint ? ` ${style(theme, "muted", `· ${input.hint}`)}` : "";
	return `\n ${style(theme, "muted", "┌")} ${style(theme, "accent", input.label)}${hint}\n\n`;
};
const renderActionEnd = (input) => {
	const status = input.status ?? "complete";
	const token = status === "complete" ? "success" : "muted";
	const text = status === "complete" ? `${input.label} complete` : `${input.label} skipped`;
	return `\n ${style(theme, "muted", "└")} ${style(theme, token, text)}\n`;
};

//#endregion
//#region src/ui/home.ts
const HOME_COMMANDS = [
	{
		command: "aislop scan",
		summary: "Score this project and show findings",
		group: "Run"
	},
	{
		command: "aislop fix",
		summary: "Auto-fix safe issues or hand off to an agent",
		group: "Run"
	},
	{
		command: "aislop ci",
		summary: "Run the quality gate for CI",
		group: "Run"
	},
	{
		command: "aislop doctor",
		summary: "Check which engines can run here",
		group: "Run"
	},
	{
		command: "aislop init",
		summary: "Create config and optional CI workflow",
		group: "Setup"
	},
	{
		command: "aislop hook install",
		summary: "Run aislop after coding-agent edits",
		group: "Setup"
	},
	{
		command: "aislop rules",
		summary: "Explain every rule and fix mode",
		group: "Learn"
	},
	{
		command: "aislop trend",
		summary: "Show local score history",
		group: "Learn"
	},
	{
		command: "aislop badge",
		summary: "Print a score badge URL and README markdown",
		group: "Learn"
	},
	{
		command: "aislop commands",
		summary: "List all commands and major flags",
		group: "Utility"
	},
	{
		command: "aislop update",
		summary: "Check the latest npm version",
		group: "Learn"
	},
	{
		command: "aislop version",
		summary: "Print the installed version",
		group: "Utility"
	}
];
const GROUPS = [
	"Run",
	"Setup",
	"Learn",
	"Utility"
];
const COMMAND_REFERENCE = [
	{
		command: "aislop",
		summary: "Open the interactive menu, or scan the current directory in non-TTY shells"
	},
	{
		command: "aislop scan [directory]",
		summary: "Score code quality and show findings",
		flags: [
			"--changes",
			"--staged",
			"-d, --verbose",
			"--json",
			"--sarif",
			"--format <format>",
			"--include <patterns>",
			"--exclude <patterns>"
		]
	},
	{
		command: "aislop fix [directory]",
		summary: "Apply safe auto-fixes or hand remaining findings to an agent",
		flags: [
			"-d, --verbose",
			"-f, --force",
			"--safe",
			"-p, --prompt",
			"--claude",
			"--codex",
			"--cursor",
			"--windsurf",
			"--vscode",
			"--amp",
			"--antigravity",
			"--deep-agents",
			"--gemini",
			"--kimi",
			"--opencode",
			"--warp",
			"--aider",
			"--goose",
			"--pi",
			"--crush"
		]
	},
	{
		command: "aislop ci [directory]",
		summary: "Run the CI quality gate with thresholded exit codes",
		flags: [
			"--human",
			"--sarif",
			"--format <format>"
		]
	},
	{
		command: "aislop init [directory]",
		summary: "Create .aislop/config.yml, .aislop/rules.yml, and optional GitHub Actions workflow",
		flags: ["--strict"]
	},
	{
		command: "aislop doctor [directory]",
		summary: "Check installed engines and project coverage"
	},
	{
		command: "aislop rules [directory]",
		summary: "Explain rule IDs, severity, fixability, and meaning",
		flags: ["--search"]
	},
	{
		command: "aislop hook install [agents...]",
		summary: "Install coding-agent hooks",
		flags: [
			"--agent <names>",
			"-g, --global",
			"--project",
			"--dry-run",
			"--yes",
			"--quality-gate",
			"--claude",
			"--cursor",
			"--gemini",
			"--pi",
			"--codex",
			"--windsurf",
			"--cline",
			"--kilocode",
			"--antigravity",
			"--copilot"
		]
	},
	{
		command: "aislop hook uninstall [agents...]",
		summary: "Remove installed coding-agent hooks",
		flags: [
			"--agent <names>",
			"-g, --global",
			"--project",
			"--dry-run",
			"--claude",
			"--cursor",
			"--gemini",
			"--pi",
			"--codex",
			"--windsurf",
			"--cline",
			"--kilocode",
			"--antigravity",
			"--copilot"
		]
	},
	{
		command: "aislop hooks",
		summary: "Alias for hook"
	},
	{
		command: "aislop hook status",
		summary: "Show installed hook status"
	},
	{
		command: "aislop hook baseline",
		summary: "Capture the current score as the hook baseline"
	},
	{
		command: "aislop install [agents...]",
		summary: "Alias for hook install",
		flags: [
			"--agent <names>",
			"-g, --global",
			"--project",
			"--dry-run",
			"--yes",
			"--quality-gate",
			"--claude",
			"--cursor",
			"--gemini",
			"--pi",
			"--codex",
			"--windsurf",
			"--cline",
			"--kilocode",
			"--antigravity",
			"--copilot"
		]
	},
	{
		command: "aislop install hooks [agents...]",
		summary: "Natural alias for install; same flags"
	},
	{
		command: "aislop uninstall [agents...]",
		summary: "Alias for hook uninstall",
		flags: [
			"--agent <names>",
			"-g, --global",
			"--project",
			"--dry-run",
			"--claude",
			"--cursor",
			"--gemini",
			"--pi",
			"--codex",
			"--windsurf",
			"--cline",
			"--kilocode",
			"--antigravity",
			"--copilot"
		]
	},
	{
		command: "aislop uninstall hooks [agents...]",
		summary: "Natural alias for uninstall; same flags"
	},
	{
		command: "aislop badge [directory]",
		summary: "Print score badge URL and README markdown",
		flags: [
			"--owner <owner>",
			"--repo <repo>",
			"--json"
		]
	},
	{
		command: "aislop trend [directory]",
		summary: "Show recent local scores from .aislop/history.jsonl",
		flags: ["--limit <n>"]
	},
	{
		command: "aislop update",
		summary: "Show current and latest npm versions"
	},
	{
		command: "aislop upgrade",
		summary: "Alias for update"
	},
	{
		command: "aislop version",
		summary: "Print the installed version"
	},
	{
		command: "aislop commands",
		summary: "Show this command reference"
	}
];
const renderCommandGroups = () => {
	const commandWidth = Math.max(...HOME_COMMANDS.map((c) => c.command.length));
	const lines = [];
	for (const group of GROUPS) {
		lines.push(` ${style(theme, "dim", group)}`);
		for (const item of HOME_COMMANDS.filter((c) => c.group === group)) lines.push(`   ${style(theme, "muted", "$")} ${style(theme, "fg", padEnd(item.command, commandWidth))}  ${style(theme, "muted", item.summary)}`);
		lines.push("");
	}
	return lines.join("\n");
};
const renderHelpDetails = () => [
	` ${style(theme, "dim", "Usage")}`,
	"   aislop                         Open interactive menu",
	"   aislop scan [options] [directory]",
	"   aislop fix [options] [directory]",
	"   aislop ci [options] [directory]",
	"   aislop init [options] [directory]",
	"   aislop doctor [directory]",
	"   aislop rules [directory]",
	"   aislop badge [options] [directory]",
	"   aislop trend [options] [directory]",
	"   aislop hook install [agents...]",
	"   aislop install hooks [agents...]",
	"   aislop update",
	"   aislop version",
	"",
	` ${style(theme, "dim", "Scan flags")}`,
	"   --changes        scan changed files from HEAD",
	"   --staged         scan staged files",
	"   --json           emit machine-readable JSON",
	"   --sarif          emit SARIF 2.1.0",
	"   --format         choose json or sarif",
	"   --exclude        exclude comma-separated or repeated paths",
	"   --include        include comma-separated or repeated paths",
	"",
	` ${style(theme, "dim", "Fix flags")}`,
	"   --safe           only reversible fixes",
	"   --force          aggressive dependency and framework fixes",
	"   --prompt         print an agent handoff prompt",
	"   --codex          open Codex to fix remaining findings",
	"   --claude         open Claude Code to fix remaining findings",
	"",
	` ${style(theme, "dim", "Ignore and scope")}`,
	"   .aislopignore    skip generated, vendored, or noisy paths",
	"   .gitignore       respected for untracked files",
	"   --exclude        skip extra paths for this run",
	"   --include        scan only matching paths for this run",
	"",
	` ${style(theme, "dim", "More")}`,
	"   aislop commands        show every command and major flag",
	"   aislop <cmd> --help    show detailed help for one command",
	"   -h, --help             show help",
	"   -v, -V, --version      show version",
	"",
	` ${style(theme, "dim", "One-off latest run")}`,
	"   npx aislop@latest scan",
	"",
	` ${style(theme, "dim", "Examples")}`,
	"   aislop scan --changes",
	"   aislop fix --codex",
	"   aislop hook install --claude",
	"   aislop install hooks",
	"   aislop rules --search",
	""
].join("\n");
const renderHome = (input = {}) => {
	let out = renderHeader({
		version: input.version ?? APP_VERSION,
		command: "--bare",
		context: []
	});
	out += `${renderCommandGroups().trimEnd()}\n`;
	if (input.includeHelpDetails) {
		out += `\n${renderHelpDetails().trimEnd()}\n`;
		out += renderHintLine("Run aislop scan to scan your project");
	}
	return out;
};
const renderRootHelp = (input = {}) => `${renderHome({
	version: input.version,
	includeHelpDetails: true
})}\n`;
const renderCommandReference = (input = {}) => {
	const version = input.version ?? APP_VERSION;
	const commandWidth = Math.max(...COMMAND_REFERENCE.map((c) => c.command.length));
	const lines = [renderHeader({
		version,
		command: "Commands",
		context: ["full list"]
	}).trimEnd(), ""];
	for (const item of COMMAND_REFERENCE) {
		lines.push(` ${style(theme, "fg", padEnd(item.command, commandWidth))}  ${style(theme, "muted", item.summary)}`);
		if (item.flags?.length) lines.push(`   ${style(theme, "dim", item.flags.join("  "))}`);
	}
	lines.push("", ` ${style(theme, "dim", "Scope files")}`, " .aislopignore  Skip generated, vendored, or noisy paths", " .gitignore     Respected for untracked files");
	lines.push("", renderHintLine("Run aislop <command> --help for complete command-specific options").trimEnd());
	return `${lines.join("\n")}\n`;
};

//#endregion
//#region src/commands/rules.ts
const ENGINE_PRESENTATION = {
	"ai-slop": {
		label: "AI Slop",
		summary: "Generated-code leftovers: vague comments, unsafe casts, stubs, swallowed errors.",
		order: 10
	},
	security: {
		label: "Security",
		summary: "Secrets, injection, XSS, shell execution, and vulnerable dependencies.",
		order: 20
	},
	"code-quality": {
		label: "Code Quality",
		summary: "Dead code, duplicate code, complexity, and dependency hygiene.",
		order: 30
	},
	format: {
		label: "Format",
		summary: "Formatter and import-order checks that aislop can usually fix.",
		order: 40
	},
	lint: {
		label: "Lint",
		summary: "Language linter and compiler findings from bundled or system tools.",
		order: 50
	},
	architecture: {
		label: "Architecture",
		summary: "Project-specific import and layering rules from .aislop/rules.yml.",
		order: 60
	}
};
const presentationFor = (engine) => ENGINE_PRESENTATION[engine] ?? {
	label: engine,
	summary: "Project-specific rules.",
	order: 100
};
const severityLabel = (severity) => severity === "warning" ? "warn" : severity;
const fixModeLabel = (fixable) => fixable ? "auto" : "review";
const buildRulesRender = (input) => {
	const header = input.includeHeader === false ? "" : renderHeader({
		version: APP_VERSION,
		command: "Rules catalog",
		context: [`${input.rules.length} checks`],
		brand: input.printBrand !== false
	});
	const byEngine = /* @__PURE__ */ new Map();
	for (const r of input.rules) {
		const list = byEngine.get(r.engine) ?? [];
		list.push(r);
		byEngine.set(r.engine, list);
	}
	const engines = [...byEngine.keys()].sort((a, b) => {
		const pa = presentationFor(a);
		const pb = presentationFor(b);
		if (pa.order !== pb.order) return pa.order - pb.order;
		return pa.label.localeCompare(pb.label);
	});
	const idWidth = Math.max(20, ...input.rules.map((r) => r.id.length));
	const lines = [` ${style(theme, "muted", "auto = aislop fix can change it; review = inspect and fix with a developer or agent.")}`, ""];
	for (const engine of engines) {
		const presentation = presentationFor(engine);
		lines.push(` ${style(theme, "accent", presentation.label)}`);
		lines.push(`   ${style(theme, "muted", presentation.summary)}`);
		lines.push(`   ${style(theme, "dim", padEnd("Rule ID", idWidth))}  ${style(theme, "dim", "Sev")}    ${style(theme, "dim", "Fix")}     ${style(theme, "dim", "Meaning")}`);
		const rules = (byEngine.get(engine) ?? []).sort((a, b) => a.id.localeCompare(b.id));
		for (const r of rules) {
			const severityText = severityLabel(r.severity);
			const severity = style(theme, r.severity === "error" ? "danger" : "warn", padEnd(severityText, 5));
			const fixable = r.fixable ? style(theme, "accent", padEnd("auto", 6)) : style(theme, "muted", padEnd("review", 6));
			lines.push(`   ${padEnd(r.id, idWidth)}  ${severity}  ${fixable}  ${descriptionForRule(r.id)}`);
		}
		lines.push("");
	}
	const invocation = input.invocation ?? detectInvocation();
	const tail = renderHintLine(`Run ${invocation} scan to check your project against these rules`) + renderHintLine(`Run ${invocation} init to choose engines and CI settings`);
	return `${header}${lines.join("\n")}\n${tail}`;
};
const buildRuleDetailRender = (rule, input = {}) => {
	const presentation = presentationFor(rule.engine);
	const header = input.includeHeader === false ? "" : renderHeader({
		version: APP_VERSION,
		command: "Rule detail",
		context: [presentation.label],
		brand: input.printBrand !== false
	});
	const rows = [
		["Rule", rule.id],
		["Engine", `${presentation.label} — ${presentation.summary}`],
		["Severity", severityLabel(rule.severity)],
		["Fix", `${fixModeLabel(rule.fixable)}${rule.fixable ? " (aislop fix can change it)" : " (review and fix intentionally)"}`],
		["Meaning", descriptionForRule(rule.id)]
	];
	const labelWidth = Math.max(...rows.map(([label]) => label.length));
	return `${header}${rows.map(([label, value]) => ` ${style(theme, "muted", padEnd(label, labelWidth))}  ${style(theme, label === "Severity" && rule.severity === "error" ? "danger" : "fg", value)}`).join("\n")}\n\n${renderHintLine(rule.fixable ? "Run aislop fix to apply the automatic fix" : "Use the meaning above to fix or review the finding")}`;
};
const AI_SLOP_FIXABLE = new Set([
	"ai-slop/trivial-comment",
	"ai-slop/unused-import",
	"ai-slop/narrative-comment",
	"ai-slop/duplicate-import"
]);
const AI_SLOP_ERRORS = new Set(["ai-slop/hallucinated-import"]);
const SECURITY_INFO = new Set(["security/dependency-audit-skipped"]);
const BUILTIN_RULES = [
	{
		engine: "format",
		rules: [
			"formatting",
			"import-order",
			"python-formatting",
			"go-formatting",
			"rust-formatting",
			"ruby-formatting",
			"php-formatting"
		]
	},
	{
		engine: "lint",
		rules: [
			"oxlint/*",
			"ruff/*",
			"go/*",
			"clippy/*",
			"rubocop/*",
			"typescript/*"
		]
	},
	{
		engine: "code-quality",
		rules: [
			"knip/files",
			"knip/dependencies",
			"knip/devDependencies",
			"knip/unlisted",
			"knip/unresolved",
			"knip/binaries",
			"knip/exports",
			"knip/types",
			"knip/duplicates",
			"code-quality/duplicate-block",
			"code-quality/repeated-chained-call",
			"code-quality/unused-declaration",
			"complexity/file-too-large",
			"complexity/function-too-long",
			"complexity/deep-nesting",
			"complexity/too-many-params"
		]
	},
	{
		engine: "ai-slop",
		rules: [
			"ai-slop/trivial-comment",
			"ai-slop/swallowed-exception",
			"ai-slop/silent-recovery",
			"ai-slop/meta-comment",
			"ai-slop/redundant-try-catch",
			"ai-slop/redundant-type-coercion",
			"ai-slop/duplicate-type-declaration",
			"ai-slop/thin-wrapper",
			"ai-slop/generic-naming",
			"ai-slop/unused-import",
			"ai-slop/console-leftover",
			"ai-slop/todo-stub",
			"ai-slop/unreachable-code",
			"ai-slop/constant-condition",
			"ai-slop/empty-function",
			"ai-slop/unsafe-type-assertion",
			"ai-slop/double-type-assertion",
			"ai-slop/ts-directive",
			"ai-slop/narrative-comment",
			"ai-slop/duplicate-import",
			"ai-slop/hardcoded-url",
			"ai-slop/hardcoded-id",
			"ai-slop/python-bare-except",
			"ai-slop/python-broad-except",
			"ai-slop/python-mutable-default",
			"ai-slop/python-print-debug",
			"ai-slop/python-range-len-loop",
			"ai-slop/python-chained-dict-get",
			"ai-slop/python-repetitive-dispatch",
			"ai-slop/python-isinstance-ladder",
			"ai-slop/go-library-panic",
			"ai-slop/rust-non-test-unwrap",
			"ai-slop/rust-todo-stub",
			"ai-slop/hallucinated-import"
		]
	},
	{
		engine: "security",
		rules: [
			"security/hardcoded-secret",
			"security/vulnerable-dependency",
			"security/eval",
			"security/innerhtml",
			"security/dangerously-set-innerhtml",
			"security/sql-injection",
			"security/shell-injection",
			"security/dependency-audit-skipped"
		]
	}
];
const toRuleEntry = (engine, ruleId) => {
	if (engine === "format") return {
		id: ruleId,
		engine,
		severity: "warning",
		fixable: true
	};
	if (engine === "security") return {
		id: ruleId,
		engine,
		severity: SECURITY_INFO.has(ruleId) ? "info" : "error",
		fixable: false
	};
	if (engine === "ai-slop") return {
		id: ruleId,
		engine,
		severity: AI_SLOP_ERRORS.has(ruleId) ? "error" : "warning",
		fixable: AI_SLOP_FIXABLE.has(ruleId)
	};
	return {
		id: ruleId,
		engine,
		severity: "warning",
		fixable: false
	};
};
const collectRuleEntries = (directory) => {
	const resolvedDir = path.resolve(directory);
	const entries = [];
	for (const { engine, rules } of BUILTIN_RULES) for (const rule of rules) entries.push(toRuleEntry(engine, rule));
	const configDir = findConfigDir(resolvedDir);
	if (configDir) {
		const archRules = loadArchitectureRules(path.join(configDir, RULES_FILE));
		for (const rule of archRules) entries.push({
			id: `arch/${rule.name}`,
			engine: "architecture",
			severity: rule.severity,
			fixable: false
		});
	}
	return entries;
};
const runRulesExplorer = async (entries, options) => {
	const selected = await searchSelect({
		message: "Search rules",
		items: entries.map((rule) => {
			const presentation = presentationFor(rule.engine);
			return {
				value: rule,
				label: rule.id,
				hint: `${presentation.label} · ${severityLabel(rule.severity)} · ${descriptionForRule(rule.id)}`,
				keywords: [
					presentation.label,
					rule.engine,
					rule.severity,
					fixModeLabel(rule.fixable),
					descriptionForRule(rule.id)
				]
			};
		}),
		maxVisible: 10,
		required: true
	});
	if (selected === null) return;
	process.stdout.write(`${buildRuleDetailRender(selected, {
		printBrand: options.printBrand,
		includeHeader: true
	})}\n`);
};
const rulesCommand = async (directory, options = {}) => {
	const entries = collectRuleEntries(directory);
	if (options.interactive && process.stdin.isTTY && process.stdout.isTTY) {
		await runRulesExplorer(entries, options);
		return;
	}
	process.stdout.write(`${buildRulesRender({
		rules: entries,
		invocation: detectInvocation(),
		printBrand: options.printBrand
	})}\n`);
};

//#endregion
//#region src/commands/interactive.ts
const INTERACTIVE_OPTIONS = [
	{
		value: "scan",
		label: "Scan",
		hint: "Score project and show findings"
	},
	{
		value: "fix",
		label: "Fix",
		hint: "Auto-fix or hand off remaining findings"
	},
	{
		value: "doctor",
		label: "Doctor",
		hint: "Check required tools"
	},
	{
		value: "init",
		label: "Setup",
		hint: "Create config and CI workflow"
	},
	{
		value: "rules",
		label: "Rules",
		hint: "Explain every check"
	},
	{
		value: "hook-install",
		label: "Install hooks",
		hint: "Run aislop after agent edits"
	},
	{
		value: "hook-status",
		label: "Hook status",
		hint: "Show installed hooks"
	},
	{
		value: "quit",
		label: "Quit",
		hint: "Exit"
	}
];
const optionFor = (action) => INTERACTIVE_OPTIONS.find((option) => option.value === action);
const run = async (action, directory, config) => {
	switch (action) {
		case "scan":
			await scanCommand(directory, config, {
				changes: false,
				staged: false,
				verbose: false,
				json: false,
				printBrand: false
			});
			return "complete";
		case "fix":
			await fixCommand(directory, config, {
				verbose: false,
				printBrand: false
			});
			return "complete";
		case "hook-install": {
			const agents = await promptAgentSelection("install");
			if (agents === null || agents.length === 0) return "skipped";
			await hookInstall({
				agents,
				scope: "global",
				dryRun: false,
				yes: false,
				qualityGate: false
			});
			return "complete";
		}
		case "hook-status":
			await hookStatus();
			return "complete";
		case "init":
			await initCommand(directory, { printBrand: false });
			return "complete";
		case "doctor":
			await doctorCommand(directory, { printBrand: false });
			return "complete";
		case "rules":
			await rulesCommand(directory, {
				printBrand: false,
				interactive: true
			});
			return "complete";
		case "quit": return "skipped";
	}
};
const runFramed = async (action, directory, config) => {
	const option = optionFor(action);
	const label = option?.label ?? action;
	process.stdout.write(renderActionStart({
		label,
		hint: option?.hint
	}));
	const status = await run(action, directory, config);
	process.stdout.write(renderActionEnd({
		label,
		status
	}));
};
const interactiveCommand = async (directory, config) => {
	process.stdout.write(`${renderHome({ version: APP_VERSION })}\n`);
	const picked = await searchSelect({
		message: "What would you like to do?",
		items: INTERACTIVE_OPTIONS.map((o) => ({
			value: o.value,
			label: o.label,
			hint: o.hint
		}))
	});
	if (picked === null || picked === "quit") return;
	await runFramed(picked, directory, config);
	while (true) {
		const again = await searchSelect({
			message: "Next action?",
			items: INTERACTIVE_OPTIONS.map((o) => ({
				value: o.value,
				label: o.label,
				hint: o.hint
			}))
		});
		if (again === null || again === "quit") return;
		await runFramed(again, directory, config);
	}
};

//#endregion
//#region src/commands/trend.ts
const SPARK_TICKS = [
	"▁",
	"▂",
	"▃",
	"▄",
	"▅",
	"▆",
	"▇",
	"█"
];
const DEFAULT_LIMIT = 20;
const renderSparkline = (scores) => {
	if (scores.length === 0) return "";
	const min = Math.min(...scores);
	const span = Math.max(...scores) - min;
	return scores.map((score) => {
		if (span === 0) return SPARK_TICKS[SPARK_TICKS.length - 1];
		const ratio = (score - min) / span;
		return SPARK_TICKS[Math.round(ratio * (SPARK_TICKS.length - 1))];
	}).join("");
};
const formatDate = (timestamp) => {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return timestamp;
	return date.toISOString().slice(0, 16).replace("T", " ");
};
const delta = (current, previous) => {
	if (previous === void 0) return "";
	const diff = current - previous;
	if (diff > 0) return style(theme, "success", `+${diff}`);
	if (diff < 0) return style(theme, "danger", `${diff}`);
	return style(theme, "muted", "0");
};
const buildTrendRender = (input) => {
	const header = renderHeader({
		version: APP_VERSION,
		command: "Score history",
		context: [],
		brand: input.printBrand !== false
	});
	if (input.records.length === 0) return `${header}\n  ${style(theme, "muted", "No score history yet. Run a scan to start tracking trends.")}\n`;
	const limit = input.limit ?? DEFAULT_LIMIT;
	const recent = input.records.slice(-limit);
	const scores = recent.map((r) => r.score);
	const lines = [header];
	lines.push(`  ${style(theme, "dim", padEnd("Date", 18))}${style(theme, "dim", padEnd("Score", 8))}${style(theme, "dim", padEnd("Δ", 6))}${style(theme, "dim", padEnd("Err", 6))}${style(theme, "dim", "Warn")}`);
	recent.forEach((record, index) => {
		const previous = index > 0 ? recent[index - 1]?.score : void 0;
		lines.push(`  ${padEnd(formatDate(record.timestamp), 18)}${padEnd(String(record.score), 8)}${padEnd(delta(record.score, previous), 6)}${padEnd(String(record.errors), 6)}${record.warnings}`);
	});
	const latest = recent[recent.length - 1];
	lines.push("");
	lines.push(`  ${style(theme, "accent", renderSparkline(scores))}`);
	lines.push(`  ${style(theme, "muted", `${recent.length} run(s), latest score ${latest?.score}`)}`);
	lines.push(renderHintLine("Run aislop scan to add a new data point").trimEnd());
	return `${lines.join("\n")}\n`;
};
const trendCommand = (directory, limit) => {
	const records = readHistory(directory);
	process.stdout.write(buildTrendRender({
		records,
		limit
	}));
};

//#endregion
//#region src/update-notifier.ts
const REGISTRY_URL = "https://registry.npmjs.org/aislop/latest";
const CHECK_INTERVAL_MS = 1440 * 60 * 1e3;
const REQUEST_TIMEOUT_MS = 2e3;
const CACHE_BASENAME = "update_check.json";
const isUpdateNotifierDisabled = (env = process.env) => {
	if (env.AISLOP_NO_UPDATE_NOTIFIER === "1") return true;
	if (env.NO_UPDATE_NOTIFIER === "1") return true;
	if (env.DO_NOT_TRACK === "1") return true;
	return isCiEnv(env);
};
const resolveUpdateCachePath = (homedir = os.homedir(), env = process.env) => {
	if (process.platform === "linux" && env.XDG_STATE_HOME) return path.join(env.XDG_STATE_HOME, "aislop", CACHE_BASENAME);
	return path.join(homedir, ".aislop", CACHE_BASENAME);
};
const parseVersion = (raw) => {
	const m = raw.trim().replace(/^v/, "").split(/[-+]/, 1)[0].match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!m) return null;
	return {
		major: Number(m[1]),
		minor: Number(m[2]),
		patch: Number(m[3])
	};
};
const isOutdated = (current, latest) => {
	const c = parseVersion(current);
	const l = parseVersion(latest);
	if (!c || !l) return false;
	if (l.major !== c.major) return l.major > c.major;
	if (l.minor !== c.minor) return l.minor > c.minor;
	return l.patch > c.patch;
};
const formatUpdateNotice = (current, latest) => [
	"",
	`Update available: ${current} -> ${latest}.`,
	"Upgrade: npm i -g aislop@latest",
	"One-off: npx aislop@latest",
	""
].join("\n");
const readCache = (cachePath) => {
	try {
		const parsed = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
		if (typeof parsed?.latest === "string" && typeof parsed?.checkedAt === "number") return {
			latest: parsed.latest,
			checkedAt: parsed.checkedAt
		};
		return null;
	} catch {
		return null;
	}
};
const writeCache = (cachePath, cache) => {
	try {
		fs.mkdirSync(path.dirname(cachePath), { recursive: true });
		fs.writeFileSync(cachePath, JSON.stringify(cache));
		return true;
	} catch {
		return false;
	}
};
const fetchLatestVersion = async () => {
	try {
		const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		if (!res.ok) return null;
		const data = await res.json();
		return typeof data.version === "string" ? data.version : null;
	} catch {
		return null;
	}
};
const maybeNotifyUpdate = async (now = Date.now()) => {
	if (isUpdateNotifierDisabled()) return;
	if (!process.stderr.isTTY) return;
	const cachePath = resolveUpdateCachePath();
	const cache = readCache(cachePath);
	if (cache && isOutdated(APP_VERSION, cache.latest)) process.stderr.write(formatUpdateNotice(APP_VERSION, cache.latest));
	if (!cache || now - cache.checkedAt > CHECK_INTERVAL_MS) {
		const latest = await fetchLatestVersion();
		if (latest) writeCache(cachePath, {
			latest,
			checkedAt: now
		});
	}
};

//#endregion
//#region src/commands/update.ts
const renderUpgradeHelp = (label = "Upgrade:") => [
	`${style(theme, "dim", label)}`,
	"  npm i -g aislop@latest",
	"",
	`${style(theme, "dim", "One-off latest run:")}`,
	"  npx aislop@latest",
	""
].join("\n");
const buildUpdateStatusRender = (input) => {
	const lines = [
		`Current: ${input.current}`,
		`Latest:  ${input.latest ?? "unavailable"}`,
		""
	];
	if (!input.latest) {
		lines.push("Status: could not reach the npm registry right now.", "");
		lines.push(renderUpgradeHelp("Use latest when npm is reachable:").trimEnd());
		return `${lines.join("\n")}\n`;
	}
	if (isOutdated(input.current, input.latest)) {
		lines.push(`Status: update available (${input.current} -> ${input.latest}).`, "");
		lines.push(renderUpgradeHelp("Upgrade:").trimEnd());
		return `${lines.join("\n")}\n`;
	}
	lines.push("Status: aislop is up to date.", "");
	lines.push(renderUpgradeHelp("Latest commands:").trimEnd());
	return `${lines.join("\n")}\n`;
};
const updateCommand = async (options = {}) => {
	if (options.printBrand !== false) process.stdout.write(renderHeader({
		version: APP_VERSION,
		command: "Update check",
		context: ["npm"]
	}));
	const latest = await fetchLatestVersion();
	process.stdout.write(buildUpdateStatusRender({
		current: APP_VERSION,
		latest
	}));
};

//#endregion
//#region src/cli.ts
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
const fireInstalledOnce = () => {
	if (isTelemetryDisabled(loadConfig(process.cwd()).telemetry)) return;
	if (ensureInstallId(resolveInstallIdPath()).created) track({
		event: "cli_installed",
		config: loadConfig(process.cwd()).telemetry
	});
};
const commaSeparatedParser = (value, previous = []) => {
	const parts = value.split(",").map((v) => v.trim()).filter(Boolean);
	return [...previous, ...parts];
};
const wantsSarif = (flags) => Boolean(flags.sarif) || flags.format === "sarif";
const wantsJson = (flags) => Boolean(flags.json) || flags.format === "json";
const runScan = async (directory, flags) => {
	const config = loadConfig(directory);
	const finalConfig = {
		...config,
		exclude: [...config.exclude ?? [], ...flags.exclude ?? []],
		include: [...config.include ?? [], ...flags.include ?? []]
	};
	const sarif = wantsSarif(flags);
	const { exitCode } = await scanCommand(directory, finalConfig, {
		changes: Boolean(flags.changes),
		staged: Boolean(flags.staged),
		base: flags.base,
		verbose: Boolean(flags.verbose),
		json: !sarif && wantsJson(flags),
		sarif,
		exclude: flags.exclude,
		include: flags.include
	});
	if (exitCode !== 0) {
		await flushTelemetry();
		process.exitCode = exitCode;
	}
};
const noFlagsPassed = (flags) => !flags.changes && !flags.staged && !flags.verbose && !flags.json && !flags.sarif && !flags.format && !(flags.exclude && flags.exclude.length > 0) && !(flags.include && flags.include.length > 0);
const hasNoUserArgs = () => process.argv.slice(2).length === 0;
const shouldRenderRootHelp = () => {
	const args = process.argv.slice(2);
	return args.length === 1 && [
		"--help",
		"-h",
		"help"
	].includes(args[0] ?? "");
};
const shouldRenderPlainVersion = () => {
	const args = process.argv.slice(2);
	return args.length === 1 && [
		"-V",
		"-v",
		"--version",
		"version"
	].includes(args[0] ?? "");
};
const program = new Command().name("aislop").description("The quality gate for agentic coding.").version(APP_VERSION, "-v, --version").argument("[directory]", "directory to scan when no command is passed", ".").option("--changes", "only scan changed files (git diff)").option("--staged", "only scan staged files").option("--base <ref>", "diff base for --changes, e.g. origin/main (default HEAD)").option("-d, --verbose", "show file details per rule").option("--json", "output JSON instead of terminal UI").option("--sarif", "output SARIF 2.1.0 (for GitHub code scanning)").option("--format <format>", "output format: json or sarif").option("--exclude <patterns>", "comma-separated or repeatable list of paths and files to exclude", commaSeparatedParser, []).option("--include <patterns>", "comma-separated or repeatable list of paths and files to include", commaSeparatedParser, []).action(async (directory, flags) => {
	if (hasNoUserArgs() && noFlagsPassed(flags) && process.stdin.isTTY) try {
		await interactiveCommand(directory, loadConfig(directory));
		return;
	} catch {}
	await runScan(directory, flags);
});
program.command("scan [directory]").description("Score a project and print findings").option("--changes", "only scan changed files").option("--staged", "only scan staged files").option("--base <ref>", "diff base for --changes, e.g. origin/main (default HEAD)").option("-d, --verbose", "show file details per rule").option("--json", "output JSON").option("--sarif", "output SARIF 2.1.0 (for GitHub code scanning)").option("--format <format>", "output format: json or sarif").option("--exclude <patterns>", "comma-separated or repeatable list of paths and files to exclude", commaSeparatedParser, []).option("--include <patterns>", "comma-separated or repeatable list of paths and files to include", commaSeparatedParser, []).action(async (directory = ".", _flags, command) => {
	await runScan(directory, command.optsWithGlobals());
});
const FIX_AGENT_FLAGS = [
	{
		flag: "claude",
		name: "claude",
		help: "open Claude Code to fix remaining issues"
	},
	{
		flag: "codex",
		name: "codex",
		help: "open Codex to fix remaining issues"
	},
	{
		flag: "cursor",
		name: "cursor",
		help: "open Cursor and copy prompt to clipboard"
	},
	{
		flag: "windsurf",
		name: "windsurf",
		help: "open Windsurf and copy prompt to clipboard"
	},
	{
		flag: "vscode",
		name: "vscode",
		help: "open VS Code and copy prompt to clipboard"
	},
	{
		flag: "amp",
		name: "amp",
		help: "open Amp to fix remaining issues"
	},
	{
		flag: "antigravity",
		name: "antigravity",
		help: "open Antigravity to fix remaining issues"
	},
	{
		flag: "deep-agents",
		name: "deepAgents",
		help: "open Deep Agents to fix remaining issues"
	},
	{
		flag: "gemini",
		name: "gemini",
		help: "open Gemini CLI to fix remaining issues"
	},
	{
		flag: "kimi",
		name: "kimi",
		help: "open Kimi Code CLI to fix remaining issues"
	},
	{
		flag: "opencode",
		name: "opencode",
		help: "open OpenCode to fix remaining issues"
	},
	{
		flag: "warp",
		name: "warp",
		help: "open Warp to fix remaining issues"
	},
	{
		flag: "aider",
		name: "aider",
		help: "open Aider to fix remaining issues"
	},
	{
		flag: "goose",
		name: "goose",
		help: "open Goose to fix remaining issues"
	},
	{
		flag: "pi",
		name: "pi",
		help: "open pi to fix remaining issues"
	},
	{
		flag: "crush",
		name: "crush",
		help: "open Crush to fix remaining issues"
	}
];
const matchFixAgent = (flags) => {
	return FIX_AGENT_FLAGS.find((a) => flags[a.name])?.flag;
};
const fixProgram = program.command("fix [directory]").description("Auto-fix findings or hand off to a coding agent").option("-d, --verbose", "show detailed fix progress").option("-f, --force", "run aggressive fixes (audit and framework dependency alignment)").option("--safe", "only apply reversible fixes (imports, comment removal, formatting); skip anything that deletes code or rewrites behaviour").option("-p, --prompt", "print a prompt for your coding agent to fix remaining issues");
for (const a of FIX_AGENT_FLAGS) fixProgram.option(`--${a.flag}`, a.help);
fixProgram.action(async (directory = ".", _flags, command) => {
	const flags = command.optsWithGlobals();
	await fixCommand(directory, loadConfig(directory), {
		verbose: Boolean(flags.verbose),
		force: Boolean(flags.force),
		safe: Boolean(flags.safe),
		prompt: Boolean(flags.prompt),
		agent: matchFixAgent(flags)
	});
});
program.command("init [directory]").description("Create aislop config and optional CI workflow").option("--strict", "write an enterprise-grade default config: all engines, typecheck on, CI failBelow 85, workflow included").action(async (directory = ".", _flags, command) => {
	const flags = command.optsWithGlobals();
	await withCommandLifecycle({
		command: "init",
		config: loadConfig(directory).telemetry
	}, async () => {
		await initCommand(directory, { strict: Boolean(flags.strict) });
		return { exitCode: 0 };
	});
});
program.command("doctor [directory]").description("Check toolchain coverage for this project").action(async (directory = ".") => {
	await withCommandLifecycle({
		command: "doctor",
		config: loadConfig(directory).telemetry
	}, async () => {
		await doctorCommand(directory);
		return { exitCode: 0 };
	});
});
const ciProgram = program.command("ci [directory]").description("Run the quality gate for CI");
for (const [flag, description] of [
	["--changes", "only gate files changed vs --base (or HEAD)"],
	["--staged", "only gate staged files"],
	["--base <ref>", "diff base for --changes, e.g. origin/main (default HEAD)"],
	["--human", "render the human-friendly scan design instead of JSON"],
	["--sarif", "output SARIF 2.1.0 (for GitHub code scanning)"],
	["--format <format>", "output format: json or sarif"]
]) ciProgram.option(flag, description);
ciProgram.action(async (directory = ".", _flags, command) => {
	const flags = command.optsWithGlobals();
	const { exitCode } = await ciCommand(directory, loadConfig(directory), {
		changes: Boolean(flags.changes),
		staged: Boolean(flags.staged),
		base: flags.base,
		human: Boolean(flags.human),
		sarif: Boolean(flags.sarif) || flags.format === "sarif"
	});
	if (exitCode !== 0) {
		await flushTelemetry();
		process.exitCode = exitCode;
	}
});
program.command("rules [directory]").description("Explain rules, severity, and fix mode").option("-s, --search", "open an interactive searchable rule explorer").action(async (directory = ".", _flags, command) => {
	const flags = command.optsWithGlobals();
	await withCommandLifecycle({
		command: "rules",
		config: loadConfig(directory).telemetry
	}, async () => {
		await rulesCommand(directory, { interactive: Boolean(flags.search) });
		return { exitCode: 0 };
	});
});
program.command("badge [directory]").description("Print score badge URL and README markdown").option("--owner <owner>", "GitHub owner (auto-detected from git remote if omitted)").option("--repo <repo>", "GitHub repo name (auto-detected from git remote if omitted)").option("--json", "emit machine-readable JSON instead of the rendered output").action(async (directory = ".", _flags, command) => {
	const flags = command.optsWithGlobals();
	try {
		await withCommandLifecycle({
			command: "badge",
			config: loadConfig(directory).telemetry
		}, async () => {
			await badgeCommand({
				directory,
				owner: flags.owner,
				repo: flags.repo,
				json: Boolean(flags.json)
			});
			return { exitCode: 0 };
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to print badge";
		process.stderr.write(`${message}\n`);
		process.exit(1);
	}
});
program.command("trend [directory]").description("Show local score history").option("--limit <n>", "number of recent runs to show", (v) => Number.parseInt(v, 10)).action(async (directory = ".", _flags, command) => {
	const flags = command.optsWithGlobals();
	await withCommandLifecycle({
		command: "trend",
		config: loadConfig(directory).telemetry
	}, async () => {
		trendCommand(directory, flags.limit);
		return { exitCode: 0 };
	});
});
program.command("update").alias("upgrade").description("Check npm for the latest aislop version").action(async () => {
	await updateCommand();
});
program.command("version").description("Print the installed aislop version").action(() => {
	process.stdout.write(`${APP_VERSION}\n`);
});
program.command("commands").description("List all commands and major flags").action(() => {
	process.stdout.write(renderCommandReference({ version: APP_VERSION }));
});
registerHookCommand(program);
registerHookAliases(program);
const main = async () => {
	fireInstalledOnce();
	if (shouldRenderPlainVersion()) {
		process.stdout.write(`${APP_VERSION}\n`);
		return;
	}
	if (shouldRenderRootHelp()) {
		process.stdout.write(renderRootHelp({ version: APP_VERSION }));
		return;
	}
	await program.parseAsync();
	await flushTelemetry();
	await maybeNotifyUpdate();
};
main();

//#endregion
export { APP_VERSION as a, runSubprocess as i, withFindingAssessments as n, ENGINE_INFO as r, summarizeFindingAssessments as t };