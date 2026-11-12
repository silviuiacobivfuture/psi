import type { Endpoint } from "payload";
import { z } from "zod";
import { can, subjectOf } from "../authz/access";
import { BRANDS } from "../authz/types";
import { freshlyApproved } from "./decide";
import { keepingLocale } from "./locale-safe";
import { flattenLocale, LOCALES, type ReviewSpec, reviewOf } from "./spec";

/**
 * GET /api/review/:collection/:id/status — what the review panel shows: the stage, each locale's
 * review, the editorial log of this document, and which actions THIS person may take (so an
 * author never sees approve buttons). It needs `read` on the brand; it decides nothing.
 */
const Doc = z
	.object({
		brand: z.enum(BRANDS),
		authorUser: z.unknown(),
		workflow: z
			.object({ stage: z.string().nullish(), submittedBy: z.unknown() })
			.passthrough()
			.nullish(),
	})
	.passthrough();
const Review = z
	.object({
		state: z.string().nullish(),
		reviewerName: z.string().nullish(),
		approvedAt: z.string().nullish(),
		notes: z.string().nullish(),
	})
	.passthrough();
const Trail = z.object({
	docs: z.array(
		z
			.object({
				action: z.string(),
				locale: z.string().nullish(),
				notes: z.string().nullish(),
				createdAt: z.string(),
				actor: z.object({ name: z.string().nullish(), email: z.string() }).nullish(),
			})
			.passthrough(),
	),
});

const idOf = (v: unknown): string | null => {
	if (typeof v === "number" || typeof v === "string") return String(v);
	const r = z.object({ id: z.union([z.number(), z.string()]) }).safeParse(v);
	return r.success ? String(r.data.id) : null;
};

export function statusEndpoint(specs: ReadonlyArray<ReviewSpec>): Endpoint {
	return {
		path: "/review/:collection/:id/status",
		method: "get",
		async handler(req) {
			const p = z
				.object({ collection: z.string(), id: z.string().min(1) })
				.safeParse(req.routeParams);
			const spec = p.success ? specs.find((s) => s.slug === p.data.collection) : undefined;
			const subject = subjectOf(req.user);
			if (!p.success || spec === undefined) return Response.json({}, { status: 404 });
			if (subject === null) return Response.json({}, { status: 401 });
			const all = z.record(z.unknown()).parse(
				await keepingLocale(req, () =>
					req.payload.findByID({
						collection: spec.slug,
						id: p.data.id,
						locale: "all",
						draft: true,
						depth: 0,
						overrideAccess: true,
						req,
					}),
				),
			);
			const doc = Doc.parse(all);
			if (!(await can(req, "read", doc.brand))) return Response.json({}, { status: 403 });
			const clinical = spec.clinical(all);
			const stage = doc.workflow?.stage ?? "draft";
			const ownText =
				idOf(doc.authorUser) === subject.userId ||
				idOf(doc.workflow?.submittedBy) === subject.userId;
			const locales = Object.fromEntries(
				LOCALES.map((l) => {
					const flat = z.record(z.unknown()).parse(flattenLocale(all, l));
					const r = Review.safeParse(reviewOf(flat) ?? {});
					return [
						l,
						{
							exists: typeof flat[spec.titleField] === "string",
							state: r.success ? (r.data.state ?? "pending") : "pending",
							fresh: freshlyApproved(spec, flat),
							reviewerName: r.success ? (r.data.reviewerName ?? null) : null,
							approvedAt: r.success ? (r.data.approvedAt ?? null) : null,
							notes: r.success ? (r.data.notes ?? null) : null,
						},
					];
				}),
			);
			const trail = Trail.parse(
				await req.payload.find({
					collection: "review-events",
					where: {
						and: [{ collectionSlug: { equals: spec.slug } }, { documentId: { equals: p.data.id } }],
					},
					sort: "-createdAt",
					limit: 30,
					depth: 1,
					overrideAccess: true,
					req,
				}),
			).docs.map((t) => ({
				action: t.action,
				locale: t.locale ?? null,
				notes: t.notes ?? null,
				at: t.createdAt,
				by: t.actor?.name ?? t.actor?.email ?? null,
			}));
			return Response.json({
				stage,
				clinical,
				locales,
				can: {
					submit:
						(stage === "draft" || stage === "changes_requested") &&
						(await can(req, "write", doc.brand)),
					decide:
						stage === "in_review" &&
						!ownText &&
						(await can(req, clinical ? "clinical_review" : "publish", doc.brand)),
					publish: stage === "approved" && (await can(req, "publish", doc.brand)),
				},
				trail,
			});
		},
	};
}
