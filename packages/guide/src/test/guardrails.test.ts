import { describe, expect, it } from "vitest";
import { isCrisis } from "../profiles/crisis";
import { isClinical, isOutOfScope, mentionsSisterBrand } from "../profiles/scope";

describe("crisis language", () => {
	it.each([
		["ro, with diacritics", "Nu mai vreau să trăiesc."],
		["ro, without diacritics", "nu mai vreau sa traiesc"],
		["ro, cedilla diacritics", "Vreau să-mi iau viaţa, şi nu mai pot"],
		["ro, killing myself", "Mă gândesc să mă omor"],
		["ro, suicide", "Copilul meu vorbește despre sinucidere"],
		["ro, take my life", "Vreau să-mi iau viața"],
		["ro, self-harm", "Fiica mea se autovătămează, ce fac?"],
		["ro, cutting", "Am început să mă tai pe brațe"],
		["ro, abuse", "Am fost abuzată de un vecin"],
		["ro, hitting", "Tatăl meu mă bate în fiecare seară"],
		["ro, emergency", "Este o urgență, copilul nu mai respiră"],
		["ro, 112", "trebuie sa sun la 112?"],
		["en, suicide", "I keep thinking about suicide"],
		["en, kill myself", "I want to kill myself"],
		["en, want to die", "Sometimes I just want to die"],
		["en, don't want to live", "I don't want to live anymore"],
		["en, self-harm", "My son self-harms"],
		["en, abuse", "My partner abuses me"],
		["en, emergency", "This is an emergency, she is unconscious"],
		["en, overdose", "He took an overdose"],
		["ro, a parent about a son", "Fiul meu spune că vrea să moară"],
		["ro, third person reflexive", "A zis că vrea să se omoare"],
		["ro, a daughter cutting", "Fiica mea se taie pe mâini"],
		["ro, hurting oneself", "Vreau să-mi fac rău"],
		["ro, third person, no will to live", "Nu mai vrea să trăiască"],
		["en, a parent about a daughter", "My daughter says she wants to die"],
		["en, kill himself", "He wants to kill himself"],
		["en, doesn't want to live", "She doesn't want to live"],
		["en, hurting herself", "She keeps hurting herself"],
	])("detects %s", (_label, text) => {
		expect(isCrisis(text)).toBe(true);
	});

	it.each([
		["a process question", "Cum decurge o evaluare?"],
		["an idiom about thinking", "Mă bate gândul să fac o evaluare pentru fiul meu"],
		["an idiom about loving something", "Mă omor după ciocolată, dar asta nu contează"],
		["an urgent booking", "Aveți o programare de urgență săptămâna asta?"],
		["laughing", "I died laughing at the video"],
		["a phone that dies", "My phone is going to die, can you be quick?"],
		["paper cutting", "My child cuts paper with scissors all day"],
		["violet, not violence", "Îmi place culoarea violet"],
		["breathing exercises", "Do the sessions include breathing exercises?"],
		["a room number", "Sala 1125 este la etajul doi?"],
		["dying of laughter", "Îmi vine să mor de râs când îl văd"],
		["taking a life back", "I want to take my life back after burnout"],
	])("does not flag %s", (_label, text) => {
		expect(isCrisis(text)).toBe(false);
	});

	it("still sees crisis language at the start of an over-long message", () => {
		expect(isCrisis(`Vreau să mor. ${"a".repeat(5000)}`)).toBe(true);
	});
});

describe("out-of-scope requests", () => {
	it.each([
		["ro diagnosis", "Copilul meu are ADHD?"],
		["ro diagnosis, no diacritics", "copilul meu e autist?"],
		["ro diagnose me", "Îmi puteți pune un diagnostic?"],
		["ro what does he have", "Ce are copilul meu?"],
		["ro medication", "Ce doză de Ritalin să îi dau?"],
		["ro pills", "Pot lua pastile pentru anxietate?"],
		["ro stop treatment", "Ar trebui să opresc tratamentul cu sertralină?"],
		["ro how do I treat", "Cum îl tratez acasă?"],
		["en diagnosis", "Does my son have autism?"],
		["en am I", "Am I depressed?"],
		["en what's wrong", "What's wrong with me?"],
		["en medication", "Is 50 mg of sertraline too much?"],
		["en should I stop", "Should I stop my medication?"],
		["en how to treat", "How do I treat my daughter's anxiety?"],
		["ro first person, verb first", "Sunt depresiv?"],
		["ro after a greeting", "Bună ziua. Am ADHD?"],
		["ro verb first, named child", "Oare are fiul meu dislexie?"],
	])("refuses %s", (_label, text) => {
		expect(isOutOfScope(text)).toBe(true);
	});

	it.each([
		["the core service question", "Ce tratamente oferiți pentru ADHD?"],
		["a suggestion chip", "Cum decurge o evaluare?"],
		["what is", "Ce este ADHD?"],
		["signs", "Care sunt semnele autismului?"],
		["how do I know", "Cum îmi dau seama dacă copilul meu are autism?"],
		["a statement then a question", "Copilul meu are autism, ce terapii aveți?"],
		["prices", "Cât costă o evaluare QEEG?"],
		["en signs", "What are the signs of ADHD in teenagers?"],
		["en what is", "What is neurofeedback?"],
		["en how do you treat", "How do you work with children with autism?"],
		["headphones", "Do I need headphones for EQ-SYNC?"],
		["a price with a condition", "Care este prețul unei evaluări pentru ADHD?"],
		["therapies for a condition", "Care sunt terapiile pentru autism?"],
		["suitable therapies", "Ce terapii sunt potrivite pentru ADHD?"],
		["en booking an evaluation", "Can we have an ADHD evaluation?"],
		["a child needing an evaluation", "Copilul meu are nevoie de o evaluare pentru ADHD?"],
		["en an evaluation for a son", "Could my son have an evaluation for ADHD?"],
	])("lets through %s", (_label, text) => {
		expect(isOutOfScope(text)).toBe(false);
	});
});

describe("clinical questions and sister brands", () => {
	it("recognises clinical questions in both languages", () => {
		expect(isClinical("Ce terapii aveți pentru anxietate?")).toBe(true);
		expect(isClinical("My son has trouble sleeping")).toBe(true);
		expect(isClinical("Unde vă aflați?")).toBe(false);
	});

	it("finds Hemi-Sync and EQ-SYNC in any spelling", () => {
		expect(mentionsSisterBrand("Încearcă Hemi-Sync®")).toBe(true);
		expect(mentionsSisterBrand("programul eq sync")).toBe(true);
		expect(mentionsSisterBrand("frecvențe binaurale")).toBe(true);
		expect(mentionsSisterBrand("Facem o hartă cerebrală QEEG.")).toBe(false);
	});
});
