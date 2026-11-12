import type { PayloadRequest } from "payload";
import { z } from "zod";
import type { Brand } from "../authz/types";
import { queueSources } from "../views/queue-sources";

const Page = z.object({ docs: z.array(z.object({ brand: z.string() }).passthrough()) });

/** Texts waiting in the review queue, per brand, with the person's own access (never the server's). */
export async function pendingReviews(req: PayloadRequest): Promise<Partial<Record<Brand, number>>> {
	const out: Partial<Record<Brand, number>> = {};
	for (const { slug } of queueSources(req.payload.config.collections)) {
		const page = Page.parse(
			await req.payload.find({
				collection: slug,
				where: {
					and: [
						{ "workflow.stage": { in: ["in_review", "changes_requested", "approved"] } },
						{ _status: { not_equals: "published" } },
					],
				},
				draft: true,
				depth: 0,
				limit: 500,
				select: { brand: true },
				overrideAccess: false,
				user: req.user,
				req,
			}),
		);
		for (const d of page.docs) {
			const b = z.enum(["psizone", "eqsync", "hemisync", "blog"]).safeParse(d.brand);
			if (b.success) out[b.data] = (out[b.data] ?? 0) + 1;
		}
	}
	return out;
}
