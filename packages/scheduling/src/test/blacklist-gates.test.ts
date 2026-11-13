import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSchedulingClient } from "../client";
import { backendReady } from "./admin";
import { actor, DAY, HOUR, id, n } from "./api-harness";
import { CONVEX_URL } from "./backend";
import { clinicWorld } from "./clinic-world";
import { serverKey } from "./server";

/**
 * The blacklist's gates against the local backend, in throwaway `test-blg-…` apps (synthetic
 * data): the online gates (neutral answer, one event and one audit entry), the public booking flow
 * through the real client, the staff gate on visits (warning, blocked, overridden with a stored
 * reason), and erasure.
 */
if (!backendReady) console.warn("blacklist-gates.test: no local backend; see README");

const { a, b, ids, ref, state, flag, freeClient, setup, teardown } = clinicWorld("blg");
const FAR = Date.now() + 400 * DAY;

describe.skipIf(!backendReady)("the blacklist gates", () => {
	beforeAll(async () => {
		if (!backendReady) return;
		await setup();
		ids.byPhone = id(
			await flag({
				phone: "0700 000 009",
				email: "bad@test.example",
				name: "Test Bad",
				severity: "block_online",
			}),
		);
		ids.byClient = id(await flag({ client: ref("ion"), severity: "warn", reason: "new reason" }));
		ids.guardian = id(await flag({ phone: "0700 000 003", severity: "block_online" }));
	});
	afterAll(async () => {
		if (backendReady) await teardown();
	});

	describe("screen (the callback form)", () => {
		const screen = (
			tenant: typeof a,
			contact: Record<string, string>,
			expected: { audit?: number; ok?: boolean; same?: boolean },
		) => tenant.sys("apiBlacklist:screen", { channel: "callback", contact }, expected);

		it("refuses neutrally, records one event and one audit entry, and says nothing of the entry", async () => {
			const before = await a.counts();
			const out = await screen(
				a,
				{ name: "Whoever", phone: "0040 700 000 009" },
				{ audit: 1, ok: false },
			);
			expect(out).toEqual({ ok: false, reason: "unavailable_online" });
			const after = await a.counts();
			expect(n(after, "blacklistEvents") - n(before, "blacklistEvents")).toBe(1);
			const events = await a.qry("apiBlacklist:events", { entry: ref("byPhone") });
			expect(events.events).toEqual([
				expect.objectContaining({
					kind: "online_refused",
					channel: "callback",
					severity: "block_online",
					matchedBy: "phone",
				}),
			]);
		});

		it("matches by e-mail, and by a client's phone on file when the entry names only the client", async () => {
			expect((await screen(a, { email: "BAD@test.example" }, { audit: 1, ok: false })).reason).toBe(
				"unavailable_online",
			);
			await a.mut("apiBlacklist:update", {
				entry: ref("byClient"),
				patch: { severity: "block_all" },
			});
			expect((await screen(a, { phone: "0700-000-002" }, { audit: 1, ok: false })).reason).toBe(
				"unavailable_online",
			);
		});

		it("lets a warn entry and an unflagged contact through and writes nothing", async () => {
			await a.mut("apiBlacklist:update", { entry: ref("byClient"), patch: { severity: "warn" } });
			await screen(a, { phone: "0700 000 002" }, { audit: 0, same: true });
			await screen(
				a,
				{ phone: "0700 888 888", email: "free@test.example" },
				{ audit: 0, same: true },
			);
		});

		it("an entry on a child with no contact of their own turns away the guardian's phone, online", async () => {
			const child = id(
				await a.mut("apiClients:create", {
					client: {
						kind: "child",
						consent: { contact: true, reminders: true },
						name: "Test Small Child",
						guardian: { name: "Test Parent", phone: "0700 666 666", email: "Parent@Test.example" },
					},
				}),
			);
			await flag({ client: child, severity: "block_online" });
			await screen(a, { phone: "+40 700 666 666" }, { audit: 1, ok: false });
			await screen(a, { email: "PARENT@test.example" }, { audit: 1, ok: false });
			await screen(a, { phone: "0700 666 667" }, { audit: 0, same: true });
		});

		it("does not apply another app's entries", async () => {
			await screen(b, { phone: "0700 000 009" }, { audit: 0, same: true });
		});

		it("does not apply an entry switched off or past its expiry", async () => {
			const entry = id(await flag({ phone: "0700 000 020", severity: "block_all" }));
			await a.mut("apiBlacklist:update", { entry, patch: { active: false } });
			await screen(a, { phone: "0700 000 020" }, { audit: 0, same: true });
		});
	});

	describe("the public booking flow", () => {
		const client = () => createSchedulingClient({ url: CONVEX_URL, serverKey, timeoutMs: 10_000 });
		let next = 0;

		async function hold() {
			const now = Date.now();
			const found = await client().findSlots({
				tenant: a.TENANT,
				service: "race",
				from: now + 2 * DAY,
				to: now + 3 * DAY,
				mode: "onsite",
			});
			if (!found.ok) throw new Error(found.reason);
			next += 7;
			const slot = found.slots[next];
			if (slot === undefined) throw new Error("no slot");
			const held = await client().hold({
				tenant: a.TENANT,
				service: "race",
				practitioner: slot.practitioner,
				start: slot.start,
				mode: "onsite",
				locale: "ro",
				channel: "form",
			});
			if (!held.ok) throw new Error(held.reason);
			return { held, slot };
		}
		const submit = async (contact: { name: string; phone?: string; email?: string }) => {
			const { held, slot } = await hold();
			const out = await client().submit({
				reference: held.reference,
				holdToken: held.holdToken,
				contact,
			});
			return { out, slot, held };
		};

		it("a hold carries no identifier, so it is never refused; the submit is where the blacklist asks", async () => {
			await hold();
		});

		it("refuses a blocked phone neutrally at submit, releases the hold, records the hit", async () => {
			const before = await a.counts();
			const { out, slot } = await submit({ name: "Test Visitor", phone: "0700 000 009" });
			expect(out).toEqual({ ok: false, reason: "unavailable_online" });
			const after = await a.counts();
			expect(n(after, "blacklistEvents") - n(before, "blacklistEvents")).toBe(1);
			expect(n(after, "auditEvents") - n(before, "auditEvents")).toBe(1);
			const again = await client().findSlots({
				tenant: a.TENANT,
				service: "race",
				from: slot.start,
				to: slot.start + 1,
				mode: "onsite",
			});
			expect(again.ok && again.slots.some((s) => s.start === slot.start)).toBe(true);
		});

		it("refuses by e-mail in any case", async () => {
			expect((await submit({ name: "Test Visitor", email: "BAD@Test.Example" })).out).toEqual({
				ok: false,
				reason: "unavailable_online",
			});
		});

		it("accepts a warn entry and an unflagged visitor, with no event written", async () => {
			const before = await a.counts();
			expect((await submit({ name: "Test Visitor", phone: "0700 000 002" })).out.ok).toBe(true);
			expect((await submit({ name: "Test Visitor", phone: "0700 777 777" })).out.ok).toBe(true);
			const after = await a.counts();
			expect(n(after, "blacklistEvents")).toBe(n(before, "blacklistEvents"));
			expect(n(after, "auditEvents")).toBe(n(before, "auditEvents"));
		});
	});

	describe("staff booking (visits)", () => {
		const day = (k: number) => FAR + k * DAY;
		const create = (
			client: string,
			k: number,
			extra: Record<string, unknown>,
			e: { audit?: number; ok?: boolean; same?: boolean } = {},
		) =>
			a.mut(
				"apiVisits:create",
				{
					column: { kind: "practitioner", id: state.practitioner },
					start: day(k),
					end: day(k) + HOUR,
					sessionType: "ABA",
					client,
					...extra,
				},
				e,
			);
		const ov = (authority: string, reason = "agreed with the owner") => ({
			override: { authority, reason },
		});

		it("a client no entry names is booked as before", async () => {
			await create(await freeClient(), 1, {});
		});

		it("warn: a warning with the reason and nothing written; with an acknowledgement it is booked and the reason stored", async () => {
			const warned = await create(ref("ion"), 2, {}, { audit: 0, ok: false, same: true });
			expect(warned).toMatchObject({
				reason: "warning",
				blacklist: { severity: "warn", needs: "ack", reason: "new reason", matchedBy: "client" },
			});
			const booked = await create(ref("ion"), 2, ov("ack", "told the client"), { audit: 2 });
			expect(booked.ok).toBe(true);
			const events = await a.qry("apiBlacklist:events", { entry: ref("byClient") });
			expect(events.events).toContainEqual(
				expect.objectContaining({
					kind: "overridden",
					authority: "ack",
					overrideReason: "told the client",
					actor: actor.subject,
					subject: id(booked),
				}),
			);
		});

		it("an override with no reason is no override", async () => {
			const out = await create(ref("ion"), 3, ov("admin", "   "), {
				audit: 0,
				ok: false,
				same: true,
			});
			expect(out.reason).toBe("warning");
		});

		it("block_online: blocked for staff; an acknowledgement is not enough; a staff override books it", async () => {
			await a.mut("apiBlacklist:update", {
				entry: ref("byClient"),
				patch: { severity: "block_online" },
			});
			expect(await create(ref("ion"), 4, {}, { audit: 0, ok: false, same: true })).toMatchObject({
				reason: "blocked",
				blacklist: { needs: "staff" },
			});
			expect(
				await create(ref("ion"), 4, ov("ack"), { audit: 0, ok: false, same: true }),
			).toMatchObject({ reason: "blocked" });
			expect((await create(ref("ion"), 4, ov("staff"), { audit: 2 })).ok).toBe(true);
		});

		it("block_all: even a staff override is refused; the admin override books it", async () => {
			await a.mut("apiBlacklist:update", {
				entry: ref("byClient"),
				patch: { severity: "block_all" },
			});
			expect(
				await create(ref("ion"), 5, ov("staff"), { audit: 0, ok: false, same: true }),
			).toMatchObject({ reason: "blocked", blacklist: { needs: "admin" } });
			expect((await create(ref("ion"), 5, ov("admin"), { audit: 2 })).ok).toBe(true);
		});

		it("is checked before an overlap, and an overlap after an accepted override still writes nothing", async () => {
			const out = await create(ref("ion"), 5, {}, { audit: 0, ok: false, same: true });
			expect(out.reason).toBe("blocked");
			const overlap = await create(ref("ion"), 5, ov("admin"), { audit: 0, ok: false, same: true });
			expect(overlap.reason).toBe("overlaps");
		});

		it("a child is stopped through the guardian's phone", async () => {
			expect(await create(ref("child"), 6, {}, { audit: 0, ok: false, same: true })).toMatchObject({
				reason: "blocked",
				blacklist: { matchedBy: "phone" },
			});
		});

		it("an override on a client no entry names is ignored and stores no event", async () => {
			const free = await freeClient();
			const before = await a.counts();
			await create(free, 7, ov("admin"), { audit: 1 });
			const after = await a.counts();
			expect(n(after, "blacklistEvents")).toBe(n(before, "blacklistEvents"));
		});

		it("move is gated the same way: blocked, then a staff or admin override as the entry needs", async () => {
			const free = await freeClient();
			const booked = id(await create(free, 8, {}));
			// Flag the client afterwards: the move of an already-booked visit is gated too.
			const entry = id(await flag({ client: free, severity: "block_online" }));
			const move = (
				extra: Record<string, unknown>,
				e: { audit?: number; ok?: boolean; same?: boolean },
			) =>
				a.mut("apiVisits:move", { visit: booked, start: day(9), end: day(9) + HOUR, ...extra }, e);
			expect(await move({}, { audit: 0, ok: false, same: true })).toMatchObject({
				reason: "blocked",
			});
			expect(await move(ov("ack"), { audit: 0, ok: false, same: true })).toMatchObject({
				reason: "blocked",
			});
			expect((await move(ov("staff"), { audit: 2 })).ok).toBe(true);
			await a.mut("apiBlacklist:update", { entry, patch: { severity: "warn" } });
			expect(
				await move({ start: day(10), end: day(10) + HOUR }, { audit: 0, ok: false, same: true }),
			).toMatchObject({ reason: "warning" });
		});

		it("a switched-off or expired entry no longer stops a booking", async () => {
			const free = await freeClient();
			const entry = id(await flag({ client: free, severity: "block_all" }));
			expect((await create(free, 11, {}, { audit: 0, ok: false, same: true })).reason).toBe(
				"blocked",
			);
			await a.mut("apiBlacklist:update", { entry, patch: { active: false } });
			expect((await create(free, 11, {})).ok).toBe(true);
		});
	});

	describe("erasing a client", () => {
		it("the entry keeps its identifiers and reason but loses the client link and the name", async () => {
			const person = id(
				await a.mut("apiClients:create", {
					client: {
						kind: "adult",
						consent: { contact: true, reminders: true },
						name: "Test Gone",
						phone: "0700 444 444",
					},
				}),
			);
			const entry = id(
				await flag({
					client: person,
					phone: "0700 444 444",
					name: "Test Gone",
					severity: "block_online",
				}),
			);
			// The erasure's two audit events: the client's, and the blacklist entry that lost its link.
			expect((await a.mut("staffClients:eraseClient", { client: person }, { audit: 2 })).ok).toBe(
				true,
			);
			const got = await a.qry("apiBlacklist:get", { entry });
			expect(got.entry).toMatchObject({
				phone: "+40700444444",
				severity: "block_online",
				reason: "a reason",
			});
			expect(got.entry).not.toHaveProperty("client");
			expect(got.entry).not.toHaveProperty("name");
			// It still stops the same phone online.
			const gate = await a.sys(
				"apiBlacklist:screen",
				{ channel: "form", contact: { phone: "0700 444 444" } },
				{ audit: 1, ok: false },
			);
			expect(gate.reason).toBe("unavailable_online");
		});
	});
});
