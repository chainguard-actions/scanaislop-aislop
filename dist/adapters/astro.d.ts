import { r as AislopRunResult, t as AislopAdapterOptions } from "../core-Cd1J69dD.js";
//#region src/framework-adapters/astro.d.ts
export interface AstroIntegration {
  name: string;
  hooks: {
    "astro:build:start"?: () => Promise<void>;
  };
}
export interface AislopAstroOptions extends AislopAdapterOptions {
  runOnBuild?: boolean;
}
export declare const createAstroAislopScripts: () => Record<string, string>;
export declare const createAstroAislopWorkflow: () => string;
export declare const runAstroAislop: (options?: AislopAstroOptions) => Promise<AislopRunResult>;
declare const aislopAstro: (options?: AislopAstroOptions) => AstroIntegration;
//#endregion
export { aislopAstro as default };