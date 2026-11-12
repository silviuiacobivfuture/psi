import type { Site } from "@psi/cms-client";
import type { PayloadRequest } from "payload";
import { z } from "zod";
import { type StudioSettings, snapshotSettings, studioSettingsOf } from "./settings";

/**
 * The studio's drafts and history (collection `ai-settings-versions`). Every function here is
 * called after the caller's own check (the global's update access, or the endpoint's
 * `ai_admin`), so the Local API runs with `overrideAccess`; reads for a view use the person's
 * own access instead.
 */
const COLLECTION = "ai-settings-versions";

/** How a version went live, set by the endpoint before it updates the global. */
export const STUDIO_NOTE = "psi.studio.note";
export type VersionNote = "studio" | "revert" | "form" | "baseline";

const Who = z.object({
	id: z.union([z.number(), z.string()]).optional(),
	name: z.string().nullish(),
	email: z.string().nullish(),
});

export function whoOf(req: PayloadRequest): { by: string | null; byId: string | null } {
	const w = Who.safeParse(req.user ?? {});
	if (!w.success) return { by: null, byId: null };
	return {
		by: w.data.name ?? w.data.email ?? null,
		byId: w.data.id === undefined ? null : String(w.data.id),
	};
}

const Row = z.object({
	id: z.union([z.number(), z.string()]),
	brand: z.string(),
	kind: z.enum(["draft", "published"]),
	settings: z.unknown(),
	by: z.string().nullish(),
	at: z.string(),
	note: z.string().nullish(),
});
const Rows = z.object({ docs: z.array(Row) });

export interface Version {
	id: string;
	kind: "draft" | "published";
	settings: StudioSettings;
	by: string | null;
	at: string;
	note: string | null;
}

function versionOf(row: z.infer<typeof Row>, brand: Site): Version | null {
	const settings = snapshotSettings(row.settings, brand);
	if (settings === null) return null;
	return {
		id: String(row.id),
		kind: row.kind,
		settings,
		by: row.by ?? null,
		at: row.at,
		note: row.note ?? null,
	};
}

async function rows(
	req: PayloadRequest,
	brand: Site,
	kind: "draft" | "published",
	limit: number,
	asPerson: boolean,
): Promise<Version[]> {
	const page = Rows.parse(
		await req.payload.find({
			collection: COLLECTION,
			where: { and: [{ brand: { equals: brand } }, { kind: { equals: kind } }] },
			sort: "-at",
			limit,
			depth: 0,
			...(asPerson ? { overrideAccess: false, user: req.user } : { overrideAccess: true }),
			req,
		}),
	);
	return page.docs.flatMap((r) => {
		const v = versionOf(r, brand);
		return v === null ? [] : [v];
	});
}

/** The brand's saved draft, or null; read with the person's own access. */
export async function readDraft(req: PayloadRequest, brand: Site): Promise<Version | null> {
	return (await rows(req, brand, "draft", 1, true))[0] ?? null;
}

/** The brand's published versions, newest first; read with the person's own access. */
export function readHistory(req: PayloadRequest, brand: Site, limit = 20): Promise<Version[]> {
	return rows(req, brand, "published", limit, true);
}

/** One published version of this brand, by id, or null. */
export async function readVersion(
	req: PayloadRequest,
	brand: Site,
	id: string,
): Promise<Version | null> {
	const found = await req.payload
		.findByID({ collection: COLLECTION, id, depth: 0, overrideAccess: true, req })
		.catch(() => null);
	const row = Row.safeParse(found);
	if (!row.success || row.data.brand !== brand || row.data.kind !== "published") return null;
	return versionOf(row.data, brand);
}

/** Saves the brand's draft (one row, replaced). */
export async function saveDraft(
	req: PayloadRequest,
	brand: Site,
	settings: StudioSettings,
): Promise<Version> {
	const existing = await rows(req, brand, "draft", 5, false);
	const data = {
		brand,
		kind: "draft" as const,
		settings,
		...whoOf(req),
		at: new Date().toISOString(),
	};
	const [first, ...extra] = existing;
	if (first === undefined) {
		await req.payload.create({ collection: COLLECTION, data, overrideAccess: true, req });
	} else {
		await req.payload.update({
			collection: COLLECTION,
			id: first.id,
			data,
			overrideAccess: true,
			req,
		});
	}
	for (const e of extra) {
		await req.payload.delete({ collection: COLLECTION, id: e.id, overrideAccess: true, req });
	}
	return { id: first?.id ?? "new", kind: "draft", settings, by: data.by, at: data.at, note: null };
}

/** Drops the brand's draft, if any. */
export async function discardDraft(req: PayloadRequest, brand: Site): Promise<void> {
	await req.payload.delete({
		collection: COLLECTION,
		where: { and: [{ brand: { equals: brand } }, { kind: { equals: "draft" } }] },
		overrideAccess: true,
		req,
	});
}

const Stamp = z.object({ updatedBy: z.string().nullish(), updatedAt: z.string().nullish() });

/**
 * Records what just went live for one brand (the global's after-change hook). The first time, the
 * settings it replaced are recorded too (as `baseline`, with their own stamps), so the very first
 * change can be reverted.
 */
export async function recordPublished(
	req: PayloadRequest,
	brand: Site,
	previousDoc: unknown,
	doc: unknown,
): Promise<void> {
	const now = studioSettingsOf(doc, brand);
	if (now === null) return;
	const known = await rows(req, brand, "published", 1, false);
	if (known.length === 0) {
		const before = studioSettingsOf(previousDoc, brand);
		const prev = z.record(z.unknown()).catch({}).parse(previousDoc);
		const stamp = Stamp.catch({}).parse(prev[brand]);
		if (before !== null) {
			await req.payload.create({
				collection: COLLECTION,
				data: {
					brand,
					kind: "published",
					settings: before,
					by: stamp.updatedBy ?? null,
					at: stamp.updatedAt ?? new Date(Date.now() - 1000).toISOString(),
					note: "baseline",
				},
				overrideAccess: true,
				req,
			});
		}
	}
	const note = z
		.enum(["studio", "revert", "form", "baseline"])
		.catch("form")
		.parse(req.context[STUDIO_NOTE]);
	await req.payload.create({
		collection: COLLECTION,
		data: {
			brand,
			kind: "published",
			settings: now,
			...whoOf(req),
			at: new Date().toISOString(),
			note,
		},
		overrideAccess: true,
		req,
	});
}
