import type { ArticleInput } from "../schema";

/**
 * The 21 days of the free EQ-SYNC programme, as the EQ-SYNC site describes them. No prices (they
 * are not set yet) and no efficacy claim. It carries the contraindication (safety copy), so it is a
 * health draft: it needs a named clinical reviewer before it can be published.
 */
export const EQSYNC_21_ZILE: ArticleInput = {
	slug: "programul-gratuit-de-21-de-zile",
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
		"apps/eqsync-web/messages/ro.json: hero_*, path_*, tracker_note, faq_2_a, faq_3_a, protocols_*, protocol_*_title, closing_text",
		"apps/eqsync-web/messages/ro.json: fq_start_a, fq_protocol_a, fq_swap_a, fq_age_a, pp_cat_title",
		"packages/design/brand-books/2-eq-sync.md: structure (day, session, minutes), no streak-shaming",
		"docs/brands/CONTEXT.md: the 21-day guided binaural sound programme",
	],
	title: {
		ro: "Cum arată cele 21 de zile ale programului gratuit",
		en: "What the 21 days of the free programme look like",
	},
	standfirst: {
		ro: "Patru exerciții ghidate, ascultate cu căștile, în ritmul tău, timp de 21 de zile de la confirmarea adresei de email. În ziua 20 se deblochează un exercițiu bonus, care rămâne al tău și după program.",
		en: "Four guided exercises, listened to with headphones, at your own pace, for 21 days from the moment you confirm your email address. On day 20 a bonus exercise unlocks, and it stays yours after the programme.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: programul gratuit EQ-SYNC durează 21 de zile și are 4 exerciții ghidate pe frecvențe binaurale. Le asculți cu căștile, când vrei și de câte ori vrei, până la ziua 21. Primele 21 de zile sunt din partea noastră, fără obligații.",
				en: "In short: the free EQ-SYNC programme lasts 21 days and has 4 guided exercises built on binaural beats. You listen with headphones, whenever you like and as often as you like, until day 21. The first 21 days are on us, with no strings attached.",
			},
		},
		{ type: "h2", text: { ro: "Ziua 1", en: "Day 1" } },
		{
			type: "p",
			text: {
				ro: "Drumul începe la confirmarea emailului. Din acel moment se numără cele 21 de zile.",
				en: "The journey starts when you confirm your email. The 21 days are counted from that moment.",
			},
		},
		{ type: "h2", text: { ro: "Sesiune cu sesiune", en: "Session by session" } },
		{
			type: "list",
			items: [
				{
					ro: "Pui căștile. Alegi un moment liniștit al zilei și un loc unde nu te grăbește nimeni.",
					en: "Put your headphones on. Choose a quiet moment of the day and a place where nobody is rushing you.",
				},
				{
					ro: "Parcurgi exercițiile. Cele 4 exerciții ghidate, în ritmul tău. Le poți relua oricând în cele 21 de zile.",
					en: "Work through the exercises. The 4 guided exercises, at your own pace. You can repeat them any time during the 21 days.",
				},
				{
					ro: "Ziua 20. Se deblochează exercițiul bonus „Relaxare profundă”, care rămâne al tău și după program.",
					en: "Day 20. The bonus exercise “Deep relaxation” unlocks, and it stays yours after the programme.",
				},
			],
		},
		{
			type: "quote",
			text: {
				ro: "Nu există zile ratate, doar zile adăugate.",
				en: "There are no missed days, only days added.",
			},
		},
		{
			type: "p",
			text: {
				ro: "În programul tău se adună zilele în care asculți.",
				en: "Your programme collects the days you listen.",
			},
		},
		{ type: "h2", text: { ro: "După ziua 21", en: "After day 21" } },
		{
			type: "p",
			text: {
				ro: "Cele 4 exerciții gratuite se închid după ziua 21, iar înainte de asta primești un email. Exercițiul bonus „Relaxare profundă” rămâne al tău.",
				en: "The 4 free exercises close after day 21, and you get an email before that happens. The bonus exercise “Deep relaxation” stays yours.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă vrei să continui, alegi protocoale. Un protocol e un set de 4 exerciții ghidate pe o temă, iar tu îl alegi lună de lună și îl poți schimba de la o lună la alta. Protocoalele sunt grupate în 10 categorii, de exemplu:",
				en: "If you want to carry on, you choose protocols. A protocol is a set of 4 guided exercises on one theme; you choose it month by month and can swap it from one month to the next. Protocols are grouped into 10 categories, for example:",
			},
		},
		{
			type: "list",
			items: [
				{ ro: "Calmare, stres și reglare", en: "Calm, stress and regulation" },
				{ ro: "Somn și regenerare", en: "Sleep and recovery" },
				{ ro: "Claritate mentală și decizii", en: "Mental clarity and decisions" },
			],
		},
		{ type: "h2", text: { ro: "Înainte să începi", en: "Before you start" } },
		{
			type: "p",
			text: {
				ro: "Programul este pentru persoane care au împlinit 18 ani. EQ-SYNC este un instrument de wellness, nu un dispozitiv medical. Persoanele cu epilepsie sau cu afecțiuni convulsive nu folosesc audio binaural fără acordul medicului.",
				en: "The programme is for people aged 18 or over. EQ-SYNC is a wellness tool, not a medical device. People with epilepsy or seizure disorders do not use binaural audio without their doctor’s agreement.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor: primul pas e o singură sesiune, în ritmul tău. Începi programul gratuit de pe site-ul EQ-SYNC.",
				en: "Next step: the first step is a single session, at your own pace. You start the free programme on the EQ-SYNC site.",
			},
		},
	],
};
