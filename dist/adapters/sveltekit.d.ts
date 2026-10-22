import { r as AislopRunResult } from "../core-Cd1J69dD.js";
import { AislopViteOptions, VitePluginLike } from "./vite.js";
//#region src/framework-adapters/sveltekit.d.ts
export type AislopSvelteKitOptions = Omit<AislopViteOptions, "framework">;
export declare const createSvelteKitAislopScripts: () => Record<string, string>;
export declare const createSvelteKitAislopWorkflow: () => string;
export declare const runSvelteKitAislop: (options?: AislopSvelteKitOptions) => Promise<AislopRunResult>;
declare const aislopSvelteKit: (options?: AislopSvelteKitOptions) => VitePluginLike;
//#endregion
export { aislopSvelteKit as default };