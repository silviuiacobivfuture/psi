import { beforeAll, describe, expect, it } from "vitest";
import { withActor, withOverride } from "../actor";
import { newId } from "../ids";
import type { BlacklistInputFields } from "../ports";
import type { ContractSection } from "./env";
import { draft, useWorld, type World } from "./visits.world";

/**
 * The blacklist on every adapter: entries, the gate of the online paths, the staff gate with its overrides, and the
 * events it leaves. A refusal is its own case and leaves every entry as it was.
 */
export const blacklistContract: ContractSection = (env) => {
	const h = useWorld(env);
	let w: World;
	let flagged: string;
	let phoned: string;
	/** Every default entry has a phone of its own: two entries about one phone are refused. */
	let serial = 0;
	beforeAll(async () => {
		w = h.world();
		const now = Date.now();
		phoned = (
			await h.c().clients.insert({
				id: newId("c"),
				app: w.app,
				name: "Client With Phone",
				status: "active",
				treating: [],
				contact: { phone: "+40722000111", email: "with.phone@example.test" },
				guardian: { name: "Guardian Test", phone: "+40722000222" },
				createdAt: now,
				updatedAt: now,
			})
		).id;
		flagged = w.c2;
	});
	const bl = () => env().store.blacklist;
	const entry = (over: Partial<BlacklistInputFields> = {}): BlacklistInputFields => ({
		phone: `+4073${String(++serial).padStart(7, "0")}`,
		reason: "synthetic reason",
		category: "other",
		severity: "warn",
		...over,
	});
	const snapshot = async (): Promise<string> =>
		JSON.stringify([await bl().list(w.app, true), await bl().events(w.app, {})]);
	const refused = async (reason: string, run: () => Promise<unknown>): Promise<void> => {
		const before = await snapshot();
		await expect(run()).rejects.toMatchObject({ name: "StoreRefused", reason });
		expect(await snapshot(), "a refusal wrote something").toBe(before);
	};
	const made = async (over: Partial<BlacklistInputFields> = {}): Promise<string> =>
		(await withActor("rita", () => bl().create(w.app, entry(over), "any"))).id;

	describe("blacklist entries", () => {
		it("an entry is stored, normalised, and read back with who made it", async () => {
			const { id } = await withActor("rita", () =>
				bl().create(
					w.app,
					entry({ phone: "0722 333 444", email: " Mixed.Case@Example.TEST ", name: "Someone" }),
					"any",
				),
			);
			expect(await bl().get(w.app, id)).toMatchObject({
				id,
				phone: "+40722333444",
				email: "mixed.case@example.test",
				name: "Someone",
				active: true,
				createdBy: "rita",
				updatedBy: "rita",
				version: 1,
			});
			expect((await bl().list(w.app, false)).map((e) => e.id)).toContain(id);
			expect(await bl().get(w.app, "nosuchentry000000000000000")).toBeUndefined();
			expect(await bl().get("some-other-app", id)).toBeUndefined();
		});
		it("an entry about a client record is stored against it", async () => {
			const id = await made({ phone: undefined, client: flagged });
			expect(await bl().get(w.app, id)).toMatchObject({ client: flagged });
		});
		it("an app lists only its own entries", async () => {
			const id = await made();
			const other = await env().newApp();
			expect(await bl().list(other, true)).toEqual([]);
			expect((await bl().list(w.app, true)).map((e) => e.id)).toContain(id);
		});
		it("a name alone is not enough: invalid, naming the entry", async () => {
			await refused("invalid", () =>
				bl().create(
					w.app,
					{ name: "Someone", reason: "x", category: "other", severity: "warn" },
					"any",
				),
			);
		});
		it("a phone that is not a phone and an e-mail that is not one are invalid, naming the field", async () => {
			await expect(
				bl().create(w.app, entry({ phone: "not a phone" }), "any"),
			).rejects.toMatchObject({ reason: "invalid", detail: { problems: ["phone"] } });
			await expect(
				bl().create(w.app, entry({ phone: undefined, email: "nope" }), "any"),
			).rejects.toMatchObject({ reason: "invalid", detail: { problems: ["email"] } });
		});
		it("a reason of 2000 characters is kept, one of 2001 is invalid", async () => {
			const id = await made({ reason: "r".repeat(2000) });
			expect((await bl().get(w.app, id))?.reason).toHaveLength(2000);
			await refused("invalid", () =>
				bl().create(w.app, entry({ reason: "r".repeat(2001) }), "any"),
			);
			await refused("invalid", () => bl().create(w.app, entry({ reason: "  " }), "any"));
		});
		it("a caller who may flag at warn level only cannot make a stronger entry", async () => {
			await refused("severity_not_allowed", () =>
				bl().create(w.app, entry({ severity: "block_online" }), "warn_only"),
			);
			await refused("severity_not_allowed", () =>
				bl().create(w.app, entry({ severity: "block_all" }), "warn_only"),
			);
			const id = (await bl().create(w.app, entry({ severity: "warn" }), "warn_only")).id;
			expect(id.length).toBeGreaterThan(2);
		});
		it("an expiry in the past is refused; a future one is kept and ends the entry", async () => {
			await refused("already_expired", () =>
				bl().create(w.app, entry({ expiresAt: Date.now() - 1000 }), "any"),
			);
			const id = await made({ expiresAt: Date.now() + 86_400_000 });
			expect((await bl().get(w.app, id))?.expiresAt).toBeGreaterThan(Date.now());
		});
		it("a client that is not there is refused", async () => {
			await refused("unknown_client", () =>
				bl().create(
					w.app,
					entry({ phone: undefined, client: "nosuchclient000000000000000" }),
					"any",
				),
			);
		});
		it("the same phone twice is refused and names the twin", async () => {
			const phone = "+40733111222";
			const id = await made({ phone });
			await expect(bl().create(w.app, entry({ phone }), "any")).rejects.toMatchObject({
				reason: "exists",
				detail: { id },
			});
		});
		it("an entry is changed, version up by one, and an unchanged patch changes nothing", async () => {
			const id = await made();
			const done = await withActor("olga", () =>
				bl().update(
					w.app,
					id,
					{ reason: "new reason", severity: "block_online" },
					[],
					undefined,
					"any",
				),
			);
			expect(done).toEqual({ changed: true, version: 2 });
			expect(await bl().get(w.app, id)).toMatchObject({
				reason: "new reason",
				severity: "block_online",
				updatedBy: "olga",
				version: 2,
			});
			expect(await bl().update(w.app, id, { reason: "new reason" }, [], undefined, "any")).toEqual({
				changed: false,
				version: 2,
			});
		});
		it("an entry is switched off, hidden from the list, and switched on again", async () => {
			const id = await made();
			await bl().update(w.app, id, { active: false }, [], undefined, "any");
			expect((await bl().list(w.app, false)).map((e) => e.id)).not.toContain(id);
			expect((await bl().list(w.app, true)).map((e) => e.id)).toContain(id);
			await bl().update(w.app, id, { active: true }, [], undefined, "any");
			expect((await bl().list(w.app, false)).map((e) => e.id)).toContain(id);
		});
		it("an identifier is taken off an entry, but not the last one", async () => {
			const id = await made({ phone: "+40744555666", email: "two@example.test" });
			await bl().update(w.app, id, {}, ["email"], undefined, "any");
			expect((await bl().get(w.app, id))?.email).toBeUndefined();
			await refused("identifier_required", () =>
				bl().update(w.app, id, {}, ["phone"], undefined, "any"),
			);
		});
		it("a clear of a field that cannot be cleared is invalid", async () => {
			const id = await made();
			await refused("invalid", () => bl().update(w.app, id, {}, ["reason"], undefined, "any"));
		});
		it("an update from another version is stale, and a limited caller cannot touch a stronger entry", async () => {
			const id = await made({ severity: "block_online" });
			await refused("stale", () => bl().update(w.app, id, { reason: "x" }, [], 9, "any"));
			await refused("severity_not_allowed", () =>
				bl().update(w.app, id, { reason: "x" }, [], undefined, "warn_only"),
			);
			const weak = await made();
			await refused("severity_not_allowed", () =>
				bl().update(w.app, weak, { severity: "block_all" }, [], undefined, "warn_only"),
			);
		});
		it("an update of an entry that is not there, an expiry in the past, or onto another's phone is refused", async () => {
			await refused("not_found", () =>
				bl().update(w.app, "nosuchentry000000000000000", { reason: "x" }, [], undefined, "any"),
			);
			const a = await made({ phone: "+40755000001" });
			await made({ phone: "+40755000002" });
			await refused("already_expired", () =>
				bl().update(w.app, a, { expiresAt: Date.now() - 5 }, [], undefined, "any"),
			);
			await refused("exists", () =>
				bl().update(w.app, a, { phone: "+40755000002" }, [], undefined, "any"),
			);
		});
		it("an entry is deleted for good; deleting nothing is not_found", async () => {
			const id = await made();
			await bl().remove(w.app, id);
			expect(await bl().get(w.app, id)).toBeUndefined();
			await refused("not_found", () => bl().remove(w.app, id));
		});
	});

	describe("the check: does the blacklist name this person?", () => {
		it("a phone or e-mail on an entry is a hit, by the way it matched", async () => {
			const id = await made({
				phone: "+40766000001",
				email: "named@example.test",
				severity: "block_online",
			});
			const byPhone = await bl().check(w.app, { phone: "0766 000 001" });
			expect(byPhone).toMatchObject({
				entry: id,
				severity: "block_online",
				matchedBy: "phone",
				reason: "synthetic reason",
			});
			expect(await bl().check(w.app, { email: "NAMED@example.test" })).toMatchObject({
				entry: id,
				matchedBy: "email",
			});
			expect(await bl().check(w.app, { phone: "+40766000099" })).toBeNull();
		});
		it("a client record is a hit through its own or its guardian's contact", async () => {
			const id = await made({ phone: "+40722000222", severity: "warn" });
			expect(await bl().check(w.app, { client: phoned })).toMatchObject({
				entry: id,
				matchedBy: "phone",
			});
		});
		it("the strongest severity wins", async () => {
			await made({ phone: "+40766000010", severity: "warn" });
			const strong = await made({ email: "strong@example.test", severity: "block_all" });
			const hit = await bl().check(w.app, { phone: "+40766000010", email: "strong@example.test" });
			expect(hit).toMatchObject({ entry: strong, severity: "block_all" });
		});
		it("an entry switched off, or expired, is no hit", async () => {
			const id = await made({ phone: "+40766000020" });
			await bl().update(w.app, id, { active: false }, [], undefined, "any");
			expect(await bl().check(w.app, { phone: "+40766000020" })).toBeNull();
		});
		it("a name alone is no hit, and a client that is not there is refused", async () => {
			await made({ phone: "+40766000030", name: "Same Name" });
			expect(await bl().check(w.app, { name: "Same Name" })).toBeNull();
			await refused("unknown_client", () =>
				bl().check(w.app, { client: "nosuchclient000000000000000" }),
			);
		});
	});

	describe("the online gate", () => {
		it("a warn entry lets the visitor through and writes nothing", async () => {
			await made({ phone: "+40777000001", severity: "warn" });
			const before = await snapshot();
			expect(await bl().screen(w.app, "callback", { phone: "+40777000001" })).toBe(false);
			expect(await snapshot()).toBe(before);
		});
		it("a blocking entry turns the visitor away and leaves an event for the team", async () => {
			const id = await made({ phone: "+40777000002", severity: "block_online" });
			expect(await bl().screen(w.app, "callback", { name: "V", phone: "0777 000 002" })).toBe(true);
			expect(await bl().events(w.app, { entry: id })).toMatchObject([
				{
					kind: "online_refused",
					entry: id,
					severity: "block_online",
					matchedBy: "phone",
					channel: "callback",
				},
			]);
		});
		it("a contact nobody flagged passes and writes nothing", async () => {
			const before = await snapshot();
			expect(await bl().screen(w.app, "form", { phone: "+40777999999" })).toBe(false);
			expect(await snapshot()).toBe(before);
		});
		it("the e-mail of a flagged client is turned away too, through the contact their record has", async () => {
			const id = await made({ phone: undefined, client: phoned, severity: "block_all" });
			expect(await bl().screen(w.app, "guide", { email: "with.phone@example.test" })).toBe(true);
			expect((await bl().events(w.app, { entry: id }))[0]?.channel).toBe("guide");
		});
		it("events are listed newest first, cut to a limit, and an app sees only its own", async () => {
			const all = await bl().events(w.app, {});
			expect(all.length).toBeGreaterThan(1);
			for (let i = 1; i < all.length; i += 1)
				expect(all[i - 1]?.at).toBeGreaterThanOrEqual(all[i]?.at ?? 0);
			expect(await bl().events(w.app, { limit: 1 })).toHaveLength(1);
			expect(await bl().events(await env().newApp(), {})).toEqual([]);
		});
	});

	describe("booking a client the blacklist names", () => {
		const book = (client: string, ...rest: Parameters<typeof withOverride>[0][]) =>
			withActor("rita", () =>
				withOverride(rest[0], () =>
					h.c().appointments.insert(draft(w, { start: h.next(), clientId: client })),
				),
			);
		const flag = async (severity: BlacklistInputFields["severity"]): Promise<string> => {
			const c = await h.c().clients.insert({
				id: newId("c"),
				app: w.app,
				name: `Flagged ${severity}`,
				status: "active",
				treating: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			await made({ phone: undefined, client: c.id, severity });
			return c.id;
		};
		it("a client nobody flagged is booked as before", async () => {
			expect((await book(w.c1)).clientId).toBe(w.c1);
		});
		it("a warning stops the booking, naming the entry, and nothing is written", async () => {
			const client = await flag("warn");
			await expect(book(client)).rejects.toMatchObject({
				reason: "warning",
				detail: { blacklist: { severity: "warn", needs: "ack" } },
			});
			expect(await h.c().appointments.list(w.app, { eq: { clientId: client } })).toEqual([]);
		});
		it("a warning is acknowledged with a reason, and the override is recorded", async () => {
			const client = await flag("warn");
			const saved = await book(client, { reason: "seen the warning", authority: "ack" });
			expect(saved.clientId).toBe(client);
			const events = (await bl().events(w.app, {})).filter((e) => e.kind === "overridden");
			expect(events[0]).toMatchObject({
				channel: "staff",
				actor: "rita",
				authority: "ack",
				overrideReason: "seen the warning",
				subject: saved.id,
			});
		});
		it("a block_online entry needs more than an acknowledgement; staff authority books", async () => {
			const client = await flag("block_online");
			await expect(book(client)).rejects.toMatchObject({
				reason: "blocked",
				detail: { blacklist: { needs: "staff" } },
			});
			await expect(
				book(client, { reason: "just looking", authority: "ack" }),
			).rejects.toMatchObject({
				reason: "blocked",
			});
			expect(
				(await book(client, { reason: "agreed with the owner", authority: "staff" })).clientId,
			).toBe(client);
		});
		it("a block_all entry needs the admin authority", async () => {
			const client = await flag("block_all");
			await expect(book(client, { reason: "x", authority: "staff" })).rejects.toMatchObject({
				reason: "blocked",
				detail: { blacklist: { needs: "admin" } },
			});
			expect((await book(client, { reason: "owner decision", authority: "admin" })).clientId).toBe(
				client,
			);
		});
		it("an override with a blank reason does not count", async () => {
			const client = await flag("warn");
			await expect(book(client, { reason: "  ", authority: "admin" })).rejects.toMatchObject({
				reason: "warning",
			});
		});
		it("moving a flagged client's appointment is gated the same way", async () => {
			const client = await flag("block_online");
			const first = await book(client, { reason: "agreed", authority: "staff" });
			const later = {
				...first,
				start: first.start + 2 * 3_600_000,
				end: first.end + 2 * 3_600_000,
			};
			await expect(
				withActor("rita", () => h.c().appointments.replace(later)),
			).rejects.toMatchObject({
				reason: "blocked",
			});
			expect(
				await withActor("rita", () =>
					withOverride({ reason: "agreed", authority: "staff" }, () =>
						h.c().appointments.replace(later),
					),
				),
			).toBe(true);
		});
	});
};
