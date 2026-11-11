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
	lead: Localised;
	origin: ReadonlyArray<Localised>;
	aims: ReadonlyArray<Localised>;
	todo: ReadonlyArray<Localised>;
};
