/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { AdminShell, type ShellProps } from "./shell";

function html(extra: Partial<ShellProps>): string {
	const base = {
		app: "psizone",
		apps: [],
		nav: [],
		tabs: [],
		current: "calendar",
		title: "t",
		user: { name: "Ana Test", email: null },
		labels: new Proxy({}, { get: (_t, k) => String(k) }),
		prefsAction: "/prefs",
		signOutAction: "/out",
		locale: "ro",
		themePref: "light",
		deco: false,
		searchAction: "/search",
	} as unknown as ShellProps;
	const out = (<AdminShell {...base} {...extra} />).toString();
	if (typeof out !== "string") throw new Error("async render");
	return out;
}

describe("the account menu's saved choices", () => {
	const choice = {
		id: "assistant",
		label: "Asistent",
		action: "/assistant/mode",
		name: "mode",
		value: "bar",
		options: [
			{ value: "bar", label: "Bară" },
			{ value: "panel", label: "Panou" },
		],
	};

	it("draws one form per choice, posting to its own route, the current option pressed", () => {
		const out = html({ choices: [choice] });
		expect(out).toContain('action="/assistant/mode"');
		expect(out).toMatch(/name="mode" value="bar" aria-pressed="true"/);
		expect(out).toMatch(/name="mode" value="panel" aria-pressed="false"/);
		expect(out).toContain('aria-labelledby="adm-choice-assistant"');
	});

	it("draws nothing without choices", () => {
		expect(html({})).not.toContain("adm-choice-");
	});
});
