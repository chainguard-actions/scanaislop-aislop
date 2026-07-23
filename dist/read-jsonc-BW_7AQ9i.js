#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
//#region src/utils/paths.ts
/** Normalize an OS path to forward-slash (POSIX) separators. */
const toPosix = (p) => p.split(path.sep).join("/");
/** path.relative, normalized to POSIX separators (stable across OSes). */
const relativePosix = (from, to) => toPosix(path.relative(from, to));
const stripWindowsNamespace = (filePath) => {
	if (filePath.startsWith("\\\\?\\UNC\\")) return `\\\\${filePath.slice(8)}`;
	return filePath.startsWith("\\\\?\\") ? filePath.slice(4) : filePath;
};
const projectRelativePosix = (rootDirectory, filePath) => {
	if (process.platform === "win32") {
		const normalizedRoot = stripWindowsNamespace(rootDirectory);
		const normalizedFile = stripWindowsNamespace(filePath);
		return (path.win32.isAbsolute(normalizedFile) ? path.win32.relative(normalizedRoot, normalizedFile) : normalizedFile).split(path.win32.sep).join("/");
	}
	return path.isAbsolute(filePath) ? relativePosix(rootDirectory, filePath) : toPosix(filePath);
};
//#endregion
//#region src/utils/git-ignore.ts
const MAX_BUFFER = 50 * 1024 * 1024;
const toProjectPath = (rootDirectory, filePath) => {
	const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(rootDirectory, filePath);
	return path.relative(rootDirectory, absolutePath).split(path.sep).join("/");
};
const getIgnoredPaths = (rootDirectory, files) => {
	if (files.length === 0) return /* @__PURE__ */ new Set();
	const result = spawnSync("git", ["check-ignore", "--stdin"], {
		cwd: rootDirectory,
		encoding: "utf-8",
		input: files.join("\n"),
		maxBuffer: MAX_BUFFER
	});
	if (result.error || result.status !== 0 && result.status !== 1) return /* @__PURE__ */ new Set();
	return new Set(result.stdout.split("\n").map((file) => file.trim()).filter((file) => file.length > 0));
};
const dropGitIgnoredPaths = (rootDirectory, absolutePaths) => {
	if (absolutePaths.length === 0) return absolutePaths;
	const relativePaths = absolutePaths.map((absolutePath) => toProjectPath(rootDirectory, absolutePath));
	const ignored = getIgnoredPaths(rootDirectory, relativePaths);
	return absolutePaths.filter((_, index) => !ignored.has(relativePaths[index]));
};
//#endregion
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
const stripTrailingCommas = (raw) => {
	let result = "";
	let inString = false;
	let escaped = false;
	for (let index = 0; index < raw.length; index++) {
		const character = raw[index];
		if (inString) {
			result += character;
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === "\"") inString = false;
			continue;
		}
		if (character === "\"") {
			inString = true;
			result += character;
			continue;
		}
		if (character === ",") {
			let nextIndex = index + 1;
			while (/\s/.test(raw[nextIndex] ?? "")) nextIndex++;
			if (raw[nextIndex] === "}" || raw[nextIndex] === "]") continue;
		}
		result += character;
	}
	return result;
};
const parseJsonc = (raw) => {
	try {
		return JSON.parse(raw);
	} catch {
		try {
			return JSON.parse(stripTrailingCommas(stripJsonComments(raw)));
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
export { projectRelativePosix as a, getIgnoredPaths as i, readJsoncFile as n, relativePosix as o, dropGitIgnoredPaths as r, toPosix as s, parseJsonc as t };
