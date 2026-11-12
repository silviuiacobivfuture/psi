import { AI_SETTINGS_DEFAULTS, EMBED_MODELS, SITES, type Site } from "@psi/cms-client";
import type { Field, GlobalAfterChangeHook, GlobalBeforeChangeHook, GlobalConfig } from "payload";
import { z } from "zod";
import { brandsFor, can, mayEnterAdmin } from "../authz/access";
import { announceAiSettings } from "../webhook/hooks";

/**
 * Each site's AI settings, one group per brand, in one global (GET /api/globals/ai-settings).
 * Who may read a group: anyone with `read` on that brand (editors, and each site's read-only
 * service user, which sees its own brand only). Who may change it: `ai_admin` on that brand.
 * No secret is kept here: the OpenRouter key stays in OpenBao.
 */
const SITE_LABELS: Readonly<Record<Site, string>> = {
	psizone: "Psizone",
	eqsync: "EQ-SYNC",
	hemisync: "Hemi-Sync",
	blog: "Blog",
};

const STAMP = { create: (): boolean => false, update: (): boolean => false };

function group(site: Site): Field {
	return {
		name: site,
		type: "group",
		label: SITE_LABELS[site],
		access: {
			read: ({ req }) => brandsFor(req, "read").then((b) => b.includes(site)),
			update: ({ req }) => can(req, "ai_admin", site),
		},
		fields: [
			{
				name: "embeddings",
				type: "select",
				required: true,
				defaultValue: AI_SETTINGS_DEFAULTS.embeddings,
				label: { ro: "Încorporări (embeddings)", en: "Embeddings" },
				options: [
					{ value: "openrouter", label: "OpenRouter" },
					{ value: "lexical", label: { ro: "Lexical (fără model)", en: "Lexical (no model)" } },
				],
			},
			{
				name: "embedModel",
				type: "select",
				required: true,
				defaultValue: AI_SETTINGS_DEFAULTS.embedModel,
				label: { ro: "Modelul de încorporare", en: "Embedding model" },
				options: EMBED_MODELS.map((m) => ({ value: m, label: m })),
				admin: {
					description: {
						ro: "Alt model înseamnă alt spațiu vectorial: cunoștințele se reindexează.",
						en: "Another model is another vector space: the knowledge is re-indexed.",
					},
				},
			},
			{
				name: "deepSearch",
				type: "checkbox",
				defaultValue: AI_SETTINGS_DEFAULTS.deepSearch,
				label: { ro: "Căutare aprofundată", en: "Deep search" },
			},
			{
				name: "guideEnabled",
				type: "checkbox",
				defaultValue: AI_SETTINGS_DEFAULTS.guideEnabled,
				label: { ro: "Ghidul este pornit", en: "Guide enabled" },
			},
			{
				name: "exchangeLimit",
				type: "number",
				required: true,
				min: 1,
				max: 200,
				defaultValue: AI_SETTINGS_DEFAULTS.exchangeLimit,
				label: { ro: "Întrebări per vizitator", en: "Questions per visitor" },
				admin: {
					step: 1,
					description: {
						ro: "Câte întrebări poate pune un vizitator în fereastră: per sesiune, per browser și per amprentă, separat.",
						en: "How many questions a visitor may ask within the window: per session, per browser and per fingerprint, separately.",
					},
				},
				validate: (v: number | null | undefined): true | string =>
					typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 200 ? true : "1–200",
			},
			{
				name: "exchangeWindowHours",
				type: "number",
				required: true,
				min: 1,
				max: 168,
				defaultValue: AI_SETTINGS_DEFAULTS.exchangeWindowHours,
				label: { ro: "Fereastra (ore)", en: "Window (hours)" },
				admin: { step: 1 },
				validate: (v: number | null | undefined): true | string =>
					typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 168 ? true : "1–168",
			},
			{
				name: "screeningLevel",
				type: "select",
				required: true,
				defaultValue: AI_SETTINGS_DEFAULTS.screeningLevel,
				label: { ro: "Nivelul de filtrare", en: "Screening level" },
				options: [
					{ value: "standard", label: "Standard" },
					{ value: "strict", label: { ro: "Strict", en: "Strict" } },
				],
				admin: {
					description: {
						ro: "Standard: reguli de cuvinte, ascunderea datelor personale, reguli de criză și de domeniu (fără cost). Strict: adaugă doi detectori AI, pentru injectare de instrucțiuni și conținut abuziv (două apeluri de model în plus la fiecare întrebare).",
						en: "Standard: word rules, personal-data redaction, crisis and scope rules (free). Strict: adds two AI detectors for prompt injection and abusive content (two extra model calls per question).",
					},
				},
			},
			{
				name: "updatedBy",
				type: "text",
				label: { ro: "Schimbat de", en: "Changed by" },
				access: STAMP,
				admin: { readOnly: true },
			},
			{
				name: "updatedAt",
				type: "date",
				label: { ro: "Schimbat la", en: "Changed on" },
				access: STAMP,
				admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
			},
		],
	};
}

const Group = z.record(z.unknown());
const Doc = z.record(z.unknown());
const Who = z.object({ name: z.string().nullish(), email: z.string().nullish() });
const SETTINGS = [
	"embeddings",
	"embedModel",
	"deepSearch",
	"guideEnabled",
	"exchangeLimit",
	"exchangeWindowHours",
	"screeningLevel",
] as const;

/** The brands whose settings differ between two versions of the global. */
export function changedSites(before: unknown, after: unknown): Site[] {
	const b = Doc.safeParse(before);
	const a = Doc.safeParse(after);
	return SITES.filter((s) => {
		const x = Group.safeParse(b.success ? b.data[s] : undefined);
		const y = Group.safeParse(a.success ? a.data[s] : undefined);
		if (!y.success) return false;
		return SETTINGS.some((k) => (x.success ? x.data[k] : undefined) !== y.data[k]);
	});
}

/** Stamps who changed which brand's settings, and when. */
const stamp: GlobalBeforeChangeHook = ({ data, originalDoc, req }) => {
	const out = Doc.parse(data);
	const who = Who.parse(req.user ?? {});
	const now = new Date().toISOString();
	for (const site of changedSites(originalDoc, { ...Doc.parse(originalDoc ?? {}), ...out })) {
		out[site] = {
			...Group.parse(out[site] ?? {}),
			updatedBy: who.name ?? who.email ?? null,
			updatedAt: now,
		};
	}
	return out;
};

const announce: GlobalAfterChangeHook = async ({ doc, previousDoc, req }) => {
	const sites = changedSites(previousDoc, doc);
	if (sites.length > 0) await announceAiSettings(req, sites);
	return doc;
};

export const AiSettingsGlobal: GlobalConfig = {
	slug: "ai-settings",
	label: { ro: "Setări AI", en: "AI settings" },
	// In the "Platformă / Platform" group of the admin navigation (components/AdminNav.tsx).
	admin: { group: false },
	access: {
		read: ({ req }) => mayEnterAdmin(req),
		update: async ({ req }) => (await brandsFor(req, "ai_admin")).length > 0,
	},
	hooks: { beforeChange: [stamp], afterChange: [announce] },
	fields: SITES.map(group),
};
