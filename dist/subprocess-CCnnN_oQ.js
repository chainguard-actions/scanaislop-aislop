#!/usr/bin/env node
import { spawn } from "node:child_process";

//#region src/utils/subprocess.ts
const runSubprocess = (command, args, options = {}) => {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: {
				...process.env,
				...options.env
			},
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			windowsHide: true
		});
		const stdoutBuffers = [];
		const stderrBuffers = [];
		child.stdout?.on("data", (buffer) => stdoutBuffers.push(buffer));
		child.stderr?.on("data", (buffer) => stderrBuffers.push(buffer));
		let settled = false;
		let timer;
		const finalize = (callback) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			callback();
		};
		if (options.timeout && options.timeout > 0) {
			timer = setTimeout(() => {
				child.kill("SIGTERM");
				setTimeout(() => child.kill("SIGKILL"), 1e3).unref();
				finalize(() => reject(/* @__PURE__ */ new Error(`Command timed out after ${options.timeout}ms: ${command}`)));
			}, options.timeout);
			timer.unref();
		}
		child.once("error", (error) => finalize(() => reject(/* @__PURE__ */ new Error(`Failed to run ${command}: ${error.message}`))));
		child.once("close", (code) => {
			finalize(() => resolve({
				stdout: Buffer.concat(stdoutBuffers).toString("utf-8").trim(),
				stderr: Buffer.concat(stderrBuffers).toString("utf-8").trim(),
				exitCode: code
			}));
		});
	});
};
const isToolInstalled = async (tool) => {
	try {
		const result = await runSubprocess("which", [tool]);
		return result.exitCode === 0 && result.stdout.length > 0;
	} catch {
		return false;
	}
};

//#endregion
export { runSubprocess as n, isToolInstalled as t };