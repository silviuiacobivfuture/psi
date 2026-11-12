import type { Site } from "@psi/cms-client";
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from "payload";
import { z } from "zod";
import { subjectOf } from "../authz/access";
import { DRAFT_SAVE, isLive, WAS_LIVE } from "../review/live";
import { appendTrail } from "../review/trail";
import { notifySites } from "./send";

const Doc = z
	.object({
		id: z.union([z.number(), z.string()]),
		slug: z.string().nullish(),
		brand: z.string().nullish(),
		title: z.string().nullish(),
		_status: z.enum(["draft", "published"]).nullish(),
	})
	.passthrough();

/**
 * After a save of an article or an offering: a publication, a change to the published text or a
 * withdrawal is written to the editorial log and announced to the sites. Draft saves (autosave
 * included) leave the published text as it was, so they announce nothing; staging picks drafts up
 * on its refresh.
 */
export function announceChange(kind: "articles" | "offerings"): CollectionAfterChangeHook {
	return async ({ doc, req }) => {
		const d = Doc.parse(doc);
		// The gate recorded, for this save, whether the live row was published and whether the save
		// was a draft (which leaves the live row as it was).
		if (req.context[DRAFT_SAVE] === true) return doc;
		const wasLive = req.context[WAS_LIVE] === true;
		const live = await isLive(req, kind, d.id);
		const event = live
			? wasLive
				? ("update" as const)
				: ("publish" as const)
			: wasLive
				? ("unpublish" as const)
				: null;
		if (event === null) return doc;
		if (event !== "update") {
			await appendTrail(req, {
				collectionSlug: kind,
				documentId: String(d.id),
				brand: d.brand ?? null,
				locale: null,
				action: event,
				actor: subjectOf(req.user)?.userId ?? null,
				title: d.title ?? null,
			});
		}
		await notifySites(req, {
			kind,
			event,
			id: String(d.id),
			slug: d.slug ?? null,
			brand: d.brand ?? null,
			sentAt: new Date().toISOString(),
		});
		return doc;
	};
}

export const announceArticle: CollectionAfterChangeHook = announceChange("articles");

export function announceDeletion(kind: "articles" | "offerings"): CollectionAfterDeleteHook {
	return async ({ doc, req }) => {
		const d = Doc.parse(doc);
		await appendTrail(req, {
			collectionSlug: kind,
			documentId: String(d.id),
			brand: d.brand ?? null,
			locale: null,
			action: "delete",
			actor: subjectOf(req.user)?.userId ?? null,
			title: d.title ?? null,
		});
		await notifySites(req, {
			kind,
			event: "delete",
			id: String(d.id),
			slug: d.slug ?? null,
			brand: d.brand ?? null,
			sentAt: new Date().toISOString(),
		});
	};
}

export const announceDeleted: CollectionAfterDeleteHook = announceDeletion("articles");

export async function announceAiSettings(req: PayloadRequest, sites: Site[]): Promise<void> {
	await notifySites(req, { kind: "ai-settings", sites, sentAt: new Date().toISOString() });
}

/** The site settings of these brands changed: their sites re-read them at once. */
export async function announceSiteSettings(req: PayloadRequest, sites: Site[]): Promise<void> {
	await notifySites(req, { kind: "site-settings", sites, sentAt: new Date().toISOString() });
}
