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
export { getEngineLabel as n, ENGINE_INFO as t };