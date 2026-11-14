import type { ProfileFallback } from "@psi/engine";
import type { Brand, Locale } from "../contract";
import { CENTRE_PHONES, pageUrl } from "../services/contact";

const MAIN_PHONE = CENTRE_PHONES[0] ?? "";

/**
 * What the guide of a brand the organisation's settings govern (it has a scheduling tenant: Psizone) says when those
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
};

export function fallbackOf(brand: Brand, locale: Locale): { fallback?: ProfileFallback } {
	const words = FALLBACKS[brand]?.[locale];
	if (words === undefined) return {};
	const { label, ...rest } = words;
	return { fallback: { ...rest, action: { label, href: pageUrl(brand, locale, "/programare") } } };
}
