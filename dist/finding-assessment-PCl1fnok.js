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
export { getEngineLabel as i, withFindingAssessments as n, ENGINE_INFO as r, summarizeFindingAssessments as t };