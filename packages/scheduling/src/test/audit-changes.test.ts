import { describe, expect, it } from "vitest";
import { AUDIT_ENTITIES, journalName, listed, makeAuditEvent, moved } from "../clinic";

const base = {
	tenant: "psizone",
	at: Date.UTC(2026, 10, 14),
	actor: "olga",
	action: "member.change",
	entity: "member",
	entityId: "a".repeat(64),
} as const;

describe("the journal keeps a team change's before and after, and nothing else", () => {
	it("keeps a member's name, roles and calendars, and leaves the summary to field names", () => {
		const made = makeAuditEvent({
			...base,
			fields: ["displayName", "roles"],
			changes: [
				{ field: "displayName", from: "", to: "Nou Venit Ăîșț" },
				{ field: "roles", from: "", to: "k1,k2" },
				{ field: "coordinates", from: "p1", to: "" },
			],
		});
		expect(made.ok).toBe(true);
		if (!made.ok) return;
		expect(made.event.summary).toBe("member.change; fields: displayName, roles");
		expect(made.event.changes).toHaveLength(3);
	});

	it("keeps an override's grants and denials, both empty included", () => {
		const made = makeAuditEvent({
			...base,
			action: "override.change",
			entity: "override",
			changes: [
				{ field: "grants", from: "", to: "people_view_all" },
				{ field: "denies", from: "", to: "" },
			],
		});
		expect(made.ok).toBe(true);
	});

	it("an event with no changes is as before", () => {
		const made = makeAuditEvent(base);
		expect(made.ok && made.event.changes).toBe(undefined);
	});

	it.each(
		AUDIT_ENTITIES.filter((e) => e !== "member" && e !== "override"),
	)("refuses any value on a %s event (no client, record or note content can reach the log)", (entity) => {
		const made = makeAuditEvent({
			...base,
			action: "client.update",
			entity,
			changes: [{ field: "name", from: "Test Client A", to: "diagnosis X" }],
		});
		expect(made).toEqual({ ok: false, problems: ["changes.0.field"] });
	});

	it.each([
		["a member's e-mail", "member", "email", "a@example.test", ""],
		["a member's phone", "member", "phone", "", "0722"],
		["a name on an override", "override", "displayName", "", "X"],
		["roles on an override", "override", "roles", "", "r1"],
	] as const)("refuses %s: the field keeps no values", (_label, entity, field, from, to) => {
		const made = makeAuditEvent({ ...base, entity, changes: [{ field, from, to }] });
		expect(made).toEqual({ ok: false, problems: ["changes.0.field"] });
	});

	it.each([
		["free text in a list", "roles", "", "Test Client A diagnosis"],
		["a list with an empty item", "roles", "r1,,r2", ""],
		["markup in a list", "grants", "", "<script>"],
		["a line break in a name", "displayName", "", "Ana\nPopescu"],
		["a name over 200 characters", "displayName", "", "A".repeat(201)],
	] as const)("refuses %s", (_label, field, from, to) => {
		const entity = field === "grants" ? "override" : "member";
		const made = makeAuditEvent({ ...base, entity, changes: [{ field, from, to }] });
		expect(made).toEqual({ ok: false, problems: ["changes.0.from"] });
	});

	it("bounds: 200 characters of name and 8 changes pass, 9 changes are refused", () => {
		const name = makeAuditEvent({
			...base,
			changes: [{ field: "displayName", from: "", to: "A".repeat(200) }],
		});
		expect(name.ok).toBe(true);
		const eight = Array.from({ length: 8 }, () => ({ field: "roles", from: "", to: "r1" }));
		expect(makeAuditEvent({ ...base, changes: eight }).ok).toBe(true);
		const nine = [...eight, { field: "roles", from: "", to: "r1" }];
		expect(makeAuditEvent({ ...base, changes: nine })).toEqual({
			ok: false,
			problems: ["changes"],
		});
	});

	it("bounds: a list of 40 000 characters passes, one more is refused", () => {
		// 400 keys of 99 characters and their commas are 39 999 characters; one more on the last key makes 40 000.
		const exact = `${Array.from({ length: 400 }, () => "k".repeat(99)).join(",")}k`;
		expect(exact.length).toBe(40_000);
		const list = (to: string) =>
			makeAuditEvent({
				...base,
				action: "override.change",
				entity: "override",
				changes: [{ field: "grants", from: "", to }],
			});
		expect(list(exact).ok).toBe(true);
		expect(list(`${exact}k`)).toEqual({ ok: false, problems: ["changes.0.to"] });
	});

	it("an entity id may be a member's sign-in subject (up to 200 characters)", () => {
		expect(makeAuditEvent({ ...base, entityId: "s".repeat(200) }).ok).toBe(true);
		expect(makeAuditEvent({ ...base, entityId: "s".repeat(201) })).toEqual({
			ok: false,
			problems: ["entityId"],
		});
	});
});

describe("the helpers the wrappers keep the values with", () => {
	it("a list is sorted and comma-joined, empty for none", () => {
		expect(listed([])).toBe("");
		expect(listed(["b"])).toBe("b");
		expect(listed(["c", "a", "b"])).toBe("a,b,c");
	});

	it("only what moved is kept", () => {
		expect(
			moved([
				{ field: "roles", from: "a", to: "a" },
				{ field: "displayName", from: "", to: "X" },
			]),
		).toEqual([{ field: "displayName", from: "", to: "X" }]);
		expect(moved([])).toEqual([]);
	});

	it("a pasted line break in a name becomes a space; the name is kept, never the write refused", () => {
		expect(journalName("Ana\nPopescu\t")).toBe("Ana Popescu ");
		expect(journalName("Ăîșț <b>")).toBe("Ăîșț <b>");
		expect(journalName("A".repeat(250))).toHaveLength(200);
		const made = makeAuditEvent({
			...base,
			changes: [{ field: "displayName", from: "", to: journalName("Ana\nPopescu") }],
		});
		expect(made.ok).toBe(true);
	});
});
