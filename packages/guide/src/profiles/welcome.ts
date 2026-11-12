import type { Brand, Locale } from "../contract";

type Copy = Readonly<Record<Brand, Readonly<Record<Locale, string>>>>;

/** Three questions to start from, per brand: the end of the welcome and of the follow-up line. */
const EXAMPLES: Copy = {
	psizone: {
		ro: "„Am o îngrijorare legată de copilul meu”, „Vreau o evaluare” sau „Cât costă o evaluare?”",
		en: '"I\'m worried about my child", "I\'d like an evaluation" or "How much does an evaluation cost?"',
	},
	eqsync: {
		ro: "„Vreau mai multă liniște seara”, „Cum încep programul gratuit?” sau „Ce căști îmi trebuie?”",
		en: '"I want more calm in the evening", "How do I start the free programme?" or "What headphones do I need?"',
	},
	hemisync: {
		ro: "„Vreau să încerc meditația”, „Cu ce program să încep?” sau „Ce exerciții sunt gratuite?”",
		en: '"I\'d like to try meditation", "Which programme should I start with?" or "Which exercises are free?"',
	},
	blog: {
		ro: "„Caut ajutor pentru copilul meu”, „Nu dorm bine, ce pot face?” sau „Vreau să fac o programare”",
		en: '"I\'m looking for help for my child", "I don\'t sleep well, what can I do?" or "I\'d like to book an appointment"',
	},
};

/** Who the guide is and what it helps with, before the examples. */
const INTROS: Copy = {
	psizone: {
		ro: "Bună, mă bucur că ai scris. Sunt ghidul Psizone: te ascult, îți spun ce putem face pentru tine și te ajut să începi, de la o întrebare la o programare. De exemplu, mă poți întreba:",
		en: "Hello, I'm glad you wrote. I'm the Psizone guide: I'll listen, tell you what we can do for you and help you start, from a question to a booking. For example, you could ask:",
	},
	eqsync: {
		ro: "Bună. Sunt ghidul EQ-SYNC: te ajut să vezi dacă programul gratuit ți se potrivește și cum începi, plus întrebări despre exerciții și căști. De exemplu:",
		en: "Hi. I'm the EQ-SYNC guide: I'll help you see whether the free programme suits you and how to start, plus questions about the exercises and headphones. For example:",
	},
	hemisync: {
		ro: "Bună. Sunt ghidul Hemi-Sync: te ajut să alegi un exercițiu gratuit sau un program și să începi explorarea. De exemplu:",
		en: "Hello. I'm the Hemi-Sync guide: I'll help you choose a free exercise or a programme and begin exploring. For example:",
	},
	blog: {
		ro: "Bună. Sunt ghidul blogului: te ajut să găsești un articol și pasul potrivit pentru tine, la Psizone, EQ-SYNC sau Hemi-Sync. De exemplu:",
		en: "Hello. I'm the blog's guide: I'll help you find an article and the right step for you, at Psizone, EQ-SYNC or Hemi-Sync. For example:",
	},
};

/** Mid-conversation, a topic-free follow-up ("si deci?"): no greeting, then the examples. */
const FOLLOW_UP_LEADS: Copy = {
	psizone: {
		ro: "Spune-mi ce te interesează și caut în paginile noastre. De exemplu:",
		en: "Tell me what you'd like to know and I'll look through our pages. For example:",
	},
	eqsync: {
		ro: "Spune-mi ce vrei să afli despre program și caut în paginile noastre. De exemplu:",
		en: "Tell me what you'd like to know about the programme and I'll look it up. For example:",
	},
	hemisync: {
		ro: "Spune-mi ce ai vrea să explorezi și caut în paginile programelor. De exemplu:",
		en: "Tell me what you'd like to explore and I'll look through the programme pages. For example:",
	},
	blog: {
		ro: "Spune-mi ce te interesează și caut printre articole. De exemplu:",
		en: "Tell me what interests you and I'll look through the articles. For example:",
	},
};

function joined(lead: Copy): Copy {
	const one = (brand: Brand): Readonly<Record<Locale, string>> => ({
		ro: `${lead[brand].ro} ${EXAMPLES[brand].ro}`,
		en: `${lead[brand].en} ${EXAMPLES[brand].en}`,
	});
	return {
		psizone: one("psizone"),
		eqsync: one("eqsync"),
		hemisync: one("hemisync"),
		blog: one("blog"),
	};
}

/**
 * Each guide's FALLBACK reply to small talk ("bună", "ce poți face?"), sent only when the model
 * cannot reply (no key, a provider failure, a reply still in another language): who it is, what
 * it can help with, and three questions to start from, in the brand's warm voice. The model
 * replies to small talk otherwise.
 */
export const WELCOMES: Copy = joined(INTROS);

/** The same, mid-conversation (after an answered turn): no greeting, the examples again. */
export const FOLLOW_UPS: Copy = joined(FOLLOW_UP_LEADS);

/** Each guide's reply to a thank-you, in the brand's voice. */
export const THANKS: Readonly<Record<Brand, Readonly<Record<Locale, string>>>> = {
	psizone: {
		ro: "Cu drag! Dacă mai ai o întrebare, sunt aici.",
		en: "You're welcome! If anything else comes up, I'm here.",
	},
	eqsync: { ro: "Cu drag. Seară liniștită.", en: "You're welcome. A quiet evening to you." },
	hemisync: { ro: "Cu drag. Drum bun în explorare.", en: "You're welcome. Enjoy the exploring." },
	blog: { ro: "Cu drag! Lectură plăcută.", en: "You're welcome! Happy reading." },
};

/**
 * The honest line when a reply stated only facts nothing on the site supports, even after its
 * retry: we don't have that on the site, and who can tell you.
 */
export const UNKNOWN: Copy = {
	psizone: {
		ro: "Nu am găsit asta în paginile noastre, așa că nu vreau să-ți spun ceva greșit. Colegii noștri îți pot răspunde la telefon sau din pagina de contact.",
		en: "I couldn't find that in our pages, and I'd rather not tell you something wrong. Our team can answer you by phone or through the contact page.",
	},
	eqsync: {
		ro: "Nu am găsit asta în paginile programului, așa că nu vreau să ghicesc. Echipa EQ-SYNC îți răspunde din pagina de contact.",
		en: "I couldn't find that in the programme's pages, and I'd rather not guess. The EQ-SYNC team can answer you through the contact page.",
	},
	hemisync: {
		ro: "Nu am găsit asta în paginile programelor, așa că nu vreau să ghicesc. Echipa Hemi-Sync îți răspunde din pagina de contact.",
		en: "I couldn't find that in the programme pages, and I'd rather not guess. The Hemi-Sync team can answer you through the contact page.",
	},
	blog: {
		ro: "Nu am găsit asta printre articole, așa că nu vreau să ghicesc. Redacția îți răspunde din pagina de contact.",
		en: "I couldn't find that among the articles, and I'd rather not guess. The editors can answer you through the contact page.",
	},
};
