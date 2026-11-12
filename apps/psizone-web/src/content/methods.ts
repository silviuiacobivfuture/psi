import type { Localised } from "./localised";

/**
 * DRAFT — owner and clinical review pending (written 2026-11-12). Nothing here is approved copy.
 *
 * Sources: the method names are those the centre lists (docs/brands/CONTEXT.md, brand book,
 * content-strategy.md "Method pages"); CRIIN and EQ-Sync as "own, patented methods" come from the
 * owners' story (content/story.ts); the "how we use it" lines restate the home page's how_step_*
 * copy; psychotherapy's modalities come from CONTEXT.md. What a technique is, in the centre's own
 * words, is not documented anywhere yet, so it is a `todo` (rendered as a visible placeholder,
 * never as a plausible sentence). Every method needs a named psychologist's sign-off.
 *
 * Hub mapping (`hubs`), each pair with its source: evaluation → autism (spoke_autism_2), ADHD
 * (WP "Evaluare și intervenție în ADHD"), speech (content-strategy "how a speech evaluation works");
 * neurofeedback → ADHD (spoke_adhd_2); ABA → autism (hub_autism_text); speech therapy → speech (the
 * hub itself); psychotherapy → teens (WP homepage card "Psihoterapie copii și adolescenți"), adults
 * (WP "Terapie individuală – anxietate și depresie"), couples (WP "Terapia de familie și cuplu").
 *
 * Brand rule: only methods with `clinical: true` are ever listed on a hub page. EQ-Sync is one of
 * Psizone's own methods and appears on the methods pages only.
 */
export interface Method {
	id: string;
	/** Romanian slug, served under both locales (the app's convention). */
	path: string;
	/** One of Psizone's own, patented methods (story). */
	own: boolean;
	/** May be listed on hub (clinical) pages. */
	clinical: boolean;
	/** May be a compass destination (the compass shows on hub pages too: never EQ-Sync). */
	compass: boolean;
	name: Localised;
	lead: Localised;
	/** What the technique is, described, never promised. Empty when undocumented. */
	what: ReadonlyArray<Localised>;
	/** Where it sits in the centre's one plan. */
	atPsizone: ReadonlyArray<Localised>;
	/** Hub ids where the method is used (editorial mapping, for review). */
	hubs: ReadonlyArray<string>;
	/** What the specialists still have to write: shown as placeholders. */
	todo: ReadonlyArray<Localised>;
	external?: { href: string; label: Localised };
}

const WHAT: Localised = {
	ro: "Ce este metoda, pe scurt, în cuvintele echipei.",
	en: "What the method is, briefly, in the team's words.",
};
const NOT_SUITABLE: Localised = {
	ro: "Pentru cine nu este potrivită metoda.",
	en: "Who the method is not suitable for.",
};
const SESSION: Localised = {
	ro: "Cum arată o ședință și cât durează.",
	en: "What a session looks like and how long it takes.",
};
const PRACTITIONERS: Localised = {
	ro: "Cine din echipă lucrează cu această metodă.",
	en: "Who on the team works with this method.",
};
const IN_PLAN: Localised = {
	ro: "Face parte din planul unic pe care îl facem cu specialiștii potriviți: psihoterapie, ABA, logopedie, neurofeedback.",
	en: "It is part of the one plan we make with the right specialists: psychotherapy, ABA, speech therapy, neurofeedback.",
};

export const METHODS: ReadonlyArray<Method> = [
	{
		id: "evaluare-qeeg",
		path: "/metode/evaluare-qeeg",
		own: false,
		clinical: true,
		compass: true,
		name: { ro: "Evaluare și QEEG", en: "Evaluation and QEEG" },
		lead: {
			ro: "Primul pas: discutăm, observăm și, unde ajută, facem o hartă cerebrală QEEG.",
			en: "The first step: we talk, we observe and, where it helps, we make a QEEG brain map.",
		},
		what: [
			{
				ro: "Evaluarea pornește de la o discuție și de la observație. Unde ajută, adăugăm o hartă cerebrală QEEG.",
				en: "The evaluation starts with a conversation and with observation. Where it helps, we add a QEEG brain map.",
			},
		],
		atPsizone: [
			{
				ro: "Evaluarea este punctul de pornire al planului și reperul față de care măsurăm din nou, la reevaluare, ca să îți arătăm ce s-a schimbat.",
				en: "The evaluation is where the plan starts and the reference we measure against again at re-evaluation, to show you what has changed.",
			},
		],
		hubs: ["autism", "adhd", "speech", "stroke"],
		todo: [
			{
				ro: "Ce este QEEG, pe scurt, în cuvintele echipei.",
				en: "What QEEG is, briefly, in the team's words.",
			},
			SESSION,
			{
				ro: "Când recomandăm QEEG și când nu este necesar.",
				en: "When we recommend QEEG and when it is not needed.",
			},
			NOT_SUITABLE,
			PRACTITIONERS,
		],
	},
	{
		id: "neurofeedback",
		path: "/metode/neurofeedback",
		own: false,
		clinical: true,
		compass: true,
		name: { ro: "Neurofeedback", en: "Neurofeedback" },
		lead: {
			ro: "Una dintre neurotehnologiile din planurile noastre.",
			en: "One of the neurotechnologies in our plans.",
		},
		what: [],
		atPsizone: [
			{
				ro: "Face parte din neurotehnologiile pe care le-am adăugat de-a lungul anilor, după formări și specializări.",
				en: "It is one of the neurotechnologies we added over the years, after trainings and specialisations.",
			},
			IN_PLAN,
		],
		hubs: ["adhd", "stroke", "sport"],
		todo: [WHAT, SESSION, NOT_SUITABLE, PRACTITIONERS],
	},
	{
		id: "tms",
		path: "/metode/tms",
		own: false,
		clinical: true,
		compass: true,
		name: { ro: "TMS", en: "TMS" },
		lead: {
			ro: "Stimularea magnetică transcraniană.",
			en: "Transcranial magnetic stimulation.",
		},
		what: [],
		atPsizone: [],
		hubs: ["stroke"],
		todo: [
			WHAT,
			{
				ro: "Cine o recomandă și cine o efectuează.",
				en: "Who recommends it and who carries it out.",
			},
			SESSION,
			NOT_SUITABLE,
		],
	},
	{
		id: "aba",
		path: "/metode/aba",
		own: false,
		clinical: true,
		compass: true,
		name: { ro: "ABA", en: "ABA" },
		lead: {
			ro: "Analiza aplicată a comportamentului (Applied Behavior Analysis).",
			en: "Applied behaviour analysis.",
		},
		what: [],
		atPsizone: [
			{
				ro: "O folosim în planurile pentru copiii cu autism (TSA).",
				en: "We use it in plans for children with autism (ASD).",
			},
			IN_PLAN,
		],
		hubs: ["autism"],
		todo: [WHAT, SESSION, NOT_SUITABLE, PRACTITIONERS],
	},
	{
		id: "logopedie",
		path: "/metode/logopedie",
		own: false,
		clinical: true,
		compass: true,
		name: { ro: "Logopedie", en: "Speech therapy" },
		lead: {
			ro: "Terapia limbajului și a vorbirii.",
			en: "Language and speech therapy.",
		},
		what: [],
		atPsizone: [IN_PLAN],
		hubs: ["speech"],
		todo: [WHAT, SESSION, NOT_SUITABLE, PRACTITIONERS],
	},
	{
		id: "psihoterapie",
		path: "/metode/psihoterapie",
		own: false,
		clinical: true,
		compass: true,
		name: { ro: "Psihoterapie", en: "Psychotherapy" },
		lead: {
			ro: "Terapie prin dialog, pentru copii, adolescenți, adulți, cupluri și familii.",
			en: "Talking therapy for children, teenagers, adults, couples and families.",
		},
		what: [
			{
				ro: "Lucrăm în psihoterapie cognitiv-comportamentală, în terapie de familie și de cuplu și prin hipnoză clinică.",
				en: "We work in cognitive behavioural therapy, family and couples therapy, and clinical hypnosis.",
			},
		],
		atPsizone: [IN_PLAN],
		hubs: ["teens", "adults", "couple", "stroke", "oncology", "sport"],
		todo: [
			SESSION,
			{
				ro: "Dacă oferim ședințe online.",
				en: "Whether we offer online sessions.",
			},
			NOT_SUITABLE,
			PRACTITIONERS,
		],
	},
	{
		id: "integrare-neurosenzoriala",
		path: "/metode/integrare-neurosenzoriala",
		own: false,
		clinical: true,
		compass: true,
		name: { ro: "Integrare neurosenzorială", en: "Neurosensory integration" },
		lead: {
			ro: "Terapie prin mișcare și stimulare senzorială, într-o sală amenajată pentru asta.",
			en: "Therapy through movement and sensory stimulation, in a room fitted out for it.",
		},
		what: [],
		atPsizone: [IN_PLAN],
		hubs: ["sensory", "autism", "adhd"],
		todo: [],
	},
	{
		id: "criin",
		path: "/metode/criin",
		own: true,
		clinical: false,
		compass: true,
		name: { ro: "CRIIN", en: "CRIIN" },
		lead: {
			ro: "Una dintre cele două metode proprii, brevetate, născute din experiența și cercetările echipei.",
			en: "One of the team's two own, patented methods, born from its experience and research.",
		},
		what: [],
		atPsizone: [],
		hubs: [],
		todo: [
			{
				ro: "Ce este CRIIN și ce înseamnă numele.",
				en: "What CRIIN is and what the name stands for.",
			},
			{ ro: "Cui se adresează.", en: "Who it is for." },
			SESSION,
			NOT_SUITABLE,
		],
	},
	{
		id: "eq-sync",
		path: "/metode/eq-sync",
		own: true,
		clinical: false,
		compass: false,
		name: { ro: "EQ-Sync", en: "EQ-Sync" },
		lead: {
			ro: "Una dintre cele două metode proprii, brevetate. Un program ghidat prin sunet, cu site-ul lui.",
			en: "One of the team's two own, patented methods. A sound-guided programme with its own site.",
		},
		what: [],
		atPsizone: [],
		hubs: [],
		todo: [
			{
				ro: "Ce este EQ-Sync și cui se adresează.",
				en: "What EQ-Sync is and who it is for.",
			},
		],
		external: {
			href: "https://eq-sync.ro/",
			label: { ro: "Despre EQ-Sync, pe eq-sync.ro", en: "About EQ-Sync, on eq-sync.ro" },
		},
	},
];

/** Methods that may be listed on a hub page: clinical ones only (never EQ-Sync). */
export function methodsForHub(hubId: string): ReadonlyArray<Method> {
	return METHODS.filter((x) => x.clinical && x.hubs.includes(hubId));
}
