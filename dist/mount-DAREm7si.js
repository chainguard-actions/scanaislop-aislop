#!/usr/bin/env node
//#region src/ui/agent-tui/mount.ts
const ALT_SCREEN_ON = "\x1B[?1049h";
const ALT_SCREEN_OFF = "\x1B[?1049l";
const HIDE_CURSOR = "\x1B[?25l";
const SHOW_CURSOR = "\x1B[?25h";
const mountAgentTui = async (store) => {
	const [{ render }, React, { AgentApp }] = await Promise.all([
		import("ink"),
		import("react"),
		import("./AgentApp-DT7vzhgx.js")
	]);
	process.stdout.write(ALT_SCREEN_ON + HIDE_CURSOR);
	const instance = render(React.createElement(AgentApp, { store }), { exitOnCtrlC: false });
	return { close: async () => {
		instance.unmount();
		await instance.waitUntilExit();
		process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
	} };
};

//#endregion
export { mountAgentTui };