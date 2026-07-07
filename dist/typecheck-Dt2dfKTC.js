import { t as __exportAll } from "./rolldown-runtime-Cbj13DAv.js";
import { n as runSubprocess } from "./subprocess-CQUJDGgn.js";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

//#region src/utils/read-jsonc.ts
/** Strip block and line comments outside JSON strings (preserves `@/*` paths and `https://` URLs). */
const stripJsonComments = (raw) => {
	let result = "";
	let i = 0;
	let inString = null;
	let escaped = false;
	while (i < raw.length) {
		const ch = raw[i];
		const next = raw[i + 1];
		if (inString) {
			result += ch;
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === inString) inString = null;
			i++;
			continue;
		}
		if (ch === "\"" || ch === "'") {
			inString = ch;
			result += ch;
			i++;
			continue;
		}
		if (ch === "/" && next === "/") {
			i += 2;
			while (i < raw.length && raw[i] !== "\n") i++;
			continue;
		}
		if (ch === "/" && next === "*") {
			i += 2;
			while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
			i += 2;
			continue;
		}
		result += ch;
		i++;
	}
	return result;
};
const parseJsonc = (raw) => {
	try {
		return JSON.parse(raw);
	} catch {
		try {
			return JSON.parse(stripJsonComments(raw));
		} catch {
			return null;
		}
	}
};
const readJsoncFile = (filePath) => {
	try {
		return parseJsonc(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return null;
	}
};

//#endregion
//#region src/engines/lint/typecheck.ts
var typecheck_exports = /* @__PURE__ */ __exportAll({
	resolveTrustedTscPath: () => resolveTrustedTscPath,
	runTypecheck: () => runTypecheck
});
const MAX_DEPTH = 3;
const TSC_TIMEOUT_MS = 12e4;
const esmRequire = createRequire(import.meta.url);
const TSC_LINE_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/;
const findTsconfigs = (root) => {
	const results = [];
	const walk = (dir, depth) => {
		if (depth > MAX_DEPTH) return;
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full, depth + 1);
			else if (entry.name === "tsconfig.json") results.push(full);
		}
	};
	walk(root, 0);
	return results;
};
const resolveTrustedTscPath = () => {
	try {
		return esmRequire.resolve("typescript/lib/tsc.js");
	} catch {
		return null;
	}
};
const isReferenceOnlyConfig = (tsconfigPath) => {
	try {
		const parsed = parseJsonc(fs.readFileSync(tsconfigPath, "utf-8"));
		if (!parsed) return false;
		return Array.isArray(parsed.references) && !parsed.files && !parsed.include && !parsed.extends;
	} catch {
		return false;
	}
};
const runTypecheck = async (context) => {
	const tsconfigs = findTsconfigs(context.rootDirectory).filter((p) => !isReferenceOnlyConfig(p));
	if (tsconfigs.length === 0) return [];
	const diagnostics = [];
	const seen = /* @__PURE__ */ new Set();
	const tscCli = resolveTrustedTscPath();
	if (!tscCli) return [];
	for (const tsconfig of tsconfigs) {
		const projectDir = path.dirname(tsconfig);
		let output = "";
		try {
			const result = await runSubprocess(process.execPath, [
				tscCli,
				"--noEmit",
				"--pretty",
				"false",
				"-p",
				tsconfig
			], {
				cwd: projectDir,
				timeout: TSC_TIMEOUT_MS
			});
			output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
		} catch {
			continue;
		}
		for (const rawLine of output.split("\n")) {
			const line = rawLine.trim();
			if (!line) continue;
			const match = TSC_LINE_RE.exec(line);
			if (!match) continue;
			const [, filePath, lineStr, colStr, severity, code, message] = match;
			const absolute = path.resolve(projectDir, filePath);
			const relative = path.relative(context.rootDirectory, absolute);
			const key = `${relative}:${lineStr}:${colStr}:TS${code}`;
			if (seen.has(key)) continue;
			seen.add(key);
			diagnostics.push({
				filePath: relative,
				engine: "lint",
				rule: `typescript/TS${code}`,
				severity: severity === "error" ? "error" : "warning",
				message,
				help: `Fix the underlying type — TS${code} is a hard contract violation, not a style nit.`,
				line: Number.parseInt(lineStr, 10),
				column: Number.parseInt(colStr, 10),
				category: "TypeScript",
				fixable: false
			});
		}
	}
	return diagnostics;
};

//#endregion
export { typecheck_exports as n, readJsoncFile as r, resolveTrustedTscPath as t };