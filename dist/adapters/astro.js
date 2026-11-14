import { n as createAislopPackageScripts, r as maybeRunAislop, t as createAislopCiWorkflow } from "../core-C8w3U67l.js";
// src/framework-adapters/astro.ts
const createAstroAislopScripts = () => createAislopPackageScripts("astro");
const createAstroAislopWorkflow = () => createAislopCiWorkflow();
const runAstroAislop = async (options = {}) => maybeRunAislop("astro", {
	...options,
	enabled: options.enabled ?? options.runOnBuild ?? false
});
const aislopAstro = (options = {}) => ({
	name: "@scanaislop/astro",
	hooks: { "astro:build:start": async () => {
		await runAstroAislop(options);
	} }
});
export { createAstroAislopScripts, createAstroAislopWorkflow, aislopAstro as default, runAstroAislop };
