import { describe, expect, it } from "vitest";
import {
	createFaithfulness,
	type EvidencePage,
	evidenceFrom,
	FAITHFULNESS_THRESHOLD,
} from "../grounding/faithfulness";
import { BUNDLED_LANGUAGES } from "../language/index";

/** Romanian and English, plus one next step a profile adds (EQ-SYNC's headphones line). */
const faithfulness = createFaithfulness({
	scorerId: "faithfulness",
	packs: BUNDLED_LANGUAGES,
	nextSteps: ["foloseste casti"],
	knownNames: ["Ghidul Psizone"],
});
const splitSentences = faithfulness.sentences.split;
const scoreAnswer = faithfulness.score;

const PASSAGES: Readonly<Record<string, string>> = {
	"1": "Evaluarea durează două ore și include o discuție cu părinții. Raportul se primește în 10 zile lucrătoare.",
	"2": "Terapia ABA se lucrează individual, în ședințe de 50 de minute.",
	"3": "The evaluation takes two hours and includes a talk with the parents. It costs 600 lei.",
	"4": "Evaluarea este făcută de dr. Ana Popescu. The evaluation is run by Dr. Ana Popescu.",
};
const evidence = evidenceFrom(PASSAGES);
const assess = (sentence: string) => faithfulness.assess(sentence, evidence);

describe("sentence assessment", () => {
	it.each([
		["the passage's own words", "Evaluarea durează două ore [1]."],
		[
			"a Romanian paraphrase with inflections",
			"Evaluarea include și o discuție cu voi, părinții [1].",
		],
		["another inflection", "Lucrăm individual cu fiecare copil [2]."],
		["a figure from the passage", "Ședințele durează 50 de minute [2]."],
		["two sources", "Evaluarea durează două ore [1], iar terapia ABA se face individual [2]."],
		["an English paraphrase", "The evaluation lasts two hours and includes the parents [3]."],
		["an English figure", "It costs 600 lei [3]."],
		["a citation list", "Raportul vine în 10 zile lucrătoare după evaluare [1, 2]."],
		["an abbreviated title", "Evaluarea este făcută de dr. Ana Popescu [4]."],
		["an English title", "The evaluation is run by Dr. Ana Popescu [4]."],
		["a fact another shown passage holds", "Evaluarea include o discuție cu părinții [2]."],
		["a supported sentence without a number", "Evaluarea durează două ore."],
		["the profile's own name", "La Psizone, evaluarea durează două ore [1]."],
	])("supports %s", (_label, sentence) => {
		const verdict = assess(sentence);
		expect(verdict.problem).toBeUndefined();
		expect(verdict.severity).toBe("ok");
	});

	it.each([
		["a next step", "Te așteptăm la o programare pentru evaluare."],
		["a recommendation", "Îți recomandăm o evaluare cu un specialist."],
		["a question back", "Vrei să afli și cât costă?"],
		["a courtesy", "Bună ziua."],
		["an English next step", "We recommend booking an evaluation."],
		["a short connective", "Pe scurt:"],
		["an article to read next", "Citește și articolul despre somn."],
		["a hub to see next", "Vezi și hubul nostru de logopedie."],
		["an English article", "Read our article on sleep next."],
		["a profile's own next step", "Folosește căști când asculți sesiunile."],
		["a warm English opener", "Of course, I'd be glad to help you with that."],
		["a warm Romanian opener", "Bună, sigur că te ajutăm cu drag."],
		["an em-dash opener", "Of course — booking is simple."],
		["a closing invitation", "Would you like me to tell you what the first meeting looks like?"],
	])("does not treat %s as a claim", (_label, sentence) => {
		const verdict = assess(sentence);
		expect(verdict.claim).toBe(false);
		expect(verdict.problem).toBeUndefined();
	});

	it.each([
		["a citation to a passage it was never shown", "Evaluarea durează două ore [7].", "uncited"],
		["an invented figure", "Evaluarea durează 3 ore [1].", "figure"],
		["an invented price", "The evaluation costs 450 lei [3].", "figure"],
		["an invented phone number", "Ne poți suna la 0721 000 111 [1].", "figure"],
		["a percentage", "Terapia ABA ajută 86% dintre copii [2].", "figure"],
		["an invented name", "Evaluarea este făcută de dr. Ion Ionescu [4].", "entity"],
		["an invented English name", "The evaluation is run by Dr. Mark Smith [3].", "entity"],
		["an invented surname after an abbreviation", "Evaluarea o face dr. Marin [1].", "entity"],
		["an invented place", "Evaluarea durează două ore, la sediul din Brăila [1].", "entity"],
		["an invented web address", "Programarea se face pe evaluari-rapide.ro [1].", "entity"],
		["a promise the passages do not make", "Terapia ABA vindecă autismul complet [2].", "promise"],
		[
			"a claim dressed as a next step",
			"Vezi cum terapia ABA vindecă autismul complet la copii.",
			"promise",
		],
		["a promise behind a warm opener", "Sigur, terapia ABA vindecă autismul [2].", "promise"],
		["an English cure claim", "ABA therapy cures every child for good [2].", "promise"],
	])("refuses %s", (_label, sentence, problem) => {
		const verdict = assess(sentence);
		expect(verdict.problem).toBe(problem);
		expect(verdict.severity).toBe("refuse");
	});

	it("leaves out an unsupported sentence that invents no fact", () => {
		const verdict = assess("Echipa noastră lucrează cu multă răbdare și atenție [1].");
		expect(verdict.problem).toBe("unsupported");
		expect(verdict.severity).toBe("drop");
	});

	it("matches figures whole, not inside longer numbers", () => {
		expect(assess("Ședințele au 5 minute de pauză [2].").problem).toBe("figure");
	});

	it("supports a short line pointing to a page that was shown", () => {
		const pages: ReadonlyArray<EvidencePage> = [
			{ n: 1, title: "Ce cere formularul de programare", url: "/contact" },
		];
		const verdict = faithfulness.assess(
			"Totul se face simplu, de pe pagina de contact.",
			evidenceFrom({ "1": "Cererea de programare cere doar numele." }, pages),
		);
		expect(verdict).toMatchObject({ severity: "ok", page: 1 });
	});

	it("does not end a sentence at an abbreviation or an initial", () => {
		expect(
			splitSentences("Ne găsești pe str. Brăilei nr. 5, la dr. A. Popescu [1]. Apoi discutăm."),
		).toEqual(["Ne găsești pe str. Brăilei nr. 5, la dr. A. Popescu [1].", "Apoi discutăm."]);
	});

	it("splits sentences at sentence ends and newlines, not inside numbers", () => {
		expect(splitSentences("Durează 2.5 ore [1]. Apoi discutăm.\nLa final [1]!")).toEqual([
			"Durează 2.5 ore [1].",
			"Apoi discutăm.",
			"La final [1]!",
		]);
	});
});

/** The two Psizone seed passages the live booking questions found (packages/knowledge seed). */
const BOOKING_RO: Readonly<Record<string, string>> = {
	"1": [
		"## Cererea de programare",
		"Cererea de programare de pe pagina de contact cere doar date pentru organizare, niciodată detalii medicale:",
		"- numele tău;",
		"- un e-mail sau un număr de telefon (ne ajunge unul dintre ele);",
		"- pentru cine e evaluarea: un copil, un adolescent sau pentru tine;",
		"- când te putem suna: dimineața, după-amiaza sau oricând;",
		"- acordul tău să fii contactat de Psizone pentru programare.",
		"Formularul nu are un câmp de text liber.",
	].join("\n"),
	"2": [
		"## Telefon",
		"Poți suna direct la centrul Psizone, la unul dintre cele două numere de telefon publicate pe psizone.ro:",
		"- 0748 017 752",
		"- 0752 466 792",
		"## Dacă preferi să scrii",
		"Pe pagina de contact poți lăsa și o cerere de programare, cu un e-mail sau un număr de telefon. Nu îți cerem detalii medicale în cerere.",
	].join("\n"),
};
const BOOKING_EN: Readonly<Record<string, string>> = {
	"1": [
		"## The appointment request",
		"The appointment request on the contact page asks only for logistics, never for medical details:",
		"- your name;",
		"- an email or a phone number (either one is enough);",
		"- who the evaluation is for: a child, a teenager or you;",
		"- when we can call you: morning, afternoon or any time;",
		"- your consent to be contacted by Psizone about an appointment.",
	].join("\n"),
	"2": [
		"## Phone",
		"You can call the Psizone centre directly, on either of the two phone numbers published on psizone.ro:",
		"- 0748 017 752",
		"- 0752 466 792",
	].join("\n"),
};
const CONTACT_PAGES: ReadonlyArray<EvidencePage> = [
	{ n: 1, title: "Ce cere formularul de programare", url: "/contact" },
	{ n: 2, title: "Telefoanele Psizone", url: "/contact" },
];

describe("the live answers that were refused (2026-11-12), as fixtures", () => {
	it("passes the Romanian booking answer", async () => {
		const answer = [
			"Poți face o programare în două moduri.",
			"Pe pagina de contact găsești un formular simplu, care cere doar date pentru organizare: numele tău, un e-mail sau un număr de telefon, pentru cine e evaluarea și când te putem suna [1].",
			"Dacă preferi, poți suna direct la centrul Psizone, la 0748 017 752 sau la 0752 466 792 [2].",
			"Formularul nu îți cere detalii medicale [1].",
		].join(" ");
		const ev = evidenceFrom(BOOKING_RO, CONTACT_PAGES);
		for (const sentence of splitSentences(answer)) {
			expect(faithfulness.assess(sentence, ev).severity).not.toBe("refuse");
		}
		const score = await scoreAnswer(answer, BOOKING_RO, { pages: CONTACT_PAGES });
		expect(score.passed).toBe(true);
		expect(score.claims).toBeGreaterThanOrEqual(3);
	});

	it("passes the English booking answer, phones cited to the request passage", async () => {
		const answer =
			"You can book an evaluation through the appointment request on the contact page, or call the Psizone centre on 0748 017 752 or 0752 466 792 [1].";
		const score = await scoreAnswer(answer, BOOKING_EN, { pages: CONTACT_PAGES });
		expect(score).toMatchObject({ score: 1, claims: 1, supported: 1, passed: true });
	});

	it("still refuses the same answer with an invented number, price or name", () => {
		const ev = evidenceFrom(BOOKING_EN, CONTACT_PAGES);
		for (const sentence of [
			"You can call the Psizone centre on 0748 017 999 [2].",
			"The evaluation costs 300 lei, paid at the contact desk [1].",
			"Dr. Elena Marin will call you back about the appointment [1].",
		]) {
			expect(faithfulness.assess(sentence, ev).severity).toBe("refuse");
		}
	});
});

describe("the faithfulness scorer (Mastra createScorer)", () => {
	it("scores a faithful answer 1 and passes it", async () => {
		const score = await scoreAnswer(
			"Evaluarea durează două ore [1]. Lucrăm individual [2]. Te așteptăm la o programare.",
			PASSAGES,
		);
		expect(score).toEqual({
			scorer: "faithfulness",
			score: 1,
			claims: 2,
			supported: 2,
			passed: true,
			dropped: 0,
		});
	});

	it("fails an answer with one unsupported claim", async () => {
		const score = await scoreAnswer(
			"Evaluarea durează două ore [1]. Terapia ABA vindecă autismul complet [2].",
			PASSAGES,
		);
		expect(score.score).toBe(0.5);
		expect(score.score).toBeLessThan(FAITHFULNESS_THRESHOLD);
		expect(score.passed).toBe(false);
	});

	it("fails an answer that makes no claim at all", async () => {
		const score = await scoreAnswer("Da [1].", PASSAGES);
		expect(score).toMatchObject({ score: 0, claims: 0, passed: false });
	});
});
