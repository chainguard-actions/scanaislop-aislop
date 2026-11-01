import { n as AislopFramework, r as AislopRunResult, t as AislopAdapterOptions } from "../core-Cd1J69dD.js";
//#region src/framework-adapters/vite.d.ts
type ViteApply = "serve" | "build";
export interface VitePluginLike {
  name: string;
  apply?: ViteApply;
  buildStart?: () => Promise<void>;
  closeBundle?: () => Promise<void>;
}
export interface AislopViteOptions extends AislopAdapterOptions {
  framework?: Extract<AislopFramework, "vite" | "tanstack-start" | "redwoodsdk" | "t3" | "sveltekit">;
  runOnBuild?: boolean;
  hook?: "buildStart" | "closeBundle";
}
export declare const createViteAislopScripts: (framework?: AislopViteOptions["framework"]) => Record<string, string>;
export declare const createViteAislopWorkflow: () => string;
export declare const runViteAislop: (options?: AislopViteOptions) => Promise<AislopRunResult>;
declare const aislopVite: (options?: AislopViteOptions) => VitePluginLike;
//#endregion
export { aislopVite as default };