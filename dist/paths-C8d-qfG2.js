import path from "node:path";
//#region src/utils/paths.ts
/** Normalize an OS path to forward-slash (POSIX) separators. */
const toPosix = (p) => p.split(path.sep).join("/");
/** path.relative, normalized to POSIX separators (stable across OSes). */
const relativePosix = (from, to) => toPosix(path.relative(from, to));
const stripWindowsNamespace = (filePath) => {
	if (filePath.startsWith("\\\\?\\UNC\\")) return `\\\\${filePath.slice(8)}`;
	return filePath.startsWith("\\\\?\\") ? filePath.slice(4) : filePath;
};
const projectRelativePosix = (rootDirectory, filePath) => {
	if (process.platform === "win32") {
		const normalizedRoot = stripWindowsNamespace(rootDirectory);
		const normalizedFile = stripWindowsNamespace(filePath);
		return (path.win32.isAbsolute(normalizedFile) ? path.win32.relative(normalizedRoot, normalizedFile) : normalizedFile).split(path.win32.sep).join("/");
	}
	return path.isAbsolute(filePath) ? relativePosix(rootDirectory, filePath) : toPosix(filePath);
};
//#endregion
export { relativePosix as n, projectRelativePosix as t };
