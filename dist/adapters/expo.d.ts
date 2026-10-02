import { r as AislopRunResult, t as AislopAdapterOptions } from "../core-Cd1J69dD.js";
//#region src/framework-adapters/expo.d.ts
export interface ExpoConfigLike {
  extra?: Record<string, unknown>;
  [name: string]: unknown;
}
export interface AislopExpoOptions extends AislopAdapterOptions {
  /**
   * Expo config plugins run while resolving app config. Keep scan execution out
   * of that path unless a host integration explicitly opts in.
   */
  runDuringConfig?: boolean;
}
export declare const createExpoAislopScripts: () => Record<string, string>;
export declare const createExpoAislopWorkflow: () => string;
export declare const runExpoAislop: (options?: AislopExpoOptions) => Promise<AislopRunResult>;
declare const withAislopExpo: <TConfig extends ExpoConfigLike>(config: TConfig, _options?: AislopExpoOptions) => TConfig;
//#endregion
export { withAislopExpo as default };