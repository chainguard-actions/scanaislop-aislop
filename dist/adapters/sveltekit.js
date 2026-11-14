import { n as createAislopPackageScripts, t as createAislopCiWorkflow } from "../core-C8w3U67l.js";
import aislopVite, { runViteAislop } from "./vite.js";
// src/framework-adapters/sveltekit.ts
const createSvelteKitAislopScripts = () => createAislopPackageScripts("sveltekit");
const createSvelteKitAislopWorkflow = () => createAislopCiWorkflow();
const runSvelteKitAislop = async (options = {}) => runViteAislop({
	...options,
	framework: "sveltekit"
});
const aislopSvelteKit = (options = {}) => aislopVite({
	...options,
	framework: "sveltekit"
});
export { createSvelteKitAislopScripts, createSvelteKitAislopWorkflow, aislopSvelteKit as default, runSvelteKitAislop };
