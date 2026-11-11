import type { KnowledgeEntryInput } from "../entry";

/**
 * EQ-SYNC, Romanian and English. Copied from the site's own copy (apps/eqsync-web/messages/
 * {ro,en}.json: method_*, path_*, protocols_*, faq_1..4, hero_lead, closing_text). No health
 * claims, no prices; the contraindication answer (faq_5) is medical guidance and is left out
 * until a clinician reviews it.
 */

type Locale = "ro" | "en";

const common = {
	brand: "eqsync",
	status: "published",
	reviewedBy: null,
	reviewedAt: null,
} as const;

function home(locale: Locale, anchor: string): string {
	return locale === "ro" ? `/#${anchor}` : `/en/#${anchor}`;
}

interface Copy {
	slug: string;
	kind: "programme" | "operational";
	anchor: string;
	title: Record<Locale, string>;
	body: Record<Locale, ReadonlyArray<string>>;
}

const COPY: ReadonlyArray<Copy> = [
	{
		slug: "free-programme",
		kind: "programme",
		anchor: "program",
		title: { ro: "Programul gratuit de 21 de zile", en: "The free 21-day programme" },
		body: {
			ro: [
				"## Programul gratuit",
				"",
				"4 exerciții ghidate, cu căștile, în ritmul tău: 21 de zile de la confirmarea adresei de email. Primele 21 de zile sunt din partea noastră, fără obligații.",
				"",
				"## 21 de zile, sesiune cu sesiune",
				"",
				"- **Pui căștile.** Alegi un moment liniștit al zilei și un loc unde nu te grăbește nimeni.",
				"- **Parcurgi exercițiile.** Cele 4 exerciții ghidate, în ritmul tău. Le poți relua oricând în cele 21 de zile.",
				"- **Ziua 20.** Se deblochează exercițiul bonus „Relaxare profundă”, care rămâne al tău și după program.",
				"",
				"## Cum decurge o ședință",
				"",
				"Pui căștile, alegi un loc liniștit și asculți un exercițiu ghidat, în ritmul tău. Programul gratuit are 4 exerciții, pe care le poți relua oricând în cele 21 de zile.",
				"",
				"## După cele 21 de zile gratuite",
				"",
				"Cele 4 exerciții gratuite se închid după ziua 21, iar înainte primești un email. Exercițiul bonus „Relaxare profundă”, deblocat în ziua 20, rămâne al tău. Dacă vrei să continui, alegi protocoale.",
			],
			en: [
				"## The free programme",
				"",
				"4 guided exercises, with headphones, at your own pace: 21 days from the moment you confirm your email. The first 21 days are on us, with no obligation.",
				"",
				"## 21 days, session by session",
				"",
				"- **Put on headphones.** Pick a quiet moment of the day and a place where nothing rushes you.",
				"- **Go through the exercises.** The 4 guided exercises, at your own pace. Repeat them any time during the 21 days.",
				"- **Day 20.** The bonus exercise “Deep relaxation” unlocks, and stays yours after the programme.",
				"",
				"## What a session is like",
				"",
				"You put on headphones, find a quiet place and listen to a guided exercise at your own pace. The free programme has 4 exercises, which you can repeat any time during the 21 days.",
				"",
				"## After the 21 free days",
				"",
				"The 4 free exercises close after day 21, and you get an email beforehand. The bonus exercise “Deep relaxation”, unlocked on day 20, stays yours. If you want to go on, you choose protocols.",
			],
		},
	},
	{
		slug: "headphones",
		kind: "operational",
		anchor: "intrebari",
		title: { ro: "De ce ai nevoie de căști", en: "Why you need headphones" },
		body: {
			ro: [
				"## Căști, nu difuzoare",
				"",
				"Ai nevoie doar de căști, cu sunet separat pentru stânga și dreapta. Difuzoarele nu funcționează: efectul binaural depinde de tonul diferit pe care îl primește fiecare ureche.",
				"",
				"De aceea căștile sunt necesare: difuzoarele amestecă cele două tonuri înainte să ajungă la urechi. Sunetul pornește doar când apeși tu.",
			],
			en: [
				"## Headphones, not speakers",
				"",
				"You only need headphones, with separate left and right sound. Speakers don't work: the binaural effect depends on each ear receiving its own tone.",
				"",
				"That is why headphones are needed: speakers mix the two tones before they reach your ears. Sound starts only when you press play.",
			],
		},
	},
	{
		slug: "method",
		kind: "programme",
		anchor: "metoda",
		title: { ro: "Ce sunt frecvențele binaurale, pe scurt", en: "Binaural frequencies, in short" },
		body: {
			ro: [
				"## Metoda",
				"",
				"Fiecare ureche primește un ton ușor diferit; creierul recompune diferența.",
				"",
				"- Prin căști, urechea stângă aude un ton, iar urechea dreaptă unul foarte apropiat ca frecvență.",
				"- Fenomenul se numește bătaie binaurală: creierul percepe un al treilea ton, care nu există fizic în afara lui.",
				"",
				"De aceea căștile sunt necesare: difuzoarele amestecă cele două tonuri înainte să ajungă la urechi.",
			],
			en: [
				"## The method",
				"",
				"Each ear hears a slightly different tone; the brain puts the difference back together.",
				"",
				"- Through headphones, the left ear hears one tone and the right ear another, very close in frequency.",
				"- This is called a binaural beat: the brain perceives a third tone that does not physically exist outside it.",
				"",
				"That is why headphones are needed: speakers mix the two tones before they reach your ears.",
			],
		},
	},
	{
		slug: "protocols",
		kind: "programme",
		anchor: "protocoale",
		title: { ro: "Protocoalele, după cele 21 de zile", en: "Protocols, after the 21 days" },
		body: {
			ro: [
				"## Protocoale, dacă vrei să continui",
				"",
				"Fiecare protocol e construit din exerciții ghidate și îl alegi tu, lună de lună. Categoriile de protocoale sunt:",
				"",
				"- Calmare, stres și reglare",
				"- Somn și regenerare",
				"- Claritate mentală și decizii",
				"",
				"Descrierea protocoalelor din fiecare categorie urmează.",
			],
			en: [
				"## Protocols, if you want to go on",
				"",
				"Each protocol is built from guided exercises, and you choose it month by month. The protocol categories are:",
				"",
				"- Calm, stress and regulation",
				"- Sleep and recovery",
				"- Mental clarity and decisions",
				"",
				"The protocols in each category will be described soon.",
			],
		},
	},
	{
		slug: "wellness-tool",
		kind: "operational",
		anchor: "intrebari",
		title: {
			ro: "E un dispozitiv medical sau un tratament?",
			en: "Is it a medical device or a treatment?",
		},
		body: {
			ro: [
				"## Instrument de wellness",
				"",
				"Nu. EQ-SYNC este un instrument de wellness, nu un dispozitiv medical, și nu înlocuiește consultul sau tratamentul medical.",
			],
			en: [
				"## A wellness tool",
				"",
				"No. EQ-SYNC is a wellness tool, not a medical device, and it does not replace medical advice or treatment.",
			],
		},
	},
];

function entries(locale: Locale): ReadonlyArray<KnowledgeEntryInput> {
	return COPY.map((c) => ({
		...common,
		locale,
		id: `eqsync-${locale}-${c.slug}`,
		kind: c.kind,
		title: c.title[locale],
		url: home(locale, c.anchor),
		body: c.body[locale].join("\n"),
	}));
}

export const EQSYNC_RO: ReadonlyArray<KnowledgeEntryInput> = entries("ro");
export const EQSYNC_EN: ReadonlyArray<KnowledgeEntryInput> = entries("en");
