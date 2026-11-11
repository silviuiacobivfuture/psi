import type { ArticleInput } from "../schema";

/**
 * What EQ-SYNC is and is not. It touches safety (contraindications), so it is a health draft: it
 * needs a named clinical reviewer before it can be published. Every fact comes from the files in
 * `provenance`; no efficacy claim is made.
 */
export const EQSYNC_CE_ESTE: ArticleInput = {
	slug: "eqsync-ce-este-si-ce-nu-este",
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
		"apps/eqsync-web/messages/ro.json: meta_description, problem_*, faq_4_*, faq_5_*, footer_disclaimer, guide_refusal_out_of_scope, fq_age_a",
		"packages/design/brand-books/2-eq-sync.md: audience, “never efficacy percentages”",
		"docs/brands/CONTEXT.md: EQ-SYNC is a 21-day guided binaural sound programme for mental calm",
	],
	title: {
		ro: "EQ-SYNC: ce este și ce nu este",
		en: "EQ-SYNC: what it is and what it isn’t",
	},
	standfirst: {
		ro: "EQ-SYNC este un program de exerciții audio ghidate pentru liniște mentală, construit pe frecvențe binaurale și ascultat cu căștile. Este un instrument de wellness, nu un dispozitiv medical, și nu înlocuiește consultul sau tratamentul medical.",
		en: "EQ-SYNC is a programme of guided audio exercises for mental calm, built on binaural beats and listened to with headphones. It is a wellness tool, not a medical device, and it does not replace medical advice or treatment.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: EQ-SYNC îți oferă un drum de 21 de zile, sesiune cu sesiune, cu exerciții ghidate pe care le asculți în căști. Nu pune diagnostice, nu tratează nimic și nu ține locul medicului sau psihologului.",
				en: "In short: EQ-SYNC offers you a 21-day path, session by session, with guided exercises you listen to on headphones. It does not diagnose, it does not treat anything, and it does not take the place of a doctor or a psychologist.",
			},
		},
		{ type: "h2", text: { ro: "Ce este", en: "What it is" } },
		{
			type: "list",
			items: [
				{
					ro: "Un program gratuit de 21 de zile, cu 4 exerciții ghidate pe frecvențe binaurale.",
					en: "A free 21-day programme, with 4 guided exercises built on binaural beats.",
				},
				{
					ro: "Exerciții pe care le asculți cu căștile, în ritmul tău, într-un loc liniștit.",
					en: "Exercises you listen to with headphones, at your own pace, somewhere quiet.",
				},
				{
					ro: "După cele 21 de zile, protocoale pe care le alegi tu, dacă vrei să continui.",
					en: "After the 21 days, protocols you choose yourself, if you want to carry on.",
				},
			],
		},
		{ type: "h2", text: { ro: "Pentru cine l-am gândit", en: "Who we made it for" } },
		{
			type: "p",
			text: {
				ro: "Pentru oamenii la care mintea rămâne „pe fugă” mult după ce pericolul a trecut: gânduri care nu se opresc, un somn după care te trezești tot obosit, un corp care rămâne în stare de veghe după ce motivul stresului a dispărut.",
				en: "For people whose minds stay “on the run” long after the danger has passed: thoughts that won’t stop, sleep you still wake up tired from, a body that stays on watch after the reason for the stress has gone.",
			},
		},
		{ type: "h2", text: { ro: "Ce nu este", en: "What it isn’t" } },
		{
			type: "list",
			items: [
				{ ro: "Nu este un dispozitiv medical.", en: "It is not a medical device." },
				{
					ro: "Nu este un tratament și nu înlocuiește consultul sau tratamentul medical.",
					en: "It is not a treatment, and it does not replace medical advice or treatment.",
				},
				{
					ro: "Nu îți promite rezultate în cifre. Îți promite o structură: zile, sesiuni, minute.",
					en: "It does not promise you results in figures. It promises you a structure: days, sessions, minutes.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Ghidul EQ-SYNC nu răspunde la întrebări despre diagnostic, medicație sau tratament. Pentru ele, vorbește cu medicul tău.",
				en: "The EQ-SYNC guide does not answer questions about diagnosis, medication or treatment. For those, talk to your doctor.",
			},
		},
		{ type: "h2", text: { ro: "Când nu îl folosești", en: "When not to use it" } },
		{
			type: "p",
			text: {
				ro: "Persoanele cu epilepsie sau cu afecțiuni convulsive nu folosesc audio binaural fără acordul medicului. Programul este pentru persoane care au împlinit 18 ani.",
				en: "People with epilepsy or seizure disorders do not use binaural audio without their doctor’s agreement. The programme is for people aged 18 or over.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor: citește întrebările frecvente de pe site-ul EQ-SYNC înainte să începi.",
				en: "Next step: read the frequently asked questions on the EQ-SYNC site before you start.",
			},
		},
	],
};
