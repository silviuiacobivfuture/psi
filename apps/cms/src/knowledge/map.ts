import type { KnowledgeEntryInput } from "@psi/knowledge";
import { z } from "zod";
import { BRANDS } from "../authz/types";
import { flattenLocale, LOCALES, type Locale } from "../review/spec";
import { knowledgeReviewRequired } from "./rule";

/**
 * A published KnowledgeEntries document (fetched with `locale: "all"`) becomes one
 * @psi/knowledge entry per locale that exists and is approved (or needs no approval, by the
 * same rule the review gate applies). Locales that are missing or
 * not approved are returned as ids to remove, so the guide never keeps a stale answer.
 */

const Flat = z.object({
	id: z.union([z.string(), z.number()]),
	brand: z.enum(BRANDS),
	kind: z.enum(["clinical", "programme", "operational", "editorial"]),
	audience: z.string().nullish(),
	hub: z.string().nullish(),
	method: z.string().nullish(),
	_status: z.enum(["draft", "published"]).nullish(),
	question: z.string().nullish(),
	answer: z.string().nullish(),
	citePath: z.string().nullish(),
	review: z
		.object({
			state: z.string().nullish(),
			reviewerName: z.string().nullish(),
			approvedAt: z.string().nullish(),
		})
		.nullish(),
});

/** The knowledge id of one locale of one CMS entry. */
export function knowledgeId(docId: string | number, locale: Locale): string {
	return `cms.ke.${String(docId).toLowerCase()}.${locale}`;
}

export interface KnowledgePlan {
	ingest: KnowledgeEntryInput[];
	remove: string[];
}

const blankToUndefined = (v: string | null | undefined): string | undefined =>
	v === null || v === undefined || v.trim() === "" ? undefined : v.trim();

export function planKnowledge(all: Record<string, unknown>): KnowledgePlan {
	const plan: KnowledgePlan = { ingest: [], remove: [] };
	for (const locale of LOCALES) {
		const flat = z.record(z.unknown()).parse(flattenLocale(all, locale));
		const d = Flat.parse(flat);
		const id = knowledgeId(d.id, locale);
		const question = blankToUndefined(d.question);
		const answer = blankToUndefined(d.answer);
		const citePath = blankToUndefined(d.citePath);
		const approved = d.review?.state === "approved";
		const allowed = approved || !knowledgeReviewRequired(flat);
		if (
			d._status !== "published" ||
			!allowed ||
			question === undefined ||
			answer === undefined ||
			citePath === undefined
		) {
			plan.remove.push(id);
			continue;
		}
		plan.ingest.push({
			id,
			brand: d.brand,
			locale,
			kind: d.kind,
			title: question,
			url: citePath,
			body: answer,
			audience: blankToUndefined(d.audience),
			hub: blankToUndefined(d.hub),
			method: blankToUndefined(d.method),
			status: "published",
			reviewedBy: approved ? (d.review?.reviewerName ?? null) : null,
			reviewedAt: approved ? (d.review?.approvedAt ?? null) : null,
		});
	}
	return plan;
}

/** Every knowledge id a CMS entry can own (used on delete and unpublish). */
export function allKnowledgeIds(docId: string | number): string[] {
	return LOCALES.map((l) => knowledgeId(docId, l));
}
