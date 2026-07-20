#!/usr/bin/env node
import { n as runSubprocess, t as isToolInstalled } from "./subprocess-CCnnN_oQ.js";
import { createRequire, isBuiltin } from "node:module";
import { performance } from "node:perf_hooks";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import fs from "node:fs";
import YAML from "yaml";
import { z as z$1 } from "zod/v4";
import micromatch from "micromatch";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { randomUUID } from "node:crypto";

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
const EnginesSchema = z$1.object({
	format: z$1.boolean().default(true),
	lint: z$1.boolean().default(true),
	"code-quality": z$1.boolean().default(true),
	"ai-slop": z$1.boolean().default(true),
	architecture: z$1.boolean().default(false),
	security: z$1.boolean().default(true)
});
const QualitySchema = z$1.object({
	maxFunctionLoc: z$1.number().positive().default(80),
	maxFileLoc: z$1.number().positive().default(400),
	maxNesting: z$1.number().positive().default(5),
	maxParams: z$1.number().positive().default(6)
});
const LintConfigSchema = z$1.object({ typecheck: z$1.boolean().default(false) });
const SecurityConfigSchema = z$1.object({
	audit: z$1.boolean().default(true),
	auditTimeout: z$1.number().positive().default(25e3)
});
const ThresholdsSchema = z$1.object({
	good: z$1.number().default(75),
	ok: z$1.number().default(50)
});
const ScoringSchema = z$1.object({
	weights: z$1.record(z$1.string(), z$1.number()).default(DEFAULT_WEIGHTS),
	thresholds: ThresholdsSchema.default(() => ({
		good: 75,
		ok: 50
	})),
	smoothing: z$1.number().nonnegative().default(20),
	maxPerRule: z$1.number().positive().default(40)
});
const CiSchema = z$1.object({
	failBelow: z$1.number().default(70),
	format: z$1.enum(["json"]).default("json")
});
const TelemetrySchema = z$1.object({ enabled: z$1.boolean().default(true) });
const RuleSeverityOverride = z$1.enum([
	"error",
	"warning",
	"off"
]);
const RulesSchema = z$1.record(z$1.string(), RuleSeverityOverride).default(() => ({}));
const AislopConfigSchema = z$1.object({
	version: z$1.number().default(1),
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
	exclude: z$1.array(z$1.string()).default(() => [
		"node_modules",
		".git",
		"dist",
		"build",
		"coverage"
	]),
	include: z$1.array(z$1.string()).default(() => [])
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
const MAX_BUFFER = 50 * 1024 * 1024;
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
		maxBuffer: MAX_BUFFER
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
		maxBuffer: MAX_BUFFER
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
		maxBuffer: MAX_BUFFER
	});
	if (findResult.error || findResult.status !== 0) return [];
	return findResult.stdout.split("\n").filter((file) => file.length > 0).map((file) => file.replace(/^\.\//, ""));
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
const JS_EXTENSIONS$3 = new Set([
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
	if (!JS_EXTENSIONS$3.has(ext)) return [];
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
		if (JS_EXTENSIONS$3.has(ext) && /^(?:return|throw)\b/.test(trimmed) && trimmed.endsWith(";") && nextLine && nextLine.length > 0 && !isGuardedSingleLineExit(lines, i) && !isBlockCloserAfterReturn(nextLine) && !nextLine.startsWith("//") && !nextLine.startsWith("/*") && !nextLine.startsWith("case ") && !nextLine.startsWith("default:") && !nextLine.startsWith("if ") && !nextLine.startsWith("if(") && !nextLine.startsWith("else")) diagnostics.push(slop(relativePath, i + 2, "ai-slop/unreachable-code", "warning", "Code after return/throw statement is unreachable", "Remove the unreachable code or restructure the control flow", false));
		if (/\bif\s*\(\s*(?:false|true|0|1)\s*\)/.test(trimmed) && !trimmed.startsWith("//") && !trimmed.startsWith("*") && !/["'`].*\bif\s*\(/.test(trimmed) && !/\/.*\bif\s*\(/.test(trimmed.replace(/\/\/.*$/, ""))) diagnostics.push(slop(relativePath, i + 1, "ai-slop/constant-condition", "warning", "Conditional with a constant value — likely debugging leftover", "Remove the constant condition or replace with proper logic", false));
		if (JS_EXTENSIONS$3.has(ext) && /(?:function\s+\w+\s*\([^)]*\)|=>\s*)\s*\{\s*\}\s*;?\s*$/.test(trimmed) && !trimmed.startsWith("interface") && !trimmed.startsWith("type ") && !isPropertyNoopAssignment(trimmed)) diagnostics.push(slop(relativePath, i + 1, "ai-slop/empty-function", "info", "Empty function body — possible stub or unfinished implementation", "Implement the function body or add a comment explaining why it's empty", false));
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
const JS_EXTENSIONS$2 = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const IMPORT_FROM_RE = /^\s*import\s+([^;]*?)\s+from\s+["']([^"']+)["']/;
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
		const match = IMPORT_FROM_RE.exec(line);
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
		if (!JS_EXTENSIONS$2.has(path.extname(filePath))) continue;
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
const JS_EXTENSIONS$1 = new Set([
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
		const isJs = JS_EXTENSIONS$1.has(ext);
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
const JS_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs"
]);
const PY_EXTENSIONS = new Set([".py"]);
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
	if (JS_EXTENSIONS.has(ext)) {
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
const esmRequire$1 = createRequire(import.meta.url);
const resolveLocalBiomeScript = () => {
	try {
		const packageJsonPath = esmRequire$1.resolve("@biomejs/biome/package.json");
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
const runGenericLinter = async (context, language) => {
	switch (language) {
		case "rust": return runClippy(context);
		case "ruby": return runRubocop(context);
		default: return [];
	}
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
const esmRequire = createRequire(import.meta.url);
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
		const oxlintMainPath = esmRequire.resolve("oxlint");
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
			if (context.config.lint.typecheck) promises.push(import("./typecheck-By967nny.js").then((mod) => mod.runTypecheck(context)));
		}
		if (context.frameworks.includes("expo")) promises.push(import("./expo-doctor-BM2JR6f6.js").then((mod) => mod.runExpoDoctor(context)));
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
//#region src/hooks/io/atomic-write.ts
const readIfExists = (targetPath) => {
	try {
		return fs.readFileSync(targetPath, "utf-8");
	} catch {
		return null;
	}
};

//#endregion
//#region src/hooks/quality-gate/baseline.ts
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

//#endregion
//#region src/output/finding-assessment.ts
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
//#region src/mcp/tools.ts
const MAX_FINDINGS = 25;
const resolveCwd = (raw) => {
	if (!raw || raw.trim().length === 0) return process.cwd();
	return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
};
const buildEngineContext = (rootDirectory, project, config) => {
	const configDir = findConfigDir(rootDirectory);
	const rulesPath = configDir ? path.join(configDir, RULES_FILE) : void 0;
	return {
		rootDirectory,
		languages: project.languages,
		frameworks: project.frameworks,
		installedTools: project.installedTools,
		config: {
			quality: config.quality,
			security: config.security,
			lint: config.lint,
			architectureRulesPath: config.engines.architecture ? rulesPath : void 0
		}
	};
};
const enabledEnginesFromConfig = (config) => ({
	format: config.engines.format,
	lint: config.engines.lint,
	"code-quality": config.engines["code-quality"],
	"ai-slop": config.engines["ai-slop"],
	architecture: config.engines.architecture,
	security: config.engines.security
});
const summariseDiagnostic = (d, rootDirectory) => ({
	file: path.isAbsolute(d.filePath) ? path.relative(rootDirectory, d.filePath) : d.filePath,
	line: d.line,
	column: d.column,
	rule: d.rule,
	severity: d.severity,
	assessment: assessDiagnostic(d),
	message: d.message,
	fixable: d.fixable,
	help: d.help || void 0
});
const summariseDiagnostics = (diagnostics, rootDirectory) => {
	const counts = {
		error: diagnostics.filter((d) => d.severity === "error").length,
		warning: diagnostics.filter((d) => d.severity === "warning").length,
		fixable: diagnostics.filter((d) => d.fixable).length,
		total: diagnostics.length
	};
	const findings = diagnostics.slice(0, MAX_FINDINGS).map((d) => summariseDiagnostic(d, rootDirectory));
	const elided = diagnostics.length > MAX_FINDINGS ? diagnostics.length - MAX_FINDINGS : 0;
	return {
		counts,
		findingAssessment: summarizeFindingAssessments(diagnostics),
		findings,
		elided
	};
};
const runScan = async (cwd) => {
	const project = await discoverProject(cwd);
	const config = loadConfig(cwd);
	const diagnostics = (await runEngines(buildEngineContext(project.rootDirectory, project, config), enabledEnginesFromConfig(config))).flatMap((r) => r.diagnostics);
	const { score } = calculateScore(diagnostics, config.scoring.weights, config.scoring.thresholds, project.sourceFileCount, config.scoring.smoothing, config.scoring.maxPerRule);
	const errorCount = diagnostics.filter((d) => d.severity === "error").length;
	const failBelow = config.ci.failBelow;
	return {
		project,
		diagnostics,
		score,
		qualityGate: {
			failBelow,
			passed: errorCount === 0 && score >= failBelow,
			errorCount
		}
	};
};
const aislopScanInputSchema = z.object({ path: z.string().optional().describe("Project directory to scan. Defaults to the MCP server's cwd.") });
const aislopScanTool = {
	name: "aislop_scan",
	description: "Scan a project with aislop. Runs the deterministic engines (format, lint, code-quality, ai-slop, security, architecture), returns a 0–100 score and the top findings. Use this before deciding whether the agent's recent changes are ready to ship.",
	inputSchema: aislopScanInputSchema
};
const handleAislopScan = async (input) => {
	const { project, diagnostics, score, qualityGate } = await runScan(resolveCwd(input.path));
	const summary = summariseDiagnostics(diagnostics, project.rootDirectory);
	return {
		score,
		qualityGate,
		fileCount: project.sourceFileCount,
		languages: project.languages,
		frameworks: project.frameworks,
		...summary
	};
};
const aislopFixInputSchema = z.object({
	path: z.string().optional().describe("Project directory to fix. Defaults to the MCP server's cwd."),
	force: z.boolean().optional().describe("Run aggressive fixes (dependency audit overrides, unused-file removal, framework alignment). Off by default; on means writes to package.json and may delete files.")
});
const runAislopFix = (cwd, force) => {
	const args = ["fix"];
	if (force) args.push("--force");
	return new Promise((resolve) => {
		const child = spawn("npx", [
			"--yes",
			"aislop@latest",
			...args
		], {
			cwd,
			env: {
				...process.env,
				NO_COLOR: "1"
			}
		});
		const stdout = [];
		const stderr = [];
		child.stdout?.on("data", (b) => stdout.push(b));
		child.stderr?.on("data", (b) => stderr.push(b));
		child.on("close", (code) => resolve({
			exitCode: code ?? 0,
			stdout: Buffer.concat(stdout).toString("utf-8"),
			stderr: Buffer.concat(stderr).toString("utf-8")
		}));
	});
};
const aislopFixTool = {
	name: "aislop_fix",
	description: "Apply mechanical fixes (formatting, unused imports, narrative comments, duplicate imports, etc.). Returns counts before/after so the agent can see how many issues remain. Use BEFORE handing off to the agent — saves tokens by clearing what the CLI handles deterministically.",
	inputSchema: aislopFixInputSchema
};
const handleAislopFix = async (input) => {
	const cwd = resolveCwd(input.path);
	const before = await runScan(cwd);
	const fixResult = await runAislopFix(cwd, Boolean(input.force));
	const after = await runScan(cwd);
	const fixedCount = Math.max(0, before.diagnostics.length - after.diagnostics.length);
	const summary = summariseDiagnostics(after.diagnostics, after.project.rootDirectory);
	return {
		ok: fixResult.exitCode === 0,
		exitCode: fixResult.exitCode,
		fixed: fixedCount,
		scoreBefore: before.score,
		scoreAfter: after.score,
		delta: after.score - before.score,
		remaining: summary.counts.total,
		counts: summary.counts,
		findings: summary.findings,
		elided: summary.elided
	};
};
const aislopWhyInputSchema = z.object({ rule_id: z.string().describe("Full rule id (e.g. `ai-slop/narrative-comment`, `complexity/function-too-long`, `security/sql-injection`).") });
const aislopWhyTool = {
	name: "aislop_why",
	description: "Explain an aislop rule: what it catches, why an AI agent typically produces it, severity, and whether it's auto-fixable. Use when a finding's message alone isn't enough to act on.",
	inputSchema: aislopWhyInputSchema
};
const handleAislopWhy = (input) => {
	const ruleId = input.rule_id.trim();
	const [engine, slug] = ruleId.split("/");
	const docs = slug ? `https://scanaislop.com/patterns#${slug}` : "https://scanaislop.com/patterns";
	return {
		id: ruleId,
		engine: engine ?? "unknown",
		docs,
		hint: "Run `aislop rules` for the full list of rules and their auto-fix status. The /patterns page has bad/good code examples for every named ai-slop pattern."
	};
};
const aislopBaselineInputSchema = z.object({ path: z.string().optional().describe("Project directory. Defaults to the MCP server's cwd.") });
const aislopBaselineTool = {
	name: "aislop_baseline",
	description: "Read the project's baseline (the last captured score the per-edit hook compares against). Returns score / lastScanAt / fileCount, or null if no baseline exists yet (run `aislop hook baseline` to capture).",
	inputSchema: aislopBaselineInputSchema
};
const handleAislopBaseline = (input) => {
	const baseline = readBaseline(resolveCwd(input.path));
	if (baseline) return {
		exists: true,
		score: baseline.score,
		lastScanAt: baseline.updatedAt,
		fileCount: baseline.fileCount
	};
	return {
		exists: false,
		hint: "Run `aislop hook baseline` to capture a baseline."
	};
};

//#endregion
//#region src/version.ts
const APP_VERSION = "0.11.0";

//#endregion
//#region src/telemetry/env.ts
const detectPackageManager = (env = process.env) => {
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
const REQUEST_TIMEOUT_MS = 3e3;
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
	package_manager: detectPackageManager(),
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
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
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
//#region src/telemetry/events.ts
const buildMcpToolCalledProps = (input) => {
	const props = {
		tool: input.tool,
		duration_ms: Math.round(input.durationMs),
		ok: input.ok
	};
	if (input.errorKind) props.error_kind = input.errorKind;
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
//#region src/mcp.ts
const ok = (data) => ({ content: [{
	type: "text",
	text: JSON.stringify(data, null, 2)
}] });
const err = (message) => ({
	content: [{
		type: "text",
		text: JSON.stringify({ error: message }, null, 2)
	}],
	isError: true
});
const instrument = async (tool, fn) => {
	const startedAt = performance.now();
	try {
		const value = await fn();
		track({
			event: "mcp_tool_called",
			properties: buildMcpToolCalledProps({
				tool,
				durationMs: performance.now() - startedAt,
				ok: true
			})
		});
		return ok(value);
	} catch (e) {
		track({
			event: "mcp_tool_called",
			properties: buildMcpToolCalledProps({
				tool,
				durationMs: performance.now() - startedAt,
				ok: false,
				errorKind: errorKindFromException(e)
			})
		});
		return err(e instanceof Error ? e.message : String(e));
	}
};
const buildServer = () => {
	const server = new McpServer({
		name: "aislop",
		version: APP_VERSION
	});
	server.registerTool(aislopScanTool.name, {
		description: aislopScanTool.description,
		inputSchema: aislopScanInputSchema.shape
	}, (input) => instrument("aislop_scan", () => handleAislopScan(input)));
	server.registerTool(aislopFixTool.name, {
		description: aislopFixTool.description,
		inputSchema: aislopFixInputSchema.shape
	}, (input) => instrument("aislop_fix", () => handleAislopFix(input)));
	server.registerTool(aislopWhyTool.name, {
		description: aislopWhyTool.description,
		inputSchema: aislopWhyInputSchema.shape
	}, (input) => instrument("aislop_why", () => handleAislopWhy(input)));
	server.registerTool(aislopBaselineTool.name, {
		description: aislopBaselineTool.description,
		inputSchema: aislopBaselineInputSchema.shape
	}, (input) => instrument("aislop_baseline", () => handleAislopBaseline(input)));
	return server;
};
const main = async () => {
	const server = buildServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
	track({ event: "mcp_server_started" });
	await flushTelemetry();
};
main().catch((e) => {
	process.stderr.write(`aislop-mcp failed to start: ${e instanceof Error ? e.message : String(e)}\n`);
	process.exit(1);
});

//#endregion
export { buildServer };