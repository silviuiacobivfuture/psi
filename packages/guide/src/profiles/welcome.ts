import type { Brand, Locale } from "../contract";

type Copy = Readonly<Record<Brand, Readonly<Record<Locale, string>>>>;

/** Three questions to start from, per brand: the end of the welcome and of the follow-up line. */
const EXAMPLES: Copy = {
	psizone: {
		ro: "„Cum fac o programare?”, „Ce date cere formularul?” sau „Cum decurge prima discuție?”",
		en: '"How do I book an evaluation?", "What does the request form ask for?" or "How does the first conversation go?"',
	},
	eqsync: {
		ro: "„Cum funcționează programul gratuit?”, „Ce căști îmi trebuie?” sau „Ce se întâmplă după cele 21 de zile?”",
		en: '"How does the free programme work?", "What headphones do I need?" or "What happens after the 21 days?"',
	},
	hemisync: {
		ro: "„Ce exerciții gratuite aveți?”, „Ce sunt nivelurile Focus?” sau „Cum funcționează clubul?”",
		en: '"Which exercises are free?", "What are the Focus levels?" or "How does the club work?"',
	},
	blog: {
		ro: "„Cum sunt revizuite articolele?”, „Ce articole aveți despre somn?” sau „Cum urmăresc articolele unui singur site?”",
		en: '"How are the articles reviewed?", "Which articles do you have about sleep?" or "How do I follow one site\'s articles?"',
	},
};

/** Who the guide is and what it helps with, before the examples. */
const INTROS: Copy = {
	psizone: {
		ro: "Bună, mă bucur că ai scris. Sunt ghidul Psizone și te pot ajuta cu întrebări despre programări, despre cum lucrăm și despre paginile noastre. De exemplu, mă poți întreba:",
		en: "Hello, I'm glad you wrote. I'm the Psizone guide, and I can help with questions about appointments, how we work and what our pages cover. For example, you could ask:",
	},
	eqsync: {
		ro: "Bună. Sunt ghidul EQ-SYNC și te pot ajuta cu întrebări despre program, exerciții, căști și contul tău. De exemplu:",
		en: "Hi. I'm the EQ-SYNC guide, and I can help with questions about the programme, the exercises, headphones and your account. For example:",
	},
	hemisync: {
		ro: "Bună. Sunt ghidul Hemi-Sync și te pot ajuta cu întrebări despre programe, exercițiile gratuite, ateliere și club. De exemplu:",
		en: "Hello. I'm the Hemi-Sync guide, and I can help with questions about the programmes, the free exercises, workshops and the club. For example:",
	},
	blog: {
		ro: "Bună. Sunt ghidul blogului și te pot ajuta să găsești articole și să afli cum le scriem și le revizuim. De exemplu:",
		en: "Hello. I'm the blog's guide, and I can help you find articles and learn how we write and review them. For example:",
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
