import { z } from "zod";
import manifest from "../../authz.manifest.json";
import { RELATIONS, type Relation } from "./types";

/**
 * The roles cms declares to Polaris (authz.manifest.json), read as data: each role's key and the
 * `cms_brand#<relation>` grants it carries. The interim adapter evaluates exactly these, so it
 * cannot grant anything Polaris would not.
 */
const Grant = z
	.string()
	.regex(/^cms_brand#[a-z_]+$/)
	.transform((g) => g.slice("cms_brand#".length))
	.pipe(z.enum(RELATIONS));

const Manifest = z.object({
	module: z.literal("cms"),
	roles: z.array(z.object({ key: z.string().regex(/^cms:[a-z_]+$/), grants: z.array(Grant) })),
});

export const ROLES: ReadonlyMap<string, ReadonlySet<Relation>> = new Map(
	Manifest.parse(manifest).roles.map((r) => [r.key, new Set(r.grants)]),
);
