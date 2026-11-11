import type { Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

export interface Member {
	/** A proper noun, never translated. */
	name: string;
	role: (o: { locale: Locale }) => string;
}

/** The team as published on psizone.ro's team page; roles not published there read "Specialist". */
export const TEAM: ReadonlyArray<Member> = [
	{ name: "Daniela Turcu", role: (o) => m.role_daniela({}, o) },
	{ name: "Adrian Turcu", role: (o) => m.role_adrian({}, o) },
	{ name: "Iuliana Mușat", role: (o) => m.role_specialist({}, o) },
	{ name: "Nicoleta Năfureanu", role: (o) => m.role_specialist({}, o) },
	{ name: "Marica Sîrbu", role: (o) => m.role_specialist({}, o) },
	{ name: "Georgiana Gheorghiță", role: (o) => m.role_specialist({}, o) },
];
