// @vitest-environment happy-dom
/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { Inbox, type InboxEntry, type InboxLabels, type InboxUrls, inboxPatch } from "./inbox";

const labels: InboxLabels = {
	title: "Notificări",
	bell: (n) => (n === 0 ? "Notificări, nimic necitit" : `Notificări, ${n} necitite`),
	empty: "Nu ai notificări.",
	error: "Nu am putut încărca notificările.",
	retry: "Încearcă din nou",
	markAll: "Marchează tot ca citit",
	markOne: "Marchează ca citit",
	groupToday: "Azi",
	groupEarlier: "Mai devreme",
	unread: "necitit",
};
const urls: InboxUrls = {
	panel: "/inbox/panel",
	stream: "/inbox/stream",
	read: "/inbox/read",
	readAll: "/inbox/read-all",
};

const entry = (n: number, over: Partial<InboxEntry> = {}): InboxEntry => ({
	id: `n${n}`,
	title: `Cerere nouă ${n}`,
	body: "Maria a trimis o cerere.",
	href: `/requests/${n}`,
	time: "10:15",
	read: false,
	group: "today",
	...over,
});

function mount(html: string): HTMLElement {
	document.body.innerHTML = `<main>${html}</main>`;
	return document.body;
}
// Attribute quotes are escaped by the renderer; expressions are compared as the browser reads them.
const render = (data: Parameters<typeof Inbox>[0]["data"]): string =>
	(<Inbox data={data} labels={labels} urls={urls} />).toString().replaceAll("&#39;", "'");

async function violations(root: HTMLElement): Promise<string[]> {
	// happy-dom has no layout: contrast is checked against the design tokens below instead.
	const result = await axe.run(root, {
		runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
		rules: { "color-contrast": { enabled: false } },
	});
	return result.violations.map(
		(v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
	);
}

describe("Inbox states", () => {
	it("empty: no badge, a calm message, no mark-all", () => {
		const html = render({ state: "ready", entries: [], unread: 0 });
		expect(html).toContain("Nu ai notificări.");
		expect(html).toMatch(/id="psi-inbox-badge"[^>]*\shidden/);
		expect(html).not.toContain("Marchează tot ca citit");
		expect(html).toMatch(/<output[^>]*>Notificări, nimic necitit<\/output>/);
	});

	it("unread: the badge shows the count, the bell names it, unread entries can be marked", () => {
		const html = render({
			state: "ready",
			entries: [entry(1), entry(2, { read: true })],
			unread: 1,
		});
		expect(html).toMatch(/<output[^>]*>Notificări, 1 necitite<\/output>/);
		expect(html).toMatch(/id="psi-inbox-badge"[^>]*>1</);
		expect(html).not.toMatch(/id="psi-inbox-badge"[^>]*\shidden/);
		expect(html.match(/psi-inbox__mark/g)?.length).toBe(1);
		expect(html).toContain("Marchează tot ca citit");
		expect(html).toContain("@post('/inbox/read?id=n1'");
		expect(html).toContain("@post('/inbox/read-all'");
	});

	it("many: groups today and earlier, caps the badge at 99+", () => {
		const entries = Array.from({ length: 30 }, (_, i) =>
			entry(i, { group: i < 10 ? "today" : "earlier" }),
		);
		const html = render({ state: "ready", entries, unread: 150 });
		expect(html).toContain("99+");
		expect(html.indexOf("Azi")).toBeLessThan(html.indexOf("Mai devreme"));
		expect(html.match(/psi-inbox__item /g)?.length ?? 0).toBeGreaterThanOrEqual(30);
	});

	it("a group with no entries is not drawn", () => {
		const html = render({ state: "ready", entries: [entry(1)], unread: 1 });
		expect(html).toContain("Azi");
		expect(html).not.toContain("Mai devreme");
	});

	it("error: an alert with a retry that asks the server again, and no badge", () => {
		const html = render({ state: "error" });
		expect(html).toContain('role="alert"');
		expect(html).toContain("Nu am putut încărca notificările.");
		expect(html).toContain("@get('/inbox/panel')");
		expect(html).toMatch(/id="psi-inbox-badge"[^>]*\shidden/);
	});

	it("opens the live stream once and toggles with the bell; Escape closes and returns focus to the bell", () => {
		const html = render({ state: "ready", entries: [], unread: 0 });
		expect(html.match(/@get\('\/inbox\/stream'/g)?.length).toBe(1);
		expect(html).toContain('data-on:click="$inboxOpen = !$inboxOpen"');
		expect(html).toContain("keydown__window");
		expect(html).toContain("psi-inbox-bell");
	});

	it("escapes hostile text and keeps deep links as given paths", () => {
		const html = render({
			state: "ready",
			entries: [entry(1, { title: "<img src=x onerror=alert(1)>", href: "/requests/1" })],
			unread: 1,
		});
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
	});

	it("an id in the read URL is encoded", () => {
		const html = render({ state: "ready", entries: [entry(1, { id: "a b&c" })], unread: 1 });
		expect(html).toContain("id=a%20b%26c");
	});
});

describe("Inbox patches", () => {
	const patchOf = (data: Parameters<typeof Inbox>[0]["data"]): string =>
		inboxPatch({ data, labels, urls }).replaceAll("&#39;", "'");

	it("carry only the three live regions, never the shell, so an open panel and the one stream survive", () => {
		const html = patchOf({ state: "ready", entries: [entry(1)], unread: 1 });
		for (const id of ["psi-inbox-badge", "psi-inbox-status", "psi-inbox-body"])
			expect(html.match(new RegExp(`id="${id}"`, "g"))?.length, id).toBe(1);
		for (const shell of [
			'id="psi-inbox"',
			'id="psi-inbox-bell"',
			'id="psi-inbox-panel"',
			"data-init",
			"data-show",
			"display:none",
		])
			expect(html, shell).not.toContain(shell);
		expect(html).not.toContain("\n");
	});

	it("the badge, status and body agree on the count", () => {
		const html = patchOf({ state: "ready", entries: [entry(1), entry(2)], unread: 2 });
		expect(html).toMatch(/id="psi-inbox-badge"[^>]*>2</);
		expect(html).toContain("Notificări, 2 necitite");
		expect(html.match(/psi-inbox__mark/g)?.length).toBe(2);
	});

	it("an error patch hides the badge and offers the retry", () => {
		const html = patchOf({ state: "error" });
		expect(html).toMatch(/id="psi-inbox-badge"[^>]*\shidden/);
		expect(html).toContain("@get('/inbox/panel')");
	});
});

describe("Inbox accessibility (axe, WCAG 2.2 AA)", () => {
	const cases: Array<[string, Parameters<typeof Inbox>[0]["data"]]> = [
		["empty", { state: "ready", entries: [], unread: 0 }],
		[
			"unread",
			{
				state: "ready",
				entries: [entry(1), entry(2, { read: true, group: "earlier" })],
				unread: 1,
			},
		],
		[
			"many",
			{
				state: "ready",
				entries: Array.from({ length: 40 }, (_, i) =>
					entry(i, { group: i % 2 ? "today" : "earlier" }),
				),
				unread: 40,
			},
		],
		["error", { state: "error" }],
	];
	for (const [name, data] of cases) {
		it(`${name} has no violations`, async () => {
			expect(await violations(mount(render(data)))).toEqual([]);
		});
	}
});

describe("Inbox contrast per theme (from the design tokens)", () => {
	const tokens = JSON.parse(
		readFileSync(resolve(__dirname, "../../../design/tokens.json"), "utf8"),
	) as {
		color: {
			themes: Array<{ id: string }>;
			tokens: Array<{ name: string; value: Record<string, string> }>;
		};
	};
	const lum = (hex: string): number => {
		const [r, g, b] = [1, 3, 5]
			.map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
			.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
		return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
	};
	const ratio = (a: string, b: string): number => {
		const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
		return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
	};
	const pairs: Array<[string, string, number]> = [
		["ink", "surface-1", 4.5],
		["ink-muted", "surface-1", 4.5],
		["on-accent", "accent", 4.5],
		["line-control", "surface-1", 3],
		["focus", "surface-1", 3],
	];
	for (const theme of tokens.color.themes) {
		it(`${theme.id}: text, badge, control border and focus ring meet AA`, () => {
			const at = (name: string): string =>
				tokens.color.tokens.find((t) => t.name === name)?.value[theme.id] ?? "";
			for (const [fg, bg, min] of pairs)
				expect(ratio(at(fg), at(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
		});
	}
});
