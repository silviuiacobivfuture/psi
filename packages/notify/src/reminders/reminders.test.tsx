import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppKey } from "../apps";
import { APP_DEFAULTS } from "../apps";
import { createNotifier, type Notifier, type NotifyOutcome } from "../notify";
import { createMemoryOutbox } from "../outbox";
import { startFakeNovu } from "../testing/fake-novu";
import { issueLinks } from "./links";
import { type ActionResult, createReminderRoutes, type ReminderActions } from "./routes";
import { createMemoryUsedLinks } from "./store";
import { signToken, verifyToken } from "./token";

const SECRET = "s".repeat(40);
const NOW = Date.parse("2026-11-30T09:00:00Z");
const START = Date.parse("2026-12-01T08:00:00Z");
const HOST = "https://psizone-api.example";

const facts = {
	appointmentId: "apt_1",
	clientName: "Ana Popescu",
	serviceName: "Terapie ABA",
	startsAt: new Date(START).toISOString(),
};

interface Calls {
	confirm: number;
	cancel: number;
}

function setup(over: { confirm?: ActionResult; cancel?: ActionResult; fail?: boolean } = {}) {
	const calls: Calls = { confirm: 0, cancel: 0 };
	const notices: Array<{ event: string; payload: Record<string, unknown> }> = [];
	const actions: ReminderActions = {
		async confirm() {
			calls.confirm++;
			if (over.fail) throw new Error("down");
			return over.confirm ?? { status: "done", appointment: facts };
		},
		async cancel() {
			calls.cancel++;
			if (over.fail) throw new Error("down");
			return over.cancel ?? { status: "done", appointment: facts };
		},
		async calendar() {
			return {
				summary: "Terapie ABA",
				startsAt: START,
				endsAt: START + 3_600_000,
				location: "Galați",
				cancelled: false,
			};
		},
	};
	const notifier: Pick<Notifier, "notify"> = {
		async notify(
			_app: AppKey,
			event: string,
			payload: Record<string, unknown>,
		): Promise<NotifyOutcome> {
			notices.push({ event, payload });
			return { status: "queued", jobs: 1 };
		},
	};
	const clock = { now: NOW };
	const app = createReminderRoutes({
		secret: SECRET,
		used: createMemoryUsedLinks(() => clock.now),
		actions,
		notifier,
		appOf: (host) =>
			host.startsWith("psizone-api")
				? "psizone"
				: host.startsWith("hemisync-api")
					? "hemisync"
					: undefined,
		now: () => clock.now,
	});
	return { app, calls, notices, clock };
}

const links = () =>
	issueLinks({
		secret: SECRET,
		publicOrigin: HOST,
		app: "psizone",
		appointmentId: "apt_1",
		locale: "ro",
		startsAt: START,
		now: NOW,
	});
const path = (url: string): string => url.slice(HOST.length).replace("/v1/public/reminders", "");
async function call(a: ReturnType<typeof setup>["app"], method: "GET" | "POST", url: string) {
	const res = await a.request(`${HOST}${path(url)}`, { method });
	return { status: res.status, text: await res.text(), headers: res.headers };
}

describe("token", () => {
	const base = {
		secret: SECRET,
		app: "psizone" as const,
		appointmentId: "apt_1",
		locale: "ro" as const,
		expiresAt: START,
	};
	const verify = (token: string, over: Partial<Parameters<typeof verifyToken>[0]> = {}) =>
		verifyToken({
			secret: SECRET,
			token,
			now: NOW,
			expectApp: "psizone",
			expectAction: "confirm",
			...over,
		});

	it("a valid token verifies and carries its claims", () => {
		const v = verify(signToken({ ...base, action: "confirm" }));
		expect(v.ok && v.claims).toMatchObject({ a: "psizone", i: "apt_1", k: "confirm", l: "ro" });
	});
	it("expired", () =>
		expect(verify(signToken({ ...base, action: "confirm" }), { now: START })).toMatchObject({
			ok: false,
			failure: "expired",
		}));
	it("tampered payload", () => {
		const [body, sig] = signToken({ ...base, action: "confirm" }).split(".");
		const forged = Buffer.from(
			JSON.stringify({
				...JSON.parse(Buffer.from(body ?? "", "base64url").toString()),
				i: "apt_2",
			}),
		).toString("base64url");
		expect(verify(`${forged}.${sig}`)).toEqual({ ok: false, failure: "tampered" });
	});
	it("tampered signature, wrong secret, truncated signature", () => {
		const token = signToken({ ...base, action: "confirm" });
		const cut = token.length - 10;
		expect(
			verify(`${token.slice(0, cut)}${token[cut] === "A" ? "B" : "A"}${token.slice(cut + 1)}`),
		).toEqual({ ok: false, failure: "tampered" });
		expect(verify(token, { secret: "x".repeat(40) })).toEqual({ ok: false, failure: "tampered" });
		expect(verify(token.slice(0, -10))).toEqual({ ok: false, failure: "tampered" });
	});
	it("malformed: empty, no dot, extra parts, bad characters", () => {
		for (const t of ["", "abc", "a.b.c", ".", "a.", ".b", "a b.c d", "é.é"])
			expect(verify(t).ok, t).toBe(false);
	});
	it("signed garbage is malformed, not trusted", () => {
		const body = Buffer.from("not json").toString("base64url");
		const sig = Buffer.from(
			createHmac("sha256", SECRET).update(`psi-notify-link.${body}`).digest(),
		).toString("base64url");
		expect(verify(`${body}.${sig}`)).toEqual({ ok: false, failure: "malformed" });
	});
	it("wrong app and wrong action", () => {
		const token = signToken({ ...base, action: "confirm" });
		expect(verify(token, { expectApp: "hemisync" })).toEqual({ ok: false, failure: "wrong-app" });
		expect(verify(token, { expectAction: "cancel" })).toEqual({
			ok: false,
			failure: "wrong-action",
		});
	});
	it("a short secret cannot sign", () =>
		expect(() => signToken({ ...base, secret: "short", action: "confirm" })).toThrow("32"));
	it("every token is unique", () =>
		expect(signToken({ ...base, action: "confirm" })).not.toBe(
			signToken({ ...base, action: "confirm" }),
		));
	it("issuing for a past appointment is refused", () =>
		expect(() =>
			issueLinks({
				secret: SECRET,
				publicOrigin: HOST,
				app: "psizone",
				appointmentId: "a",
				locale: "ro",
				startsAt: NOW,
				now: NOW,
			}),
		).toThrow("past"));
});

describe("routes", () => {
	let s: ReturnType<typeof setup>;
	beforeEach(() => {
		s = setup();
	});

	it("GET shows a page with one button and changes nothing, however often a scanner fetches it", async () => {
		for (let i = 0; i < 3; i++) {
			const r = await call(s.app, "GET", links().cancelUrl);
			expect(r.status).toBe(200);
			expect(r.text).toContain("<form");
			expect(r.text).toContain("Da, anulez");
		}
		expect(s.calls).toEqual({ confirm: 0, cancel: 0 });
		expect(s.notices).toHaveLength(0);
		const post = await call(s.app, "POST", links().cancelUrl);
		expect(post.status).toBe(200);
	});

	it("POST confirm updates the calendar once and tells reception", async () => {
		const l = links();
		const r = await call(s.app, "POST", l.confirmUrl);
		expect(r.status).toBe(200);
		expect(r.text).toContain("Mulțumim");
		expect(s.calls).toEqual({ confirm: 1, cancel: 0 });
		expect(s.notices).toHaveLength(1);
		expect(s.notices[0]?.event).toBe("reminder.confirmed");
		expect(s.notices[0]?.payload).toMatchObject({ appointmentId: "apt_1" });
	});

	it("POST cancel cancels and tells reception", async () => {
		await call(s.app, "POST", links().cancelUrl);
		expect(s.calls).toEqual({ confirm: 0, cancel: 1 });
		expect(s.notices[0]?.event).toBe("reminder.declined");
	});

	it("a reused link shows the outcome, not an error, and does nothing again", async () => {
		const l = links();
		await call(s.app, "POST", l.confirmUrl);
		const again = await call(s.app, "POST", l.confirmUrl);
		expect(again.status).toBe(200);
		expect(again.text).toContain("deja");
		expect(s.calls.confirm).toBe(1);
		expect(s.notices).toHaveLength(1);
	});

	it("two simultaneous POSTs act once", async () => {
		const l = links();
		await Promise.all([call(s.app, "POST", l.cancelUrl), call(s.app, "POST", l.cancelUrl)]);
		expect(s.calls.cancel).toBe(1);
	});

	it("the confirm link does not work on the cancel route and the reverse", async () => {
		const l = links();
		const a = await call(
			s.app,
			"POST",
			`${HOST}/v1/public/reminders/${l.confirmUrl.split("/").at(-2)}/cancel`,
		);
		expect(a.status).toBe(400);
		expect(s.calls).toEqual({ confirm: 0, cancel: 0 });
	});

	it("expired links are 410 with a friendly page, both on GET and POST", async () => {
		const l = links();
		s.clock.now = START + 1;
		for (const m of ["GET", "POST"] as const) {
			const r = await call(s.app, m, l.confirmUrl);
			expect(r.status).toBe(410);
			expect(r.text).toContain("expirat");
		}
		expect(s.calls).toEqual({ confirm: 0, cancel: 0 });
	});

	it("an expired English link says so in English", async () => {
		const en = issueLinks({
			secret: SECRET,
			publicOrigin: HOST,
			app: "psizone",
			appointmentId: "apt_1",
			locale: "en",
			startsAt: START,
			now: NOW,
		});
		s.clock.now = START + 1;
		const r = await call(s.app, "GET", en.cancelUrl);
		expect(r.status).toBe(410);
		expect(r.text).toContain("This link has expired");
		expect(r.text).toContain('lang="en"');
	});

	it("a tampered link is 400 and does nothing", async () => {
		const l = links();
		const token = l.confirmUrl.split("/").at(-2) ?? "";
		const cut = token.length - 10;
		const forged = `${token.slice(0, cut)}${token[cut] === "A" ? "B" : "A"}${token.slice(cut + 1)}`;
		const r = await call(s.app, "POST", l.confirmUrl.replace(token, forged));
		expect(r.status).toBe(400);
		expect(s.calls.confirm).toBe(0);
	});

	it("a link from another app is refused", async () => {
		const l = links();
		const r = await s.app.request(`https://hemisync-api.example${path(l.confirmUrl)}`, {
			method: "POST",
		});
		expect(r.status).toBe(400);
		const unknown = await s.app.request(`https://other.example${path(l.confirmUrl)}`, {
			method: "POST",
		});
		expect(unknown.status).toBe(400);
		expect(s.calls.confirm).toBe(0);
	});

	it("an appointment that is already gone is 410 and tells nobody", async () => {
		s = setup({ confirm: { status: "gone" } });
		const r = await call(s.app, "POST", links().confirmUrl);
		expect(r.status).toBe(410);
		expect(s.notices).toHaveLength(0);
	});

	it("an appointment already confirmed answers 'already' and does not notify twice", async () => {
		s = setup({ confirm: { status: "already" } });
		const r = await call(s.app, "POST", links().confirmUrl);
		expect(r.status).toBe(200);
		expect(r.text).toContain("deja");
		expect(s.notices).toHaveLength(0);
	});

	it("when the calendar cannot be updated the answer is 503 and the link still works afterwards", async () => {
		s = setup({ fail: true });
		const l = links();
		expect((await call(s.app, "POST", l.confirmUrl)).status).toBe(503);
		expect((await call(s.app, "POST", l.confirmUrl)).status).toBe(503); // not burned: it tried again
		expect(s.calls.confirm).toBe(2);
	});

	it("pages are never cached, never referred and speak the link's language", async () => {
		const en = issueLinks({
			secret: SECRET,
			publicOrigin: HOST,
			app: "psizone",
			appointmentId: "apt_1",
			locale: "en",
			startsAt: START,
			now: NOW,
		});
		const r = await call(s.app, "GET", en.confirmUrl);
		expect(r.headers.get("cache-control")).toBe("no-store");
		expect(r.headers.get("referrer-policy")).toBe("no-referrer");
		expect(r.text).toContain('lang="en"');
		expect(r.text).toContain("Yes, confirm");
		expect(r.text).toContain("Psizone");
	});

	it("the page carries the app's brand", async () => {
		const h = createReminderRoutes({
			secret: SECRET,
			used: createMemoryUsedLinks(),
			actions: {
				confirm: async () => ({ status: "gone" }),
				cancel: async () => ({ status: "gone" }),
				calendar: async () => undefined,
			},
			notifier: { notify: async () => ({ status: "queued", jobs: 1 }) },
			appOf: () => "hemisync",
			now: () => NOW,
		});
		const l = issueLinks({
			secret: SECRET,
			publicOrigin: HOST,
			app: "hemisync",
			appointmentId: "x",
			locale: "ro",
			startsAt: START,
			now: NOW,
		});
		const res = await h.request(`${HOST}${path(l.confirmUrl)}`);
		expect(await res.text()).toContain(APP_DEFAULTS.hemisync.brandName);
	});

	it("the .ics link returns the calendar file, can be fetched again, and is refused when tampered", async () => {
		const l = links();
		for (let i = 0; i < 2; i++) {
			const r = await call(s.app, "GET", l.icsUrl);
			expect(r.status).toBe(200);
			expect(r.headers.get("content-type")).toContain("text/calendar");
			expect(r.text).toContain("BEGIN:VEVENT");
			expect(r.text).toContain("DTSTART:20261201T080000Z");
			expect(r.text).toContain("\r\n");
		}
		expect((await call(s.app, "POST", l.icsUrl)).status).toBe(404);
		expect((await call(s.app, "GET", l.icsUrl.replace(/.{3}\/ics$/, "AAA/ics"))).status).toBe(400);
	});
});

describe("reception is told through the real trigger client", () => {
	it("confirming queues reminder.confirmed to the reception topic with the link id as occurrence", async () => {
		const novu = await startFakeNovu();
		const notifier = createNotifier({
			novu: { apiUrl: novu.url, secretKey: "k" },
			apps: {
				psizone: {
					settings: APP_DEFAULTS.psizone,
					siteUrl: "https://a.example",
					consoleUrl: "https://b.example",
				},
			},
			outbox: createMemoryOutbox(),
			now: () => NOW,
			log: () => undefined,
		});
		const used = createMemoryUsedLinks(() => NOW);
		const app = createReminderRoutes({
			secret: SECRET,
			used,
			notifier,
			appOf: () => "psizone",
			now: () => NOW,
			actions: {
				confirm: async () => ({ status: "done", appointment: facts }),
				cancel: async () => ({ status: "gone" }),
				calendar: async () => undefined,
			},
		});
		await app.request(`${HOST}${path(links().confirmUrl)}`, { method: "POST" });
		await notifier.drain();
		const trig = novu.requests.find((r) => r.path === "/v1/events/trigger");
		expect((trig?.body as { name: string; to: unknown }).name).toBe(
			"psizone-reminder-confirmed-reception",
		);
		expect((trig?.body as { to: unknown }).to).toEqual({
			type: "Topic",
			topicKey: "psizone:reception",
		});
		await novu.close();
	});
});
