import {
	buildKeyRing,
	encryptField,
	generateDataKeyBytes,
	parseMasterKey,
	wrapDataKey,
} from "@psi/scheduling/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { sealedOf } from "./ports/crypto";
import { ok, type Populated, populate } from "./testing/populate";
import { createBareWorld, MASTER_KEY } from "./testing/world";

const A = "/v1/apps/psizone";

/** What the import writes with, so the rows below are the import's own shapes. */
async function sealedByImport(w: Populated, field: string, plain: string): Promise<string> {
	const master = await parseMasterKey(MASTER_KEY);
	if ((await w.store.keys.keys("psizone")).length === 0)
		await w.store.keys.install(
			"psizone",
			1,
			await wrapDataKey(master, generateDataKeyBytes(), "psizone", 1),
		);
	const ring = await buildKeyRing(master, "psizone", await w.store.keys.keys("psizone"));
	return sealedOf(await encryptField(ring, plain, `psizone|${field}`));
}

describe("a client and a visit that came in through the import", () => {
	let w: Populated;
	let imp = "";
	let bare = "";
	beforeAll(async () => {
		w = await populate(await createBareWorld());
		const made = async (name: string): Promise<string> =>
			String(ok(await w.call("olga", "POST", `${A}/clients`, { name }), "client").id);
		imp = await made("Imported Client");
		bare = await made("Plain Client");
		const client = await w.store.c.clients.get("psizone", imp);
		if (client === undefined) throw new Error("the client was just made");
		await w.store.c.clients.replace({
			...client,
			importedClinical: {
				mainReason: await sealedByImport(w, "clients.mainReasonEnc", "synthetic-reason"),
				diagnosis: await sealedByImport(w, "clients.diagnosisEnc", "synthetic-diagnosis"),
				healthNotes: await sealedByImport(w, "clients.healthNotesEnc", "synthetic-health-notes"),
			},
		});
		const visit = await w.store.c.appointments.get("psizone", w.ids.a1);
		if (visit === undefined) throw new Error("the populated clinic has an appointment");
		await w.store.c.appointments.replace({
			...visit,
			therapistNoteSealed: await sealedByImport(w, "visits.therapistNotes", "synthetic-visit-note"),
		});
	});

	const audited = async (): Promise<{ actor: { subject: string }; target: { id: string } }[]> =>
		(ok(await w.call("olga", "GET", `${A}/audit?action=clinical.read`), "audit").items ?? []) as {
			actor: { subject: string };
			target: { id: string };
		}[];

	it("the client's reason, diagnosis and health notes are its clinical group", async () => {
		const read = ok(await w.call("olga", "GET", `${A}/clients/${imp}`), "client");
		expect(read.clinical).toEqual({
			mainReason: "synthetic-reason",
			diagnosis: "synthetic-diagnosis",
			notes: "synthetic-health-notes",
		});
	});

	it("only with the clinical group's key: reception sees the client without it, and nothing is audited for her", async () => {
		const before = (await audited()).length;
		const read = ok(await w.call("rita", "GET", `${A}/clients/${imp}`), "client");
		expect(read.clinical).toBeUndefined();
		expect(JSON.stringify(read)).not.toContain("synthetic");
		expect((await audited()).length).toBe(before);
	});

	it("a list never carries the clinical group", async () => {
		const list = ok(await w.call("olga", "GET", `${A}/clients`), "list");
		expect(JSON.stringify(list)).not.toContain("synthetic-diagnosis");
	});

	it("a read of the clinical group is audited with the reader", async () => {
		await w.call("olga", "GET", `${A}/clients/${imp}`);
		expect((await audited()).some((e) => e.actor.subject === "olga" && e.target.id === imp)).toBe(
			true,
		);
	});

	it("the visit's therapist note is its clinical group, with the same permission and audit", async () => {
		const owner = ok(await w.call("olga", "GET", `${A}/appointments/${w.ids.a1}`), "appointment");
		expect(owner.clinical).toEqual({ therapistNote: "synthetic-visit-note" });
		expect(JSON.stringify(owner)).not.toContain("therapistNoteSealed");
		const reception = ok(
			await w.call("rita", "GET", `${A}/appointments/${w.ids.a1}`),
			"appointment",
		);
		expect(reception.clinical).toBeUndefined();
		expect(JSON.stringify(reception)).not.toContain("synthetic");
		expect(
			(await audited()).some((e) => e.actor.subject === "olga" && e.target.id === w.ids.a1),
		).toBe(true);
	});

	it("a list of appointments never carries the therapist note, nor its sealed form", async () => {
		const list = ok(
			await w.call("olga", "GET", `${A}/appointments?from=0&to=${Date.UTC(2100, 0, 1)}`),
			"list",
		);
		expect(JSON.stringify(list)).not.toContain("synthetic-visit-note");
		expect(JSON.stringify(list)).not.toContain("therapistNoteSealed");
	});

	it("a first edit of the clinical group keeps what the import kept apart", async () => {
		ok(
			await w.call("olga", "PATCH", `${A}/clients/${imp}`, {
				clinical: { notes: "synthetic-new-notes" },
			}),
			"edit",
		);
		const read = ok(await w.call("olga", "GET", `${A}/clients/${imp}`), "client");
		expect(read.clinical).toEqual({
			mainReason: "synthetic-reason",
			diagnosis: "synthetic-diagnosis",
			notes: "synthetic-new-notes",
		});
	});

	it("a client with none of it has no clinical group", async () => {
		const read = ok(await w.call("olga", "GET", `${A}/clients/${bare}`), "client");
		expect(read.clinical).toBeUndefined();
	});
});
