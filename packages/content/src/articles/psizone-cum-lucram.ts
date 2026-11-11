import type { ArticleInput } from "../schema";

/**
 * How Psizone works, in three steps. Every fact comes from the Psizone site copy and brand book
 * listed in `provenance`; nothing here is health advice. Draft until the owner approves it.
 */
export const PSIZONE_CUM_LUCRAM: ArticleInput = {
	slug: "un-plan-o-echipa-cum-lucram",
	brand: "psizone",
	topic: "cum-lucram",
	backlogNo: null,
	status: "draft",
	kind: "editorial",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	provenance: [
		"apps/psizone-web/messages/ro.json: hubs_title, how_*, methods_*, team_page_lead, hero_reassure, signal_caption, cta_text",
		"apps/psizone-web/src/content/visit.ts and faq.ts: the first visit, who we work with",
		"packages/design/brand-books/1-psizone.md: promise, voice, words to avoid",
		"docs/brands/content-strategy.md: claim rules, method pages",
		"docs/brands/CONTEXT.md: services and audiences",
	],
	title: {
		ro: "Un plan, o echipă: cum lucrăm la Psizone",
		en: "One plan, one team: how we work at Psizone",
	},
	standfirst: {
		ro: "Lucrăm în trei pași: evaluăm, intervenim după un singur plan, apoi măsurăm din nou și îți arătăm ce s-a schimbat. Planul îl face o echipă de specialiști care lucrează împreună, nu o singură metodă.",
		en: "We work in three steps: we assess, we intervene on a single plan, then we measure again and show you what has changed. The plan is made by a team of specialists working together, not by a single method.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: evaluăm, intervenim și îți arătăm progresul. Totul începe cu ce te îngrijorează pe tine, la copilul tău, la adolescentul tău sau la tine însuți.",
				en: "In short: we assess, we intervene and we show you the progress. It all starts with what worries you, about your child, your teenager or yourself.",
			},
		},
		{ type: "h2", text: { ro: "1. Evaluăm", en: "1. We assess" } },
		{
			type: "p",
			text: {
				ro: "Discutăm, observăm și, unde ajută, facem o hartă cerebrală QEEG. Prima discuție e despre voi, nu despre diagnostic: vrem să înțelegem ce vă aduce la noi înainte să vorbim despre metode.",
				en: "We talk, we observe and, where it helps, we make a QEEG brain map. The first conversation is about you, not about a diagnosis: we want to understand what brings you to us before we talk about methods.",
			},
		},
		{ type: "h2", text: { ro: "2. Intervenim", en: "2. We intervene" } },
		{
			type: "p",
			text: {
				ro: "Facem un singur plan, cu specialiștii potriviți. În echipă sunt psihologi, psihoterapeuți și terapeuți care lucrează împreună, pe același plan, pentru copii, adolescenți, adulți și seniori.",
				en: "We make a single plan, with the right specialists. The team brings together psychologists, psychotherapists and therapists who work together, on the same plan, for children, teenagers, adults and seniors.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Metodele cu care lucrăm sunt:",
				en: "The methods we work with are:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "evaluarea psihologică și harta cerebrală QEEG;",
					en: "psychological assessment and the QEEG brain map;",
				},
				{ ro: "psihoterapia;", en: "psychotherapy;" },
				{ ro: "terapia ABA;", en: "ABA therapy;" },
				{ ro: "logopedia;", en: "speech therapy;" },
				{ ro: "neurofeedbackul;", en: "neurofeedback;" },
				{ ro: "TMS.", en: "TMS." },
			],
		},
		{
			type: "p",
			text: {
				ro: "Planul se face cu specialiștii potriviți pentru voi. Fiecare pagină despre o metodă va spune și pentru cine nu este potrivită.",
				en: "The plan is made with the specialists who are right for you. Every page about a method will also say who it is not suitable for.",
			},
		},
		{ type: "h2", text: { ro: "3. Îți arătăm progresul", en: "3. We show you the progress" } },
		{
			type: "p",
			text: {
				ro: "Măsurăm din nou și îți arătăm ce s-a schimbat, nu doar cum au mers ședințele. De aici vine și promisiunea noastră: vezi schimbarea.",
				en: "We measure again and show you what has changed, not just how the sessions went. That is where our promise comes from: see the change.",
			},
		},
		{
			type: "quote",
			text: { ro: "Măsurăm, nu promitem.", en: "We measure; we don’t promise." },
		},
		{ type: "h2", text: { ro: "Ce nu îți promitem", en: "What we don’t promise you" } },
		{
			type: "p",
			text: {
				ro: "Nu promitem vindecări și nu promitem termene. Îți arătăm măsurătorile tale, pas cu pas.",
				en: "We don’t promise cures and we don’t promise timelines. We show you your measurements, step by step.",
			},
		},
		{ type: "h2", text: { ro: "Primul pas", en: "The first step" } },
		{
			type: "p",
			text: {
				ro: "Primul pas e o discuție. Ne spui ce te îngrijorează, iar noi îți spunem ce urmează și cât costă.",
				en: "The first step is a conversation. You tell us what worries you, and we tell you what comes next and what it costs.",
			},
		},
	],
};
