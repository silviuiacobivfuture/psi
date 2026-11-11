import type { ArticleInput } from "../schema";

/**
 * Why EQ-SYNC is heard through headphones. Every fact comes from the EQ-SYNC site copy and brand
 * book listed in `provenance`; no efficacy claim is made. It carries the contraindication (safety
 * copy), so it is a health draft: it needs a named clinical reviewer before it can be published.
 */
export const EQSYNC_CASTI: ArticleInput = {
	slug: "de-ce-ai-nevoie-de-casti",
	brand: "eqsync",
	topic: "programul-eqsync",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	provenance: [
		"apps/eqsync-web/messages/ro.json: method_*, faq_1_*, faq_4_a, faq_5_a, path_step_1_text, sample_note",
		"packages/design/brand-books/2-eq-sync.md: the mechanism line, “always say when headphones are needed”",
	],
	title: {
		ro: "De ce ai nevoie de căști pentru EQ-SYNC",
		en: "Why EQ-SYNC needs headphones",
	},
	standfirst: {
		ro: "Pentru că fiecare ureche trebuie să primească un ton ușor diferit. Difuzoarele amestecă cele două tonuri înainte să ajungă la urechi, așa că efectul binaural nu mai apare. Orice căști cu sunet separat pentru stânga și dreapta sunt suficiente.",
		en: "Because each ear has to receive a slightly different tone. Speakers mix the two tones before they reach your ears, so the binaural effect does not appear. Any headphones with separate left and right sound will do.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: exercițiile EQ-SYNC sunt construite pe frecvențe binaurale, iar frecvențele binaurale au nevoie ca fiecare ureche să audă altceva. Asta pot face căștile. Difuzoarele, nu.",
				en: "In short: EQ-SYNC exercises are built on binaural beats, and binaural beats need each ear to hear something different. Headphones can do that. Speakers can’t.",
			},
		},
		{ type: "h2", text: { ro: "Ce se întâmplă, pe scurt", en: "What happens, briefly" } },
		{
			type: "p",
			text: {
				ro: "Fiecare ureche primește un ton ușor diferit; creierul recompune diferența. Prin căști, urechea stângă aude un ton, iar urechea dreaptă unul foarte apropiat ca frecvență.",
				en: "Each ear receives a slightly different tone; the brain puts the difference back together. Through headphones, the left ear hears one tone and the right ear hears one very close to it in frequency.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Fenomenul se numește bătaie binaurală: creierul percepe un al treilea ton, care nu există fizic în afara lui.",
				en: "This is called a binaural beat: the brain perceives a third tone that does not physically exist outside it.",
			},
		},
		{ type: "h2", text: { ro: "De ce nu merg difuzoarele", en: "Why speakers don’t work" } },
		{
			type: "p",
			text: {
				ro: "Difuzoarele amestecă cele două tonuri în cameră, înainte să ajungă la urechi. Fiecare ureche aude atunci amândouă tonurile, iar diferența pe care ar fi trebuit să o recompună creierul dispare.",
				en: "Speakers mix the two tones in the room, before they reach your ears. Each ear then hears both tones, and the difference the brain should have put back together is gone.",
			},
		},
		{ type: "h2", text: { ro: "Ce căști îți trebuie", en: "Which headphones you need" } },
		{
			type: "p",
			text: {
				ro: "Nu ai nevoie de echipament special. Îți trebuie doar căști cu sunet separat pentru stânga și dreapta.",
				en: "You don’t need special equipment. All you need are headphones with separate left and right sound.",
			},
		},
		{ type: "h2", text: { ro: "Cum asculți", en: "How to listen" } },
		{
			type: "list",
			items: [
				{
					ro: "Alege un moment liniștit al zilei și un loc unde nu te grăbește nimeni.",
					en: "Choose a quiet moment of the day and a place where nobody is rushing you.",
				},
				{
					ro: "Pune căștile înainte să pornești exercițiul.",
					en: "Put your headphones on before you start the exercise.",
				},
				{
					ro: "Sunetul pornește doar când apeși tu.",
					en: "The sound starts only when you press play.",
				},
			],
		},
		{ type: "h2", text: { ro: "Înainte să începi", en: "Before you start" } },
		{
			type: "p",
			text: {
				ro: "EQ-SYNC este un instrument de wellness, nu un dispozitiv medical, și nu înlocuiește consultul sau tratamentul medical. Persoanele cu epilepsie sau cu afecțiuni convulsive nu folosesc audio binaural fără acordul medicului.",
				en: "EQ-SYNC is a wellness tool, not a medical device, and it does not replace medical advice or treatment. People with epilepsy or seizure disorders do not use binaural audio without their doctor’s agreement.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor: pune căștile și ascultă fragmentul de aproximativ două minute de pe site-ul EQ-SYNC.",
				en: "Next step: put your headphones on and listen to the two-minute excerpt on the EQ-SYNC site.",
			},
		},
	],
};
