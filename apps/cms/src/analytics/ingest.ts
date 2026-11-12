import { timingSafeEqual } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import { CounterBatch } from "@psi/cms-client";
import type { Endpoint } from "payload";
import { env } from "../env";

/**
 * POST /api/analytics/ingest — the blog collector's flush: daily counters, added atomically to
 * `analytics_daily` (one upsert per counter; concurrent pods never lose an increment). Only the
 * collector's key may write (`Authorization: Bearer <ANALYTICS_INGEST_TOKEN>`); the body is the
 * strict counter contract, so nothing but counters can be stored.
 */
type Execute = (query: ReturnType<typeof sql>) => Promise<unknown>;

/** The Postgres adapter's drizzle `execute`, found structurally (no cast). */
function executor(db: object): Execute | null {
	if (!("drizzle" in db)) return null;
	const d = db.drizzle;
	if (typeof d !== "object" || d === null || !("execute" in d)) return null;
	const run = d.execute;
	if (typeof run !== "function") return null;
	return async (q) => {
		const r: unknown = await run.call(d, q);
		return r;
	};
}

function authorized(header: string | null, token: string | undefined): boolean {
	if (token === undefined || header === null || !header.startsWith("Bearer ")) return false;
	const got = Buffer.from(header.slice("Bearer ".length));
	const want = Buffer.from(token);
	return got.length === want.length && timingSafeEqual(got, want);
}

export const analyticsIngest: Endpoint = {
	path: "/analytics/ingest",
	method: "post",
	async handler(req) {
		if (!authorized(req.headers.get("authorization"), env().ANALYTICS_INGEST_TOKEN)) {
			return Response.json({ error: "unauthorized" }, { status: 401 });
		}
		const json: unknown = req.json ? await req.json().catch(() => null) : null;
		const batch = CounterBatch.safeParse(json);
		if (!batch.success) return Response.json({ error: "not a counter batch" }, { status: 400 });
		const run = executor(req.payload.db);
		if (run === null) return Response.json({ error: "no sql store" }, { status: 503 });
		for (const c of batch.data.counters) {
			await run(sql`
				INSERT INTO "analytics_daily" ("day", "brand", "slug", "locale", "topic", "metric", "count")
				VALUES (${c.day}, ${c.brand}, ${c.slug}, ${c.locale}, ${c.topic ?? ""}, ${c.metric}, ${c.count})
				ON CONFLICT ("day", "brand", "slug", "locale", "topic", "metric")
				DO UPDATE SET "count" = "analytics_daily"."count" + EXCLUDED."count"`);
		}
		return Response.json({ stored: batch.data.counters.length });
	},
};
