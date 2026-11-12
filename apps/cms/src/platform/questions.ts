import type { PayloadRequest } from "payload";
import { z } from "zod";
import { BRANDS, type Brand } from "../authz/types";

/**
 * The guide's questions per brand from the reading counters (`analytics-daily`, metrics
 * `guide_asked` and `guide_unanswered`), which every site sends to /api/analytics/ingest: stored,
 * so they survive a site's restart. Read with the person's own access (brands they may read).
 */
export interface Questions {
	asked: number;
	unanswered: number;
}

const Rows = z.object({
	docs: z.array(
		z.object({ brand: z.string(), metric: z.string(), count: z.number() }).passthrough(),
	),
});
const BrandValue = z.enum(BRANDS);

export async function questionsSince(
	req: PayloadRequest,
	since: string,
): Promise<Partial<Record<Brand, Questions>>> {
	const page = Rows.parse(
		await req.payload.find({
			collection: "analytics-daily",
			where: {
				and: [
					{ day: { greater_than_equal: since } },
					{ metric: { in: ["guide_asked", "guide_unanswered"] } },
				],
			},
			pagination: false,
			depth: 0,
			overrideAccess: false,
			user: req.user,
			req,
		}),
	);
	const out: Partial<Record<Brand, Questions>> = {};
	for (const d of page.docs) {
		const b = BrandValue.safeParse(d.brand);
		if (!b.success) continue;
		const q = out[b.data] ?? { asked: 0, unanswered: 0 };
		if (d.metric === "guide_asked") q.asked += d.count;
		else q.unanswered += d.count;
		out[b.data] = q;
	}
	return out;
}

/** Today, as the counters name days (UTC). */
export function today(now: number = Date.now()): string {
	return new Date(now).toISOString().slice(0, 10);
}
