/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { SubNav } from "./subnav";

const groups = [
	{
		key: "team",
		label: "Team",
		items: [
			{
				key: "people",
				label: "Members",
				href: "/settings/people",
				icon: "users" as const,
				hint: "Who",
			},
			{
				key: "roles",
				label: "Roles",
				href: "/settings/roles",
				icon: "shield" as const,
				hint: "What",
			},
		],
	},
];

describe("SubNav", () => {
	it("lists each group with its links and marks the open one", () => {
		const html = String(<SubNav label="Sections" groups={groups} current="roles" />);
		expect(html).toContain('aria-label="Sections"');
		expect(html).toContain("Team");
		expect(html).toContain('data-subnav="people"');
		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
		expect(html).not.toContain("Who");
	});
	it("shows the hints on the landing, where nothing is open", () => {
		const html = String(<SubNav label="Sections" groups={groups} />);
		expect(html).toContain("Who");
		expect(html).not.toContain("aria-current");
	});
	it("renders nothing for no groups but the empty nav", () => {
		expect(String(<SubNav label="x" groups={[]} />)).not.toContain("adm-subnav__group");
	});
});
