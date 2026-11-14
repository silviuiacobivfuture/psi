import type { ProfileFallback } from "@psi/engine";
import type { Brand, Locale } from "../contract";
import { CENTRE_PHONES, hemisyncBookingUrl, pageUrl } from "../services/contact";

const MAIN_PHONE = CENTRE_PHONES[0] ?? "";

/**
 * What the guide of a brand the organisation's settings govern (it has a scheduling tenant: Psizone, Hemi-Sync) says when those
 * settings stop it (switched off, the month's budget or tokens spent), and its offer of a person after refusals. Both
 * carry the booking form, so a visitor can always ask for a visit or a call back.
 */
const FALLBACKS: Readonly<
	Partial<
		Record<Brand, Readonly<Record<Locale, Omit<ProfileFallback, "action"> & { label: string }>>>
	>
> = {
	psizone: {
		ro: {
			paused:
				"Ghidul face o pauză acum. Poți cere o programare sau să te sunăm din formularul de programare, iar echipa îți răspunde cât de curând.",
			person: (contact) =>
				`Îmi pare rău că nu te-am putut ajuta. Un om din echipă te poate ajuta: ${contact}. Sau lasă-ne o cerere în formularul de programare.`,
			contact: MAIN_PHONE,
			label: "Formularul de programare",
		},
		en: {
			paused:
				"The guide is taking a break right now. You can ask for an appointment or a call back in the booking form, and the team will reply soon.",
			person: (contact) =>
				`I'm sorry I couldn't help. A person from the team can: ${contact}. Or leave us a request in the booking form.`,
			contact: MAIN_PHONE,
			label: "The booking form",
		},
	},
	// Hemi-Sync România publishes no fixed phone: its booking page is the way to a person, unless the team names one.
	hemisync: {
		ro: {
			paused:
				"Ghidul face o pauză acum. Poți cere o sesiune sau să te contactăm din formularul de programare Hemi-Sync, iar echipa îți răspunde cât de curând.",
			person: (contact) =>
				`Îmi pare rău că nu te-am putut ajuta. Un om din echipa Hemi-Sync te poate ajuta: ${contact}.`,
			contact: hemisyncBookingUrl("ro"),
			label: "Formularul de programare",
		},
		en: {
			paused:
				"The guide is taking a break right now. You can ask for a session or to be contacted in the Hemi-Sync booking form, and the team will reply soon.",
			person: (contact) =>
				`I'm sorry I couldn't help. A person from the Hemi-Sync team can: ${contact}.`,
			contact: hemisyncBookingUrl("en"),
			label: "The booking form",
		},
	},
};

/** Where the brand's booking form is, in the visitor's language. */
function bookingHref(brand: Brand, locale: Locale): string {
	return brand === "hemisync" ? hemisyncBookingUrl(locale) : pageUrl(brand, locale, "/programare");
}

export function fallbackOf(brand: Brand, locale: Locale): { fallback?: ProfileFallback } {
	const words = FALLBACKS[brand]?.[locale];
	if (words === undefined) return {};
	const { label, ...rest } = words;
	return { fallback: { ...rest, action: { label, href: bookingHref(brand, locale) } } };
}
