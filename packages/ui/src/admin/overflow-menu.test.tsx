/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { OverflowMenu } from "./overflow-menu";

const items = [
	{
		key: "archive",
		label: "Archive",
		icon: "archive" as const,
		onClick: "$askArchive = true",
	},
	{ key: "export", label: "Export", href: "/export" },
	{
		key: "delete",
		label: "Delete",
		icon: "trash" as const,
		tone: "danger" as const,
		onClick: "$askDelete = true",
	},
];

describe("OverflowMenu", () => {
	const html = (<OverflowMenu id="client-actions" label="More actions" items={items} />).toString();
	it("is a named button that announces a menu and starts closed", () => {
		expect(html).toContain('aria-haspopup="menu"');
		expect(html).toContain('aria-label="More actions"');
		expect(html).toContain('data-attr:aria-expanded="$om_client_actions"');
		expect(html).toContain("&quot;om_client_actions&quot;:false");
		expect(html).toContain('style="display:none"');
	});
	it("lists every item as a menuitem, links as links, actions as buttons that close the menu first", () => {
		expect(html.match(/role="menuitem"/g)).toHaveLength(3);
		expect(html).toContain('href="/export"');
		expect(html).toContain("$om_client_actions = false; $askArchive = true");
		expect(html).toContain("adm-menu__item--danger");
	});
	it("answers the keys: Escape closes and returns focus, arrows and Home/End move, a click outside closes", () => {
		expect(html).toContain("evt.key === &#39;Escape&#39;");
		for (const k of ["ArrowDown", "ArrowUp", "Home", "End"]) expect(html).toContain(k);
		expect(html).toContain("data-on:click__outside");
	});
});
