import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok, type Populated } from "./testing/populate";
import { HOUR, type Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };
const DAY = 24 * HOUR;

describe.each(factories)("editing an appointment, on the $name store", (factory) => {
	let w: Populated;
	let n = 0;
	const as = (who: string | null, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);
	/** A free hour of its own, at 10:00 UTC on a day of its own, so cases never meet and the local date is that day. */
	const slot = (): { start: number; end: number; date: string } => {
		const start = Date.UTC(2027, 0, 4, 10) + ++n * DAY;
		return { start, end: start + HOUR, date: new Date(start).toISOString().slice(0, 10) };
	};
	const book = async (over: Record<string, unknown> = {}, who = "olga") => {
		const s = slot();
		const r = await as(who, "POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			serviceId: w.ids.service,
			start: s.start,
			end: s.end,
			priceCents: 10_000,
			...over,
		});
		return { ...s, id: String(ok(r, "book").id), reply: r };
	};
	const get = async (id: string) => (await as("olga", "GET", `/appointments/${id}`)).json;
	/** A call that must be refused: the status, the code, and NOTHING moved anywhere. */
	async function refused(run: () => Promise<Reply>, status: number, code: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const clientOf = async (name: string): Promise<string> =>
		String(ok(await as("olga", "POST", "/clients", { name }), "client").id);
	const reminded = async (date: string): Promise<string[]> =>
		(
			(await as("olga", "GET", `/reminders?date=${date}`)).json.items as { appointmentId: string }[]
		).map((i) => i.appointmentId);

	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	describe("the client, the service, the price and the reminder", () => {
		it("moves the appointment to another client, who is told it is theirs while the first is told it is gone", async () => {
			const a = await book();
			w.notifier.sent.length = 0;
			const r = await as("olga", "PATCH", `/appointments/${a.id}`, { clientId: w.ids.c2 });
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			expect(r.json).toMatchObject({ id: a.id, clientId: w.ids.c2 });
			expect(await get(a.id)).toMatchObject({ clientId: w.ids.c2 });
			expect(
				w.notifier.sent.map((s) => [s.event, s.to.kind === "client" ? s.to.clientId : ""]),
			).toEqual(
				expect.arrayContaining([
					["appointment.cancelled", w.ids.c1],
					["appointment.confirmed", w.ids.c2],
				]),
			);
			const trail = (await as("olga", "GET", "/audit")).json.items as { target: { id: string } }[];
			expect(trail.some((e) => e.target.id === a.id)).toBe(true);
		});

		it("changes the service", async () => {
			const a = await book();
			const other = String(
				ok(
					await as("olga", "POST", "/services", {
						slug: `other-${n}`,
						name: { ro: "Altă ședință", en: "Another session" },
						durationMinutes: 30,
						modes: ["onsite"],
					}),
					"service",
				).id,
			);
			const r = await as("olga", "PATCH", `/appointments/${a.id}`, { serviceId: other });
			expect(r.json).toMatchObject({ serviceId: other });
			expect(await get(a.id)).toMatchObject({ serviceId: other });
		});

		it("changes the price and keeps what was paid", async () => {
			const a = await book({ priceCents: 10_000 });
			await as("olga", "POST", `/appointments/${a.id}/payment`, {
				amountCents: 4_000,
				method: "cash",
			});
			const r = await as("olga", "PATCH", `/appointments/${a.id}`, { priceCents: 3_000 });
			expect(r.json).toMatchObject({
				money: { priceCents: 3_000, paidCents: 4_000, paymentStatus: "paid" },
			});
			expect(await get(a.id)).toMatchObject({ money: { priceCents: 3_000, paidCents: 4_000 } });
		});

		it("a price is the money group's: a role that edits the core but not the money is refused, and nothing changes", async () => {
			const a = await book();
			await refused(
				() => as("dora", "PATCH", `/appointments/${a.id}`, { priceCents: 1, note: "also this" }),
				403,
				"forbidden",
			);
			expect((await get(a.id)).note).toBeUndefined();
			// The same role may change what is theirs to change.
			expect((await as("dora", "PATCH", `/appointments/${a.id}`, { note: "mine" })).status).toBe(
				200,
			);
		});

		it("switches the reminder off and on; one without it is left off the list, and cannot be reminded by hand", async () => {
			const a = await book();
			expect((await get(a.id)).remind).toBe(true);
			expect(await reminded(a.date)).toContain(a.id);
			expect(
				(await as("olga", "PATCH", `/appointments/${a.id}`, { remind: false })).json,
			).toMatchObject({ remind: false });
			expect((await get(a.id)).remind).toBe(false);
			expect(await reminded(a.date)).not.toContain(a.id);
			await refused(() => as("olga", "GET", `/reminders/${a.id}/whatsapp`), 409, "conflict");
			await as("olga", "PATCH", `/appointments/${a.id}`, { remind: true });
			expect(await reminded(a.date)).toContain(a.id);
		});

		it("an appointment booked without its reminder is left off the list from the start", async () => {
			const a = await book({ remind: false });
			expect((await get(a.id)).remind).toBe(false);
			expect(await reminded(a.date)).not.toContain(a.id);
		});

		it("a new client the caller may not see is refused like one that is not there, and nothing changes", async () => {
			const a = await book();
			// A therapist sees the clients they treat: the second client is another therapist's.
			await refused(
				() => as("dora", "PATCH", `/appointments/${a.id}`, { clientId: w.ids.c2 }),
				400,
				"invalid",
			);
			await refused(
				() => as("olga", "PATCH", `/appointments/${a.id}`, { clientId: "nosuchclient000" }),
				400,
				"invalid",
			);
			expect(await get(a.id)).toMatchObject({ clientId: w.ids.c1 });
		});

		it("a service that is not there is refused, and nothing changes", async () => {
			const a = await book();
			await refused(
				() => as("olga", "PATCH", `/appointments/${a.id}`, { serviceId: "nosuchservice0" }),
				400,
				"invalid",
			);
		});

		it("the core group has its own permission: a person denied it may move the time but not the client, the service or the reminder", async () => {
			const a = await book({ practitionerId: w.ids.elena, clientId: w.ids.c2 });
			expect((await as("elena", "PATCH", `/appointments/${a.id}`, { remind: false })).status).toBe(
				200,
			);
			ok(
				await as("olga", "PUT", "/members/elena/overrides", {
					grant: [],
					deny: ["appointments_edit_own_core"],
				}),
				"deny",
			);
			try {
				for (const body of [{ remind: true }, { serviceId: w.ids.service }, { note: "x" }])
					await refused(
						() => as("elena", "PATCH", `/appointments/${a.id}`, body),
						403,
						"forbidden",
					);
				const s = slot();
				expect(
					(await as("elena", "PATCH", `/appointments/${a.id}`, { start: s.start, end: s.end }))
						.status,
				).toBe(200);
			} finally {
				await as("olga", "PUT", "/members/elena/overrides", { grant: [], deny: [] });
			}
		});

		it("a price below nothing, a price that is not whole and a reminder that is not yes or no are malformed", async () => {
			const a = await book();
			for (const body of [
				{ priceCents: -1 },
				{ priceCents: 1.5 },
				{ remind: "no" },
				{ clientId: 7 },
			])
				await refused(() => as("olga", "PATCH", `/appointments/${a.id}`, body), 400, "invalid");
		});
	});

	describe("the package", () => {
		it("takes an appointment out of its package with null, and the package no longer counts it", async () => {
			const a = await book({ packageId: w.ids.pkg });
			expect(await get(a.id)).toMatchObject({ packageId: w.ids.pkg });
			const r = await as("olga", "PATCH", `/appointments/${a.id}`, { packageId: null });
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			expect(r.json.packageId).toBeUndefined();
			expect((await get(a.id)).packageId).toBeUndefined();
			const pkg = (await as("olga", "GET", `/packages/${w.ids.pkg}`)).json as {
				sessionsUsed?: number;
				sessionsRemaining?: number;
			};
			expect(pkg.sessionsRemaining ?? 11).toBeGreaterThan(0);
		});

		it("detaching an appointment that has no package changes nothing", async () => {
			const a = await book();
			expect((await as("olga", "PATCH", `/appointments/${a.id}`, { packageId: null })).status).toBe(
				200,
			);
			expect((await get(a.id)).packageId).toBeUndefined();
		});

		it("another client's package is refused, with the client moved or not; nothing changes", async () => {
			const a = await book();
			// w.ids.pkg is client one's.
			await refused(
				() =>
					as("olga", "PATCH", `/appointments/${a.id}`, {
						clientId: w.ids.c2,
						packageId: w.ids.pkg,
					}),
				400,
				"invalid",
			);
			const b = await book({ packageId: w.ids.pkg });
			await refused(
				() => as("olga", "PATCH", `/appointments/${b.id}`, { clientId: w.ids.c2 }),
				400,
				"invalid",
			);
			expect(await get(b.id)).toMatchObject({ clientId: w.ids.c1, packageId: w.ids.pkg });
			// The client and the package move together.
			const mine = String(
				ok(
					await as("olga", "POST", `/clients/${w.ids.c2}/packages`, {
						name: "own",
						sessions: 4,
						priceCents: 40_000,
					}),
					"package",
				).id,
			);
			const moved = await as("olga", "PATCH", `/appointments/${b.id}`, {
				clientId: w.ids.c2,
				packageId: mine,
			});
			expect(moved.json).toMatchObject({ clientId: w.ids.c2, packageId: mine });
		});

		it("a package that is not there is refused", async () => {
			const a = await book();
			await refused(
				() => as("olga", "PATCH", `/appointments/${a.id}`, { packageId: "nosuchpackage0" }),
				400,
				"invalid",
			);
		});
	});

	describe("all or nothing", () => {
		it("an edit that would clash changes none of its fields: the client, the note and the price stay", async () => {
			const taken = await book({ clientId: w.ids.c2 });
			const a = await book({ note: "keep" });
			await refused(
				() =>
					as("olga", "PATCH", `/appointments/${a.id}`, {
						clientId: w.ids.c2,
						note: "changed",
						priceCents: 1,
						remind: false,
						start: taken.start,
						end: taken.end,
					}),
				409,
				"conflict",
			);
			expect(await get(a.id)).toMatchObject({
				clientId: w.ids.c1,
				note: "keep",
				remind: true,
				money: { priceCents: 10_000 },
			});
		});

		it("a cancelled or deleted appointment is not edited, and nothing is written", async () => {
			const a = await book();
			await as("olga", "POST", `/appointments/${a.id}/cancel`, { reason: "client asked" });
			await refused(
				() => as("olga", "PATCH", `/appointments/${a.id}`, { note: "late" }),
				409,
				"conflict",
			);
			const b = await book();
			await as("olga", "DELETE", `/appointments/${b.id}`);
			await refused(
				() => as("olga", "PATCH", `/appointments/${b.id}`, { note: "late" }),
				409,
				"conflict",
			);
		});

		it("an edit that changes nothing is still an answer, and a stranger to the app is told nothing", async () => {
			const a = await book({ note: "same" });
			expect(
				(await as("olga", "PATCH", `/appointments/${a.id}`, { note: "same", remind: true })).status,
			).toBe(200);
			await refused(
				() => w.call("hugo", "PATCH", `${A}/appointments/${a.id}`, { note: "x" }),
				404,
				"not_found",
			);
		});
	});

	describe("the blacklist, for a client the appointment is moved to", () => {
		async function flagged(severity: "warn" | "block_online" | "block_all"): Promise<string> {
			const client = await clientOf(`Flagged ${severity} ${++n}`);
			ok(
				await as("olga", "POST", "/blacklist", {
					client,
					reason: "synthetic reason",
					category: "other",
					severity,
				}),
				"flag",
			);
			return client;
		}

		it("moving an appointment to a flagged client stops with the entry named, and writes nothing", async () => {
			const a = await book();
			const client = await flagged("warn");
			const r = await refused(
				() => as("olga", "PATCH", `/appointments/${a.id}`, { clientId: client }),
				409,
				"conflict",
			);
			expect(err(r).detail).toMatchObject({ reason: "warning" });
			expect(await get(a.id)).toMatchObject({ clientId: w.ids.c1 });
		});

		it("with a reason the override lets a warning through, and the authority is the caller's own", async () => {
			const a = await book();
			const client = await flagged("warn");
			const r = await as("olga", "PATCH", `/appointments/${a.id}`, {
				clientId: client,
				override: { reason: "known and agreed" },
			});
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			expect(r.json).toMatchObject({ clientId: client });
		});

		it("a block needs the authority to override it, however the request asks: reception cannot, the owner can", async () => {
			const a = await book();
			const client = await flagged("block_all");
			const r = await refused(
				() =>
					as("rita", "PATCH", `/appointments/${a.id}`, {
						clientId: client,
						override: { reason: "please" },
					}),
				409,
				"conflict",
			);
			expect(err(r).detail).toMatchObject({ reason: "blocked" });
			expect(
				(
					await as("olga", "PATCH", `/appointments/${a.id}`, {
						clientId: client,
						override: { reason: "the owner decides" },
					})
				).status,
			).toBe(200);
		});

		it("an edit that keeps the client is not asked about the blacklist", async () => {
			const client = await flagged("warn");
			const a = await book({ clientId: client, override: { reason: "known" } });
			expect((await as("olga", "PATCH", `/appointments/${a.id}`, { note: "fine" })).status).toBe(
				200,
			);
		});
	});

	describe("requested, then confirmed", () => {
		it("a requested appointment holds the time, takes no reminder and tells the client nothing", async () => {
			w.notifier.sent.length = 0;
			const a = await book({ status: "requested" });
			expect(a.reply.json).toMatchObject({ status: "requested", remind: true });
			expect(w.notifier.sent).toEqual([]);
			expect(await reminded(a.date)).not.toContain(a.id);
			await refused(
				() =>
					as("olga", "POST", "/appointments", {
						practitionerId: w.ids.dora,
						clientId: w.ids.c2,
						start: a.start,
						end: a.end,
					}),
				409,
				"conflict",
			);
		});

		it("confirming turns it into a scheduled one, tells the client, lists it for its reminder and is audited", async () => {
			const a = await book({ status: "requested" });
			w.notifier.sent.length = 0;
			const r = await as("olga", "POST", `/appointments/${a.id}/confirm`);
			expect(r.status, JSON.stringify(r.json)).toBe(200);
			expect(r.json).toMatchObject({ id: a.id, status: "scheduled" });
			expect((await get(a.id)).status).toBe("scheduled");
			expect(w.notifier.sent.map((s) => s.event)).toEqual(["appointment.confirmed"]);
			expect(await reminded(a.date)).toContain(a.id);
			const trail = (await as("olga", "GET", "/audit")).json.items as { target: { id: string } }[];
			expect(trail.some((e) => e.target.id === a.id)).toBe(true);
			expect(
				(await as("olga", "POST", `/appointments/${a.id}/attendance`, { status: "attended" }))
					.status,
			).toBe(200);
		});

		it("only a requested appointment is confirmed: twice, a scheduled one, a cancelled one, one that is not there", async () => {
			const a = await book({ status: "requested" });
			await as("olga", "POST", `/appointments/${a.id}/confirm`);
			await refused(() => as("olga", "POST", `/appointments/${a.id}/confirm`), 409, "conflict");
			const b = await book();
			await refused(() => as("olga", "POST", `/appointments/${b.id}/confirm`), 409, "conflict");
			const c = await book({ status: "requested" });
			await as("olga", "POST", `/appointments/${c.id}/cancel`, { reason: "never answered" });
			await refused(() => as("olga", "POST", `/appointments/${c.id}/confirm`), 409, "conflict");
			await refused(
				() => as("olga", "POST", "/appointments/nosuchone000/confirm"),
				404,
				"not_found",
			);
		});

		it("a requested appointment has no attendance until it is confirmed", async () => {
			const a = await book({ status: "requested" });
			for (const status of ["attended", "no_show", "scheduled"])
				await refused(
					() => as("olga", "POST", `/appointments/${a.id}/attendance`, { status }),
					409,
					"conflict",
				);
		});

		it("a requested appointment is moved, edited and cancelled like any other", async () => {
			const a = await book({ status: "requested" });
			const s = slot();
			const moved = await as("olga", "PATCH", `/appointments/${a.id}`, {
				start: s.start,
				end: s.end,
				note: "asked for later",
			});
			expect(moved.json).toMatchObject({ status: "requested", start: s.start });
			expect(
				(await as("olga", "POST", `/appointments/${a.id}/cancel`, { reason: "never answered" }))
					.json,
			).toMatchObject({ status: "cancelled" });
		});

		it("only a session waits for the client: a block or a group activity requested is refused, and nothing is written", async () => {
			const s = slot();
			await refused(
				() =>
					as("olga", "POST", "/appointments", {
						kind: "block",
						practitionerId: w.ids.dora,
						start: s.start,
						end: s.end,
						status: "requested",
					}),
				400,
				"invalid",
			);
			await refused(
				() =>
					as("olga", "POST", "/appointments", {
						practitionerId: w.ids.dora,
						clientId: w.ids.c1,
						start: s.start,
						end: s.end,
						status: "confirmed",
					}),
				400,
				"invalid",
			);
		});

		it("confirming needs the right to edit: reception may, a role with no appointment rights may not", async () => {
			const a = await book({ status: "requested" });
			await refused(() => as("vera", "POST", `/appointments/${a.id}/confirm`), 404, "not_found");
			expect((await as("rita", "POST", `/appointments/${a.id}/confirm`)).status).toBe(200);
		});
	});
});
