import { encodeSlot } from "@psi/scheduling";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createPicker } from "./booking-picker";
import { type BookingDeps, registerBookingSubmit } from "./booking-submit";
import { createIntake } from "./callback-intake";
import { type Mail, type Mailer, MailFailed } from "./mailer";
import { ANA, NOW, type StoreOptions, store } from "./test-store";

/**
 * A visitor's request is never lost, and the team is told. The routes run for real; only the two
 * ports below them are fakes: the scheduling store (test-store) and the mailer. Every case states
 * what reached the store, what was e-mailed, what was logged, and what the visitor saw.
 */

const TEAM = ["team@example.test"];
const LOG_FORBIDDEN = /Ana Popescu|0700 123 456|ana@example\.test/;
const SLOT = encodeSlot({ practitioner: ANA, start: NOW + 86_400_000, mode: "onsite" });

const valid = {
	form: "booking",
	name: "Ana Popescu",
	email: "ana@example.test",
	phone: "0700 123 456",
	forWhom: "child",
	when: "morning",
	consent: "yes",
};

interface Setup {
	store?: StoreOptions | "off";
	mail?: "ok" | "down" | "off";
}

function rig(setup: Setup = {}) {
	const fake = store([], setup.store === "off" ? {} : (setup.store ?? {}));
	const sent: Mail[] = [];
	const log: string[] = [];
	const mailer: Mailer | undefined =
		setup.mail === "off"
			? undefined
			: {
					async send(mail) {
						if (setup.mail === "down") throw new MailFailed("EAUTH");
						sent.push(mail);
					},
				};
	const scheduling = setup.store === "off" ? undefined : fake.client;
	const failed: string[] = [];
	const picker = createPicker(
		scheduling,
		"psizone",
		() => NOW,
		(e) => failed.push(String(e)),
	);
	const deps: BookingDeps = {
		scheduling,
		picker,
		tenant: "psizone",
		failed: (e) => failed.push(String(e)),
		intake: createIntake({
			tenant: "psizone",
			store: scheduling,
			mailer,
			notifyTo: TEAM,
			site: "landing.test",
			zone: "Europe/Bucharest",
			listUrl: "https://cms.example.test/admin/platform/scheduling?brand=psizone&tab=callbacks",
			now: () => NOW,
			log: (line) => log.push(line),
		}),
	};
	const app = new Hono();
	registerBookingSubmit(app, "ro", "", deps);
	registerBookingSubmit(app, "en", "/en", deps);
	return { app, fake, sent, log, failed };
}

async function post(
	app: Hono,
	path: string,
	body: Record<string, string>,
	headers: Record<string, string> = {},
): Promise<string> {
	const res = await app.request(path, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
		body: new URLSearchParams(body).toString(),
	});
	expect(res.status).toBe(200);
	return (await res.text()).replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

const THANKS = "Mulțumim, Ana Popescu.";
const FAILED_TITLE = "Cererea nu a putut fi trimisă";
const PHONES = ["0748 017 752", "0752 466 792"];

function expectThanks(html: string): void {
	expect(html).toContain(THANKS);
	expect(html).not.toContain(FAILED_TITLE);
	expect(html).not.toMatch(/nu e salvată|goes nowhere/);
}

function expectHonestFailure(html: string): void {
	expect(html).toContain(FAILED_TITLE);
	expect(html).not.toContain("Mulțumim");
	for (const phone of PHONES) expect(html).toContain(phone);
	expect(html).toContain('href="tel:+40748017752"');
	expect(html).toContain('role="alert"');
}

describe("a callback request (no time chosen)", () => {
	it("is stored AND e-mailed, and the visitor is thanked", async () => {
		const { app, fake, sent, log } = rig();
		expectThanks(await post(app, "/programare", valid, { referer: "http://localhost/contact" }));
		expect(fake.callbacks).toEqual([
			{
				tenant: "psizone",
				contact: { name: "Ana Popescu", email: "ana@example.test", phone: "0700 123 456" },
				audience: "child",
				when: "morning",
				locale: "ro",
				channel: "form",
				page: "/contact",
				consent: true,
			},
		]);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toEqual(TEAM);
		const text = sent[0]?.text ?? "";
		for (const part of [
			"Nume: Ana Popescu",
			"Telefon: 0700 123 456",
			"E-mail: ana@example.test",
			"Pentru: ",
			"Salvată în sistemul de programări: da",
			"https://cms.example.test/admin/platform/scheduling?brand=psizone&tab=callbacks",
		]) {
			expect(text).toContain(part);
		}
		expect(sent[0]?.subject).toBe("Cerere nouă de programare: Ana Popescu");
		expect(log).toEqual([]);
	});

	it("English visitor: stored with locale en, the team's e-mail is still Romanian", async () => {
		const { app, fake, sent } = rig();
		const html = await post(app, "/en/programare", valid);
		expect(html).toContain("Thank you, Ana Popescu.");
		expect(fake.callbacks[0]?.locale).toBe("en");
		expect(sent[0]?.text).toContain("Nume: Ana Popescu");
	});

	it("the store down: still e-mailed, thanked, and the e-mail says it is the only copy", async () => {
		const { app, fake, sent, log } = rig({ store: { callbacks: "down" } });
		expectThanks(await post(app, "/programare", valid));
		expect(fake.callbacks).toEqual([]);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.text).toContain("Salvată în sistemul de programări: NU");
		expect(log.join("\n")).toContain(
			"callbacks: not stored (Convex at http://store is unreachable",
		);
		expect(log.join("\n")).not.toMatch(LOG_FORBIDDEN);
	});

	it("the store refusing the request counts as not stored: the e-mail goes and says so", async () => {
		const { app, fake, sent, log } = rig({ store: { callbacks: "refused" } });
		expectThanks(await post(app, "/programare", valid));
		expect(fake.callbacks).toEqual([]);
		expect(sent[0]?.text).toContain("sistemul de programări: NU");
		expect(log).toContain("callbacks: the store refused the request (unknown_tenant)");
	});

	it("the mail down: still stored, thanked, the failure logged without personal data", async () => {
		const { app, fake, sent, log } = rig({ mail: "down" });
		expectThanks(await post(app, "/programare", valid));
		expect(fake.callbacks).toHaveLength(1);
		expect(sent).toEqual([]);
		expect(log).toEqual(["callbacks: team not e-mailed (mail could not be sent (EAUTH))"]);
	});

	it("mail not configured: still stored and thanked; the log says mail is off", async () => {
		const { app, fake, sent, log } = rig({ mail: "off" });
		expectThanks(await post(app, "/programare", valid));
		expect(fake.callbacks).toHaveLength(1);
		expect(sent).toEqual([]);
		expect(log).toEqual(["callbacks: team not e-mailed (mail is not configured)"]);
	});

	it("BOTH down: an honest error with the clinic's phones, never thanks, in ro and en", async () => {
		const { app, fake, sent, log } = rig({ store: { callbacks: "down" }, mail: "down" });
		expectHonestFailure(await post(app, "/programare", valid));
		expect(fake.callbacks).toEqual([]);
		expect(sent).toEqual([]);
		expect(log.at(-1)).toBe("callbacks: REQUEST LOST, neither stored nor e-mailed");
		expect(log.join("\n")).not.toMatch(LOG_FORBIDDEN);

		const en = await post(app, "/en/programare", valid);
		expect(en).toContain("Your request could not be sent");
		expect(en).not.toContain("Thank you");
		for (const phone of PHONES) expect(en).toContain(phone);
		expect(en).toContain('href="/en/contact"');
	});

	it("scheduling off and no mail: nothing can receive it, so the visitor is told, not thanked", async () => {
		const { app, log } = rig({ store: "off", mail: "off" });
		expectHonestFailure(await post(app, "/programare", valid));
		expect(log).toContain("callbacks: not stored (scheduling is off)");
	});

	it("scheduling off but mail on: e-mailed (the only copy) and thanked", async () => {
		const { app, sent } = rig({ store: "off" });
		expectThanks(await post(app, "/programare", valid));
		expect(sent[0]?.text).toContain("sistemul de programări: NU");
	});

	it("the chat's compact form is the guide channel, and a page comes from the Referer's path", async () => {
		const { app, fake } = rig();
		await post(
			app,
			"/programare",
			{ ...valid, form: "chat-booking-ab12cd" },
			{
				referer: "http://localhost/terapii/neurofeedback",
			},
		);
		expect(fake.callbacks[0]).toMatchObject({ channel: "guide", page: "/terapii/neurofeedback" });
		await post(app, "/programare", valid, { referer: "http://localhost/x?a=b#c" });
		expect(fake.callbacks[1]?.page).toBe("/x");
		await post(app, "/programare", valid, { referer: "not a url" });
		expect(fake.callbacks[2]?.page).toBe("/contact");
	});

	it("a typed line break cannot add a header or a line to the e-mail", async () => {
		const { app, sent } = rig();
		await post(app, "/programare", { ...valid, name: "Ana\r\nBcc: evil@example.test" });
		expect(sent[0]?.subject).not.toMatch(/[\r\n]/);
		expect(sent[0]?.text).toContain("Nume: Ana Bcc: evil@example.test");
		expect(sent[0]?.text).not.toContain("\nBcc:");
	});
});

describe("a request that is not valid reaches nobody", () => {
	it.each([
		["a name that is too short", { name: "A" }, "Eroare"],
		["no way to reach the person", { email: "", phone: "" }, "Eroare"],
		["a malformed e-mail", { email: "nope" }, "Eroare"],
		["the consent box left empty", { consent: "" }, "acordul"],
		["nobody chosen to book for", { forWhom: "" }, "Eroare"],
	])("%s: the form comes back with the error, nothing stored, nothing sent", async (_why, over, shown) => {
		const { app, fake, sent, log } = rig();
		// "callback" is the picker's "call me instead" mode: the details (and their errors) are on screen.
		const html = await post(app, "/programare", { ...valid, callback: "1", ...over });
		expect(html).toContain("<form");
		expect(html).toContain(shown);
		expect(html).not.toContain("Mulțumim");
		expect(html).not.toContain(FAILED_TITLE);
		expect(fake.callbacks).toEqual([]);
		expect(sent).toEqual([]);
		expect(log).toEqual([]);
	});
});

describe("a chosen time", () => {
	it("held: the confirm step shows, and still nothing is stored or e-mailed", async () => {
		const { app, fake, sent } = rig({ store: { hold: "ok" } });
		const html = await post(app, "/programare", { ...valid, slot: SLOT, service: "evaluation" });
		expect(html).toContain("/programare/confirma");
		expect(fake.callbacks).toEqual([]);
		expect(sent).toEqual([]);
	});

	it("the time was taken: the form comes back, nothing stored or sent", async () => {
		const { app, fake, sent } = rig({ store: { hold: "taken" } });
		const html = await post(app, "/programare", { ...valid, slot: SLOT, service: "evaluation" });
		expect(html).toContain("<form");
		expect(html).not.toContain("Mulțumim");
		expect(fake.callbacks).toEqual([]);
		expect(sent).toEqual([]);
	});

	it("the calendar cannot hold it but the table works: the request is stored with the time asked for, and e-mailed", async () => {
		const { app, fake, sent, failed } = rig({ store: { hold: "down" } });
		expectThanks(await post(app, "/programare", { ...valid, slot: SLOT, service: "evaluation" }));
		expect(failed).toHaveLength(1);
		expect(fake.callbacks[0]).toMatchObject({
			preferredStart: NOW + 86_400_000,
			service: "evaluation",
		});
		expect(sent[0]?.text).toContain("Ora aleasă: ");
	});

	it("the store wholly down: the e-mail carries the time asked for; both down is the honest error", async () => {
		const down = rig({ store: { hold: "down", callbacks: "down" } });
		expectThanks(
			await post(down.app, "/programare", { ...valid, slot: SLOT, service: "evaluation" }),
		);
		expect(down.fake.callbacks).toEqual([]);
		expect(down.sent[0]?.text).toContain("Ora aleasă: ");
		const lost = rig({ store: { hold: "down", callbacks: "down" }, mail: "down" });
		expectHonestFailure(
			await post(lost.app, "/programare", { ...valid, slot: SLOT, service: "evaluation" }),
		);
	});

	it("a malformed slot never reaches the store or the mail: the form comes back with the slot error", async () => {
		const { app, fake, sent } = rig();
		const html = await post(app, "/programare", { ...valid, slot: "forged" });
		expect(html).toContain("<form");
		expect(fake.callbacks).toEqual([]);
		expect(sent).toEqual([]);
	});
});

describe("the confirm step", () => {
	const confirm = {
		...valid,
		reference: "ABCD2345",
		holdToken: "h".repeat(24),
		start: String(NOW + 86_400_000),
	};

	it("submit failing in the store: the request still reaches the team with the held time", async () => {
		const { app, fake, sent, failed } = rig({ store: { submit: "down" } });
		expectThanks(await post(app, "/programare/confirma", confirm));
		expect(failed).toHaveLength(1);
		expect(fake.callbacks[0]).toMatchObject({ preferredStart: NOW + 86_400_000, channel: "form" });
		expect(sent[0]?.text).toContain("Ora aleasă: ");
	});

	it("submit failing and mail failing, the table still takes it: thanked, logged without personal data", async () => {
		const { app, fake, log } = rig({ store: { submit: "down" }, mail: "down" });
		expectThanks(await post(app, "/programare/confirma", confirm));
		expect(fake.callbacks).toHaveLength(1);
		expect(log.join("\n")).not.toMatch(LOG_FORBIDDEN);
	});

	it("everything down: the honest error", async () => {
		const { app } = rig({ store: { submit: "down", callbacks: "down" }, mail: "down" });
		expectHonestFailure(await post(app, "/programare/confirma", confirm));
	});

	it("without consent: the form comes back, nothing stored or sent", async () => {
		const { app, fake, sent } = rig({ store: { submit: "down" } });
		const html = await post(app, "/programare/confirma", { ...confirm, consent: "" });
		expect(html).toContain("<form");
		expect(html).not.toContain("Mulțumim");
		expect(fake.callbacks).toEqual([]);
		expect(sent).toEqual([]);
	});

	it("a refused submit (the hold lapsed) shows the error, and is not a callback", async () => {
		const { app, fake, sent } = rig();
		const html = await post(app, "/programare/confirma", confirm);
		expect(html).toContain("<form");
		expect(fake.callbacks).toEqual([]);
		expect(sent).toEqual([]);
	});
});
