import type { KnowledgeEntryInput } from "../entry";
import { HUB_FACTS } from "./hubs";

/**
 * Psizone, English: the same non-clinical facts as psizone-ro.ts, from the English messages.
 * English pages live under `/en` (Romanian slugs until English slugs exist).
 */

const common = {
	brand: "psizone",
	locale: "en",
	status: "published",
	reviewedBy: null,
	reviewedAt: null,
} as const;

const contact: KnowledgeEntryInput = {
	...common,
	id: "psizone-en-contact-phones",
	kind: "operational",
	title: "Psizone phone numbers",
	url: "/en/contact",
	body: [
		"## Phone",
		"",
		"You can call the Psizone centre directly, on either of the two phone numbers published on psizone.ro:",
		"",
		"- 0748 017 752",
		"- 0752 466 792",
		"",
		"## If you would rather write",
		"",
		"The contact page also takes an appointment request, with an email or a phone number. We don't ask for medical details in the request: we talk about what worries you on the phone.",
	].join("\n"),
};

const booking: KnowledgeEntryInput = {
	...common,
	id: "psizone-en-booking-request",
	kind: "operational",
	title: "What the appointment request asks for",
	url: "/en/contact",
	body: [
		"## The appointment request",
		"",
		"The appointment request on the contact page asks only for logistics, never for medical details:",
		"",
		"- your name;",
		"- an email or a phone number (either one is enough);",
		"- who the evaluation is for: a child, a teenager or you;",
		"- when we can call you: morning, afternoon or any time;",
		"- your consent to be contacted by Psizone about an appointment.",
		"",
		"The form has no free-text field. Your details are used only for the appointment; the privacy policy has the details.",
	].join("\n"),
};

const editorial: KnowledgeEntryInput = {
	...common,
	id: "psizone-en-editorial-workflow",
	kind: "editorial",
	title: "How our articles are written and reviewed",
	url: "/en/politica-editoriala",
	body: [
		"## From draft to publication",
		"",
		"Every article goes through the same steps: draft, clinical review, publication. In the review, a specialist from the team approves the text or asks for changes; who approved it and the review date are kept. We publish only approved texts, with the author and the clinical reviewer named, and every page is reviewed again after 12 months.",
		"",
		"## The rules we follow",
		"",
		"- We describe the process and what we measure; we never promise cures, timelines or unsourced percentages.",
		"- Testimonials appear only with written consent and without outcome claims.",
		"- Every page about a method also says who it is not suitable for.",
		"- No AI-generated text is published unreviewed, and crisis and safety texts are never written with AI.",
		"",
		"The guide on the site answers only from published, reviewed content and shows the page it answered from.",
	].join("\n"),
};

const hubsOverview: KnowledgeEntryInput = {
	...common,
	id: "psizone-en-hubs",
	kind: "editorial",
	title: "Psizone topics",
	url: "/en",
	body: [
		"## Topics",
		"",
		"On psizone.ro the information is grouped by topic:",
		"",
		...HUB_FACTS.map((h) => `- **${h.en.title}** (${h.en.eyebrow}): ${h.en.text}`),
		"",
		"The topics' articles are in preparation; each is written and reviewed by psychologists before publication.",
	].join("\n"),
};

const hubs: ReadonlyArray<KnowledgeEntryInput> = HUB_FACTS.map((h) => ({
	...common,
	id: `psizone-en-hub-${h.id}`,
	kind: "editorial",
	title: h.en.title,
	url: `/en${h.path}`,
	audience: h.en.eyebrow,
	hub: h.path,
	body: [
		`## ${h.en.title}`,
		"",
		`The "${h.en.title}" topic (${h.en.eyebrow}) on psizone.ro: ${h.en.text}`,
		"",
		"This topic's articles are in preparation; each is written and reviewed by psychologists before publication.",
	].join("\n"),
}));

export const PSIZONE_EN: ReadonlyArray<KnowledgeEntryInput> = [
	contact,
	booking,
	editorial,
	hubsOverview,
	...hubs,
];
