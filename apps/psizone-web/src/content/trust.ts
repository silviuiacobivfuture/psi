import type { Localised } from "./localised";

/**
 * DRAFT — owner review pending (written 2026-11-12). The documented trust signals for the home
 * page, every one from the owners' story (content/story.ts). No statistics, ratings or room counts:
 * those sources disagree or are not the owners'. The years are left to the hero's card ("22"), which
 * the owner must reconcile with the story's "peste 20".
 */
export interface TrustMark {
	value: Localised;
	label: Localised;
}

export const TRUST_MARKS: ReadonlyArray<TrustMark> = [
	{
		value: { ro: "Primul", en: "The first" },
		label: { ro: "centru terapeutic din Galați", en: "therapy centre in Galați" },
	},
	{
		value: { ro: "Prima", en: "The first" },
		label: {
			ro: "sală de integrare senzorială și polisenzorială din oraș",
			en: "sensory and multisensory integration room in the city",
		},
	},
	{
		value: { ro: "2", en: "2" },
		label: {
			ro: "școli cu săli de integrare neurosenzorială la care am contribuit: „Paul Popescu Neveanu” și „Emil Gârleanu”",
			en: "schools whose neurosensory integration rooms we helped fit out: „Paul Popescu Neveanu” and „Emil Gârleanu”",
		},
	},
	{
		value: { ro: "2", en: "2" },
		label: { ro: "metode proprii, brevetate", en: "own, patented methods" },
	},
];
