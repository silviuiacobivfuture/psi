/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { CommandPalette, paletteShortcut } from "./palette";

const items = [
	{
		id: "nav.calendar",
		label: "Calendar",
		icon: "calendar" as const,
		href: "/calendar",
		group: "Go to",
	},
	{
		id: "client.new",
		label: "New client",
		icon: "plus" as const,
		href: "/clients?new=1",
		group: "Clients",
	},
];
const props = {
	title: "Commands",
	placeholder: "Type a command",
	closeLabel: "Close",
	empty: "Nothing",
	items,
};

describe("CommandPalette", () => {
	it("lists every item under its group, each tagged with its action id", () => {
		const html = String(<CommandPalette {...props} />);
		expect(html).toContain("Go to");
		expect(html).toContain('data-action="nav.calendar"');
		expect(html).toContain('href="/clients?new=1"');
		expect(html.match(/<li data-palette-item/g)).toHaveLength(2);
	});
	it("is a modal dialog, closed until its signal opens it, with a filter field and an empty message", () => {
		const html = String(<CommandPalette {...props} />);
		expect(html).toContain('role="dialog"');
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain("display:none");
		expect(html).toContain('type="search"');
		expect(html).toContain("Nothing");
	});
	it("opens on Ctrl or Cmd plus K and never on K alone", () => {
		const js = paletteShortcut();
		expect(js).toContain("evt.ctrlKey || evt.metaKey");
		expect(js).toContain("$palette = !$palette");
	});
	it("an empty list is still a dialog", () => {
		expect(String(<CommandPalette {...props} items={[]} />)).toContain('role="dialog"');
	});
});
