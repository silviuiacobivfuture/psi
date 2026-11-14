import { ClientNote, NOTE_CATEGORIES, NOTE_MAX_CHARS } from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { ok, type Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };
const List = z.object({ items: z.array(ClientNote) });
const SECRET = "synthetic-clinical-sentence-7731";

describe.each(factories)("notes about a client, on the $name store", (factory) => {
	let w: Populated;
	const as = (who: string | null, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);
	/** A call that must be refused: the status and code, and NOTHING moved anywhere. */
	async function refused(run: () => Promise<Reply>, status: number, code: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const write = async (who: string, over: Record<string, unknown> = {}, client = w.ids.c1) =>
		ClientNote.parse(
			ok(
				await as(who, "POST", `/clients/${client}/notes`, {
					category: "general",
					text: "a note",
					...over,
				}),
				"note",
			),
		);
	const listed = async (who: string, client = w.ids.c1) =>
		List.parse((await as(who, "GET", `/clients/${client}/notes`)).json).items;
	const texts = async (who: string, client = w.ids.c1): Promise<string[]> =>
		(await listed(who, client)).map((n) => n.text);

	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	describe("writing", () => {
		it("takes every category; the answer is the note, with its author, unpinned unless asked", async () => {
			for (const category of NOTE_CATEGORIES) {
				const n = await write("olga", { category, text: `  about ${category}  ` });
				expect(n).toMatchObject({
					category,
					text: `about ${category}`,
					pinned: false,
					authorSubject: "olga",
					clientId: w.ids.c1,
				});
			}
			expect((await write("olga", { pinned: true })).pinned).toBe(true);
		});

		it("keeps a clinical note as ciphertext: the store never holds its words, the caller reads them back", async () => {
			const n = await write("olga", { category: "clinic", text: SECRET });
			const held = await w.store.c.notes.get("psizone", n.id);
			expect(held?.sealed).toBeTypeOf("string");
			expect(held?.text).toBeUndefined();
			expect(await w.dump()).not.toContain(SECRET);
			expect((await listed("olga")).find((x) => x.id === n.id)?.text).toBe(SECRET);
		});

		it("holds the length: 5000 characters are kept, 5001 are refused", async () => {
			expect((await write("olga", { text: "x".repeat(NOTE_MAX_CHARS) })).text).toHaveLength(
				NOTE_MAX_CHARS,
			);
			await refused(
				() =>
					as("olga", "POST", `/clients/${w.ids.c1}/notes`, {
						category: "general",
						text: "x".repeat(NOTE_MAX_CHARS + 1),
					}),
				400,
				"invalid",
			);
		});

		it.each([
			["a blank text", { text: "   " }],
			["no text", { text: undefined }],
			["a category that is not one", { category: "secret" }],
			["a text that is not text", { text: 12 }],
			["a pin that is not yes or no", { pinned: "yes" }],
		])("refuses %s, and writes nothing", async (_what, over) => {
			await refused(
				() =>
					as("olga", "POST", `/clients/${w.ids.c1}/notes`, {
						category: "general",
						text: "ok",
						...over,
					}),
				400,
				"invalid",
			);
		});

		it("refuses a client that is not there, one the caller may not see, and a role with no notes key; nothing is written", async () => {
			await refused(
				() => as("olga", "POST", "/clients/nosuchclient0/notes", { text: "x" }),
				404,
				"not_found",
			);
			// A therapist sees the clients they treat: client two is another therapist's.
			await refused(
				() => as("dora", "POST", `/clients/${w.ids.c2}/notes`, { text: "x" }),
				404,
				"not_found",
			);
			await refused(
				() => as("vera", "POST", `/clients/${w.ids.c1}/notes`, { text: "x" }),
				403,
				"forbidden",
			);
			await refused(
				() => as(null, "POST", `/clients/${w.ids.c1}/notes`, { text: "x" }),
				401,
				"unauthenticated",
			);
		});

		it("a clinical note needs the clinical group: reception is refused, whole", async () => {
			const r = await refused(
				() =>
					as("rita", "POST", `/clients/${w.ids.c1}/notes`, { category: "clinic", text: SECRET }),
				403,
				"forbidden",
			);
			expect(err(r).detail).toMatchObject({ group: "clinical" });
			expect((await write("dora", { category: "clinic", text: SECRET })).category).toBe("clinic");
		});

		it("pinning at the moment of writing needs the pin key", async () => {
			await as("olga", "PUT", "/members/nopin", {
				displayName: "No pin",
				roles: [],
				coordinates: [],
			});
			await as("olga", "PUT", "/members/nopin/overrides", {
				grant: ["notes_view_all", "notes_create_all", "clients_view_all"],
				deny: [],
			});
			await refused(
				() => as("nopin", "POST", `/clients/${w.ids.c1}/notes`, { text: "pinned?", pinned: true }),
				403,
				"forbidden",
			);
			expect((await write("nopin", { text: "unpinned" })).pinned).toBe(false);
		});
	});

	describe("reading", () => {
		it("lists pinned notes first, the latest pin first, then the rest newest first", async () => {
			const c = await write("olga", { text: "ord-first" }, w.ids.c2);
			w.clock.now += 1_000;
			const second = await write("olga", { text: "ord-second" }, w.ids.c2);
			w.clock.now += 1_000;
			const third = await write("olga", { text: "ord-third" }, w.ids.c2);
			expect(await texts("olga", w.ids.c2)).toEqual(
				expect.arrayContaining(["ord-third", "ord-second", "ord-first"]),
			);
			const order = (await listed("olga", w.ids.c2)).map((n) => n.id);
			expect(order.indexOf(third.id)).toBeLessThan(order.indexOf(second.id));
			expect(order.indexOf(second.id)).toBeLessThan(order.indexOf(c.id));
			w.clock.now += 1_000;
			await as("olga", "POST", `/notes/${c.id}/pin`, { pinned: true });
			expect((await listed("olga", w.ids.c2))[0]?.id).toBe(c.id);
			w.clock.now += 1_000;
			await as("olga", "POST", `/notes/${second.id}/pin`, { pinned: true });
			expect((await listed("olga", w.ids.c2)).slice(0, 2).map((n) => n.id)).toEqual([
				second.id,
				c.id,
			]);
		});

		it("shows a clinical note only to a caller with the clinical group, and audits the clinical read", async () => {
			const n = await write("olga", { category: "clinic", text: `${SECRET}-list` });
			expect(await texts("rita")).not.toContain(`${SECRET}-list`);
			expect((await listed("rita")).some((x) => x.id === n.id)).toBe(false);
			expect(await texts("dora")).toContain(`${SECRET}-list`);
			expect(await texts("cora")).toContain(`${SECRET}-list`);
			const trail = (await as("olga", "GET", "/audit?action=clinical.read")).json.items as {
				actor: { subject: string };
			}[];
			expect(trail.some((e) => e.actor.subject === "dora")).toBe(true);
			expect(trail.some((e) => e.actor.subject === "rita")).toBe(false);
		});

		it("is not there for a role with no key, and not for a client the caller may not see", async () => {
			await refused(() => as("vera", "GET", `/clients/${w.ids.c1}/notes`), 403, "forbidden");
			expect(await listed("dora", w.ids.c2)).toEqual([]);
			await refused(() => as("olga", "GET", "/clients/nosuchclient0/notes"), 404, "not_found");
		});
	});

	describe("changing, pinning and deleting: one's own, unless the key is held for all", () => {
		it("reception edits, pins and deletes the notes it wrote", async () => {
			const n = await write("rita", { text: "rita's" });
			expect(
				(await as("rita", "PATCH", `/notes/${n.id}`, { text: "rita's, edited" })).json,
			).toMatchObject({
				text: "rita's, edited",
				authorSubject: "rita",
			});
			expect((await as("rita", "POST", `/notes/${n.id}/pin`, { pinned: true })).json).toMatchObject(
				{ pinned: true },
			);
			expect((await as("rita", "DELETE", `/notes/${n.id}`)).status).toBe(200);
			expect((await listed("olga")).some((x) => x.id === n.id)).toBe(false);
		});

		it("reception cannot edit or delete another's note: refused, and the note is as it was; it may pin (the key is held for all)", async () => {
			const n = await write("olga", { text: "olga's" });
			await refused(
				() => as("rita", "PATCH", `/notes/${n.id}`, { text: "taken over" }),
				403,
				"forbidden",
			);
			await refused(() => as("rita", "DELETE", `/notes/${n.id}`), 403, "forbidden");
			expect((await listed("olga")).find((x) => x.id === n.id)).toMatchObject({
				text: "olga's",
				authorSubject: "olga",
			});
			expect((await as("rita", "POST", `/notes/${n.id}/pin`, { pinned: true })).json).toMatchObject(
				{ pinned: true },
			);
		});

		it("a therapist pins only the notes they wrote: the pin key is held for own", async () => {
			const others = await write("olga", { text: "olga's, not for dora to pin" });
			await refused(
				() => as("dora", "POST", `/notes/${others.id}/pin`, { pinned: true }),
				403,
				"forbidden",
			);
			const mine = await write("dora", { text: "dora's to pin" });
			expect(
				(await as("dora", "POST", `/notes/${mine.id}/pin`, { pinned: true })).json,
			).toMatchObject({ pinned: true });
		});

		it("the owner holds the keys for all: they change and delete anyone's", async () => {
			const n = await write("rita", { text: "rita's again" });
			expect(
				(await as("olga", "PATCH", `/notes/${n.id}`, { text: "edited by the owner" })).status,
			).toBe(200);
			expect((await as("olga", "DELETE", `/notes/${n.id}`)).status).toBe(200);
		});

		it("a therapist changes only their own notes, even on the client they treat", async () => {
			const mine = await write("dora", { text: "dora's" });
			const others = await write("olga", { text: "olga's for dora to see" });
			expect(
				(await as("dora", "PATCH", `/notes/${mine.id}`, { text: "dora's, edited" })).status,
			).toBe(200);
			await refused(
				() => as("dora", "PATCH", `/notes/${others.id}`, { text: "no" }),
				403,
				"forbidden",
			);
		});

		it("refuses a note that is not there, and one on a client the caller may not see, and writes nothing", async () => {
			await refused(
				() => as("olga", "PATCH", "/notes/nosuchnote0", { text: "x" }),
				404,
				"not_found",
			);
			const elsewhere = await write("olga", { text: "client two's" }, w.ids.c2);
			await refused(
				() => as("dora", "PATCH", `/notes/${elsewhere.id}`, { text: "x" }),
				404,
				"not_found",
			);
			await refused(() => as("dora", "DELETE", `/notes/${elsewhere.id}`), 404, "not_found");
			await refused(() => as(null, "DELETE", `/notes/${elsewhere.id}`), 401, "unauthenticated");
		});

		it("a note does not cross the clinical line: either way is refused, and clinical text is sealed again when changed", async () => {
			const plain = await write("olga", { text: "plain" });
			const clinic = await write("olga", { category: "clinic", text: `${SECRET}-a` });
			await refused(
				() => as("olga", "PATCH", `/notes/${plain.id}`, { category: "clinic" }),
				400,
				"invalid",
			);
			await refused(
				() => as("olga", "PATCH", `/notes/${clinic.id}`, { category: "general" }),
				400,
				"invalid",
			);
			expect(
				(await as("olga", "PATCH", `/notes/${plain.id}`, { category: "plata" })).json,
			).toMatchObject({ category: "plata" });
			const before = (await w.store.c.notes.get("psizone", clinic.id))?.sealed;
			const r = await as("olga", "PATCH", `/notes/${clinic.id}`, { text: `${SECRET}-b` });
			expect(r.json).toMatchObject({ text: `${SECRET}-b`, category: "clinic" });
			expect((await w.store.c.notes.get("psizone", clinic.id))?.sealed).not.toBe(before);
			expect(await w.dump()).not.toContain(`${SECRET}-b`);
		});

		it("a clinical note is changed, pinned and deleted only with the clinical group of that key", async () => {
			const clinic = await write("olga", { category: "clinic", text: `${SECRET}-c` });
			// Reception cannot even see it.
			await refused(
				() => as("rita", "PATCH", `/notes/${clinic.id}`, { text: "x" }),
				404,
				"not_found",
			);
			await refused(() => as("rita", "DELETE", `/notes/${clinic.id}`), 404, "not_found");
		});

		it("audits what was written, changed and removed, by who", async () => {
			const n = await write("rita", { text: "audited" });
			await as("rita", "PATCH", `/notes/${n.id}`, { text: "audited, edited" });
			await as("rita", "DELETE", `/notes/${n.id}`);
			const trail = (await as("olga", "GET", "/audit")).json.items as {
				target: { id: string };
				actor: { subject: string };
			}[];
			const mine = trail.filter((e) => e.target.id === n.id);
			expect(mine.length).toBeGreaterThanOrEqual(3);
			expect(mine.every((e) => e.actor.subject === "rita")).toBe(true);
			expect(JSON.stringify(trail)).not.toContain("audited, edited");
		});
	});

	describe("the client's summary", () => {
		it("carries the pinned notes the caller may read, and a clinical one only with the clinical group", async () => {
			const client = String(
				ok(
					await as("olga", "POST", "/clients", { name: "Summary Client", treating: [w.ids.dora] }),
					"client",
				).id,
			);
			const plain = await write("olga", { text: "pinned plain", pinned: true }, client);
			const clinic = await write(
				"olga",
				{ category: "clinic", text: `${SECRET}-pinned`, pinned: true },
				client,
			);
			await write("olga", { text: "not pinned" }, client);
			const summary = async (who: string) =>
				(
					(await as(who, "GET", `/clients/${client}`)).json.pinnedNotes as {
						id: string;
						text: string;
					}[]
				).map((n) => n.id);
			expect(await summary("olga")).toEqual(expect.arrayContaining([plain.id, clinic.id]));
			expect(await summary("olga")).toHaveLength(2);
			expect(await summary("dora")).toEqual(expect.arrayContaining([plain.id, clinic.id]));
			expect(await summary("rita")).toEqual([plain.id]);
			// A role with no notes key has no summary of notes at all: the field is absent, not empty.
			expect((await as("ana", "GET", `/clients/${client}`)).json.pinnedNotes).toBeUndefined();
			expect(JSON.stringify((await as("rita", "GET", `/clients/${client}`)).json)).not.toContain(
				SECRET,
			);
		});

		it("only a single read carries them: a list of clients does not", async () => {
			const r = await as("olga", "GET", "/clients");
			for (const c of (r.json.items as Record<string, unknown>[]) ?? [])
				expect(c.pinnedNotes).toBeUndefined();
		});

		it("a note let go of leaves the summary", async () => {
			const n = await write("olga", { text: "briefly pinned", pinned: true });
			expect(
				(
					(await as("olga", "GET", `/clients/${w.ids.c1}`)).json.pinnedNotes as { id: string }[]
				).map((x) => x.id),
			).toContain(n.id);
			await as("olga", "POST", `/notes/${n.id}/pin`, { pinned: false });
			expect(
				(
					(await as("olga", "GET", `/clients/${w.ids.c1}`)).json.pinnedNotes as { id: string }[]
				).map((x) => x.id),
			).not.toContain(n.id);
		});
	});
});
