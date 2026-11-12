import { answerText, collect, shape } from "@psi/engine/testing";
import { afterEach, describe, expect, it } from "vitest";
import { passage, type SearchBehaviour, source } from "./fake-knowledge";
import { closeAll, startGuide } from "./harness";

afterEach(closeAll);

/** Psizone's two booking passages (the seed), as the live questions found them. */
const REQUEST_EN = source("psizone-en-booking-request", "What the appointment request asks for");
const PHONES_EN = source("psizone-en-contact-phones", "Psizone phone numbers");
const BOOKING_EN: SearchBehaviour = {
	kind: "passages",
	passages: [
		passage(
			REQUEST_EN,
			"The appointment request on the contact page asks only for logistics, never for medical details:\n- your name;\n- an email or a phone number (either one is enough);\n- who the evaluation is for: a child, a teenager or you;\n- when we can call you: morning, afternoon or any time;",
		),
		passage(
			PHONES_EN,
			"You can call the Psizone centre directly, on either of the two phone numbers published on psizone.ro:\n- 0748 017 752\n- 0752 466 792\nThe contact page also takes an appointment request, with an email or a phone number. We don't ask for medical details in the request: we talk about what worries you on the phone.",
		),
	],
};
const REQUEST_RO = source("psizone-ro-booking-request", "Ce cere formularul de programare");
const PHONES_RO = source("psizone-ro-contact-phones", "Telefoanele Psizone");
const BOOKING_RO: SearchBehaviour = {
	kind: "passages",
	passages: [
		passage(
			REQUEST_RO,
			"Cererea de programare de pe pagina de contact cere doar date pentru organizare, niciodată detalii medicale:\n- numele tău;\n- un e-mail sau un număr de telefon (ne ajunge unul dintre ele);\n- pentru cine e evaluarea: un copil, un adolescent sau pentru tine;\n- când te putem suna: dimineața, după-amiaza sau oricând;",
		),
		passage(
			PHONES_RO,
			"Poți suna direct la centrul Psizone, la unul dintre cele două numere de telefon publicate pe psizone.ro:\n- 0748 017 752\n- 0752 466 792\nPe pagina de contact poți lăsa și o cerere de programare, cu un e-mail sau un număr de telefon. Nu îți cerem detalii medicale în cerere: despre ce te îngrijorează vorbim la telefon.",
		),
	],
};

/** Streams text the way a model does: a few characters at a time. */
function tokens(text: string, size = 6): Array<string> {
	const out: Array<string> = [];
	for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
	return out;
}

const WARM_EN =
	"Of course — booking is simple. You can call us on 0748 017 752 or 0752 466 792, or send the appointment request on the contact page, which asks only for your name, an email or phone number, who the evaluation is for, and when we can call you [1][2].\n\nWe don't ask for medical details in the request — we talk about what worries you on the phone [1].\n\nWould you like me to tell you what the first meeting looks like?";
const WARM_RO =
	"Bună, sigur că te ajutăm. Poți suna direct la centrul Psizone, la 0748 017 752 sau 0752 466 792 [2]. Sau poți lăsa o cerere de programare pe pagina de contact: îți cere doar numele, un e-mail sau un număr de telefon, pentru cine e evaluarea și când te putem suna [1].\n\nNu îți cerem detalii medicale în cerere [2].\n\nVrei să-ți spun cum arată prima întâlnire?";

describe("warm, conversational answers (the live answers of 2026-11-12)", () => {
	it.each([
		["en", WARM_EN, BOOKING_EN, "Hi! How do I book an evaluation for my daughter?"],
		["ro", WARM_RO, BOOKING_RO, "Bună, mă poți ajuta? Vreau să programez o evaluare."],
	] as const)("%s: streams the whole answer, opener and closing question kept, and passes", async (locale, answer, found, question) => {
		const { guide, scores } = await startGuide({
			replies: [{ kind: "text", chunks: tokens(answer) }],
			searches: [found],
		});
		const events = await collect(guide.ask({ question, locale }));
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		const text = answerText(events);
		expect(
			text.startsWith(locale === "en" ? "Of course — booking is simple." : "Bună, sigur"),
		).toBe(true);
		expect(text.trimEnd().endsWith("?")).toBe(true);
		expect(scores).toHaveLength(1);
		expect(scores[0]).toMatchObject({ score: 1, passed: true, dropped: 0 });
		expect(scores[0]?.claims).toBeGreaterThanOrEqual(2);
	});

	it("still refuses the warm answer with an invented phone number", async () => {
		const { guide } = await startGuide({
			replies: [{ kind: "text", chunks: tokens(WARM_EN.replace("0752 466 792", "0752 466 000")) }],
			searches: [BOOKING_EN],
		});
		const events = await collect(guide.ask({ question: "How do I book?", locale: "en" }));
		expect(shape(events).slice(-2)).toEqual(["refusal:no_content", "done"]);
		expect(answerText(events)).not.toContain("466 000");
	});
});

describe("the separators the model wrote", () => {
	it.each([
		1, 2, 3, 7,
	])("keep a paragraph break after an uncited opener (tokens of %i)", async (size) => {
		const answer =
			"Bună, sigur că te ajutăm. \n\nPoți suna direct la centrul Psizone, la 0748 017 752 sau 0752 466 792 [2].\nNu îți cerem detalii medicale în cerere [2].";
		const { guide } = await startGuide({
			replies: [{ kind: "text", chunks: tokens(answer, size) }],
			searches: [BOOKING_RO],
		});
		const events = await collect(guide.ask({ question: "Cum vă pot suna?", locale: "ro" }));
		expect(shape(events)).toEqual(["thinking", "text", "sources", "done"]);
		const text = answerText(events);
		expect(text).toContain("ajutăm. \n\nPoți suna");
		expect(text).toContain("[1].\nNu îți cerem");
		expect(text).not.toMatch(/\.[A-ZĂÂÎȘȚ]/);
	});

	it("keeps one separator where a sentence was left out", async () => {
		const answer =
			"Poți suna direct la centrul Psizone, la 0748 017 752 [2]. Echipa lucrează cu multă răbdare și atenție [2].\n\nNu îți cerem detalii medicale în cerere [2].";
		const { guide } = await startGuide({
			replies: [{ kind: "text", chunks: tokens(answer, 4) }],
			searches: [BOOKING_RO],
		});
		const text = answerText(
			await collect(guide.ask({ question: "Cum vă pot suna?", locale: "ro" })),
		);
		expect(text).not.toContain("răbdare");
		expect(text).toMatch(/\[1\]\.\s+Nu îți cerem/);
	});
});
