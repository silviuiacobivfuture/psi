/**
 * Imports the repository's articles into the CMS as drafts, once: an article whose slug the CMS
 * already has is left alone (re-running changes nothing). Local API, run from apps/cms:
 *
 *     pnpm import:articles        # = payload run src/scripts/import-repo-articles.ts
 *
 * Writes no review, approval or publication: the imported drafts go through the workflow.
 */
import config from "@payload-config";
import { ARTICLES } from "@psi/content";
import { getPayload } from "payload";
import { createData, englishData, toImport } from "../import/repo-articles";
import { LOCAL_DRAFT } from "../review/live";

const payload = await getPayload({ config });
const context = { [LOCAL_DRAFT]: true };
let created = 0;
let present = 0;
for (const a of toImport(ARTICLES)) {
	const { totalDocs } = await payload.count({
		collection: "articles",
		where: { slug: { equals: a.slug } },
		overrideAccess: true,
	});
	if (totalDocs > 0) {
		present++;
		payload.logger.info(`import: ${a.slug} already in the CMS, left alone`);
		continue;
	}
	const ro = await payload.create({
		collection: "articles",
		locale: "ro",
		draft: true,
		overrideAccess: true,
		context,
		data: createData(a),
	});
	await payload.update({
		collection: "articles",
		id: ro.id,
		locale: "en",
		draft: true,
		overrideAccess: true,
		context,
		data: englishData(a, ro),
	});
	created++;
	payload.logger.info(`import: ${a.slug} → draft ${ro.id}`);
}
payload.logger.info(`import: ${created} created, ${present} already present`);
process.exit(0);
