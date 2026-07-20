import { n as runSubprocess } from "./subprocess-CQUJDGgn.js";
import fs from "node:fs";
import path from "node:path";

//#region src/engines/lint/typecheck.ts
const MAX_DEPTH = 3;
const TSC_TIMEOUT_MS = 12e4;
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
const findTscBinary = (fromDir) => {
	let dir = fromDir;
	while (dir !== path.dirname(dir)) {
		const candidate = path.join(dir, "node_modules", ".bin", "tsc");
		if (fs.existsSync(candidate)) return candidate;
		dir = path.dirname(dir);
	}
	return null;
};
const isReferenceOnlyConfig = (tsconfigPath) => {
	try {
		const stripped = fs.readFileSync(tsconfigPath, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
		const parsed = JSON.parse(stripped);
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
	for (const tsconfig of tsconfigs) {
		const projectDir = path.dirname(tsconfig);
		const tscBinary = findTscBinary(projectDir);
		if (!tscBinary) continue;
		let output = "";
		try {
			const result = await runSubprocess(tscBinary, [
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
export { runTypecheck };