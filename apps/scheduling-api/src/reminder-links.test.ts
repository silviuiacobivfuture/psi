import { issueLinks, signToken } from "@psi/notify/reminders";
import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { HOUR, LINK_SECRET, NOW } from "./testing/world";

const ORIGIN = "https://api-programari.test";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});

const linksFor = (
	appointmentId: string,
	app: "psizone" | "hemisync" = "psizone",
	startsAt = NOW + 24 * HOUR,
) =>
	issueLinks({
		secret: LINK_SECRET,
		publicOrigin: ORIGIN,
		app,
		appointmentId,
		locale: "ro",
		startsAt,
		now: NOW,
	});
const path = (url: string): string => url.slice(ORIGIN.length);
const get = (url: string) => w.app.request(path(url));
const post = (url: string) => w.app.request(path(url), { method: "POST" });
const appointment = async (id: string) => (await w.store.c.appointments.get("psizone", id))?.status;
const reminder = async (id: string) => (await w.store.c.reminders.get("psizone", id))?.state;

describe("the reminder links: what they do, once", () => {
	it("a GET on confirm shows a page with a button and changes nothing; the POST confirms and tells reception once", async () => {
		const { confirmUrl } = linksFor(w.ids.a1);
		const before = await w.fingerprint();
		const page = await get(confirmUrl);
		expect(page.status).toBe(200);
		expect(await page.text()).toContain("<form");
		expect(await w.fingerprint()).toBe(before);

		const done = await post(confirmUrl);
		expect(done.status).toBe(200);
		expect(await reminder(w.ids.a1)).toBe("confirmed");
		expect(w.linkNotices).toHaveLength(1);
		expect(w.linkNotices[0]).toMatchObject({
			app: "psizone",
			event: "reminder.confirmed",
			payload: { appointmentId: w.ids.a1, clientName: "Client One" },
		});

		// a repeat shows the outcome, not an error, and tells nobody again
		expect((await post(confirmUrl)).status).toBe(200);
		expect(w.linkNotices).toHaveLength(1);
	});

	it("cancel frees the slot, tells reception, and a repeat is already answered", async () => {
		const { cancelUrl } = linksFor(w.ids.a1);
		expect((await post(cancelUrl)).status).toBe(200);
		expect(await appointment(w.ids.a1)).toBe("cancelled");
		expect(w.linkNotices.map((n) => n.event)).toEqual(["reminder.declined"]);
		const again = await post(cancelUrl);
		expect(again.status).toBe(200);
		expect(w.linkNotices).toHaveLength(1);
		// the calendar stream was told
		expect(await w.store.changes.head("psizone")).toBeGreaterThan(0);
	});

	it("the calendar link is read-only and can be fetched again", async () => {
		const { icsUrl } = linksFor(w.ids.a1);
		const before = await w.fingerprint();
		for (let i = 0; i < 2; i += 1) {
			const res = await get(icsUrl);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toContain("text/calendar");
			const text = await res.text();
			expect(text).toContain("BEGIN:VEVENT");
			expect(text).toContain("Evaluare");
		}
		expect(await w.fingerprint()).toBe(before);
	});
});

describe("every refusal of a reminder link is its own case and writes nothing", () => {
	const refused = async (
		run: () => Response | Promise<Response>,
		status: number,
	): Promise<void> => {
		const before = await w.fingerprint();
		expect((await run()).status).toBe(status);
		expect(await w.fingerprint()).toBe(before);
	};

	it("a tampered token: the signature or the claims changed", async () => {
		const { confirmUrl } = linksFor(w.ids.a1);
		const token = path(confirmUrl).split("/")[4] ?? "";
		const [body = "", sig = ""] = token.split(".");
		// The first character carries all six of its bits; the last carries padding bits a decoder may ignore.
		const flipped = `${sig.startsWith("A") ? "B" : "A"}${sig.slice(1)}`;
		await refused(
			() => w.app.request(`/v1/public/reminders/${body}.${flipped}/confirm`, { method: "POST" }),
			400,
		);
		const other = Buffer.from(
			JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), i: w.ids.a2 }),
		).toString("base64url");
		await refused(
			() => w.app.request(`/v1/public/reminders/${other}.${sig}/confirm`, { method: "POST" }),
			400,
		);
	});

	it("a token that is not one", async () => {
		await refused(
			() => w.app.request("/v1/public/reminders/nonsense/confirm", { method: "POST" }),
			404,
		);
		await refused(() => w.app.request("/v1/public/reminders/a.b/confirm", { method: "POST" }), 404);
	});

	it("a token signed with another secret", async () => {
		const token = signToken({
			secret: "another-secret-of-more-than-32-characters",
			app: "psizone",
			appointmentId: w.ids.a1,
			action: "confirm",
			locale: "ro",
			expiresAt: NOW + HOUR,
		});
		await refused(
			() => w.app.request(`/v1/public/reminders/${token}/confirm`, { method: "POST" }),
			400,
		);
	});

	it("an expired link", async () => {
		const token = signToken({
			secret: LINK_SECRET,
			app: "psizone",
			appointmentId: w.ids.a1,
			action: "confirm",
			locale: "ro",
			expiresAt: NOW - HOUR,
		});
		await refused(
			() => w.app.request(`/v1/public/reminders/${token}/confirm`, { method: "POST" }),
			410,
		);
	});

	it("a link used for another action", async () => {
		const { confirmUrl } = linksFor(w.ids.a1);
		await refused(() => post(confirmUrl.replace("/confirm", "/cancel")), 400);
	});

	it("a link of another app acts only in that app: the appointment here is untouched", async () => {
		const { cancelUrl } = linksFor(w.ids.a1, "hemisync");
		await refused(() => post(cancelUrl), 410);
		expect(await appointment(w.ids.a1)).toBe("scheduled");
	});

	it("an appointment that is gone, deleted or past", async () => {
		const { confirmUrl } = linksFor("nope-nope-nope");
		await refused(() => post(confirmUrl), 410);
		await w.call("olga", "DELETE", `/v1/apps/psizone/appointments/${w.ids.a2}`);
		await refused(() => post(linksFor(w.ids.a2).confirmUrl), 410);
		w.clock.now = NOW + 48 * HOUR;
		await refused(() => post(linksFor(w.ids.a1, "psizone", NOW + 72 * HOUR).cancelUrl), 410);
	});

	it("a cancelled appointment cannot be confirmed", async () => {
		await w.call("olga", "POST", `/v1/apps/psizone/appointments/${w.ids.a1}/cancel`, {
			reason: "xx",
		});
		await refused(() => post(linksFor(w.ids.a1).confirmUrl), 410);
	});

	it("an action that fails gives the link back: 503, and the link still works afterwards", async () => {
		const { confirmUrl } = linksFor(w.ids.a1);
		const real = w.store.c.reminders.insert;
		w.store.c.reminders.insert = () => Promise.reject(new Error("store down"));
		expect((await post(confirmUrl)).status).toBe(503);
		w.store.c.reminders.insert = real;
		expect((await post(confirmUrl)).status).toBe(200);
		expect(await reminder(w.ids.a1)).toBe("confirmed");
	});
});
