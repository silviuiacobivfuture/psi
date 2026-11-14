import { SEED_FORM_TEMPLATES } from "@psi/scheduling/clinic";
import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PortError } from "../port";
import { createSdkPort } from "./index";

let api: RunningApi;
beforeAll(async () => {
	api = await startApi();
});
afterAll(async () => {
	await api.close();
});

const as = async (subject: string) =>
	createSdkPort({ baseUrl: api.url, bearer: () => api.tokenFor(subject) });
const OLGA = { subject: "olga", name: "Olga Test" };
const refusal = async (run: () => Promise<unknown>): Promise<PortError> => {
	try {
		await run();
	} catch (error) {
		if (error instanceof PortError) return error;
		throw error;
	}
	throw new Error("expected a refusal");
};

describe("notes through the adapter", () => {
	it("writes a note in the console's categories, lists it with its author, changes it, pins it and deletes it", async () => {
		const port = await as("olga");
		const c = api.world.ids.c1;
		const made = await port.addNote(
			"psizone",
			c,
			{ body: "Plătește în rate", category: "payment", pinned: false },
			OLGA,
		);
		expect(made).toMatchObject({
			body: "Plătește în rate",
			category: "payment",
			pinned: false,
			authorSubject: "olga",
			editedAt: null,
		});
		expect((await port.notes("psizone", c)).map((n) => n.id)).toContain(made.id);
		const edited = await port.updateNote("psizone", made.id, {
			body: "Plătește integral",
			category: "administrative",
		});
		expect(edited).toMatchObject({ body: "Plătește integral", category: "administrative" });
		// The test clock does not move by itself: a change a minute later is what "edited" says.
		api.world.clock.now += 60_000;
		const again = await port.updateNote("psizone", made.id, { body: "Plătește integral, azi" });
		expect(again.editedAt).not.toBeNull();
		const pinned = await port.updateNote("psizone", made.id, { pinned: true });
		expect(pinned.pinned).toBe(true);
		await port.deleteNote("psizone", made.id);
		expect((await port.notes("psizone", c)).map((n) => n.id)).not.toContain(made.id);
	});

	it("shows pinned notes in the client rows and the flags: a count, and the newest pinned text", async () => {
		const port = await as("olga");
		const c = api.world.ids.c1;
		await port.addNote(
			"psizone",
			c,
			{ body: "Fixată veche", category: "general", pinned: true },
			OLGA,
		);
		api.world.clock.now += 60_000;
		const newest = await port.addNote(
			"psizone",
			c,
			{ body: "Fixată nouă", category: "behaviour", pinned: true },
			OLGA,
		);
		const rows = await port.clientSummaries("psizone", "current", "");
		expect(rows.find((r) => r.clientId === c)?.pinnedNotes).toBeGreaterThanOrEqual(2);
		expect(rows.find((r) => r.clientId === api.world.ids.c2)?.pinnedNotes).toBe(0);
		const flags = await port.clientFlags("psizone", [c, api.world.ids.c2]);
		expect(flags[c]?.pinned).toEqual({ body: newest.body, category: "behaviour" });
		expect(flags[api.world.ids.c2]).toBeUndefined();
	});

	it("keeps a clinical note from reception, and refuses reception writing one; nothing is written", async () => {
		const olga = await as("olga");
		const rita = await as("rita");
		const c = api.world.ids.c1;
		const clinical = await olga.addNote(
			"psizone",
			c,
			{ body: "Text clinic secret", category: "clinical", pinned: true },
			OLGA,
		);
		expect((await rita.notes("psizone", c)).map((n) => n.id)).not.toContain(clinical.id);
		expect((await rita.clientFlags("psizone", [c]))[c]?.pinned?.body).not.toBe(
			"Text clinic secret",
		);
		const before = await api.world.fingerprint();
		const e = await refusal(() =>
			rita.addNote(
				"psizone",
				c,
				{ body: "x", category: "clinical", pinned: false },
				{ subject: "rita", name: "Rita" },
			),
		);
		expect(e.code).toBe("forbidden");
		expect(await api.world.fingerprint()).toBe(before);
	});

	it("reception changes its own notes and not another's: refused, and the note stays", async () => {
		const olga = await as("olga");
		const rita = await as("rita");
		const c = api.world.ids.c1;
		const theirs = await olga.addNote(
			"psizone",
			c,
			{ body: "A lui Olga", category: "general", pinned: false },
			OLGA,
		);
		const before = await api.world.fingerprint();
		expect(
			(await refusal(() => rita.updateNote("psizone", theirs.id, { body: "luată" }))).code,
		).toBe("forbidden");
		expect((await refusal(() => rita.deleteNote("psizone", theirs.id))).code).toBe("forbidden");
		expect(await api.world.fingerprint()).toBe(before);
		const mine = await rita.addNote(
			"psizone",
			c,
			{ body: "A Ritei", category: "general", pinned: false },
			{ subject: "rita", name: "Rita" },
		);
		expect((await rita.updateNote("psizone", mine.id, { body: "A Ritei, schimbată" })).body).toBe(
			"A Ritei, schimbată",
		);
	});

	it("a note with nothing to change is refused", async () => {
		const port = await as("olga");
		const made = await port.addNote(
			"psizone",
			api.world.ids.c1,
			{ body: "x", category: "general", pinned: false },
			OLGA,
		);
		expect((await refusal(() => port.updateNote("psizone", made.id, {}))).code).toBe("invalid");
	});
});

describe("records through the adapter", () => {
	const template = SEED_FORM_TEMPLATES[0];
	if (template === undefined) throw new Error("fixture");

	it("keeps a draft of a seeded form, lists it, opens it, changes it and deletes it", async () => {
		const port = await as("olga");
		const c = api.world.ids.c1;
		const made = await port.createRecord(
			"psizone",
			c,
			{ formKey: template.key, status: "draft", appointmentId: null, data: {} },
			OLGA,
		);
		expect(made).toMatchObject({ formKey: template.key, status: "draft", clientId: c, data: {} });
		expect((await port.records("psizone", c)).map((r) => r.id)).toContain(made.id);
		expect((await port.record("psizone", made.id))?.id).toBe(made.id);
		expect(await port.record("psizone", "nosuchrecord00")).toBeNull();
		const final = await port.updateRecord("psizone", made.id, { status: "draft", data: {} });
		expect(final.status).toBe("draft");
		await port.deleteRecord("psizone", made.id);
		expect((await port.records("psizone", c)).map((r) => r.id)).not.toContain(made.id);
	});

	it("refuses an answer its form does not have, final or draft, and a form that is not known; nothing is written", async () => {
		const port = await as("olga");
		const c = api.world.ids.c1;
		const before = await api.world.fingerprint();
		expect(
			(
				await refusal(() =>
					port.createRecord(
						"psizone",
						c,
						{ formKey: template.key, status: "final", appointmentId: null, data: { nope: "x" } },
						OLGA,
					),
				)
			).code,
		).toBe("invalid");
		expect(
			(
				await refusal(() =>
					port.createRecord(
						"psizone",
						c,
						{ formKey: template.key, status: "draft", appointmentId: null, data: { nope: "x" } },
						OLGA,
					),
				)
			).code,
		).toBe("invalid");
		expect(
			(
				await refusal(() =>
					port.createRecord(
						"psizone",
						c,
						{ formKey: "no-such-form", status: "draft", appointmentId: null, data: {} },
						OLGA,
					),
				)
			).code,
		).toBe("invalid");
		expect(await api.world.fingerprint()).toBe(before);
	});
});

describe("a client's own fields through the adapter", () => {
	it("changes the name, the phone and the note, and the page reads them back", async () => {
		const port = await as("olga");
		const c = api.world.ids.c2;
		const next = await port.updateClient("psizone", c, {
			name: "Client Doi Nou",
			phone: "0733 111 222",
			note: "Notă de pe fișă",
		});
		expect(next).toMatchObject({
			name: "Client Doi Nou",
			phone: "0733 111 222",
			note: "Notă de pe fișă",
		});
		expect((await port.client("psizone", c))?.name).toBe("Client Doi Nou");
	});

	it("empties the e-mail (the guardian can still be reached): the read shows none, the phone stays", async () => {
		const port = await as("olga");
		const c = api.world.ids.c1;
		const next = await port.updateClient("psizone", c, { email: null });
		expect(next.email).toBeNull();
		expect(next.phone).not.toBeNull();
		expect((await port.client("psizone", c))?.email).toBeNull();
	});

	it("an empty field that is already empty changes nothing: no change is journalled", async () => {
		const port = await as("olga");
		const c = api.world.ids.c1;
		await port.updateClient("psizone", c, { email: null });
		const changes = async () =>
			(
				(await api.world.call("olga", "GET", "/v1/apps/psizone/audit?action=client.update")).json
					.items as { target: { id: string } }[]
			).filter((e) => e.target.id === c).length;
		const before = await changes();
		const held = await port.client("psizone", c);
		await port.updateClient("psizone", c, { email: null });
		expect(await changes()).toBe(before);
		expect(await port.client("psizone", c)).toEqual(held);
	});

	it("refuses to leave a client with nothing to book with, as a conflict: nothing written", async () => {
		const port = await as("olga");
		const made = await port.createClient("psizone", {
			name: "Doar Telefon",
			phone: "0733 000 111",
			guardian: null,
		});
		const before = await api.world.fingerprint();
		const refused = await refusal(() => port.updateClient("psizone", made.id, { phone: null }));
		expect(refused.code).toBe("conflict");
		expect(refused.message).toBe("contact_required");
		expect(await api.world.fingerprint()).toBe(before);
		expect((await port.client("psizone", made.id))?.phone).toBe("0733 000 111");
	});

	it("an empty guardian removes the guardian while the client's own phone remains", async () => {
		const port = await as("olga");
		const c = api.world.ids.c2;
		expect((await port.client("psizone", c))?.guardian).not.toBeNull();
		const next = await port.updateClient("psizone", c, { guardian: null });
		expect(next.guardian).toBeNull();
		expect(next.phone).not.toBeNull();
	});
});

describe("a weekly series through the adapter", () => {
	let n = 0;
	const series = async (port: Awaited<ReturnType<typeof as>>, count = 4) => {
		// Each series on a stretch of its own (a series lasts a month): none meets another.
		const date = new Date(Date.UTC(2027, 3, 5) + ++n * 70 * 86_400_000).toISOString().slice(0, 10);
		const calendar = await port.calendar("psizone", date, date);
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		const service = calendar.services[0];
		if (!dora || !service) throw new Error("fixture");
		return port.createAppointments("psizone", {
			date,
			startMin: 600,
			columnId: dora.id,
			clientId: api.world.ids.c1,
			serviceId: service.id,
			recurrence: { count },
		});
	};

	it("changes this one and the following, not the ones before", async () => {
		const port = await as("olga");
		const made = await series(port);
		const third = made[2];
		if (third === undefined) throw new Error("fixture");
		const changed = await port.updateSeries(
			"psizone",
			third.id,
			{ note: "de acum încolo", remind: false },
			"following",
		);
		expect(changed.map((a) => a.note)).toEqual(
			expect.arrayContaining(["de acum încolo", "de acum încolo"]),
		);
		const after = await Promise.all(made.map((a) => port.appointment("psizone", a.id)));
		expect(after.map((a) => a?.note)).toEqual(["", "", "de acum încolo", "de acum încolo"]);
		expect(after.map((a) => a?.remind)).toEqual([true, true, false, false]);
	});

	it("changes the time of day of the whole series, in the clinic's wall clock", async () => {
		const port = await as("olga");
		const made = await series(port, 3);
		const first = made[0];
		if (first === undefined) throw new Error("fixture");
		const out = await port.updateSeries("psizone", first.id, { startMin: 12 * 60 }, "all");
		expect(out.map((a) => a.startMin)).toEqual([720, 720, 720]);
		expect(out.map((a) => a.date)).toEqual(made.map((a) => a.date));
	});

	it("refuses the whole change when one week is taken, and no week changes", async () => {
		const port = await as("olga");
		const made = await series(port, 3);
		const [first, second] = made;
		if (first === undefined || second === undefined) throw new Error("fixture");
		const calendar = await port.calendar("psizone", second.date, second.date);
		const dora = calendar.columns.find((c) => c.name === "Dora Test");
		if (!dora) throw new Error("fixture");
		await port.createAppointments("psizone", {
			date: second.date,
			startMin: 720,
			columnId: dora.id,
			clientId: api.world.ids.c2,
			serviceId: first.serviceId,
		});
		const before = await api.world.fingerprint();
		expect(
			(await refusal(() => port.updateSeries("psizone", first.id, { startMin: 720 }, "all"))).code,
		).toBe("conflict");
		expect(await api.world.fingerprint()).toBe(before);
	});

	it("cancels the following, then the rest, with the reason; a cancelled week frees its time", async () => {
		const port = await as("olga");
		const made = await series(port);
		const second = made[1];
		if (second === undefined) throw new Error("fixture");
		const out = await port.cancelSeries("psizone", second.id, "client plecat", "following");
		expect(out.filter((a) => a.status === "cancelled")).toHaveLength(3);
		const states = await Promise.all(made.map((a) => port.appointment("psizone", a.id)));
		expect(states.map((a) => a?.status)).toEqual([
			"confirmed",
			"cancelled",
			"cancelled",
			"cancelled",
		]);
		expect(states[1]?.cancelReason).toBe("client plecat");
	});

	it("an appointment in no series is not a series: refused, nothing written", async () => {
		const port = await as("olga");
		const before = await api.world.fingerprint();
		expect(
			(await refusal(() => port.cancelSeries("psizone", api.world.ids.a1, "x y", "all"))).code,
		).toBe("invalid");
		expect(
			(await refusal(() => port.updateSeries("psizone", api.world.ids.a1, { note: "x" }, "all")))
				.code,
		).toBe("invalid");
		expect(await api.world.fingerprint()).toBe(before);
	});
});
