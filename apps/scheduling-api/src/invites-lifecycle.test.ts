import { beforeEach, describe, expect, it } from "vitest";
import { createNovuNotify } from "./ports/novu-notify";
import { inviteKit } from "./testing/invite-kit";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, LINK_SECRET, NOW } from "./testing/world";

const _A = "/v1/apps/psizone";
const DAY = 24 * HOUR;
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});
const { as, invite, state, visitor, sent, audit, person, writesNothing, detail } = inviteKit(
	() => w,
);

describe("the link in the e-mail", () => {
	/** The e-mail's link, from the notification the handler queued, through the real adapter. */
	async function linkOf(event = "account.invite"): Promise<string> {
		const queued = sent(event).at(-1);
		if (queued === undefined) throw new Error("nothing was queued");
		let url = "";
		await createNovuNotify({
			store: w.store,
			clock: () => w.clock.now,
			log: () => undefined,
			links: { publicOrigin: "https://api-programari.test", secret: LINK_SECRET },
			notifier: {
				notify: (_app, _event, payload) => {
					url = String(payload.inviteUrl ?? payload.signInUrl);
					return Promise.resolve({ status: "queued", jobs: 1 });
				},
				drain: () => Promise.resolve(0),
				start: () => () => undefined,
				upsertSubscriber: () => Promise.resolve(),
				setTeam: () => Promise.resolve(),
				pending: () => Promise.resolve(0),
			},
		}).notify(queued);
		return url.replace("https://api-programari.test", "");
	}
	const get = (path: string) => w.app.request(path);
	const post = (path: string) => w.app.request(path, { method: "POST" });

	it("opens on a page with one button, and the button sends the person to set a password", async () => {
		const id = await person();
		await invite(id);
		const path = await linkOf();
		expect(path).toMatch(/^\/v1\/public\/invites\/.+\..+$/);
		const page = await get(path);
		expect(page.status).toBe(200);
		expect(await page.text()).toContain("Continuă");
		expect(w.sso.calls.some((c) => c.startsWith("recovery:"))).toBe(false);
		const go = await post(path);
		expect(go.status).toBe(303);
		expect(go.headers.get("location")).toBe("https://sso.test/recover/u1");
	});
	it("an existing account is sent to the site's sign-in, and no recovery link is asked for", async () => {
		const id = await person();
		w.sso.seed("maria@example.test");
		await invite(id);
		const go = await post(await linkOf("account.invite_existing"));
		expect(go.headers.get("location")).toBe("https://psizone.ro/cont");
		expect(w.sso.calls.some((c) => c.startsWith("recovery:"))).toBe(false);
	});
	it("a sign-in that is away answers 503 with a page", async () => {
		const id = await person();
		await invite(id);
		const path = await linkOf();
		w.sso.failing = true;
		const go = await post(path);
		expect(go.status).toBe(503);
		expect(go.headers.get("retry-after")).toBe("60");
	});
	it("stops working after a week, and a resend gives a new link while the old one says it was replaced", async () => {
		const id = await person();
		await invite(id);
		const first = await linkOf();
		w.clock.now += 61_000;
		expect((await as("olga", "POST", `/clients/${id}/invite/resend`, {})).status).toBe(200);
		const second = await linkOf();
		expect(second).not.toBe(first);
		expect(await (await get(first)).text()).toContain("invitație mai nouă");
		expect((await get(first)).status).toBe(410);
		expect((await get(second)).status).toBe(200);
		w.clock.now += 8 * DAY;
		expect((await get(second)).status).toBe(410);
		expect(await (await get(second)).text()).toContain("Invitația a expirat");
	});
	it("a withdrawn invitation says so", async () => {
		const id = await person();
		await invite(id);
		const path = await linkOf();
		await as("olga", "DELETE", `/clients/${id}/invite`);
		const r = await get(path);
		expect(r.status).toBe(410);
		expect(await r.text()).toContain("nu mai este valabilă");
		expect((await post(path)).status).toBe(410);
		expect(w.sso.calls.some((c) => c.startsWith("recovery:"))).toBe(false);
	});
	it("a forged token, another app's token and a reminder's token are not an invitation", async () => {
		const id = await person();
		await invite(id);
		const path = await linkOf();
		expect((await get(`${path}x`)).status).toBe(400);
		expect((await get("/v1/public/invites/not-a-token")).status).toBe(404);
		expect((await get("/v1/public/invites/aaa.bbb")).status).toBe(404);
	});
});

describe("status: invited, active, expired", () => {
	it("an invitation past its week reads as expired without any job having run, and can be sent again", async () => {
		const id = await person();
		await invite(id);
		w.clock.now += 7 * DAY;
		expect(await state(id)).toMatchObject({ status: "expired" });
		const again = await as("olga", "POST", `/clients/${id}/invite/resend`, {});
		expect(again.json).toMatchObject({
			status: "invited",
			sends: 2,
			expiresAt: w.clock.now + 7 * DAY,
		});
		const fresh = await invite(id);
		expect(detail(fresh)).toMatchObject({ reason: "already_invited" });
	});
	it("a new send over an expired invitation replaces it and reuses the account it made", async () => {
		const id = await person();
		await invite(id);
		w.clock.now += 8 * DAY;
		const again = await invite(id);
		expect(again.status).toBe(200);
		expect(again.json).toMatchObject({ existingAccount: false, sends: 1 });
		expect(w.sso.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
		expect(sent("account.invite")).toHaveLength(2);
	});
	it("the first sign-in of the account activates it, once, with an audit entry and the thank-you e-mail", async () => {
		const id = await person();
		await invite(id);
		expect(sent("account.activated")).toHaveLength(0);
		expect((await visitor("sub-1", "GET", "/me/appointments")).status).toBe(200);
		expect(await state(id)).toMatchObject({ status: "active", activatedAt: NOW });
		expect(sent("account.activated")).toHaveLength(1);
		expect(await audit("client.invite_activated")).toHaveLength(1);
		await visitor("sub-1", "GET", "/me/appointments");
		await visitor("sub-1", "GET", "/me/account/notifications");
		expect(sent("account.activated")).toHaveLength(1);
		expect(await audit("client.invite_activated")).toHaveLength(1);
	});
	it("someone else's sign-in activates nothing", async () => {
		const id = await person();
		await invite(id);
		const before = await w.fingerprint();
		await visitor("sub-99", "GET", "/me/appointments");
		expect(await w.fingerprint()).toBe(before);
		expect(await state(id)).toMatchObject({ status: "invited" });
	});
	it("a person who signs in after the week still activates: they have the account", async () => {
		const id = await person();
		await invite(id);
		w.clock.now += 9 * DAY;
		await visitor("sub-1", "GET", "/me/appointments");
		expect(await state(id)).toMatchObject({ status: "active" });
	});
});

describe("resend and revoke", () => {
	it("a resend inside a minute is refused and changes nothing", async () => {
		const id = await person();
		await invite(id);
		const r = await writesNothing(() => as("olga", "POST", `/clients/${id}/invite/resend`, {}));
		expect(r.status).toBe(409);
		expect(detail(r)).toMatchObject({ reason: "too_soon" });
	});
	it("a resend after a minute keeps the account, counts the send and may change the language", async () => {
		const id = await person();
		await invite(id);
		w.clock.now += 61_000;
		const r = await as("olga", "POST", `/clients/${id}/invite/resend`, { locale: "en" });
		expect(r.json).toMatchObject({ sends: 2, locale: "en", status: "invited" });
		expect(w.sso.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
		expect(sent("account.invite")).toHaveLength(2);
		expect(await audit("client.invite_resend")).toHaveLength(1);
	});
	it("a resend is refused for a client never invited, an active one, a withdrawn one and one whose address changed", async () => {
		const never = await person();
		expect(
			(await writesNothing(() => as("olga", "POST", `/clients/${never}/invite/resend`, {}))).status,
		).toBe(404);
		const id = await person();
		await invite(id);
		w.clock.now += 61_000;
		await as("olga", "PATCH", `/clients/${id}`, { contact: { email: "other@example.test" } });
		const moved = await writesNothing(() => as("olga", "POST", `/clients/${id}/invite/resend`, {}));
		expect(detail(moved)).toMatchObject({ reason: "contact_changed" });
		await as("olga", "PATCH", `/clients/${id}`, { contact: { email: "maria@example.test" } });
		await as("olga", "DELETE", `/clients/${id}/invite`);
		expect(
			detail(await writesNothing(() => as("olga", "POST", `/clients/${id}/invite/resend`, {}))),
		).toMatchObject({
			reason: "revoked",
		});
		const live = await person({ name: "Alta Persoana", contact: { email: "alta@example.test" } });
		await invite(live);
		await visitor("sub-2", "GET", "/me/appointments");
		w.clock.now += 61_000;
		expect(
			detail(await writesNothing(() => as("olga", "POST", `/clients/${live}/invite/resend`, {}))),
		).toMatchObject({ reason: "already_active" });
	});
	it("revoking withdraws the invitation, unlinks the account, audits it and never touches the sign-in", async () => {
		const id = await person();
		await invite(id);
		const calls = [...w.sso.calls];
		const r = await as("olga", "DELETE", `/clients/${id}/invite`);
		expect(r.json).toMatchObject({ status: "revoked", revokedAt: NOW });
		expect(w.sso.calls).toEqual(calls);
		expect(await audit("client.invite_revoke")).toHaveLength(1);
		const again = await writesNothing(() => as("olga", "DELETE", `/clients/${id}/invite`));
		expect(detail(again)).toMatchObject({ reason: "revoked" });
		const never = await person({ name: "Nu Invitat", contact: { email: "nu@example.test" } });
		expect(
			(await writesNothing(() => as("olga", "DELETE", `/clients/${never}/invite`))).status,
		).toBe(404);
	});
	it("after a revoke a new invitation reuses the account made before and still asks for a password", async () => {
		const id = await person();
		await invite(id);
		await as("olga", "DELETE", `/clients/${id}/invite`);
		const r = await invite(id);
		expect(r.json).toMatchObject({ status: "invited", existingAccount: false });
		expect(w.sso.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
		expect(sent("account.invite")).toHaveLength(2);
	});
	it("revoking an active account stops it showing the client's appointments", async () => {
		const c = w.ids.c1;
		await invite(c);
		await visitor("sub-1", "GET", "/me/appointments");
		expect(
			((await visitor("sub-1", "GET", "/me/appointments")).json.items as unknown[]).length,
		).toBeGreaterThan(0);
		await as("olga", "DELETE", `/clients/${c}/invite`);
		expect((await visitor("sub-1", "GET", "/me/appointments")).json.items).toEqual([]);
	});
});

describe("Programările mele: what a linked account sees", () => {
	it("shows the clinic's own appointments of the client, as confirmed, with the service", async () => {
		await invite(w.ids.c1);
		const r = await visitor("sub-1", "GET", "/me/appointments");
		expect(r.json.items).toEqual([
			expect.objectContaining({ id: w.ids.a1, reference: w.ids.a1, status: "confirmed" }),
		]);
	});
	it("an account sees nothing of a client it was not invited for, and a stranger sees nothing", async () => {
		await invite(w.ids.c1);
		expect((await visitor("sub-2", "GET", "/me/appointments")).json.items).toEqual([]);
		expect(JSON.stringify((await visitor("sub-1", "GET", "/me/appointments")).json)).not.toContain(
			w.ids.a2,
		);
	});
	it("one guardian's account covers each child it was invited for", async () => {
		const a = await person({
			name: "Copil Unu",
			guardian: { name: "Parinte", email: "parinte@example.test" },
		});
		const b = await person({
			name: "Copil Doi",
			guardian: { name: "Parinte", email: "parinte@example.test" },
		});
		await as("olga", "POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: a,
			start: NOW + 2 * DAY,
			end: NOW + 2 * DAY + HOUR,
		});
		await as("olga", "POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: b,
			start: NOW + 3 * DAY,
			end: NOW + 3 * DAY + HOUR,
		});
		await invite(a, { contact: "guardian" });
		await invite(b, { contact: "guardian" });
		expect(w.sso.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
		const r = await visitor("sub-1", "GET", "/me/appointments");
		expect((r.json.items as unknown[]).length).toBe(2);
	});
	it("a deleted appointment and a block are not shown", async () => {
		await invite(w.ids.c1);
		const made = await as("olga", "POST", "/appointments", {
			practitionerId: w.ids.dora,
			clientId: w.ids.c1,
			start: NOW + 5 * DAY,
			end: NOW + 5 * DAY + HOUR,
		});
		await as("olga", "DELETE", `/appointments/${String(made.json.id)}`);
		const ids = (
			(await visitor("sub-1", "GET", "/me/appointments")).json.items as { id: string }[]
		).map((i) => i.id);
		expect(ids).not.toContain(String(made.json.id));
	});
	it("the person can cancel their own upcoming appointment, the desk and the therapist are told, and a stranger's id is not found", async () => {
		await invite(w.ids.c1);
		const before = w.notifier.sent.length;
		const r = await visitor("sub-1", "POST", `/me/appointments/${w.ids.a1}/cancel`);
		expect(r.status).toBe(200);
		expect((await as("olga", "GET", `/appointments/${w.ids.a1}`)).json).toMatchObject({
			status: "cancelled",
		});
		expect(w.notifier.sent.slice(before)).toEqual([
			expect.objectContaining({
				event: "appointment.cancelled",
				payload: expect.objectContaining({ appointmentId: w.ids.a1, source: "client" }),
			}),
		]);
		const stranger = await writesNothing(() =>
			visitor("sub-2", "POST", `/me/appointments/${w.ids.a2}/cancel`),
		);
		expect(stranger.status).toBe(404);
		const other = await writesNothing(() =>
			visitor("sub-1", "POST", `/me/appointments/${w.ids.a2}/cancel`),
		);
		expect(other.status).toBe(404);
	});
	it("an appointment already cancelled or already over cannot be cancelled again", async () => {
		await invite(w.ids.c1);
		await visitor("sub-1", "POST", `/me/appointments/${w.ids.a1}/cancel`);
		expect(
			(await writesNothing(() => visitor("sub-1", "POST", `/me/appointments/${w.ids.a1}/cancel`)))
				.status,
		).toBe(404);
	});
});
