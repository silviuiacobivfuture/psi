import { describe, expect, it } from "vitest";
import {
	archive,
	clinicRetentionAction,
	erasureDue,
	makeAuditEvent,
	planChange,
	planClientChange,
	RECOVERY_DAYS,
	restore,
	softDelete,
	storageKeyFor,
	unarchive,
	visibilityOf,
} from "../clinic";
import { DEFAULT_RETENTION, retentionAction } from "../domain/retention";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 13);

describe("client standing: archive, delete, restore", () => {
	it("archive hides, unarchive brings back, each refused when it does not apply", () => {
		expect(archive({}, NOW)).toEqual({ ok: true, patch: { archivedAt: NOW } });
		expect(archive({ archivedAt: 1 }, NOW)).toEqual({ ok: false, reason: "already_archived" });
		expect(archive({ deletedAt: 1 }, NOW)).toEqual({ ok: false, reason: "already_deleted" });
		expect(unarchive({ archivedAt: 1 })).toEqual({ ok: true, patch: {} });
		expect(unarchive({})).toEqual({ ok: false, reason: "not_archived" });
		expect(unarchive({ deletedAt: 1, archivedAt: 1 })).toEqual({
			ok: false,
			reason: "already_deleted",
		});
	});

	it("delete needs no archive first, keeps the archive date and is soft", () => {
		expect(softDelete({}, NOW)).toEqual({ ok: true, patch: { deletedAt: NOW } });
		expect(softDelete({ archivedAt: 5 }, NOW)).toEqual({ ok: true, patch: { deletedAt: NOW } });
		expect(softDelete({ deletedAt: 1 }, NOW)).toEqual({ ok: false, reason: "already_deleted" });
		expect(visibilityOf({})).toBe("listed");
		expect(visibilityOf({ archivedAt: 1 })).toBe("archived");
		expect(visibilityOf({ archivedAt: 1, deletedAt: 2 })).toBe("deleted");
	});

	it("a deleted client is recoverable for exactly 30 days", () => {
		const deletedAt = NOW;
		expect(restore({}, NOW)).toEqual({ ok: false, reason: "not_deleted" });
		expect(restore({ deletedAt }, deletedAt + RECOVERY_DAYS * DAY - 1).ok).toBe(true);
		expect(restore({ deletedAt }, deletedAt + RECOVERY_DAYS * DAY)).toEqual({
			ok: false,
			reason: "recovery_expired",
		});
	});

	it("the clinic's own job erases only soft-deleted clients past the 30 days", () => {
		expect(erasureDue({ deletedAt: NOW }, NOW + 29 * DAY)).toBe(false);
		expect(clinicRetentionAction({ deletedAt: NOW }, NOW + 30 * DAY)).toBe("erase");
		expect(clinicRetentionAction({ archivedAt: 1 }, NOW + 10 * 365 * DAY)).toBe("keep");
		expect(clinicRetentionAction({}, NOW + 10 * 365 * DAY)).toBe("keep");
	});
});

describe("the web-request retention is a different policy", () => {
	it("erases a booking's contact after 30 days, which the clinic policy never does to a client", () => {
		const booking = {
			status: "confirmed" as const,
			end: NOW,
			updatedAt: NOW,
			hasContact: true,
			submitted: true,
		};
		expect(retentionAction(booking, NOW + 31 * DAY, DEFAULT_RETENTION)).toBe("erase_contact");
		expect(clinicRetentionAction({}, NOW + 31 * DAY)).toBe("keep");
		expect(clinicRetentionAction({}, NOW + 2000 * DAY)).toBe("keep");
	});
});

describe("versioned changes and who may move a client", () => {
	const before = {
		version: 3,
		name: "Test Client A",
		treatingPractitioner: "p1",
		phone: "0700 000 001",
	};

	it("a change that changes nothing bumps nothing", () => {
		expect(planChange(before, { name: "Test Client A" })).toEqual({ changed: false });
		expect(planChange(before, {})).toEqual({ changed: false });
	});

	it("a real change bumps the version once and names the fields, not the values", () => {
		const change = planChange(before, { name: "Test Client B", phone: "0700 000 001" });
		expect(change).toEqual({ changed: true, fields: ["name"], nextVersion: 4 });
	});

	it("a person may reassign the treating practitioner", () => {
		const result = planClientChange(
			before,
			{ treatingPractitioner: "p2" },
			{ kind: "staff", actor: "sub-1" },
		);
		expect(result).toEqual({
			ok: true,
			change: { changed: true, fields: ["treatingPractitioner"], nextVersion: 4 },
		});
	});

	it.each([
		"visit",
		"import",
		"series",
		"retention",
		"reminder",
	] as const)("%s never moves a client by itself", (process) => {
		expect(
			planClientChange(before, { treatingPractitioner: "p2" }, { kind: "system", process }),
		).toEqual({ ok: false, reason: "implicit_practitioner_change" });
	});

	it("a system process may still change other fields, and re-state the same practitioner", () => {
		expect(
			planClientChange(
				before,
				{ treatingPractitioner: "p1", phone: "0700 000 002" },
				{ kind: "system", process: "import" },
			),
		).toEqual({ ok: true, change: { changed: true, fields: ["phone"], nextVersion: 4 } });
	});
});

describe("audit events carry no content", () => {
	const base = {
		tenant: "psizone",
		at: NOW,
		actor: "sub-1",
		entity: "client",
		entityId: "k123",
	} as const;

	it("builds the summary from the action, field names and a count", () => {
		const made = makeAuditEvent({
			...base,
			action: "client.update",
			fields: ["name", "phone"],
			count: 1,
		});
		expect(made).toMatchObject({
			ok: true,
			event: { summary: "client.update; fields: name, phone; count: 1" },
		});
	});

	it("has no place for free text: a name or a note in the input is dropped, a name as a field is refused", () => {
		const made = makeAuditEvent({
			...base,
			action: "client.update",
			summary: "Test Client A diagnosis X",
		});
		expect(made.ok).toBe(true);
		if (made.ok) expect(made.event.summary).toBe("client.update");
		const bad = makeAuditEvent({ ...base, action: "client.update", fields: ["Test Client A"] });
		expect(bad).toEqual({ ok: false, problems: ["fields.0"] });
	});

	it.each([
		["an unknown action", { ...base, action: "client.peek" }, "action"],
		["an unknown entity", { ...base, action: "client.update", entity: "diagnosis" }, "entity"],
		["no actor", { ...base, action: "client.update", actor: "" }, "actor"],
		["a negative time", { ...base, action: "client.update", at: -1 }, "at"],
	])("refuses %s", (_label, input, path) => {
		expect(makeAuditEvent(input)).toEqual({ ok: false, problems: [path] });
	});
});

describe("file keys", () => {
	it("are content-addressed, per app and kind, and carry no name", () => {
		const sha = "ab".repeat(32);
		expect(storageKeyFor("psizone", "client_file", sha)).toBe(`psizone/client_file/ab/${sha}`);
		expect(storageKeyFor("hemisync", "notice", sha)).not.toBe(
			storageKeyFor("psizone", "notice", sha),
		);
	});
});
