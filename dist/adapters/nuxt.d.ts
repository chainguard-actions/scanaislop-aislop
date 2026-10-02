import { r as AislopRunResult, t as AislopAdapterOptions } from "../core-Cd1J69dD.js";
//#region src/framework-adapters/nuxt.d.ts
type NuxtHookName = "build:before" | "nitro:build:before";
export interface NuxtLike {
  hook?: (name: NuxtHookName, callback: () => Promise<void>) => void;
  options?: {
    runtimeConfig?: Record<string, unknown>;
  };
}
export interface AislopNuxtOptions extends AislopAdapterOptions {
  runOnBuild?: boolean;
  hook?: NuxtHookName;
}
export interface NuxtModuleLike {
  meta: {
    name: string;
    configKey: string;
  };
  defaults: AislopNuxtOptions;
  setup: (options: AislopNuxtOptions, nuxt: NuxtLike) => void | Promise<void>;
}
export declare const createNuxtAislopScripts: () => Record<string, string>;
export declare const createNuxtAislopWorkflow: () => string;
export declare const runNuxtAislop: (options?: AislopNuxtOptions) => Promise<AislopRunResult>;
export declare const createAislopNuxtModule: (defaults?: AislopNuxtOptions) => NuxtModuleLike;
declare const _default: NuxtModuleLike;
//#endregion
export { _default as default };