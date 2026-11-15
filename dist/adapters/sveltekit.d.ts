import { r as AislopRunResult } from "../core-NxAEo-O0.js";
import { AislopViteOptions, VitePluginLike } from "./vite.js";
export type AislopSvelteKitOptions = Omit<AislopViteOptions, "framework">;
export declare const createSvelteKitAislopScripts: () => Record<string, string>;
export declare const createSvelteKitAislopWorkflow: () => string;
export declare const runSvelteKitAislop: (options?: AislopSvelteKitOptions) => Promise<AislopRunResult>;
declare const aislopSvelteKit: (options?: AislopSvelteKitOptions) => VitePluginLike;
export { aislopSvelteKit as default };