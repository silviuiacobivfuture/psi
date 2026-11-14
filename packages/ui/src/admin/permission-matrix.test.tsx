/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import { PermissionMatrix, type PermissionMatrixProps } from "./permission-matrix";

const base: PermissionMatrixProps = {
	rows: [
		{ key: "clients", label: "Clients", group: "People" },
		{ key: "rooms", label: "Rooms", group: "Places" },
	],
	columns: [
		{ key: "view", label: "View" },
		{ key: "edit", label: "Edit" },
	],
	scopes: [{ key: "all", label: "All" }],
	noneLabel: "None",
	notApplicableLabel: "Not applicable",
	grants: { clients: { view: "all" } },
	applicable: { clients: ["view", "edit"], rooms: ["view"] },
	fieldGroupsLabel: "Field groups",
	fieldGroups: [],
	resourceLabel: "Resource",
	tableLabel: "Permissions",
};
const render = (p: Partial<PermissionMatrixProps> = {}): string =>
	String(<PermissionMatrix {...base} {...p} />);

describe("PermissionMatrix: what a cell holds through another role", () => {
	it("shows nothing inherited when none is given", () => {
		const html = render();
		expect(html).not.toContain("data-inherited");
		expect(html).not.toContain("adm-matrix__from");
	});

	it("marks exactly the inherited cells, with their words, and keeps each cell's own choice", () => {
		const html = render({
			inherited: { clients: { edit: "from Reception: All" }, rooms: { view: "from Desk: All" } },
		});
		expect(html.match(/data-inherited/g)).toHaveLength(2);
		expect(html).toContain("from Reception: All");
		expect(html).toContain("from Desk: All");
		// the cell's own select is still there, holding the role's own scope (none for clients.edit)
		expect(html).toMatch(/name="perm\.clients\.edit"[\s\S]*?<option value="none" selected/);
		expect(html).toMatch(/name="perm\.clients\.view"[\s\S]*?<option value="all" selected/);
	});

	it("never marks a cell that does not apply to its row", () => {
		const html = render({ inherited: { rooms: { edit: "from Desk: All" } } });
		expect(html).not.toContain("from Desk: All");
	});
});
