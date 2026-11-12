import {
	type ConversationStyle,
	DEFAULT_STYLE,
	type Profile,
	type ProfileLocale,
	type ProfileScheduling,
} from "@psi/engine";
import { BRANDS, type Brand, type Locale } from "../contract";
import { CRISIS } from "./crisis";
import { FOLLOW_UP_TOPICS, NEXT_STEP_PHRASES, NEXT_STEPS, policyOf } from "./policy";
import { CLINICAL, OUT_OF_SCOPE, SISTER_BRANDS } from "./scope";
import { SCREENING } from "./screening";
import { voiceOf } from "./voices";
import { FOLLOW_UPS, THANKS, UNKNOWN, WELCOMES } from "./welcome";

/** Each brand's guide, as its agent is named. */
const NAMES: Readonly<Record<Brand, string>> = {
	psizone: "Ghidul Psizone",
	eqsync: "Ghidul EQ-SYNC",
	hemisync: "Ghidul Hemi-Sync",
	blog: "Ghidul blogului psi",
};

/**
 * Which brands schedule, and what (docs/plans/scheduling.md). Psizone first: evaluation requests.
 * EQ-SYNC's online sessions and Hemi-Sync's session requests join once their services exist.
 */
const SCHEDULING: Readonly<Partial<Record<Brand, ProfileScheduling>>> = {
	psizone: { tenant: "psizone", services: ["evaluation"] },
};

/**
 * One brand's voice and policy in one locale, in a conversation style: what a follow-up may be
 * about is said only when follow-ups are asked at all.
 */
function styled(
	brand: Brand,
	locale: Locale,
	style: ConversationStyle,
): { voice: string; policy: ReadonlyArray<string> } {
	return {
		voice: voiceOf(brand, locale, style),
		policy: [
			...policyOf(locale, style),
			...(style.followUps === "never" ? [] : [FOLLOW_UP_TOPICS[brand][locale]]),
		],
	};
}

/** One brand's wording in one locale: its voice, psi's policy and next steps. */
function wording(brand: Brand, locale: Locale): ProfileLocale {
	return {
		...styled(brand, locale, DEFAULT_STYLE),
		restyle: (style) => styled(brand, locale, style),
		nextSteps: NEXT_STEPS[locale],
		welcome: WELCOMES[brand][locale],
		thanks: THANKS[brand][locale],
		followUp: FOLLOW_UPS[brand][locale],
		unknown: UNKNOWN[brand][locale],
	};
}

/**
 * One brand's guide as an engine profile. Every brand shares psi's crisis, scope and abuse
 * exemptions; only Psizone carries the sister-brand rule (no Hemi-Sync or EQ-SYNC on a clinical
 * question). Romanian is listed first, so it is the agent's default instructions.
 */
function profileFor(brand: Brand): Profile {
	return {
		id: brand,
		name: NAMES[brand],
		knowledgeScope: brand,
		locales: { ro: wording(brand, "ro"), en: wording(brand, "en") },
		crisis: CRISIS,
		outOfScope: OUT_OF_SCOPE,
		abuseExemptions: CLINICAL,
		crossReferences:
			brand === "psizone"
				? [{ when: CLINICAL, forbid: SISTER_BRANDS, refusal: "out_of_scope" }]
				: [],
		nextStepPhrases: NEXT_STEP_PHRASES,
		screening: SCREENING,
		refusalPolicy: { invalidInput: "out_of_scope" },
		...(SCHEDULING[brand] === undefined ? {} : { scheduling: SCHEDULING[brand] }),
	};
}

/** psi's four guides, as the engine's profiles. */
export const PSI_PROFILES: Readonly<Record<Brand, Profile>> = {
	psizone: profileFor("psizone"),
	eqsync: profileFor("eqsync"),
	hemisync: profileFor("hemisync"),
	blog: profileFor("blog"),
};

/** The profiles in brand order. */
export const ALL_PSI_PROFILES: ReadonlyArray<Profile> = BRANDS.map((brand) => PSI_PROFILES[brand]);
