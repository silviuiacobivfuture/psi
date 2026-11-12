import { live, RETIRED_SITES } from "@psi/content";
import type { Brand } from "../contract";

/** What a visitor may need, as the guide sorts it: the routing table's rows. */
export const NEEDS = [
	"child-development",
	"teen-support",
	"adult-mental-health",
	"evaluation",
	"sleep-calm",
	"meditation-exploration",
	"booking-contact",
	"general",
] as const;
export type Need = (typeof NEEDS)[number];

/** What the model reads to pick a need (the tool's description). */
export const NEED_DESCRIPTIONS: Readonly<Record<Need, string>> = {
	"child-development":
		"a child's speech, language, autism or ADHD concerns, behaviour, sensory difficulties, or a worry about development",
	"teen-support": "a teenager: school anxiety, screens, mood, a teen who has withdrawn",
	"adult-mental-health":
		"an adult's anxiety, depression, panic, burnout, therapy, or a first therapy session",
	evaluation:
		"wanting a first evaluation, an assessment or a QEEG brain map, or not knowing where to start",
	"sleep-calm":
		"stress, wanting calm, winding down in the evening, or trouble sleeping (wellness, not a diagnosis)",
	"meditation-exploration":
		"wanting to try meditation, focus states, lucid dreaming or exploring awareness",
	"booking-contact": "how to book, phone numbers, how to reach the team",
	general: "the visitor asks what we offer and has not said what they need",
};

/** The needs that are clinical ground: health, development, therapy. Never Hemi-Sync. */
export const CLINICAL_NEEDS: ReadonlyArray<Need> = [
	"child-development",
	"teen-support",
	"adult-mental-health",
	"evaluation",
];

/**
 * Which brands' services each guide may recommend for each need, in the order to offer them. The
 * one place the cross-brand routing is written (brand books 1 to 4): Psizone is the clinic and
 * only ever recommends itself; EQ-SYNC is a wellness programme and sends clinical needs to
 * Psizone; Hemi-Sync is exploration, not therapy, and recommends nothing for a clinical need; the
 * blog routes every need to the brand that fits and never Hemi-Sync for a clinical one.
 *
 * This is the DECLARED table, retired sites included; `ROUTES` is what the guides read.
 */
export const DECLARED_ROUTES: Readonly<
	Record<Brand, Readonly<Record<Need, ReadonlyArray<Brand>>>>
> = {
	psizone: {
		"child-development": ["psizone"],
		"teen-support": ["psizone"],
		"adult-mental-health": ["psizone"],
		evaluation: ["psizone"],
		"sleep-calm": ["psizone"],
		"meditation-exploration": [],
		"booking-contact": ["psizone"],
		general: ["psizone"],
	},
	eqsync: {
		"child-development": ["psizone"],
		"teen-support": ["psizone"],
		"adult-mental-health": ["psizone"],
		evaluation: ["psizone"],
		"sleep-calm": ["eqsync"],
		"meditation-exploration": ["eqsync"],
		"booking-contact": ["psizone"],
		general: ["eqsync"],
	},
	hemisync: {
		"child-development": [],
		"teen-support": [],
		"adult-mental-health": [],
		evaluation: [],
		"sleep-calm": ["hemisync"],
		"meditation-exploration": ["hemisync"],
		"booking-contact": [],
		general: ["hemisync"],
	},
	blog: {
		"child-development": ["psizone"],
		"teen-support": ["psizone"],
		"adult-mental-health": ["psizone"],
		evaluation: ["psizone"],
		"sleep-calm": ["eqsync", "psizone"],
		"meditation-exploration": ["hemisync", "eqsync"],
		"booking-contact": ["psizone"],
		general: ["psizone", "eqsync", "hemisync"],
	},
};

/** The table without a retired site as a destination: a need it served falls to the next brand. */
export function liveRoutes(
	retired: ReadonlyArray<string> = RETIRED_SITES,
): Readonly<Record<Brand, Readonly<Record<Need, ReadonlyArray<Brand>>>>> {
	const lived = (
		row: Readonly<Record<Need, ReadonlyArray<Brand>>>,
	): Readonly<Record<Need, ReadonlyArray<Brand>>> => ({
		"child-development": live(row["child-development"], retired),
		"teen-support": live(row["teen-support"], retired),
		"adult-mental-health": live(row["adult-mental-health"], retired),
		evaluation: live(row.evaluation, retired),
		"sleep-calm": live(row["sleep-calm"], retired),
		"meditation-exploration": live(row["meditation-exploration"], retired),
		"booking-contact": live(row["booking-contact"], retired),
		general: live(row.general, retired),
	});
	return {
		psizone: lived(DECLARED_ROUTES.psizone),
		eqsync: lived(DECLARED_ROUTES.eqsync),
		hemisync: lived(DECLARED_ROUTES.hemisync),
		blog: lived(DECLARED_ROUTES.blog),
	};
}

/** What the guides route by: `DECLARED_ROUTES` minus the retired sites (`RETIRED_SITES`). */
export const ROUTES = liveRoutes();
