#!/usr/bin/env node
import { spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
//#region src/utils/subprocess.ts
const DEFAULT_CHUNK_MAX_FILES = 200;
const DEFAULT_CHUNK_MAX_CHARS = 25e3;
const chunkFilePaths = (filePaths, maxFiles = DEFAULT_CHUNK_MAX_FILES, maxChars = DEFAULT_CHUNK_MAX_CHARS) => {
	const chunks = [];
	let current = [];
	let currentChars = 0;
	for (const filePath of filePaths) {
		const addedChars = filePath.length + 1;
		if (current.length > 0 && (current.length >= maxFiles || currentChars + addedChars > maxChars)) {
			chunks.push(current);
			current = [];
			currentChars = 0;
		}
		current.push(filePath);
		currentChars += addedChars;
	}
	if (current.length > 0) chunks.push(current);
	return chunks;
};
const killProcessTree = (child) => {
	if (process.platform === "win32") {
		if (child.pid === void 0) {
			child.kill("SIGTERM");
			return;
		}
		spawn("taskkill", [
			"/pid",
			String(child.pid),
			"/T",
			"/F"
		], {
			stdio: "ignore",
			windowsHide: true
		}).once("error", () => {});
		return;
	}
	if (child.pid === void 0) {
		child.kill("SIGTERM");
		setTimeout(() => child.kill("SIGKILL"), 1e3).unref();
		return;
	}
	const pid = child.pid;
	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		child.kill("SIGTERM");
	}
	setTimeout(() => {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			child.kill("SIGKILL");
		}
	}, 1e3).unref();
};
const activeChildren = /* @__PURE__ */ new Set();
const createOutputCapture = () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "aislop-"));
	const stdoutPath = path.join(tempDir, "stdout.log");
	const stderrPath = path.join(tempDir, "stderr.log");
	let outFd;
	try {
		outFd = openSync(stdoutPath, "w");
		const errFd = openSync(stderrPath, "w");
		return {
			tempDir,
			stdoutPath,
			stderrPath,
			outFd,
			errFd
		};
	} catch (error) {
		if (outFd !== void 0) try {
			closeSync(outFd);
		} catch {}
		try {
			rmSync(tempDir, {
				recursive: true,
				force: true
			});
		} catch {}
		throw error;
	}
};
const isMissingToolError = (error) => error instanceof Error && error.code === "ENOENT";
const warnSubprocessFailure = (tool, error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`aislop: ${tool} failed to run and was skipped: ${message}`);
};
const runSubprocess = (command, args, options = {}) => {
	return new Promise((resolve, reject) => {
		let capture;
		try {
			capture = createOutputCapture();
		} catch (error) {
			reject(/* @__PURE__ */ new Error(`Failed to prepare output capture for ${command}: ${error.message}`));
			return;
		}
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: {
				...process.env,
				...options.env
			},
			stdio: [
				"ignore",
				capture.outFd,
				capture.errFd
			],
			windowsHide: true,
			detached: process.platform !== "win32"
		});
		activeChildren.add(child);
		let cleanedUp = false;
		const cleanup = () => {
			if (cleanedUp) return {
				stdout: "",
				stderr: ""
			};
			cleanedUp = true;
			activeChildren.delete(child);
			closeSync(capture.outFd);
			closeSync(capture.errFd);
			const stdout = readFileSync(capture.stdoutPath, "utf-8").trim();
			const stderr = readFileSync(capture.stderrPath, "utf-8").trim();
			try {
				rmSync(capture.tempDir, {
					recursive: true,
					force: true
				});
			} catch {}
			return {
				stdout,
				stderr
			};
		};
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
				setImmediate(() => {
					if (settled) return;
					if (child.exitCode !== null || child.signalCode !== null) return;
					killProcessTree(child);
					finalize(() => reject(/* @__PURE__ */ new Error(`Command timed out after ${options.timeout}ms: ${command}`)));
				});
			}, options.timeout);
			timer.unref();
		}
		child.once("error", (error) => {
			cleanup();
			finalize(() => {
				const wrapped = /* @__PURE__ */ new Error(`Failed to run ${command}: ${error.message}`);
				if (error.code) wrapped.code = error.code;
				reject(wrapped);
			});
		});
		child.once("close", (code) => {
			const { stdout, stderr } = cleanup();
			finalize(() => resolve({
				stdout,
				stderr,
				exitCode: code
			}));
		});
	});
};
const isToolInstalled = async (tool) => {
	try {
		const command = process.platform === "win32" ? "where.exe" : "which";
		const result = await runSubprocess(command, [tool]);
		return result.exitCode === 0 && result.stdout.length > 0;
	} catch {
		return false;
	}
};
//#endregion
export { warnSubprocessFailure as a, runSubprocess as i, isMissingToolError as n, isToolInstalled as r, chunkFilePaths as t };
