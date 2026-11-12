import { addDataAndFileToRequest, type Endpoint, type PayloadRequest } from "payload";
import { z } from "zod";
import { can, subjectOf } from "../authz/access";
import { BRANDS, type Brand } from "../authz/types";
import { type Problem, say } from "../labels";
import { allApproved } from "./decide";
import { REVIEW_ACTION } from "./gate";
import { contentHash } from "./hash";
import { keepingLocale } from "./locale-safe";
import { flattenLocale, LOCALES, LocaleValue, type ReviewSpec, reviewedContent } from "./spec";
import { appendTrail } from "./trail";

/**
 * The editorial workflow's only doors (ported from the stopped CMS slice; submit is new):
 *
 *   POST /api/review/:collection/:id/submit                  draft → in review   (`write`)
 *   POST /api/review/:collection/:id/:locale/approve {notes}  one locale approved
 *   POST /api/review/:collection/:id/:locale/reject  {notes}  changes requested (notes required)
 *
 * Approval needs `clinical_review` on the brand for a clinical text, `publish` otherwise, and the
 * reviewer is never the author. It stores who, when and the sha256 of exactly the content
 * approved; a clinical approval also signs the article with the reviewer's People profile. When
 * every locale is approved the text is `approved` and a publisher may publish it. Every decision
 * is appended to the editorial log.
 */

const Doc = z
	.object({
		id: z.union([z.string(), z.number()]),
		brand: z.enum(BRANDS),
		authorUser: z.union([z.number(), z.string(), z.object({ id: z.unknown() })]).nullish(),
		workflow: z.object({ stage: z.string().nullish() }).passthrough().nullish(),
	})
	.passthrough();
const Body = z.object({ notes: z.string().trim().max(4000).optional() });
const Name = z.object({ name: z.string().nullish(), email: z.string().nullish() });
const Person = z.object({ docs: z.array(z.object({ id: z.union([z.number(), z.string()]) })) });

function refuse(status: number, problem: Problem, language: string): Response {
	return Response.json({ error: say(problem, language) }, { status });
}

function titleOf(spec: ReviewSpec, doc: Record<string, unknown>): string | null {
	const t = doc[spec.titleField];
	return typeof t === "string" ? t : null;
}

function idOf(v: z.infer<typeof Doc>["authorUser"]): string | null {
	if (v === null || v === undefined) return null;
	return typeof v === "object" ? String(v.id) : String(v);
}

async function load(
	req: PayloadRequest,
	spec: ReviewSpec,
	id: string,
	locale: "ro" | "en" | "all",
) {
	return keepingLocale(req, () =>
		req.payload.findByID({
			collection: spec.slug,
			id,
			locale,
			fallbackLocale: false,
			draft: true,
			depth: 0,
			overrideAccess: true,
			req,
		}),
	);
}

/** The People profile linked to this CMS account: what the blog prints as the reviewer. */
async function profileOf(req: PayloadRequest, userId: string): Promise<string | number | null> {
	const found = Person.parse(
		await req.payload.find({
			collection: "people",
			where: { user: { equals: userId } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
			req,
		}),
	);
	return found.docs[0]?.id ?? null;
}

function submitEndpoint(specs: ReadonlyArray<ReviewSpec>): Endpoint {
	return {
		path: "/review/:collection/:id/submit",
		method: "post",
		async handler(req) {
			const lang = req.i18n.language;
			const p = z
				.object({ collection: z.string(), id: z.string().min(1) })
				.safeParse(req.routeParams);
			const spec = p.success ? specs.find((s) => s.slug === p.data.collection) : undefined;
			if (!p.success || spec === undefined) return refuse(404, "notReviewed", lang);
			const subject = subjectOf(req.user);
			if (subject === null) return refuse(401, "signIn", lang);
			const doc = Doc.parse(await load(req, spec, p.data.id, "ro"));
			if (!(await can(req, "write", doc.brand))) return refuse(403, "noWrite", lang);
			const stage = doc.workflow?.stage ?? "draft";
			if (stage !== "draft" && stage !== "changes_requested") {
				return refuse(409, "notSubmittable", lang);
			}
			await req.payload.update({
				collection: spec.slug,
				id: p.data.id,
				locale: "ro",
				draft: true,
				data: {
					workflow: {
						stage: "in_review",
						submittedAt: new Date().toISOString(),
						submittedBy: Number(subject.userId),
					},
				},
				overrideAccess: true,
				context: { [REVIEW_ACTION]: true },
				req,
			});
			await appendTrail(req, {
				collectionSlug: spec.slug,
				documentId: p.data.id,
				brand: doc.brand,
				locale: null,
				action: "submit",
				actor: subject.userId,
				title: titleOf(spec, doc),
			});
			return Response.json({ stage: "in_review" });
		},
	};
}

function decideEndpoint(specs: ReadonlyArray<ReviewSpec>): Endpoint {
	const Params = z.object({
		collection: z.string(),
		id: z.string().min(1),
		locale: LocaleValue,
		action: z.enum(["approve", "reject"]),
	});
	return {
		path: "/review/:collection/:id/:locale/:action",
		method: "post",
		async handler(req) {
			const lang = req.i18n.language;
			const p = Params.safeParse(req.routeParams);
			if (!p.success) return refuse(404, "unknownRoute", lang);
			const spec = specs.find((s) => s.slug === p.data.collection);
			if (spec === undefined) return refuse(404, "notReviewed", lang);
			const subject = subjectOf(req.user);
			if (subject === null) return refuse(401, "signIn", lang);
			await addDataAndFileToRequest(req);
			const body = Body.safeParse(req.data ?? {});
			if (!body.success) return refuse(400, "notesText", lang);
			const notes = body.data.notes ?? "";
			if (p.data.action === "reject" && notes === "") return refuse(400, "rejectNeedsNotes", lang);

			const raw = z.record(z.unknown()).parse(await load(req, spec, p.data.id, p.data.locale));
			const doc = Doc.parse(raw);
			const clinical = spec.clinical(raw);
			const brand: Brand = doc.brand;
			if (!(await can(req, clinical ? "clinical_review" : "publish", brand))) {
				return refuse(403, clinical ? "noClinicalReview" : "noEditorialReview", lang);
			}
			const submitter = z
				.object({ submittedBy: z.union([z.number(), z.string()]).nullish() })
				.passthrough()
				.nullish()
				.parse(doc.workflow)?.submittedBy;
			if (
				idOf(doc.authorUser) === subject.userId ||
				(submitter !== null && submitter !== undefined && String(submitter) === subject.userId)
			) {
				return refuse(403, "authorCannotReview", lang);
			}
			if (doc.workflow?.stage !== "in_review") return refuse(409, "notInReview", lang);
			const signs = clinical && spec.signsReviewer;
			const person = signs ? await profileOf(req, subject.userId) : null;
			if (signs && p.data.action === "approve" && person === null) {
				return refuse(409, "reviewerProfile", lang);
			}

			const hash = contentHash(reviewedContent(spec, raw));
			const now = new Date().toISOString();
			const who = Name.parse(req.user ?? {});
			const approve = p.data.action === "approve";
			const review = {
				state: approve ? ("approved" as const) : ("changes_requested" as const),
				reviewerUser: Number(subject.userId),
				reviewerName: who.name ?? who.email ?? subject.userId,
				approvedAt: approve ? now : null,
				approvedHash: approve ? hash : null,
				notes: notes === "" ? null : notes,
			};
			// Would every required locale be approved after this decision?
			const all = z.record(z.unknown()).parse(await load(req, spec, p.data.id, "all"));
			const after = LOCALES.map((l) => ({
				locale: l,
				doc:
					l === p.data.locale
						? { ...raw, review }
						: z.record(z.unknown()).parse(flattenLocale(all, l)),
			}));
			const stage = !approve
				? "changes_requested"
				: allApproved(spec, after)
					? "approved"
					: "in_review";
			await req.payload.update({
				collection: spec.slug,
				id: p.data.id,
				locale: p.data.locale,
				draft: true,
				data: {
					review,
					workflow: { ...doc.workflow, stage },
					...(signs && approve ? { reviewer: person, reviewedAt: now } : {}),
				},
				overrideAccess: true,
				context: { [REVIEW_ACTION]: true },
				req,
			});
			await appendTrail(req, {
				collectionSlug: spec.slug,
				documentId: p.data.id,
				brand,
				locale: p.data.locale,
				action: p.data.action,
				actor: subject.userId,
				contentHash: hash,
				notes: notes === "" ? null : notes,
				title: titleOf(spec, doc),
			});
			return Response.json({ state: review.state, stage, locale: p.data.locale, hash });
		},
	};
}

export function reviewEndpoints(specs: ReadonlyArray<ReviewSpec>): Endpoint[] {
	return [submitEndpoint(specs), decideEndpoint(specs)];
}
