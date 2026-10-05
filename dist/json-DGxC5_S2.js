import { t as APP_VERSION } from "./version-Cb-944yC.js";
import { i as ENGINE_INFO, n as withFindingAssessments, t as summarizeFindingAssessments } from "./finding-assessment-Di7lsOy6.js";
//#region src/output/json.ts
const buildJsonOutput = (results, scoreResult, fileCount, elapsedMs, coverage, baseline) => {
	const allDiagnostics = results.flatMap((r) => r.diagnostics);
	const assessedDiagnostics = withFindingAssessments(allDiagnostics);
	const engines = {};
	for (const result of results) engines[result.engine] = {
		issues: result.diagnostics.length,
		skipped: result.skipped,
		elapsed: result.elapsed,
		...result.failed ? { failed: true } : {},
		...result.skipped && result.skipReason ? { skipReason: result.skipReason } : {},
		...result.missingTools?.length ? { missingTools: result.missingTools } : {}
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
		diagnostics: assessedDiagnostics,
		findingAssessment: summarizeFindingAssessments(allDiagnostics),
		summary: {
			errors: allDiagnostics.filter((d) => d.severity === "error").length,
			warnings: allDiagnostics.filter((d) => d.severity === "warning").length,
			fixable: allDiagnostics.filter((d) => d.fixable).length,
			files: fileCount,
			elapsed: elapsedMs < 1e3 ? `${Math.round(elapsedMs)}ms` : `${(elapsedMs / 1e3).toFixed(1)}s`
		},
		...baseline ? { baseline } : {}
	};
};
//#endregion
export { buildJsonOutput };
