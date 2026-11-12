import type { Localised } from "./localised";

/**
 * DRAFT — owner review pending (written 2026-11-12).
 *
 * Source: the owners' story (content/story.ts, chapters "acasa" to "race-me-up"). Restated
 * descriptively: the story's outcome lines ("devin mai atenți, mai rapizi și mai răbdători",
 * "progrese remarcabile") and the parents' quotes are left out on purpose (claim rules in
 * content-strategy.md: describe the process, never promise outcomes; testimonials only with
 * written consent). Everything the story does not say is a `todo`.
 */
export const RACE_ME_UP = {
	path: "/programe/race-me-up",
	/** A proper noun, never translated. */
	name: "Race Me Up",
	seo: {
		title: {
			ro: "Race Me Up: program pentru copii, Galați",
			en: "Race Me Up: programme for children, Galați",
		},
		description: {
			ro: "Race Me Up, programul Psizone din Galați care pornește de la pasiunea copiilor pentru mașini și lucrează emoțiile, atenția și răbdarea, împreună cu părinții.",
			en: "Race Me Up, Psizone's programme in Galați that starts from children's love of cars and works on emotions, attention and patience, together with parents.",
		},
	},
	lead: {
		ro: "Un program pentru copii și pentru părinții lor, care pornește de la pasiunea copiilor pentru mașini și viteză.",
		en: "A programme for children and their parents that starts from children's passion for cars and speed.",
	},
	origin: [
		{
			ro: "Race Me Up s-a născut acasă. Cu Nico, băiatul nostru, am aplicat programe de gestionare emoțională și comportamentală și am învățat din ambele roluri, de părinte și de psiholog.",
			en: "Race Me Up was born at home. With Nico, our son, we applied emotional and behavioural regulation programmes and learned from both roles, as parents and as psychologists.",
		},
		{
			ro: "Pe pistă, alături de el, am văzut cât de mult cântăresc emoțiile înaintea unei curse: tracul, nerăbdarea, dezorganizarea. Ne-am specializat în psihologie sportivă și am lucrat cu toată echipa lui.",
			en: "On the track, beside him, we saw how much emotions weigh before a race: nerves, impatience, disorganisation. We specialised in sport psychology and worked with his whole team.",
		},
	],
	aims: [
		{
			ro: "Pornește de la ce le place copiilor: mașinile și viteza.",
			en: "It starts from what children love: cars and speed.",
		},
		{
			ro: "Caută abilitățile fiecărui copil, de la orice nivel ar porni, și le dezvoltă pas cu pas.",
			en: "It looks for each child's abilities, from whatever level they start, and builds on them step by step.",
		},
		{
			ro: "Lucrează pe gestionarea emoțiilor, pe atenție, pe ritm și pe răbdare.",
			en: "It works on managing emotions, on attention, on pace and on patience.",
		},
		{
			ro: "Lucrează și cu părinții, așa cum am învățat și noi, din rolul de părinte.",
			en: "It works with the parents too, as we ourselves learned to, from the parent's side.",
		},
	],
	/** Two photographs from the old psizone.ro (the owners' own, from a slalom event). */
	photos: [
		{
			file: "motorsport-slalom-1",
			width: 1400,
			height: 1050,
			alt: {
				ro: "O mașină neagră cu galben, cu numărul de concurs pe portieră, ia un viraj între conuri pe o pistă de slalom.",
				en: "A black and yellow car with a race number on the door takes a bend between cones on a slalom course.",
			},
		},
		{
			file: "motorsport-slalom-2",
			width: 1200,
			height: 900,
			alt: {
				ro: "Aceeași mașină de slalom trece printre conuri, pe o stradă cu arbori, în fața unor steaguri de concurs.",
				en: "The same slalom car weaves between cones on a tree-lined street, in front of event flags.",
			},
		},
	],
	todo: [
		{
			ro: "Vârstele pentru care e gândit programul.",
			en: "The ages the programme is designed for.",
		},
		{
			ro: "Cum arată programul: durată, frecvență, unde se desfășoară (simulator, pistă, cabinet).",
			en: "What the programme looks like: length, frequency, where it takes place (simulator, track, practice).",
		},
		{ ro: "Cine din echipă îl conduce.", en: "Who on the team leads it." },
		{ ro: "Prețul sau intervalul de preț.", en: "The price or price range." },
	],
} as const satisfies {
	path: string;
	name: string;
	seo: { title: Localised; description: Localised };
	lead: Localised;
	origin: ReadonlyArray<Localised>;
	aims: ReadonlyArray<Localised>;
	photos: ReadonlyArray<{ file: string; width: number; height: number; alt: Localised }>;
	todo: ReadonlyArray<Localised>;
};
