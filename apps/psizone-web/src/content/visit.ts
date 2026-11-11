import type { Localised } from "./localised";

/**
 * DRAFT — owner review pending (written 2026-11-12). "What happens at the first visit".
 *
 * Sources: the contact page (contact_lead: the form asks no medical details, we call you), the
 * closing band (cta_text: what comes next and what it costs), the brand book's reassurance line,
 * the home page's three how_step_* steps, and the plan's "Ce urmează" steps (docs/plans/
 * psizone-web.md §2, Contact). Durations, what to bring and prices are not documented: `todo`.
 */
export interface VisitStep {
	title: Localised;
	text: Localised;
}

export const VISIT_STEPS: ReadonlyArray<VisitStep> = [
	{
		title: { ro: "Ne scrii sau ne suni", en: "You write or call" },
		text: {
			ro: "Lași datele de contact în formular sau ne suni direct. În formular nu îți cerem detalii medicale.",
			en: "Leave your contact details in the form, or call us directly. The form asks for no medical details.",
		},
	},
	{
		title: { ro: "Te sunăm noi", en: "We call you" },
		text: {
			ro: "La telefon ne spui ce te îngrijorează, iar noi îți spunem ce urmează și cât costă.",
			en: "On the phone you tell us what worries you, and we tell you what comes next and what it costs.",
		},
	},
	{
		title: { ro: "Prima discuție", en: "The first conversation" },
		text: {
			ro: "Prima discuție e despre voi, nu despre diagnostic. Ne cunoaștem și ascultăm.",
			en: "The first conversation is about you, not about a diagnosis. We get to know each other and we listen.",
		},
	},
	{
		title: { ro: "Evaluarea", en: "The evaluation" },
		text: {
			ro: "Discutăm, observăm și, unde ajută, facem o hartă cerebrală QEEG.",
			en: "We talk, we observe and, where it helps, we make a QEEG brain map.",
		},
	},
	{
		title: { ro: "Un singur plan", en: "One plan" },
		text: {
			ro: "Facem un singur plan, cu specialiștii potriviți: psihoterapie, ABA, logopedie, neurofeedback.",
			en: "We make one plan, with the right specialists: psychotherapy, ABA, speech therapy, neurofeedback.",
		},
	},
	{
		title: { ro: "Reevaluarea", en: "Re-evaluation" },
		text: {
			ro: "Măsurăm din nou și îți arătăm ce s-a schimbat, nu doar cum au mers ședințele.",
			en: "We measure again and show you what has changed, not just how the sessions went.",
		},
	},
];

export const VISIT_TODO: ReadonlyArray<Localised> = [
	{
		ro: "Cât durează prima întâlnire și evaluarea.",
		en: "How long the first meeting and the evaluation take.",
	},
	{
		ro: "Ce să aduci (rapoarte, evaluări anterioare, documente școlare).",
		en: "What to bring (reports, earlier evaluations, school documents).",
	},
	{
		ro: "Dacă la prima întâlnire vine și copilul sau doar părinții.",
		en: "Whether the child comes to the first meeting or only the parents.",
	},
	{ ro: "Prețul evaluării.", en: "The price of the evaluation." },
	{ ro: "Adresa și programul centrului.", en: "The centre's address and opening hours." },
];
