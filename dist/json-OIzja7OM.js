#!/usr/bin/env node
import { r as APP_VERSION, t as ENGINE_INFO } from "./cli.js";

//#region src/output/json.ts
const buildJsonOutput = (results, scoreResult, fileCount, elapsedMs) => {
	const allDiagnostics = results.flatMap((r) => r.diagnostics);
	const engines = {};
	for (const result of results) engines[result.engine] = {
		issues: result.diagnostics.length,
		skipped: result.skipped,
		elapsed: result.elapsed
	};
	return {
		schemaVersion: "1",
		cliVersion: APP_VERSION,
		version: APP_VERSION,
		score: scoreResult.score,
		label: scoreResult.label,
		engines,
		engineDefinitions: ENGINE_INFO,
		diagnostics: allDiagnostics,
		summary: {
			errors: allDiagnostics.filter((d) => d.severity === "error").length,
			warnings: allDiagnostics.filter((d) => d.severity === "warning").length,
			fixable: allDiagnostics.filter((d) => d.fixable).length,
			files: fileCount,
			elapsed: elapsedMs < 1e3 ? `${Math.round(elapsedMs)}ms` : `${(elapsedMs / 1e3).toFixed(1)}s`
		}
	};
};

//#endregion
export { buildJsonOutput };