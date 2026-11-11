import type { ArticleInput } from "../schema";

/**
 * What happens after someone contacts Psizone. Every fact comes from the Psizone contact page,
 * guide copy and brand book listed in `provenance`. Draft until the owner approves it.
 */
export const PSIZONE_PRIMUL_PAS: ArticleInput = {
	slug: "primul-pas-ce-se-intampla-dupa-ce-ne-scrii",
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
		"apps/psizone-web/messages/ro.json: contact_*, form_*, cta_text, hero_reassure",
		"apps/psizone-web/src/content/visit.ts and faq.ts: the first steps, the phone numbers",
		"apps/psizone-web/messages/ro.json: guide_intro, guide_soon, guide_refusal_out_of_scope",
		"apps/psizone-web/src/pages/contact.tsx: the two phone numbers",
		"packages/design/brand-books/1-psizone.md: reassurance line, voice",
	],
	title: {
		ro: "Primul pas: ce se întâmplă după ce ne scrii",
		en: "The first step: what happens after you get in touch",
	},
	standfirst: {
		ro: "Ne lași un nume și un telefon sau un e-mail, iar noi te sunăm. Despre ce te îngrijorează vorbim la telefon, nu într-un formular, iar prima discuție e despre voi, nu despre diagnostic.",
		en: "You leave us a name and a phone number or an email, and we call you. We talk about what worries you on the phone, not in a form, and the first conversation is about you, not about a diagnosis.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: primul pas e o discuție. Ne scrii sau ne suni, iar prima discuție e despre voi, nu despre diagnostic.",
				en: "In short: the first step is a conversation. You write to us or call us, and the first conversation is about you, not about a diagnosis.",
			},
		},
		{ type: "h2", text: { ro: "Ce ne lași", en: "What you leave us" } },
		{
			type: "list",
			items: [
				{ ro: "Numele tău.", en: "Your name." },
				{
					ro: "Un e-mail sau un telefon: ne ajunge unul dintre ele.",
					en: "An email or a phone number: either one is enough.",
				},
				{
					ro: "Pentru cine e evaluarea: un copil, un adolescent sau pentru tine.",
					en: "Who the assessment is for: a child, a teenager, or you.",
				},
				{
					ro: "Când te putem suna: dimineața, după-amiaza sau oricând.",
					en: "When we can call you: in the morning, in the afternoon, or any time.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Nu îți cerem detalii medicale în formular. Datele tale sunt folosite doar pentru programare.",
				en: "We don’t ask for medical details in the form. Your details are used only to arrange the appointment.",
			},
		},
		{ type: "h2", text: { ro: "Discuția la telefon", en: "The phone conversation" } },
		{
			type: "p",
			text: {
				ro: "Te sunăm noi. Ne spui ce te îngrijorează, iar noi îți spunem ce urmează și cât costă. Prima discuție e despre voi, nu despre diagnostic: ne cunoaștem și ascultăm.",
				en: "We call you. You tell us what worries you, and we tell you what comes next and what it costs. The first conversation is about you, not about a diagnosis: we get to know each other and we listen.",
			},
		},
		{ type: "h2", text: { ro: "Dacă preferi să suni tu", en: "If you would rather call us" } },
		{
			type: "p",
			text: {
				ro: "Ne găsești la 0748 017 752 sau la 0752 466 792.",
				en: "You can reach us on 0748 017 752 or 0752 466 792.",
			},
		},
		{ type: "h2", text: { ro: "Și ghidul Psizone", en: "And the Psizone guide" } },
		{
			type: "p",
			text: {
				ro: "Dacă vrei să afli mai întâi ceva pe cont propriu, poți întreba ghidul Psizone. El răspunde doar din paginile revizuite de echipa noastră și îți arată sursele. Despre diagnostic, medicație sau tratamentul tău vorbim doar cu un specialist, față în față. Când ghidul nu are încă un răspuns revizuit, îți spune asta și îți răspunde un om din echipă.",
				en: "If you would like to find something out on your own first, you can ask the Psizone guide. It answers only from pages our team has reviewed and shows you its sources. Diagnosis, medication or your treatment we discuss only with a specialist, face to face. When the guide has no reviewed answer yet, it says so and a person from the team replies.",
			},
		},
		{ type: "h2", text: { ro: "Pasul următor", en: "The next step" } },
		{
			type: "p",
			text: {
				ro: "Lasă-ne datele de contact pe pagina de programare și te sunăm noi.",
				en: "Leave us your contact details on the booking page and we will call you.",
			},
		},
	],
};
