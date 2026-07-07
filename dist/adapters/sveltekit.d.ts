import { r as AislopRunResult } from "../core-BPTSPzMM.js";
import { AislopViteOptions, VitePluginLike } from "./vite.js";

//#region src/framework-adapters/sveltekit.d.ts
type AislopSvelteKitOptions = Omit<AislopViteOptions, "framework">;
declare const createSvelteKitAislopScripts: () => Record<string, string>;
declare const createSvelteKitAislopWorkflow: () => string;
declare const runSvelteKitAislop: (options?: AislopSvelteKitOptions) => Promise<AislopRunResult>;
declare const aislopSvelteKit: (options?: AislopSvelteKitOptions) => VitePluginLike;
//#endregion
export { AislopSvelteKitOptions, createSvelteKitAislopScripts, createSvelteKitAislopWorkflow, aislopSvelteKit as default, runSvelteKitAislop };