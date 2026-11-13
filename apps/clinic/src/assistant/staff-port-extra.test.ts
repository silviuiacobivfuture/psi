import type { ActionInfo } from "@psi/engine/staff";
import { describe, expect, it } from "vitest";
import { createFakePort } from "../port/fake";
import { createStaffPort } from "./staff-port";
import type { ActionsSource } from "./staff-port-extra";

const person = { subject: "sub-1", name: "Recepție Demo", email: null };
const NOTE: ActionInfo = {
	id: "clients.addNote",
	label: "Adaugă o notiță",
	summary: "Adaugă o notiță la fișă",
	kind: "write",
	destructive: false,
	params: [{ name: "text", label: "Notiță", kind: "text", required: true }],
};

function setup(options: { readOnly?: boolean; actions?: ActionsSource } = {}) {
	const port = createFakePort({
		today: "2026-11-13",
		members: { "sub-1": [{ app: "psizone", roles: ["reception"] }] },
	});
	const staff = createStaffPort({
		port,
		app: "psizone",
		appName: "Psizone",
		person,
		roles: ["reception"],
		permissions: ["clients_create", "clients_view"],
		readOnly: options.readOnly ?? false,
		locale: "ro",
		...(options.actions === undefined ? {} : { actions: options.actions }),
	});
	return { port, staff };
}

describe("adding a client through the assistant's port", () => {
	it("creates the client the console would, with phone, e-mail, guardian and birth year, and audits it", async () => {
		const { port, staff } = setup();
		const made = await staff.createClient({
			name: "Iulian Iacob",
			phone: "0722 111 222",
			email: "iulian@example.test",
			guardian: "Ioana Iacob",
			birthYear: 2017,
		});
		expect(made.ok).toBe(true);
		const id = made.ok ? made.value.id : "";
		expect(await port.client("psizone", id)).toMatchObject({
			name: "Iulian Iacob",
			phone: "0722 111 222",
			email: "iulian@example.test",
			guardian: "Ioana Iacob",
			birthYear: 2017,
		});
		expect((await port.audit("psizone")).map((e) => e.action)).toContain("assistant.client.create");
	});

	it("looking as someone else, it adds nothing", async () => {
		const { port, staff } = setup({ readOnly: true });
		const before = (await port.clients("psizone", "current", "")).length;
		expect(await staff.createClient({ name: "Nou Client" })).toEqual({
			ok: false,
			reason: "forbidden",
		});
		expect((await port.clients("psizone", "current", "")).length).toBe(before);
	});

	it("the permission the console holds is what `can` answers for it", async () => {
		const { staff } = setup();
		expect(await staff.can("clients.create")).toEqual({ ok: true, value: true });
	});
});

describe("the registry, as the assistant reaches it", () => {
	it("lists what the registry lists for the screen, and runs an action with its parameters", async () => {
		const ran: Array<unknown> = [];
		const { staff, port } = setup({
			actions: {
				listActions: async () => [NOTE],
				runAction: async (id, params) => {
					ran.push({ id, params });
					return { summary: "Notiță adăugată" };
				},
			},
		});
		expect(await staff.listActions({ screen: "client", clientId: "c1" })).toEqual({
			ok: true,
			value: [NOTE],
		});
		expect(await staff.runAction({ id: NOTE.id, params: { text: "x" } })).toEqual({
			ok: true,
			value: { summary: "Notiță adăugată" },
		});
		expect(ran).toEqual([{ id: NOTE.id, params: { text: "x" } }]);
		expect((await port.audit("psizone")).map((e) => e.action)).toContain(
			"assistant.action.clients.addNote",
		);
	});

	it("without a registry nothing is listed and nothing runs; looking as someone else nothing runs either", async () => {
		const none = setup();
		expect(await none.staff.listActions(undefined)).toEqual({ ok: true, value: [] });
		expect(await none.staff.runAction({ id: NOTE.id, params: {} })).toEqual({
			ok: false,
			reason: "forbidden",
		});
		let called = 0;
		const viewing = setup({
			readOnly: true,
			actions: {
				listActions: async () => [NOTE],
				runAction: async () => {
					called += 1;
					return { summary: "" };
				},
			},
		});
		expect(await viewing.staff.runAction({ id: NOTE.id, params: {} })).toMatchObject({ ok: false });
		expect(called).toBe(0);
	});
});
