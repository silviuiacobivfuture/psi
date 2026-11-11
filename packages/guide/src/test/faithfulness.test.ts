import { describe, expect, it } from "vitest";
import {
	assessSentence,
	FAITHFULNESS_THRESHOLD,
	type PassageLookup,
	scoreAnswer,
} from "../faithfulness";
import { splitSentences } from "../sentences";

const PASSAGES: Readonly<Record<string, string>> = {
	"1": "Evaluarea durează două ore și include o discuție cu părinții. Raportul se primește în 10 zile lucrătoare.",
	"2": "Terapia ABA se lucrează individual, în ședințe de 50 de minute.",
	"3": "The evaluation takes two hours and includes a talk with the parents. It costs 600 lei.",
	"4": "Evaluarea este făcută de dr. Ana Popescu. The evaluation is run by Dr. Ana Popescu.",
};

const lookup: PassageLookup = (n) => PASSAGES[String(n)];

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
	])("supports %s", (_label, sentence) => {
		expect(assessSentence(sentence, lookup).problem).toBeUndefined();
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
		["the EQ-SYNC headphones line", "Folosește căști când asculți sesiunile."],
	])("does not treat %s as a claim", (_label, sentence) => {
		const verdict = assessSentence(sentence, lookup);
		expect(verdict.claim).toBe(false);
		expect(verdict.problem).toBeUndefined();
	});

	it.each([
		["an uncited claim", "Evaluarea durează două ore.", "uncited"],
		["a citation to a passage it was never shown", "Evaluarea durează două ore [7].", "uncited"],
		["a figure the cited passage lacks", "Evaluarea durează 3 ore [1].", "figure"],
		["a figure from another passage", "Ședințele durează 50 de minute [1].", "figure"],
		["a percentage", "Terapia ABA ajută 86% dintre copii [2].", "figure"],
		[
			"a claim the passage does not make",
			"Terapia ABA vindecă autismul complet [2].",
			"unsupported",
		],
		["the wrong passage", "Evaluarea include o discuție cu părinții [2].", "unsupported"],
		[
			"a claim dressed as a next step",
			"Vezi cum terapia ABA vindecă autismul complet la copii.",
			"uncited",
		],
	])("refuses %s", (_label, sentence, problem) => {
		expect(assessSentence(sentence, lookup).problem).toBe(problem);
	});

	it("matches figures whole, not inside longer numbers", () => {
		expect(assessSentence("Ședințele au 5 minute de pauză [2].", lookup).problem).toBe("figure");
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

describe("the faithfulness scorer (Mastra createScorer)", () => {
	it("scores a faithful answer 1 and passes it", async () => {
		const score = await scoreAnswer(
			"Evaluarea durează două ore [1]. Lucrăm individual [2]. Te așteptăm la o programare.",
			PASSAGES,
		);
		expect(score).toEqual({
			scorer: "psi-faithfulness",
			score: 1,
			claims: 2,
			supported: 2,
			passed: true,
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
