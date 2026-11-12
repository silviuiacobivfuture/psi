/**
 * Brings the repository's articles (@psi/content) into the CMS as drafts. Local API, run from
 * apps/cms:
 *
 *     pnpm import:articles              # = payload run src/scripts/import-repo-articles.ts
 *     pnpm import:articles --dry-run    # prints what it would create / update / skip, writes nothing
 *
 * - An article the CMS does not have is created as a draft.
 * - One it has, that nobody touched since the import (still a draft, no review events, no review
 *   state, not written in the admin, not edited since), is refreshed when the repository changed.
 * - Anything a person touched is left alone, and said so.
 *
 * Writes no review, approval or publication: the imported drafts go through the workflow.
 */
import config from "@payload-config";
import { getPayload } from "payload";
import { importRepoArticles } from "../import/run-import";

const words = process.argv.slice(2);
if (words.some((w) => w !== "dry-run")) {
	console.error(
		`import: unknown argument ${words.join(" ")} (only dry-run; use pnpm import:articles --dry-run)`,
	);
	process.exit(2);
}
const payload = await getPayload({ config });
const counts = await importRepoArticles(payload, { dryRun: words.includes("dry-run") });
process.exit(counts.failed > 0 ? 1 : 0);
