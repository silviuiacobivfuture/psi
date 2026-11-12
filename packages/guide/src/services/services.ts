import type {
	EngineCatalog,
	EngineServices,
	GuideAction,
	ServiceFact,
	ServiceFinding,
	ServiceQuery,
} from "@psi/engine";
import { fold } from "@psi/engine";
import { type Brand, BrandSchema, type Locale, LocaleSchema } from "../contract";
import { bookingHandoffUrl, CENTRE_PHONES, pageUrl } from "./contact";
import { NEED_DESCRIPTIONS, NEEDS, type Need, ROUTES } from "./needs";
import { SERVICES, type ServiceDef } from "./registry";

const NeedSchema = (value: string): Need | undefined => NEEDS.find((n) => n === value);

const BOOK_LABEL: Readonly<Record<Locale, string>> = {
	ro: "Începe programarea",
	en: "Start booking",
};
const PAGE_LABEL: Readonly<Record<Locale, string>> = { ro: "Află mai multe", en: "Learn more" };
const BOOK_WORD: Readonly<Record<Locale, string>> = {
	ro: "Vreau o programare pentru",
	en: "I'd like to book",
};

/** The words of the contact route: the centre's numbers and how the booking starts. */
const CONTACT: Readonly<Record<Locale, Omit<ServiceFact, "id" | "brand" | "action" | "url">>> = {
	ro: {
		name: "Programarea și contactul",
		forWhom: "Oricine vrea să programeze o evaluare sau să vorbească întâi cu echipa.",
		whatHappens: `Poți suna la ${CENTRE_PHONES.join(" sau ")}. Poți și să începi programarea în chat, unde vezi orele libere; nu îți cerem detalii medicale.`,
		firstStep:
			"Spui ce te îngrijorează, iar echipa îți spune ce urmează și cât costă; prima discuție e despre voi, nu despre diagnostic.",
	},
	en: {
		name: "Booking and contact",
		forWhom: "Anyone who wants to book an evaluation or to talk to the team first.",
		whatHappens: `You can call ${CENTRE_PHONES.join(" or ")}. You can also start booking in the chat, where you see the free times; we do not ask for medical details.`,
		firstStep:
			"You tell us what worries you, and the team tells you what comes next and what it costs; the first conversation is about you, not about a diagnosis.",
	},
};

const PRICE_SENTENCE = /(?:Preț|Price):[^.]*\./i;

/** A booking word as the hand-over address carries it: folded, one lowercase word with hyphens. */
function slugWord(word: string): string {
	return fold(word).trim().replace(/\s+/g, "-");
}

/** The first booking word a message uses for a service ("evaluare", "logopedie"), if any. */
export function bookingWordIn(question: string, locale: Locale): string | undefined {
	const said = fold(question);
	for (const def of SERVICES) {
		const word = def.bookingWord?.[locale];
		if (word !== undefined && said.includes(fold(word).trim())) return slugWord(word);
	}
	for (const def of SERVICES) {
		const other = def.bookingWord?.[locale === "ro" ? "en" : "ro"];
		if (other !== undefined && said.includes(fold(other).trim())) return slugWord(other);
	}
	return undefined;
}

export interface PsiServicesOptions {
	/** The reviewed content, for the CMS offerings' prices (`cms.of.*` entries); none: no prices. */
	catalog?: EngineCatalog;
	/** True when the asking site books in its chat; else a booking continues on Psizone's chat. */
	bookingInChat: (profile: Brand) => boolean;
}

/** The prices the CMS published for a brand: entry text per offering title, in one locale. */
async function offeringPrices(
	catalog: EngineCatalog | undefined,
	brand: Brand,
	locale: Locale,
): Promise<ReadonlyArray<{ title: string; price: string }>> {
	if (catalog === undefined) return [];
	try {
		const items = (await catalog.items(brand, locale)).filter((i) => i.id.startsWith("cms.of."));
		const found = await Promise.all(
			items.map(async (item) => {
				const passages = await catalog.entry(brand, locale, item.id);
				const price = passages.map((p) => p.text.match(PRICE_SENTENCE)?.[0]).find(Boolean);
				return price === undefined ? [] : [{ title: item.title, price }];
			}),
		);
		return found.flat();
	} catch {
		return [];
	}
}

function actionFor(def: ServiceDef, locale: Locale, chat: boolean): GuideAction {
	if (def.start === "page") {
		return {
			kind: "link",
			label: def.cta?.[locale] ?? PAGE_LABEL[locale],
			href: pageUrl(def.brand, locale, def.path),
		};
	}
	const word = def.bookingWord?.[locale];
	if (chat) {
		return {
			kind: "ask",
			label: BOOK_LABEL[locale],
			text: `${BOOK_WORD[locale]} ${word ?? def.name[locale].toLowerCase()}`,
		};
	}
	return {
		kind: "link",
		label: BOOK_LABEL[locale],
		href: bookingHandoffUrl(locale, word === undefined ? undefined : slugWord(word)),
	};
}

function factOf(
	def: ServiceDef,
	locale: Locale,
	chat: boolean,
	prices: ReadonlyArray<{ title: string; price: string }>,
): ServiceFact {
	const price = prices.find((p) => def.match.some((m) => fold(p.title).includes(m)))?.price;
	return {
		id: def.id,
		brand: def.brand,
		name: def.name[locale],
		aka: def.aka[locale],
		forWhom: def.forWhom[locale],
		whatHappens: def.whatHappens[locale],
		firstStep: def.firstStep[locale],
		...(price === undefined ? {} : { price }),
		url: pageUrl(def.brand, locale, def.path),
		action: actionFor(def, locale, chat),
	};
}

function contactFact(locale: Locale, chat: boolean): ServiceFact {
	const action: GuideAction = chat
		? {
				kind: "ask",
				label: BOOK_LABEL[locale],
				text: `${BOOK_WORD[locale]} ${locale === "ro" ? "evaluare" : "evaluation"}`,
			}
		: { kind: "link", label: BOOK_LABEL[locale], href: bookingHandoffUrl(locale) };
	return {
		id: "psizone-contact",
		brand: "psizone",
		aka: locale === "ro" ? ["programare", "programarea"] : ["booking", "appointment"],
		...CONTACT[locale],
		url: pageUrl("psizone", locale, "/contact"),
		action,
	};
}

/** What a finding says besides the services: the limits the guide keeps in its recommendation. */
function noteFor(profile: Brand, hasPrice: boolean, routed: ReadonlyArray<Brand>): string {
	const lines = [
		hasPrice
			? "Say the price only as returned."
			: "No price is published for these: do not give one; say the team tells the price at the first conversation.",
	];
	if (routed.length === 0) {
		lines.push(
			"Nothing here fits this need. Say so kindly in a sentence; do not recommend anything elsewhere; point to a specialist.",
		);
	}
	if (routed.includes("eqsync")) {
		lines.push(
			"EQ-SYNC is a wellness tool, not a medical device or a treatment: for a sleep problem that lasts or worries them, also mention an evaluation at Psizone.",
		);
	}
	if (profile === "blog" && routed.length > 1) {
		lines.push("Each service names its brand: say which site it is on.");
	}
	return lines.join(" ");
}

/**
 * The services the guides recommend, as the engine's `recommendServices` reads them: the
 * registry's services for the need, routed by brand (`ROUTES`: the one place the cross-brand
 * policy is written), each with its price when the CMS has published one, and the button that
 * takes the first step (the chat's booking where the site books, a link elsewhere). Never a
 * service outside the route: a clinical need gets no Hemi-Sync, whatever the model asks for.
 */
export function psiServices(options: PsiServicesOptions): EngineServices {
	return {
		needs: NEEDS.map((id) => ({ id, description: NEED_DESCRIPTIONS[id] })),
		async find(query: ServiceQuery): Promise<ServiceFinding> {
			const profile = BrandSchema.parse(query.profile);
			const locale = LocaleSchema.parse(query.locale);
			const need = NeedSchema(query.need);
			if (need === undefined) return { services: [], note: "Unknown need." };
			const chat = options.bookingInChat(profile);
			const routed = ROUTES[profile][need];
			const prices = (
				await Promise.all(routed.map((brand) => offeringPrices(options.catalog, brand, locale)))
			).flat();
			const firsts = routed.flatMap((brand) =>
				SERVICES.filter((d) => d.brand === brand && d.needs.includes(need)),
			);
			// One service per brand first, so a mixed route (the blog) shows each brand, then the rest.
			const seen = new Set<Brand>();
			const lead = firsts.filter((d) => !seen.has(d.brand) && seen.add(d.brand) !== undefined);
			const ordered = [...lead, ...firsts.filter((d) => !lead.includes(d))];
			const services = ordered.map((d) => factOf(d, locale, chat, prices));
			const contact =
				need === "booking-contact" && routed.includes("psizone") ? [contactFact(locale, chat)] : [];
			const all = [...contact, ...services];
			return {
				services: all,
				note: noteFor(
					profile,
					all.some((s) => s.price !== undefined),
					routed,
				),
			};
		},
	};
}
