import type { Brand, Relation } from "../authz/types";
import { knowledgeReviewRequired } from "./rule";

/**
 * THE REVIEW GATE for uploaded sources: a source is indexed only once someone with the AI role
 * (`ai_operator` on its brand, from authz.manifest.json) approved its current content. Where the
 * knowledge rule asks for a clinical review (every Psizone source, any clinical source), the
 * approver must also hold `clinical_review` on that brand. An uploader who holds what approval
 * needs is approved on upload. Nothing here is a role: the estate answers which relations a
 * person holds, per brand.
 */
export function approvalRelations(source: { brand: string; kind: string }): Relation[] {
	return knowledgeReviewRequired(source) ? ["ai_operator", "clinical_review"] : ["ai_operator"];
}

export type ApprovalDecision =
	| { ok: true }
	| { ok: false; status: 401 | 403; error: "sign_in" | "forbidden"; missing: Relation[] };

/** Whether this person (null: signed out) may approve or reject the source, from what they hold on its brand. */
export function decideApproval(
	actor: string | null,
	source: { brand: string; kind: string },
	held: ReadonlySet<Relation>,
): ApprovalDecision {
	const needed = approvalRelations(source);
	if (actor === null) return { ok: false, status: 401, error: "sign_in", missing: needed };
	const missing = needed.filter((r) => !held.has(r));
	return missing.length === 0
		? { ok: true }
		: { ok: false, status: 403, error: "forbidden", missing };
}

/** The approval a save leaves: kept while the content is the approved one, else pending or auto. */
export function approvalAfterSave(args: {
	previous: {
		state?: string | null;
		hash?: string | null;
		by?: string | null;
		byName?: string | null;
		at?: string | null;
	} | null;
	contentHash: string | null;
	scopeChanged: boolean;
	mayApprove: boolean;
	actor: { id: string; name: string } | null;
	now: string;
}): {
	state: "pending" | "approved" | "rejected";
	hash: string | null;
	by: string | null;
	byName: string | null;
	at: string | null;
} {
	const p = args.previous;
	const same = p !== null && p.hash === args.contentHash && !args.scopeChanged;
	if (same && (p.state === "approved" || p.state === "rejected")) {
		return {
			state: p.state,
			hash: p.hash ?? null,
			by: p.by ?? null,
			byName: p.byName ?? null,
			at: p.at ?? null,
		};
	}
	if (args.mayApprove && args.actor !== null && args.contentHash !== null) {
		return {
			state: "approved",
			hash: args.contentHash,
			by: args.actor.id,
			byName: args.actor.name,
			at: args.now,
		};
	}
	return { state: "pending", hash: null, by: null, byName: null, at: null };
}

/** The relations among `wanted` that a person holds on the brand, per the authorizer's `brands`. */
export async function heldOn(
	brandsFor: (relation: Relation) => Promise<ReadonlyArray<Brand>>,
	brand: Brand,
	wanted: ReadonlyArray<Relation>,
): Promise<Set<Relation>> {
	const held = new Set<Relation>();
	for (const r of wanted) if ((await brandsFor(r)).includes(brand)) held.add(r);
	return held;
}
