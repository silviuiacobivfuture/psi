import { SITES, type Site, SOCIAL_NETWORKS } from "@psi/cms-client";
import type { Field, GlobalAfterChangeHook, GlobalConfig, TextField } from "payload";
import { z } from "zod";
import { brandsFor, can, mayEnterAdmin } from "../authz/access";
import { SECTIONS } from "../platform/sections";
import { announceSiteSettings } from "../webhook/hooks";

/**
 * Each site's settings the owners asked to manage (GET /api/globals/site-settings), one group per
 * brand: phones, addresses, opening hours, social links, the hero's "years" and three toggles.
 * THE FALLBACK RULE (@psi/cms-client `siteSettingsFor`): an empty field keeps what the site does
 * today, and a toggle left on "as today" changes nothing. Reading a group needs `read` on the
 * brand (each site's read-only service user sees its own); changing it needs `site_manager`.
 */
const LABELS: Readonly<Record<Site, string>> = {
	psizone: "Psizone",
	eqsync: "EQ-SYNC",
	hemisync: "Hemi-Sync România",
	blog: "Blog",
};

const text = (name: string, ro: string, en: string, required = false): TextField => ({
	name,
	type: "text",
	required,
	label: { ro, en },
});

const toggle = (name: string, ro: string, en: string): Field => ({
	name,
	type: "select",
	required: true,
	defaultValue: "inherit",
	label: { ro, en },
	options: [
		{ value: "inherit", label: { ro: "Ca acum (implicit)", en: "As today (default)" } },
		{ value: "on", label: { ro: "Pornit", en: "On" } },
		{ value: "off", label: { ro: "Oprit", en: "Off" } },
	],
});

function group(site: Site): Field {
	return {
		name: site,
		type: "group",
		label: LABELS[site],
		access: {
			read: ({ req }) => brandsFor(req, "read").then((b) => b.includes(site)),
			update: ({ req }) => can(req, SECTIONS.siteSettings.act, site),
		},
		admin: {
			description: {
				ro: "Un câmp gol păstrează ce arată situl acum.",
				en: "An empty field keeps what the site shows today.",
			},
		},
		fields: [
			{
				name: "phones",
				type: "array",
				label: { ro: "Telefoane", en: "Phones" },
				fields: [
					{
						name: "tel",
						type: "text",
						required: true,
						label: { ro: "Număr (format internațional, +40…)", en: "Number (international, +40…)" },
						validate: (v: string | null | undefined): true | string =>
							typeof v === "string" && /^\+[1-9]\d{7,14}$/.test(v.replace(/[\s.-]/g, ""))
								? true
								: "+40…",
					},
					text("display", "Cum se afișează (0748 017 752)", "As displayed (0748 017 752)"),
					text("labelRo", "Etichetă (ro)", "Label (ro)"),
					text("labelEn", "Etichetă (en)", "Label (en)"),
				],
			},
			{
				name: "addresses",
				type: "array",
				label: { ro: "Adrese", en: "Addresses" },
				fields: [
					text("labelRo", "Etichetă (ro)", "Label (ro)"),
					text("labelEn", "Etichetă (en)", "Label (en)"),
					text("street", "Stradă și număr", "Street and number", true),
					text("city", "Oraș", "City", true),
					{ ...text("country", "Țara (cod)", "Country (code)"), defaultValue: "RO" },
					text("mapUrl", "Link hartă", "Map link"),
				],
			},
			{
				name: "openingHours",
				type: "array",
				label: { ro: "Program", en: "Opening hours" },
				fields: [
					text("daysRo", "Zile (ro), ex. Luni–Vineri", "Days (ro), e.g. Luni–Vineri", true),
					text("daysEn", "Zile (en), ex. Monday–Friday", "Days (en), e.g. Monday–Friday", true),
					text("hours", "Ore, ex. 09:00–18:00", "Hours, e.g. 09:00–18:00", true),
				],
			},
			{
				name: "social",
				type: "array",
				label: { ro: "Rețele sociale", en: "Social links" },
				fields: [
					{
						name: "network",
						type: "select",
						required: true,
						label: { ro: "Rețea", en: "Network" },
						options: SOCIAL_NETWORKS.map((n) => ({ value: n, label: n })),
					},
					text("url", "Adresă (https://…)", "Address (https://…)", true),
				],
			},
			{
				name: "heroYears",
				type: "number",
				min: 1,
				max: 200,
				label: { ro: "Anii din prima pagină", en: "The home page's years" },
				admin: { step: 1 },
			},
			toggle("bookingInChat", "Programare în conversația cu ghidul", "Booking in the guide's chat"),
			toggle("accountsSignIn", "Intrarea în cont vizibilă", "Account sign-in visible"),
			toggle("installPrompt", "Invitația de instalare a aplicației", "The app's install prompt"),
		],
	};
}

const Doc = z.record(z.unknown());

/** The brands whose group differs between two versions of the global. */
export function changedSiteSettings(before: unknown, after: unknown): Site[] {
	const b = Doc.safeParse(before);
	const a = Doc.safeParse(after);
	return SITES.filter(
		(s) =>
			JSON.stringify(b.success ? b.data[s] : null) !== JSON.stringify(a.success ? a.data[s] : null),
	);
}

const announce: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
	const sites = changedSiteSettings(previousDoc, doc);
	if (sites.length > 0) await announceSiteSettings(req, sites);
	return doc;
};

export const SiteSettingsGlobal: GlobalConfig = {
	slug: "site-settings",
	label: { ro: "Setările siturilor", en: "Site settings" },
	// In the "Platformă / Platform" group of the admin navigation (components/AdminNav.tsx).
	admin: { group: false },
	access: {
		read: ({ req }) => mayEnterAdmin(req),
		update: async ({ req }) => (await brandsFor(req, SECTIONS.siteSettings.act)).length > 0,
	},
	hooks: { afterChange: [announce] },
	fields: SITES.map(group),
};
