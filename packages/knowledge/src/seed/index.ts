import type { KnowledgeEntryInput } from "../entry";
import { BLOG_EN, BLOG_RO } from "./blog";
import { EQSYNC_EN, EQSYNC_RO } from "./eqsync";
import { HEMISYNC_EN, HEMISYNC_RO } from "./hemisync";
import { PSIZONE_EN } from "./psizone-en";
import { PSIZONE_RO } from "./psizone-ro";

/**
 * The seed: non-clinical entries for every brand, ro and en. Psizone: operational and editorial;
 * EQ-SYNC and Hemi-Sync: programme and operational; the Blog: editorial.
 */
export const SEED: ReadonlyArray<KnowledgeEntryInput> = [
	...PSIZONE_RO,
	...PSIZONE_EN,
	...EQSYNC_RO,
	...EQSYNC_EN,
	...HEMISYNC_RO,
	...HEMISYNC_EN,
	...BLOG_RO,
	...BLOG_EN,
];
