import type { CollectionSlug, PayloadRequest } from "payload";
import { keepingLocale } from "./locale-safe";

/** Set by the gate for this save: whether the live row was published before it, and its kind. */
export const WAS_LIVE = "psiWasLive";
export const DRAFT_SAVE = "psiDraftSave";
/** Set by a server-side caller (an import) whose Local API `draft: true` writes are draft saves. */
export const LOCAL_DRAFT = "psiLocalDraft";

/** Whether the live (non-draft) row of this document is published right now. */
export async function isLive(
	req: PayloadRequest,
	collection: CollectionSlug,
	id: string | number,
): Promise<boolean> {
	const { totalDocs } = await keepingLocale(req, () =>
		req.payload.count({
			collection,
			where: { and: [{ id: { equals: id } }, { _status: { equals: "published" } }] },
			overrideAccess: true,
			req,
		}),
	);
	return totalDocs > 0;
}

/**
 * A draft save leaves the live row alone. Payload marks it with `_status: "draft"` in the data,
 * which an unpublish also carries, so the request decides: `?draft=true` (the admin's saves and
 * autosaves, REST) or the review endpoints' own writes.
 */
export function isDraftSave(req: PayloadRequest, status: unknown, fromReview: boolean): boolean {
	if (status !== "draft") return false;
	return (
		fromReview || req.context[LOCAL_DRAFT] === true || String(req.query?.draft ?? "") === "true"
	);
}
