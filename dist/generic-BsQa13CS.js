import { t as __exportAll } from "./rolldown-runtime-Cbj13DAv.js";
import { n as runSubprocess } from "./subprocess-0uXz8HdE.js";

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
export { generic_exports as n, runGenericLinter as r, fixRubyLint as t };