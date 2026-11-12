import { chunkMarkdown } from "@psi/knowledge";
import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import { brandsFor, can, subjectOf } from "../authz/access";
import { appendTrail } from "../review/trail";
import { runSource, serial, unindexSource } from "./ingest-source";
import { sourceIndex } from "./ingest-store";
import type { SourceDoc } from "./source-doc";
import { approvalRelations, decideApproval, heldOn } from "./source-gate";
import { planSourceEntries } from "./source-plan";
import { brandSettings, INTERNAL, loadSource, payloadPorts, SOURCES } from "./source-ports";
import { testRetrieval } from "./test-retrieval";

/**
 * The detail page's endpoints, under /api/knowledge-sources/:id/…: `panel` (what the page shows,
 * `read` on the brand), `approve` and `reject` (the review gate's relations on the brand),
 * `reindex` and `remove` (`ai_operator`), and `test-retrieval` (`ai_operator`; never a chat
 * model). The brand is always the stored document's, never the request's. JSON in, JSON out.
 */
const PREVIEW_CHARS = 4000;

type Refusal = { status: number; error: string };

async function sourceFor(req: PayloadRequest): Promise<SourceDoc | Refusal> {
	if (subjectOf(req.user) === null) return { status: 401, error: "sign_in" };
	const id = z.union([z.string(), z.number()]).safeParse(req.routeParams?.id);
	if (!id.success) return { status: 400, error: "id" };
	const doc = await loadSource(req.payload, String(id.data));
	if (doc === null) return { status: 404, error: "not_found" };
	// Not readable on its brand: answered as missing, so ids on other brands are not confirmed.
	if (!(await can(req, "read", doc.brand))) return { status: 404, error: "not_found" };
	return doc;
}

const refused = (r: Refusal): Response => Response.json({ error: r.error }, { status: r.status });
const isRefusal = (d: SourceDoc | Refusal): d is Refusal =>
	"status" in d && "error" in d && !("brand" in d);

async function bodyJson(req: PayloadRequest): Promise<Record<string, unknown>> {
	try {
		const text = typeof req.text === "function" ? await req.text() : "";
		return z.record(z.unknown()).parse(text === "" ? {} : JSON.parse(text));
	} catch {
		return {};
	}
}

async function trail(
	req: PayloadRequest,
	doc: SourceDoc,
	action: "approve" | "reject" | "ingest" | "unpublish",
	notes: string,
): Promise<void> {
	const actor = subjectOf(req.user)?.userId ?? null;
	if (actor === null) return;
	await appendTrail(req, {
		collectionSlug: SOURCES,
		documentId: doc.id,
		brand: doc.brand,
		locale: doc.language,
		action,
		actor,
		notes,
	}).catch(() => undefined);
}

async function setFields(
	req: PayloadRequest,
	id: string,
	data: Record<string, unknown>,
): Promise<void> {
	await req.payload.update({
		collection: SOURCES,
		id,
		data,
		depth: 0,
		overrideAccess: true,
		context: { [INTERNAL]: true },
	});
}

const panel: Endpoint = {
	path: "/:id/panel",
	method: "get",
	handler: async (req) => {
		const doc = await sourceFor(req);
		if (isRefusal(doc)) return refused(doc);
		const subject = subjectOf(req.user);
		const needed = approvalRelations(doc);
		const held = await heldOn((r) => brandsFor(req, r), doc.brand, needed);
		const entries = planSourceEntries(doc, "");
		const sections = await Promise.all(
			entries.map(async (e, n) => ({
				title: (doc.sections ?? []).filter((s) => s.text.trim() !== "")[n]?.title ?? "",
				anchor: e.url.split("#")[1] ?? "",
				chunks: (await chunkMarkdown(e.body)).length,
				excerpt: e.body.replace(/^## .*\n\n/, "").slice(0, 160),
			})),
		);
		let preview = "";
		for (const s of doc.sections ?? []) {
			if (preview.length >= PREVIEW_CHARS) break;
			preview += `${s.title === "" ? "" : `## ${s.title}\n\n`}${s.text}\n\n`;
		}
		return Response.json({
			status: doc.status ?? "uploaded",
			error: doc.error ?? null,
			chars: doc.chars ?? 0,
			chunks: doc.chunks ?? 0,
			sectionCount: sections.length,
			indexedAt: doc.indexedAt ?? null,
			embedder: doc.embedder ?? null,
			contentHash: doc.contentHash ?? null,
			approval: {
				state: doc.approval?.state ?? "pending",
				byName: doc.approval?.byName ?? null,
				at: doc.approval?.at ?? null,
				current: doc.approval?.hash === doc.contentHash,
				clinical: needed.includes("clinical_review"),
			},
			can: {
				approve: decideApproval(subject?.userId ?? null, doc, held).ok,
				operate: await can(req, "ai_operator", doc.brand),
			},
			preview: preview.slice(0, PREVIEW_CHARS).trim(),
			sections,
		});
	},
};

function decision(state: "approved" | "rejected"): Endpoint {
	return {
		path: state === "approved" ? "/:id/approve" : "/:id/reject",
		method: "post",
		handler: async (req) => {
			const doc = await sourceFor(req);
			if (isRefusal(doc)) return refused(doc);
			const subject = subjectOf(req.user);
			const held = await heldOn((r) => brandsFor(req, r), doc.brand, approvalRelations(doc));
			const d = decideApproval(subject?.userId ?? null, doc, held);
			if (!d.ok) return Response.json({ error: d.error, missing: d.missing }, { status: d.status });
			if (doc.contentHash === null || doc.contentHash === undefined) {
				return Response.json({ error: "no_content" }, { status: 409 });
			}
			const who = z
				.object({ name: z.string().nullish(), email: z.string().nullish() })
				.parse(req.user ?? {});
			await setFields(req, doc.id, {
				approval: {
					state,
					hash: doc.contentHash,
					by: subject?.userId ?? null,
					byName: who.name ?? who.email ?? null,
					at: new Date().toISOString(),
				},
				...(state === "approved" ? { inIndex: true } : {}),
			});
			await trail(req, doc, state === "approved" ? "approve" : "reject", "knowledge source");
			const out = await serial(doc.id, () => runSource(payloadPorts(req.payload), doc.id));
			return Response.json({ done: state, outcome: out });
		},
	};
}

const operate = async (req: PayloadRequest): Promise<SourceDoc | Refusal> => {
	const doc = await sourceFor(req);
	if (isRefusal(doc)) return doc;
	if (!(await can(req, "ai_operator", doc.brand))) return { status: 403, error: "forbidden" };
	return doc;
};

const reindex: Endpoint = {
	path: "/:id/reindex",
	method: "post",
	handler: async (req) => {
		const doc = await operate(req);
		if (isRefusal(doc)) return refused(doc);
		if (!doc.inIndex) await setFields(req, doc.id, { inIndex: true });
		const out = await serial(doc.id, () =>
			runSource(payloadPorts(req.payload), doc.id, { force: true }),
		);
		await trail(req, doc, "ingest", `knowledge source re-index: ${out.kind}`);
		return Response.json({ done: out.kind === "indexed" ? "reindexed" : out.kind, outcome: out });
	},
};

const removeFromIndex: Endpoint = {
	path: "/:id/remove",
	method: "post",
	handler: async (req) => {
		const doc = await operate(req);
		if (isRefusal(doc)) return refused(doc);
		const out = await serial(doc.id, async () => {
			const index = await sourceIndex(doc.brand, await brandSettings(req.payload, doc.brand));
			const n = await unindexSource(index, doc);
			await setFields(req, doc.id, {
				inIndex: false,
				status: "removed",
				chunks: 0,
				indexedIds: [],
				indexedFingerprint: null,
			});
			return n;
		});
		await trail(req, doc, "unpublish", `knowledge source removed from the index (${out} ids)`);
		return Response.json({ done: "removed" });
	},
};

const retrieval: Endpoint = {
	path: "/:id/test-retrieval",
	method: "post",
	handler: async (req) => {
		const doc = await operate(req);
		if (isRefusal(doc)) return refused(doc);
		const q = z.object({ query: z.string().trim().min(1).max(500) }).safeParse(await bodyJson(req));
		if (!q.success) return Response.json({ error: "query" }, { status: 400 });
		try {
			const result = await testRetrieval({
				brand: doc.brand,
				locale: doc.language,
				query: q.data.query,
				sourceId: doc.id,
				settings: await brandSettings(req.payload, doc.brand),
			});
			return Response.json(result, { headers: { "cache-control": "no-store" } });
		} catch (error) {
			req.payload.logger.error(
				{ err: error, id: doc.id },
				"knowledge source: test retrieval failed",
			);
			return Response.json({ error: "failed" }, { status: 502 });
		}
	},
};

export const sourceEndpoints: Endpoint[] = [
	panel,
	decision("approved"),
	decision("rejected"),
	reindex,
	removeFromIndex,
	retrieval,
];
