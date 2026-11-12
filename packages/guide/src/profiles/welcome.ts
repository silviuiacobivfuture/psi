import type { Brand, Locale } from "../contract";

/**
 * Each guide's reply to small talk ("bună", "ce poți face?", "can we just talk?"): who it is and
 * what it can help with, in the brand's warm voice. Sent as written, with no retrieval and no
 * model call, so it states no fact the reviewed content would have to back.
 */
export const WELCOMES: Readonly<Record<Brand, Readonly<Record<Locale, string>>>> = {
	psizone: {
		ro: "Bună, mă bucur că ai scris. Sunt ghidul Psizone și te pot ajuta cu întrebări despre programări, despre cum lucrăm și despre paginile noastre. Întreabă-mă ce vrei să afli.",
		en: "Hello, I'm glad you wrote. I'm the Psizone guide, and I can help with questions about appointments, how we work and what our pages cover. Ask me whatever you'd like to know.",
	},
	eqsync: {
		ro: "Bună. Sunt ghidul EQ-SYNC și te pot ajuta cu întrebări despre program, exerciții, căști și contul tău. Spune-mi ce vrei să afli.",
		en: "Hi. I'm the EQ-SYNC guide, and I can help with questions about the programme, the exercises, headphones and your account. Tell me what you'd like to know.",
	},
	hemisync: {
		ro: "Bună. Sunt ghidul Hemi-Sync și te pot ajuta cu întrebări despre programe, exercițiile gratuite, ateliere și club. Spune-mi ce te interesează.",
		en: "Hello. I'm the Hemi-Sync guide, and I can help with questions about the programmes, the free exercises, workshops and the club. Tell me what interests you.",
	},
	blog: {
		ro: "Bună. Sunt ghidul blogului și te pot ajuta să găsești articole și să afli cum le scriem și le revizuim. Întreabă-mă ce cauți.",
		en: "Hello. I'm the blog's guide, and I can help you find articles and learn how we write and review them. Ask me what you're looking for.",
	},
};

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
