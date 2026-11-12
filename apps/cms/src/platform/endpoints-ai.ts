import { TestQuestion } from "@psi/cms-client";
import type { Endpoint, PayloadRequest } from "payload";
import { z } from "zod";
import type { Brand } from "../authz/types";
import { planKnowledge } from "../knowledge/map";
import { keepingLocale } from "../review/locale-safe";
import { allow, back, bodyOf, log } from "./http";
import { SECTIONS } from "./sections";
import { controlFor } from "./services";

/**
 * POST /api/platform/ai/ingest — rebuild one brand's knowledge index: the brand's PUBLISHED
 * knowledge entries, planned by the same rule the publish hook uses (approved locales only), plus
 * the repository's seed when asked, handed to the site's engine (`ingestKnowledge` workflow).
 * POST /api/platform/ai/ask — a test question, streamed back as NDJSON. Both need `ai_operator`.
 */
const VIEW = "/admin/platform/ai";
const Docs = z.object({ docs: z.array(z.record(z.unknown())) });

async function publishedEntries(
	req: PayloadRequest,
	brand: Brand,
): Promise<{ entries: Record<string, unknown>[]; remove: string[] }> {
	const page = Docs.parse(
		await keepingLocale(req, () =>
			req.payload.find({
				collection: "knowledge-entries",
				where: { brand: { equals: brand } },
				locale: "all",
				draft: false,
				depth: 0,
				pagination: false,
				overrideAccess: true,
				req,
			}),
		),
	);
	// Every entry of the brand, published or not: the plan names what to index and what to drop
	// (a withdrawn locale, an unpublished entry), by the same rule the publish hook applies.
	const plans = page.docs.map((d) => planKnowledge(d));
	return {
		entries: plans.flatMap((p) => p.ingest.map((e) => z.record(z.unknown()).parse(e))),
		remove: plans.flatMap((p) => p.remove),
	};
}

const ingest: Endpoint = {
	path: "/platform/ai/ingest",
	method: "post",
	handler: async (req) => {
		const body = await bodyOf(req);
		const a = await allow(req, SECTIONS.ai.act, body.brand);
		if (a instanceof Response) return a;
		const control = controlFor(a.brand);
		if (control === null) return back(VIEW, a.brand, { error: "notConfigured" });
		const r = await control.ingest(
			{ ...(await publishedEntries(req, a.brand)), includeSeed: body.includeSeed === "on" },
			a.actor,
		);
		if (!r.ok)
			return back(VIEW, a.brand, {
				error: r.problem === "not_configured" ? "notConfigured" : "unreachable",
			});
		if (!r.data.ok) return back(VIEW, a.brand, { error: "actionFailed" });
		await log(
			req,
			a,
			"ingest",
			r.data.runId,
			`${r.data.indexed} entries, ${r.data.removed} removed, ${r.data.chunks} chunks, ${r.data.embedder}`,
		);
		return back(VIEW, a.brand, { done: "rebuildDone" });
	},
};

const ask: Endpoint = {
	path: "/platform/ai/ask",
	method: "post",
	handler: async (req) => {
		const body = await bodyOf(req);
		const a = await allow(req, SECTIONS.ai.act, body.brand);
		if (a instanceof Response) return a;
		const q = TestQuestion.safeParse({ question: body.question, locale: body.locale });
		if (!q.success) return Response.json({ error: "invalid" }, { status: 400 });
		const control = controlFor(a.brand);
		if (control === null) return Response.json({ error: "not_configured" }, { status: 501 });
		const r = await control.ask(q.data, a.actor);
		if (!r.ok) return Response.json({ error: r.problem }, { status: 502 });
		const encoder = new TextEncoder();
		const lines = r.data;
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				for await (const line of lines)
					controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
				controller.close();
			},
		});
		return new Response(stream, {
			headers: {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-store",
			},
		});
	},
};

export const aiEndpoints: Endpoint[] = [ingest, ask];
