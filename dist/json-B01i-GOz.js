import { t as APP_VERSION } from "./version-BfJVwhN2.js";
import { t as ENGINE_INFO } from "./engine-info-Cpt36DqZ.js";

//#region src/output/json.ts
const buildJsonOutput = (results, scoreResult, fileCount, elapsedMs, coverage) => {
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
		score: coverage.scoreable ? scoreResult.score : null,
		label: coverage.scoreable ? scoreResult.label : "not scored",
		scoreable: coverage.scoreable,
		coverage,
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