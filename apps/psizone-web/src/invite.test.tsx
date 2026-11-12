import { countingScope } from "@psi/site-control";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { HUBS } from "./content/hubs";
import { METHODS } from "./content/methods";
import { registerContentPages } from "./content-routes";
import { psizoneInvite } from "./invite";

describe("Psizone's invitation", () => {
	it("labels the capsule in Psizone's voice, in both languages", () => {
		expect(psizoneInvite("ro", "/").label).toBe("Întreabă-ne orice despre copilul tău");
		expect(psizoneInvite("en", "/en").label).toBe("Ask us anything about your child");
	});

	it("invites an ADHD hub's visitor to ask about ADHD, and asks it on their behalf when clicked", () => {
		const { nudge, placeholders } = psizoneInvite("ro", "/copii/adhd");
		expect(nudge?.text).toBe("Ai o întrebare despre ADHD? Te ajut să găsești pasul potrivit.");
		expect(nudge?.question).toContain("ADHD");
		expect(placeholders[0]).toBe("Întreabă despre ADHD, evaluare sau ce urmează…");
	});

	it("never builds a sentence out of a hub's title alone: every hub has a phrase that reads in one", () => {
		for (const hub of HUBS) {
			const text = psizoneInvite("ro", hub.path).nudge?.text ?? "";
			expect(text, hub.id).toMatch(/^Ai o întrebare despre /);
			expect(text, hub.id).not.toContain("despre După");
			expect(text, hub.id).not.toContain("despre Integrare");
		}
	});

	it("finds a hub under the English prefix and with a trailing slash", () => {
		expect(psizoneInvite("en", "/en/copii/adhd/").nudge?.text).toBe(
			"Have a question about ADHD? I can help you find the right next step.",
		);
	});

	it("explains a method on its page", () => {
		const method = METHODS[0];
		if (method === undefined) throw new Error("no methods");
		const { nudge } = psizoneInvite("ro", method.path);
		expect(nudge?.text).toBe(`Vrei să-ți explic pe scurt ce înseamnă ${method.name.ro}?`);
		expect(nudge?.question).toContain(method.name.ro);
	});

	it("offers to pick a time on the booking page", () => {
		const { nudge, placeholders } = psizoneInvite("ro", "/contact");
		expect(nudge?.text).toBe("Te ajut să alegi o oră?");
		expect(placeholders[0]).toBe("Spune-mi ce zi îți convine…");
	});

	it("greets the home, and offers a short explanation on any other page", () => {
		expect(psizoneInvite("ro", "/").nudge?.text).toContain("Nu știi de unde să începi?");
		expect(psizoneInvite("ro", "/echipa").nudge?.text).toBe(
			"Vrei să-ți explic pe scurt pagina asta?",
		);
	});

	it("keeps the examples the field cycles through, and reports to the site's own signal route", () => {
		const ro = psizoneInvite("ro", "/echipa");
		expect(ro.placeholders).toEqual([
			"Spune-mi ce te îngrijorează la copilul tău…",
			"Cum decurge o evaluare?",
			"De unde încep dacă am o îngrijorare?",
		]);
		expect(ro.signalUrl).toBe("/ghid/signal");
		expect(psizoneInvite("en", "/en/echipa").signalUrl).toBe("/en/ghid/signal");
	});

	it("writes no exclamation mark and no emoji, as the brand book asks", () => {
		const paths = [
			"/",
			"/contact",
			"/echipa",
			...HUBS.map((h) => h.path),
			...METHODS.map((x) => x.path),
		];
		for (const locale of ["ro", "en"] as const) {
			for (const path of paths) {
				const i = psizoneInvite(locale, path);
				const all = [i.label, ...i.placeholders, i.nudge?.text, i.nudge?.question].join(" ");
				expect(all, `${locale} ${path}`).not.toMatch(/!|\p{Extended_Pictographic}/u);
			}
		}
	});
});

describe("a Psizone page, as a visitor receives it", () => {
	const app = new Hono();
	app.use("*", countingScope());
	registerContentPages(app, "ro", "");
	registerContentPages(app, "en", "/en");

	it("carries the nudge for the hub it is, rendered by the server", async () => {
		const html = await (await app.request("/copii/adhd")).text();
		expect(html).toContain("Ai o întrebare despre ADHD? Te ajut să găsești pasul potrivit.");
		expect(html).toContain("Întreabă-ne orice despre copilul tău");
		expect(html).toContain('data-signal-url="/ghid/signal"');
	});

	it("speaks English under /en", async () => {
		const html = await (await app.request("/en/copii/adhd")).text();
		expect(html).toContain("Have a question about ADHD?");
		expect(html).toContain('data-signal-url="/en/ghid/signal"');
	});
});
