import { ENGLISH, isAbusive, ROMANIAN } from "@psi/engine";
import { describe, expect, it } from "vitest";
import { CLINICAL } from "../profiles/scope";

/** The engine's abuse rules for psi's two languages, with psi's clinical exemption. */
const ABUSE = [...ROMANIAN.abuse, ...ENGLISH.abuse];
const isAbusiveForPsi = (text: string): boolean => isAbusive(text, ABUSE, CLINICAL);

describe("abuse rules", () => {
	it.each([
		["ro, insult", "Ești un idiot"],
		["ro, vocative insult", "Răspunde, prostule"],
		["ro, obscenity", "Du-te dracului"],
		["ro, threat", "Te omor dacă nu-mi răspunzi"],
		["en, insult", "You are useless"],
		["en, obscenity", "fuck this guide"],
		["en, threat", "I will find you"],
		["a slur", "Sunteți niște poponari"],
	])("detects %s", (_label, text) => {
		expect(isAbusiveForPsi(text)).toBe(true);
	});

	it.each([
		[
			"a child swearing at school",
			"Copilul meu spune «du-te dracului» la școală, ce terapii aveți?",
		],
		["tics", "My son has Tourette's and keeps saying fuck, how do you work with tics?"],
		["bullying", "Colegii îi spun fiului meu că e un idiot, aveți psihoterapie?"],
		["an evaluation", "Cum arată o evaluare pentru autism?"],
		["a price", "Cât costă o ședință de logopedie?"],
	])("does not flag %s", (_label, text) => {
		expect(isAbusiveForPsi(text)).toBe(false);
	});
});
