import { type Env, readDemoKnowledge } from "../env/flags";
import { DEMO_BLOG_EN } from "./blog-en";
import { DEMO_BLOG_RO } from "./blog-ro";
import type { DemoEntry } from "./entry";
import { DEMO_EQSYNC_EN } from "./eqsync-en";
import { DEMO_EQSYNC_RO } from "./eqsync-ro";
import { DEMO_HEMISYNC_EN } from "./hemisync-en";
import { DEMO_HEMISYNC_RO } from "./hemisync-ro";
import { DEMO_PSIZONE_EN } from "./psizone-en";
import { DEMO_PSIZONE_RO } from "./psizone-ro";

/**
 * The demo knowledge base: fictional FAQ-style passages for every brand, ro and en, for local
 * development only. Every entry is marked (`demo-` id, "[DEMO]" title, `/demo/…` URL, a notice in
 * its body, `demo: true`). Each brand and locale has 15 retrievable entries (2 of them clinical,
 * stamped by the demo reviewer) and one unreviewed clinical entry the ingest must skip.
 */
export const DEMO: ReadonlyArray<DemoEntry> = [
	...DEMO_PSIZONE_RO,
	...DEMO_PSIZONE_EN,
	...DEMO_EQSYNC_RO,
	...DEMO_EQSYNC_EN,
	...DEMO_HEMISYNC_RO,
	...DEMO_HEMISYNC_EN,
	...DEMO_BLOG_RO,
	...DEMO_BLOG_EN,
];

/**
 * The demo entries when `PSI_DEMO_KNOWLEDGE=true`, else none. Throws in production
 * (`NODE_ENV` or `SITE_ENV` = `production`) when the flag is on.
 */
export function demoEntries(env: Env): ReadonlyArray<DemoEntry> {
	return readDemoKnowledge(env) ? DEMO : [];
}
