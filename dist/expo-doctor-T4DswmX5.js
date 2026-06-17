#!/usr/bin/env node
import { n as runSubprocess } from "./subprocess-CCnnN_oQ.js";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

//#region src/engines/lint/expo-doctor.ts
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
		help: "Install project dependencies, then re-run `npx aislop scan`.",
		line: 0,
		column: 0,
		category: "Expo",
		fixable: false
	}];
	return toDiagnostics(parseIssues(output));
};

//#endregion
export { runExpoDoctor };