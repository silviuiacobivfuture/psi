import type { ArticleInput } from "../schema";

/**
 * The Focus levels as hemi-sync.ro describes them: experiences of listeners, not claims about
 * reality. Every fact comes from the files in `provenance`. Draft until the owner approves it.
 */
export const HEMISYNC_FOCUS: ArticleInput = {
	slug: "nivelurile-focus-pe-intelees",
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
		"apps/hemisync-web/messages/ro.json: focus_*, gateway_*, exercises_headphones, tech_headphones, club_note, guide_footer",
		"packages/design/brand-books/3-hemi-sync.md: name Focus levels precisely, ® on first use, no paranormal claims",
	],
	title: {
		ro: "Nivelurile Focus, pe înțeles",
		en: "The Focus levels, plainly explained",
	},
	standfirst: {
		ro: "Nivelurile Focus sunt nume date unor stări de conștiință pe care le explorezi treptat, ghidat de sunet, în modelul Monroe. Sunt repere ale experienței tale, nu trepte de urcat.",
		en: "The Focus levels are names given, in the Monroe model, to states of consciousness you explore gradually, guided by sound. They are landmarks of your own experience, not steps to climb.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: nivelurile Focus sunt repere, nu trepte de urcat. Fiecare este numele unei stări de conștiință pe care o explorezi treptat, ghidat de sunetul exercițiilor Hemi-Sync®.",
				en: "In short: the Focus levels are landmarks, not steps to climb. Each one is the name of a state of consciousness you explore gradually, guided by the sound of Hemi-Sync® exercises.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Descrierile de mai jos sunt descrieri ale experienței ascultătorilor, nu afirmații despre realitate.",
				en: "The descriptions below describe what listeners experience; they are not claims about reality.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Focus 10: mintea trează, corpul adormit",
				en: "Focus 10: mind awake, body asleep",
			},
		},
		{
			type: "p",
			text: {
				ro: "Primul prag: relaxare totală a corpului, în timp ce mintea rămâne lucidă și alertă.",
				en: "The first threshold: the body fully relaxed, while the mind stays lucid and alert.",
			},
		},
		{
			type: "h2",
			text: { ro: "Focus 12: conștientizare extinsă", en: "Focus 12: expanded awareness" },
		},
		{
			type: "p",
			text: {
				ro: "Atenția se lărgește dincolo de percepția obișnuită: un spațiu pentru intuiție, vizualizare și claritate.",
				en: "Attention widens beyond ordinary perception: a space for intuition, visualisation and clarity.",
			},
		},
		{
			type: "h2",
			text: { ro: "Focus 15: starea fără timp", en: "Focus 15: the state without time" },
		},
		{
			type: "p",
			text: {
				ro: "Percepția obișnuită a timpului liniar se estompează; rămâne o liniște profundă.",
				en: "The ordinary sense of linear time fades; a deep stillness remains.",
			},
		},
		{
			type: "h2",
			text: { ro: "Focus 21: granița dintre lumi", en: "Focus 21: the border between worlds" },
		},
		{
			type: "p",
			text: {
				ro: "Corpul ajunge într-o relaxare foarte profundă, iar conștiința rămâne trează și capabilă să exploreze.",
				en: "The body reaches a very deep relaxation, while awareness stays awake and able to explore.",
			},
		},
		{ type: "h2", text: { ro: "Cum le explorezi", en: "How you explore them" } },
		{
			type: "p",
			text: {
				ro: "Treptat, ghidat de sunet. Asculți în căști, într-o poziție confortabilă și într-un loc liniștit, unde nu vei fi deranjat. Sunt tonuri joase: pe difuzoarele laptopului aproape nu se aud, iar efectul binaural nu apare deloc.",
				en: "Gradually, guided by sound. You listen on headphones, in a comfortable position and somewhere quiet where you won’t be disturbed. These are low tones: on laptop speakers they are barely audible, and the binaural effect does not appear at all.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dintre programele Monroe Institute®, programul de bază este Gateway Voyage®: programul fundamental de explorare a conștiinței.",
				en: "Of the Monroe Institute® programmes, the core one is Gateway Voyage®: the foundational programme for exploring consciousness.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Programele și exercițiile Hemi-Sync® sunt o explorare. Nu înlocuiesc tratamentul medical sau psihologic.",
				en: "Hemi-Sync® programmes and exercises are an exploration. They do not replace medical or psychological treatment.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor: începe cu un exercițiu gratuit pe site-ul Hemi-Sync România.",
				en: "Next step: start with a free exercise on the Hemi-Sync România site.",
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
