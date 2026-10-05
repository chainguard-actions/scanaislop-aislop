import { n as createAislopPackageScripts, r as maybeRunAislop, t as createAislopCiWorkflow } from "../core-D4295PVP.js";
//#region src/framework-adapters/vite.ts
const createViteAislopScripts = (framework = "vite") => {
	const scripts = createAislopPackageScripts(framework);
	scripts["aislop:build-gate"] = "aislop ci --changes";
	return scripts;
};
const createViteAislopWorkflow = () => createAislopCiWorkflow();
const runViteAislop = async (options = {}) => {
	const framework = options.framework ?? "vite";
	return maybeRunAislop(framework, {
		...options,
		enabled: options.enabled ?? options.runOnBuild ?? false
	});
};
const aislopVite = (options = {}) => {
	const hook = options.hook ?? "closeBundle";
	const run = async () => {
		await runViteAislop(options);
	};
	return {
		name: "aislop:vite",
		apply: "build",
		...hook === "buildStart" ? { buildStart: run } : { closeBundle: run }
	};
};
//#endregion
export { createViteAislopScripts, createViteAislopWorkflow, aislopVite as default, runViteAislop };
