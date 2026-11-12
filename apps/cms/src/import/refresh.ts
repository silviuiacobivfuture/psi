import { z } from "zod";

/**
 * Whether an article the CMS already has may be refreshed from the repository: only when nobody
 * has touched it since the import wrote it. The facts are read by the script; the decision is
 * here, pure.
 */

/** What the import recorded about the last write it made to a document (payload-kv). */
export const Marker = z.object({
	/** Hash of the repository article that was imported. */
	hash: z.string(),
	/** The document's and its latest version's `updatedAt` right after that write. */
	docAt: z.string(),
	versionAt: z.string().nullable(),
});
export type Marker = z.infer<typeof Marker>;

export interface Existing {
	status: string | null;
	stage: string | null;
	/** The account that created it: set for anything written in the admin, absent for an import. */
	authorUser: unknown;
	/** Per-locale review states, anything but `pending` means a reviewer acted. */
	reviewStates: ReadonlyArray<string | null>;
	reviewEvents: number;
	createdAt: string;
	updatedAt: string;
	/** The latest version's `updatedAt` (edits can sit in a version only). */
	versionAt: string | null;
	marker: Marker | null;
}

export type Decision =
	| { action: "create" }
	| { action: "update" }
	| { action: "skip"; reason: "unchanged" | "edited"; why: string[] };

/** An import written before markers existed: its own writes land within this window of creation. */
export const LEGACY_WINDOW_MS = 120_000;

function millis(iso: string): number {
	return new Date(iso).getTime();
}

/** Why a person's hands are on the document; empty when nobody has touched it since the import. */
export function touched(e: Existing): string[] {
	const why: string[] = [];
	if (e.status !== "draft") why.push(`status ${e.status ?? "none"}`);
	if (e.stage !== null && e.stage !== "draft") why.push(`workflow ${e.stage}`);
	if (e.authorUser !== null && e.authorUser !== undefined) why.push("written in the admin");
	if (e.reviewEvents > 0) why.push(`${e.reviewEvents} review event(s)`);
	if (e.reviewStates.some((s) => s !== null && s !== "pending")) why.push("a locale was reviewed");
	if (e.marker !== null) {
		if (e.marker.docAt !== e.updatedAt || e.marker.versionAt !== e.versionAt) {
			why.push("edited since the import");
		}
	} else {
		const last = [e.updatedAt, e.versionAt].flatMap((t) => (t === null ? [] : [millis(t)]));
		if (Math.max(...last) - millis(e.createdAt) > LEGACY_WINDOW_MS)
			why.push("edited since the import");
	}
	return why;
}

/** create, refresh, or leave alone (and why). */
export function decide(hash: string, existing: Existing | null): Decision {
	if (existing === null) return { action: "create" };
	const why = touched(existing);
	if (why.length > 0) return { action: "skip", reason: "edited", why };
	if (existing.marker?.hash === hash) return { action: "skip", reason: "unchanged", why: [] };
	return { action: "update" };
}
