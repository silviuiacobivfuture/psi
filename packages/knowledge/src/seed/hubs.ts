/**
 * The six condition hubs live on psizone.ro, copied from apps/psizone-web/src/content/hubs.ts
 * (paths) and apps/psizone-web/messages/{ro,en}.json (hub_*_eyebrow, hub_*_title, hub_*_text).
 * Romanian slugs are served under both locales (`/en` + path) until English slugs exist.
 */

interface HubText {
	eyebrow: string;
	title: string;
	text: string;
}

export interface HubFact {
	id: string;
	path: string;
	ro: HubText;
	en: HubText;
}

export const HUB_FACTS: ReadonlyArray<HubFact> = [
	{
		id: "autism",
		path: "/copii/autism",
		ro: {
			eyebrow: "Copii",
			title: "Autism și TSA",
			text: "Primele semne, evaluarea și un plan ABA pe înțeles.",
		},
		en: {
			eyebrow: "Children",
			title: "Autism and ASD",
			text: "First signs, the evaluation, and an ABA plan in plain words.",
		},
	},
	{
		id: "adhd",
		path: "/copii/adhd",
		ro: {
			eyebrow: "Copii și adolescenți",
			title: "ADHD",
			text: "Atenție, energie, școală: ce e normal și ce ajută.",
		},
		en: {
			eyebrow: "Children and teens",
			title: "ADHD",
			text: "Attention, energy, school: what is normal and what helps.",
		},
	},
	{
		id: "sensory",
		path: "/copii/integrare-senzoriala",
		ro: {
			eyebrow: "Copii",
			title: "Integrare senzorială",
			text: "Când sunetele, atingerile sau mișcarea devin prea mult.",
		},
		en: {
			eyebrow: "Children",
			title: "Sensory integration",
			text: "When sounds, touch or movement become too much.",
		},
	},
	{
		id: "speech",
		path: "/copii/logopedie",
		ro: {
			eyebrow: "Copii",
			title: "Logopedie",
			text: "Când să te îngrijoreze că cel mic nu vorbește încă.",
		},
		en: {
			eyebrow: "Children",
			title: "Speech therapy",
			text: "When to worry that your little one isn't talking yet.",
		},
	},
	{
		id: "teens",
		path: "/adolescenti",
		ro: {
			eyebrow: "Adolescenți",
			title: "Adolescență",
			text: "Ecrane, anxietate școlară, un copil care nu mai vorbește cu tine.",
		},
		en: {
			eyebrow: "Teens",
			title: "Adolescence",
			text: "Screens, school anxiety, a teen who has stopped talking to you.",
		},
	},
	{
		id: "adults",
		path: "/adulti/anxietate-depresie",
		ro: {
			eyebrow: "Adulți",
			title: "Anxietate și depresie",
			text: "Atacuri de panică, burnout, prima ședință de terapie.",
		},
		en: {
			eyebrow: "Adults",
			title: "Anxiety and depression",
			text: "Panic attacks, burnout, the first therapy session.",
		},
	},
];
