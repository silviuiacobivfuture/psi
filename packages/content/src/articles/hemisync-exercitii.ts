import type { ArticleInput } from "../schema";

/**
 * Where to begin with Hemi-Sync®: the free exercises, then the programmes. Every fact comes from
 * the files in `provenance`; the mechanism is described, not its effects. Draft until approved.
 */
export const HEMISYNC_EXERCITII: ArticleInput = {
	slug: "cum-incepi-exercitiile-gratuite-hemi-sync",
	brand: "hemisync",
	topic: "explorarea-constiintei",
	backlogNo: null,
	status: "draft",
	kind: "editorial",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	provenance: [
		"apps/hemisync-web/messages/ro.json: exercises_*, ex_*, tech_text (first sentence), tech_headphones, method_*, gateway_*, synccreation_*, lucid_*, club_*",
		"apps/hemisync-web/messages/ro.json: footer_trademarks",
		"packages/design/brand-books/3-hemi-sync.md: free exercises before the shop, ® on first use",
	],
	title: {
		ro: "Cum începi: exercițiile gratuite Hemi-Sync®",
		en: "Where to begin: the free Hemi-Sync® exercises",
	},
	standfirst: {
		ro: "Începe cu exercițiile gratuite, ascultate direct pe site, fără plată: în căști, într-o poziție confortabilă, într-un loc liniștit unde nu vei fi deranjat. Abia după aceea alegi un program.",
		en: "Start with the free exercises, played straight from the site at no cost: on headphones, in a comfortable position, somewhere quiet where you won’t be disturbed. Only after that do you choose a programme.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: patru exerciții audio Hemi-Sync® sunt gratuite. Le asculți direct de pe site, fără plată.",
				en: "In short: four Hemi-Sync® audio exercises are free. You listen to them straight from the site, at no cost.",
			},
		},
		{ type: "h2", text: { ro: "Cele patru exerciții", en: "The four exercises" } },
		{
			type: "list",
			items: [
				{
					ro: "Introducere în tehnologia Hemi-Sync®: te familiarizează cu tehnologia audio: liniștirea activității mentale și relaxarea corpului.",
					en: "Introduction to Hemi-Sync® technology: it introduces you to the audio technology: quieting mental activity and relaxing the body.",
				},
				{
					ro: "Intro to DEC: exercițiul introductiv al Clubului Delfinului (Dolphin Energy Club), creat în cadrul Monroe Institute.",
					en: "Intro to DEC: the introductory exercise of the Dolphin Energy Club, created at the Monroe Institute.",
				},
				{
					ro: "Forgiveness („Iertarea”): o meditație oferită de Institutul Monroe celor care poartă amintiri dureroase.",
					en: "Forgiveness: a meditation the Monroe Institute offers to those who carry painful memories.",
				},
				{
					ro: "Spirit of the Season: un exercițiu de sărbători, o călătorie scurtă către cei dragi și către Pământul văzut de sus, cu zăpadă.",
					en: "Spirit of the Season: a holiday exercise, a short journey to your loved ones and to the Earth seen from above, under snow.",
				},
			],
		},
		{ type: "h2", text: { ro: "Cum asculți", en: "How to listen" } },
		{
			type: "p",
			text: {
				ro: "Tehnologia Hemi-Sync® transmite sunete precise, ușor diferite, către fiecare ureche. De aceea asculți în căști. Sunt tonuri joase: pe difuzoarele laptopului aproape nu se aud, iar efectul binaural nu apare deloc.",
				en: "Hemi-Sync® technology sends precise, slightly different sounds to each ear. That is why you listen on headphones. These are low tones: on laptop speakers they are barely audible, and the binaural effect does not appear at all.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Alege o poziție confortabilă și un loc liniștit, unde nu vei fi deranjat.",
				en: "Choose a comfortable position and a quiet place where you won’t be disturbed.",
			},
		},
		{ type: "h2", text: { ro: "O metodă, nu o credință", en: "A method, not a belief" } },
		{
			type: "p",
			text: {
				ro: "Hemi-Sync® nu îți cere să crezi nimic. Îți oferă experiența directă: tehnologii audio care te susțin în explorarea propriei conștiințe, cu respect deplin pentru liberul tău arbitru.",
				en: "Hemi-Sync® does not ask you to believe anything. It offers you direct experience: audio technologies that support you in exploring your own consciousness, with full respect for your free will.",
			},
		},
		{ type: "h2", text: { ro: "După exercițiile gratuite", en: "After the free exercises" } },
		{
			type: "list",
			items: [
				{
					ro: "Gateway Voyage®: programul fundamental de explorare a conștiinței.",
					en: "Gateway Voyage®: the foundational programme for exploring consciousness.",
				},
				{
					ro: "SyncCreation®: devino un co-creator conștient al vieții tale.",
					en: "SyncCreation®: become a conscious co-creator of your life.",
				},
				{
					ro: "Lucid Dreaming®, nou în 2026: conștient în interiorul propriilor vise.",
					en: "Lucid Dreaming®, new in 2026: aware inside your own dreams.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Dacă îți place exercițiul DEC, Clubul Delfinului reunește ascultătorii care îl practică împreună. Clubul este complementar și nu înlocuiește tratamentul medical sau psihologic.",
				en: "If you enjoy the DEC exercise, the Dolphin Energy Club brings together listeners who practise it together. The club is complementary and does not replace medical or psychological treatment.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor: ascultă primul exercițiu gratuit pe site-ul Hemi-Sync România.",
				en: "Next step: listen to the first free exercise on the Hemi-Sync România site.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Hemi-Sync® este marcă înregistrată a Interstate Industries, Inc. Monroe® este marcă înregistrată a Monroe Institute.",
				en: "Hemi-Sync® is a registered trademark of Interstate Industries, Inc. Monroe® is a registered trademark of the Monroe Institute.",
			},
		},
	],
};
