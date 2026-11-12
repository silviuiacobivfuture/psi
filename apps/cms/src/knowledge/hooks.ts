import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from "payload";
import { z } from "zod";
import { keepingLocale } from "../review/locale-safe";
import { allKnowledgeIds, planKnowledge } from "./map";
import { knowledgeSink } from "./sink";

const Id = z.object({ id: z.union([z.string(), z.number()]) });

/**
 * After a KnowledgeEntries save: re-reads the PUBLISHED document in every locale and hands the
 * approved locales to the guide's store, removing the others. A draft save changes nothing the
 * guide can see. Indexing failures are logged, never block the editor's save.
 */
export const indexKnowledge: CollectionAfterChangeHook = async ({ doc, req }) => {
	const sink = knowledgeSink();
	const { id } = Id.parse(doc);
	if (sink === null) {
		req.payload.logger.info({ id }, "knowledge: PSI_KNOWLEDGE_DB_URL unset, not indexing");
		return doc;
	}
	try {
		const published = await keepingLocale(req, () =>
			req.payload.find({
				collection: "knowledge-entries",
				where: { id: { equals: id } },
				locale: "all",
				draft: false,
				depth: 0,
				limit: 1,
				overrideAccess: true,
				req,
			}),
		);
		const all = published.docs[0];
		if (all === undefined) {
			await sink.remove(allKnowledgeIds(id));
			return doc;
		}
		const plan = planKnowledge(z.record(z.unknown()).parse(all));
		await sink.remove(plan.remove);
		await sink.ingest(plan.ingest);
		req.payload.logger.info(
			{ id, indexed: plan.ingest.map((e) => e.id), removed: plan.remove },
			"knowledge: indexed",
		);
	} catch (err) {
		req.payload.logger.error({ err, id }, "knowledge: indexing failed");
	}
	return doc;
};

export const unindexKnowledge: CollectionAfterDeleteHook = async ({ id, req }) => {
	const sink = knowledgeSink();
	if (sink === null) return;
	try {
		await sink.remove(allKnowledgeIds(id));
	} catch (err) {
		req.payload.logger.error({ err, id }, "knowledge: removal failed");
	}
};
