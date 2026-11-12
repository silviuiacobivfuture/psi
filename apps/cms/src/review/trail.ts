import type { PayloadRequest } from "payload";
import { authorizer } from "../authz/index";

export const TRAIL_ACTIONS = [
	"submit",
	"approve",
	"reject",
	"publish",
	"unpublish",
	"invalidate",
	"delete",
] as const;
export type TrailAction = (typeof TRAIL_ACTIONS)[number];

/** Appends one row to the editorial log (ReviewEvents). Never updated, never deleted. */
export async function appendTrail(
	req: PayloadRequest,
	row: {
		collectionSlug: string;
		documentId: string;
		brand: string | null;
		locale: string | null;
		action: TrailAction;
		actor: string | null;
		contentHash?: string | null;
		notes?: string | null;
		title?: string | null;
	},
): Promise<void> {
	await req.payload.create({
		collection: "review-events",
		data: {
			...row,
			actor: row.actor === null ? null : Number(row.actor),
			authorizer: authorizer().kind,
		},
		overrideAccess: true,
		req,
	});
}
