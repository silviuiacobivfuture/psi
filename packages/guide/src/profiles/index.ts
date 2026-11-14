import {
	type ConversationStyle,
	DEFAULT_STYLE,
	type Profile,
	type ProfileLocale,
	type ProfileScheduling,
} from "@psi/engine";
import { BRANDS, type Brand, type Locale } from "../contract";
import { bookingHandoffUrl, CENTRE_PHONES } from "../services/contact";
import { bookingWordIn } from "../services/services";
import { CONTACT_FACTS, conciergeRules } from "./concierge";
import { CRISIS } from "./crisis";
import { fallbackOf } from "./fallback";
import { FOLLOW_UP_TOPICS, NEXT_STEP_PHRASES, NEXT_STEPS, policyOf } from "./policy";
import { CLINICAL, HEMISYNC_ONLY, OUT_OF_SCOPE, SISTER_BRANDS } from "./scope";
import { SCREENING } from "./screening";
import { voiceOf } from "./voices";
import { FOLLOW_UPS, THANKS, UNKNOWN, WELCOMES } from "./welcome";

const MAIN_PHONE = CENTRE_PHONES[0];

/** Each brand's guide, as its agent is named. */
const NAMES: Readonly<Record<Brand, string>> = {
	psizone: "Ghidul Psizone",
	eqsync: "Ghidul EQ-SYNC",
	hemisync: "Ghidul Hemi-Sync",
	blog: "Ghidul blogului psi",
};

/**
 * Which brands schedule (docs/plans/scheduling.md). Psizone first. What each offers is whatever
 * active services the store has for its tenant.
 * EQ-SYNC's online sessions and Hemi-Sync's session requests join once their services exist.
 */
const SCHEDULING: Readonly<Partial<Record<Brand, ProfileScheduling>>> = {
	// The services come from the store at each turn (the port's catalogue); none are named here.
	psizone: { tenant: "psizone", services: [] },
};

/** True when the brand's guide books inside its own chat (it has a scheduling tenant). */
export function schedulesInChat(brand: Brand): boolean {
	return SCHEDULING[brand] !== undefined;
}

/**
 * Where a booking request goes on a site that cannot book itself: Psizone's chat, with the
 * booking started. Hemi-Sync's workshops are not Psizone's appointments, so it has none.
 */
const HANDOFF_LINES: Readonly<
	Partial<Record<Brand, Readonly<Record<Locale, { line: string; label: string }>>>>
> = {
	blog: {
		ro: {
			line: `Sigur, te ajut să începi. Programările se fac în conversația Psizone, unde vezi orele libere și alegi ce ți se potrivește; apasă butonul și continui acolo, cu programarea deja pornită. Dacă preferi telefonul, sună la ${MAIN_PHONE}.`,
			label: "Începe programarea",
		},
		en: {
			line: `Of course, I can help you start. Appointments are made in the Psizone conversation, where you see the free times and pick what suits you; press the button and carry on there, with the booking already started. If you prefer the phone, call ${MAIN_PHONE}.`,
			label: "Start booking",
		},
	},
	eqsync: {
		ro: {
			line: `EQ-SYNC se ascultă singur, fără programări. Dacă vrei o evaluare la centrul Psizone, o începi în conversația lor: apasă butonul și vezi orele libere, cu programarea deja pornită. Sau sună la ${MAIN_PHONE}.`,
			label: "Începe programarea la Psizone",
		},
		en: {
			line: `EQ-SYNC is something you listen to alone, with no appointments. If you want an evaluation at the Psizone centre, you start it in their conversation: press the button and see the free times, with the booking already started. Or call ${MAIN_PHONE}.`,
			label: "Start booking at Psizone",
		},
	},
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
			...conciergeRules(brand, locale),
			...(style.followUps === "never" ? [] : [FOLLOW_UP_TOPICS[brand][locale]]),
		],
	};
}

function handoffOf(brand: Brand, locale: Locale): Pick<ProfileLocale, "handoff"> {
	const words = HANDOFF_LINES[brand]?.[locale];
	if (words === undefined) return {};
	return {
		handoff: {
			...words,
			href: (question) => bookingHandoffUrl(locale, bookingWordIn(question, locale)),
		},
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
		facts: CONTACT_FACTS[locale],
		...handoffOf(brand, locale),
		...fallbackOf(brand, locale),
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
				: brand === "blog"
					? [{ when: CLINICAL, forbid: HEMISYNC_ONLY, refusal: "out_of_scope" }]
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
