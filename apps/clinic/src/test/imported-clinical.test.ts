import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SdkConsole, startSdkConsole } from "./sdk-harness";

/** What the import keeps apart (the client's reason, diagnosis and health notes; the visit's therapist note), on screen. */
let k: SdkConsole;
let client = "";
let visit = "";
beforeAll(async () => {
	k = await startSdkConsole();
	const { store, deps } = k.api.world;
	const made = await k.api.world.call("olga", "POST", "/v1/apps/psizone/clients", {
		name: "Imported Client",
	});
	client = String(made.json.id);
	const row = await store.c.clients.get("psizone", client);
	const a1 = await store.c.appointments.get("psizone", k.api.world.ids.a1);
	if (row === undefined || a1 === undefined) throw new Error("the populated clinic is incomplete");
	const seal = (field: string, text: string) => deps.crypto.seal("psizone", field, text);
	await store.c.clients.replace({
		...row,
		importedClinical: {
			mainReason: await seal("clients.mainReasonEnc", "synthetic-reason"),
			diagnosis: await seal("clients.diagnosisEnc", "synthetic-diagnosis"),
			healthNotes: await seal("clients.healthNotesEnc", "synthetic-health"),
		},
	});
	visit = a1.id;
	await store.c.appointments.replace({
		...a1,
		therapistNoteSealed: await seal("visits.therapistNotes", "synthetic-therapist-note"),
	});
});
afterAll(async () => {
	await k.close();
});

const text = async (r: Response): Promise<string> => r.text();

describe("the imported clinical texts on screen", () => {
	it("the client page shows the reason, the diagnosis and the notes to a person who may see the clinical group", async () => {
		const page = await text(await (await k.as("olga")).get(`/clients/${client}`));
		for (const t of ["synthetic-reason", "synthetic-diagnosis", "synthetic-health"])
			expect(page).toContain(t);
	});

	it("and nothing of them to one who may not", async () => {
		const page = await text(await (await k.as("rita")).get(`/clients/${client}`));
		expect(page).not.toContain("synthetic");
	});

	it("the appointment's details show the therapist's note to the clinical group only", async () => {
		const detail = await text(await (await k.as("olga")).get(`/calendar/appointment/${visit}`));
		expect(detail).toContain("synthetic-therapist-note");
		const reception = await text(await (await k.as("rita")).get(`/calendar/appointment/${visit}`));
		expect(reception).not.toContain("synthetic-therapist-note");
	});
});
