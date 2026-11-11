import type { KnowledgeEntryInput } from "../entry";
import { HUB_FACTS } from "./hubs";

/**
 * Psizone, Romanian. Non-clinical facts already published in this repo: the contact page
 * (apps/psizone-web/src/pages/contact.tsx), the booking form (booking.tsx, messages form_*), the
 * hub cards (messages hub_*) and the editorial workflow (docs/brands/content-strategy.md).
 * No clinical facts, no prices, no address (the address is disputed).
 */

const common = {
	brand: "psizone",
	locale: "ro",
	status: "published",
	reviewedBy: null,
	reviewedAt: null,
} as const;

const contact: KnowledgeEntryInput = {
	...common,
	id: "psizone-ro-contact-phones",
	kind: "operational",
	title: "Telefoanele Psizone",
	url: "/contact",
	body: [
		"## Telefon",
		"",
		"Poți suna direct la centrul Psizone, la unul dintre cele două numere de telefon publicate pe psizone.ro:",
		"",
		"- 0748 017 752",
		"- 0752 466 792",
		"",
		"## Dacă preferi să scrii",
		"",
		"Pe pagina de contact poți lăsa și o cerere de programare, cu un e-mail sau un număr de telefon. Nu îți cerem detalii medicale în cerere: despre ce te îngrijorează vorbim la telefon.",
	].join("\n"),
};

const booking: KnowledgeEntryInput = {
	...common,
	id: "psizone-ro-booking-request",
	kind: "operational",
	title: "Ce cere formularul de programare",
	url: "/contact",
	body: [
		"## Cererea de programare",
		"",
		"Cererea de programare de pe pagina de contact cere doar date pentru organizare, niciodată detalii medicale:",
		"",
		"- numele tău;",
		"- un e-mail sau un număr de telefon (ne ajunge unul dintre ele);",
		"- pentru cine e evaluarea: un copil, un adolescent sau pentru tine;",
		"- când te putem suna: dimineața, după-amiaza sau oricând;",
		"- acordul tău să fii contactat de Psizone pentru programare.",
		"",
		"Formularul nu are un câmp de text liber. Datele tale sunt folosite doar pentru programare; detaliile sunt în politica de confidențialitate.",
	].join("\n"),
};

const editorial: KnowledgeEntryInput = {
	...common,
	id: "psizone-ro-editorial-workflow",
	kind: "editorial",
	title: "Cum scriem și revizuim articolele",
	url: "/politica-editoriala",
	body: [
		"## De la ciornă la publicare",
		"",
		"Fiecare articol trece prin aceiași pași: ciornă, revizuire clinică, publicare. La revizuire, un specialist din echipă aprobă textul sau cere modificări; se păstrează cine a aprobat și data revizuirii. Publicăm doar texte aprobate, cu autorul și revizorul clinic numiți, și revizuim din nou fiecare pagină după 12 luni.",
		"",
		"## Regulile pe care le urmăm",
		"",
		"- Descriem procesul și ce măsurăm; nu promitem vindecări, termene sau procente fără sursă.",
		"- Mărturiile apar doar cu acord scris și fără promisiuni de rezultat.",
		"- Fiecare pagină despre o metodă spune și pentru cine nu este potrivită.",
		"- Niciun text generat cu AI nu se publică nerevizuit, iar textele despre criză și siguranță nu se scriu cu AI.",
		"",
		"Ghidul de pe site răspunde doar din conținut publicat și revizuit și arată pagina din care a răspuns.",
	].join("\n"),
};

const hubsOverview: KnowledgeEntryInput = {
	...common,
	id: "psizone-ro-hubs",
	kind: "editorial",
	title: "Temele Psizone",
	url: "/",
	body: [
		"## Teme",
		"",
		"Pe psizone.ro informațiile sunt grupate pe teme:",
		"",
		...HUB_FACTS.map((h) => `- **${h.ro.title}** (${h.ro.eyebrow}): ${h.ro.text}`),
		"",
		"Articolele temelor sunt în pregătire; fiecare este scris și revizuit de psihologi înainte de publicare.",
	].join("\n"),
};

const hubs: ReadonlyArray<KnowledgeEntryInput> = HUB_FACTS.map((h) => ({
	...common,
	id: `psizone-ro-hub-${h.id}`,
	kind: "editorial",
	title: h.ro.title,
	url: h.path,
	audience: h.ro.eyebrow,
	hub: h.path,
	body: [
		`## ${h.ro.title}`,
		"",
		`Tema „${h.ro.title}” (${h.ro.eyebrow}) de pe psizone.ro: ${h.ro.text}`,
		"",
		"Articolele acestei teme sunt în pregătire; fiecare este scris și revizuit de psihologi înainte de publicare.",
	].join("\n"),
}));

export const PSIZONE_RO: ReadonlyArray<KnowledgeEntryInput> = [
	contact,
	booking,
	editorial,
	hubsOverview,
	...hubs,
];
