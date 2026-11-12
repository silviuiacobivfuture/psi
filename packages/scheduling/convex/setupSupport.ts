import type { Mode } from "../src/domain/catalog";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * What the team's setup functions share: the shapes a slug and a name must have, the tenant row a
 * first create brings into being, and the check that every practitioner named is the tenant's.
 */

/** A practitioner of this tenant, by the id the app holds, or undefined. */
export async function practitionerOf(
	ctx: QueryCtx,
	tenant: string,
	practitioner: string,
): Promise<Doc<"practitioners"> | undefined> {
	const id = ctx.db.normalizeId("practitioners", practitioner);
	const row = id === null ? null : await ctx.db.get(id);
	return row === null || row.tenant !== tenant ? undefined : row;
}

/** A tenant, practitioner or service slug: lowercase, digits and hyphens, an immutable key. */
export const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
/** The zone every tenant's rules are written in. */
export const TENANT_ZONE = "Europe/Bucharest";
const NAME_MAX = 80;
const PRACTITIONERS_MAX = 50;

/** A display name with its whitespace collapsed, or undefined when empty or too long. */
export function cleanText(raw: string): string | undefined {
	const text = raw.replace(/\s+/g, " ").trim();
	return text.length === 0 || text.length > NAME_MAX ? undefined : text;
}

/** Both languages of a name, cleaned; undefined unless both are sound. */
export function cleanName(name: {
	ro: string;
	en: string;
}): { ro: string; en: string } | undefined {
	const ro = cleanText(name.ro);
	const en = cleanText(name.en);
	return ro === undefined || en === undefined ? undefined : { ro, en };
}

export function sameModes(a: ReadonlyArray<Mode>, b: ReadonlyArray<Mode>): boolean {
	return a.length === b.length && a.every((m) => b.includes(m));
}

/**
 * The practitioners named (ids as the app holds them), de-duplicated, if every one is an existing
 * practitioner of this tenant; undefined when any is not (nothing is then partially accepted).
 */
export async function tenantPractitioners(
	ctx: QueryCtx,
	tenant: string,
	ids: ReadonlyArray<string>,
): Promise<Id<"practitioners">[] | undefined> {
	const unique = [...new Set(ids)];
	if (unique.length > PRACTITIONERS_MAX) return undefined;
	const found: Id<"practitioners">[] = [];
	for (const id of unique) {
		const row = await practitionerOf(ctx, tenant, id);
		if (row === undefined) return undefined;
		found.push(row._id);
	}
	return found;
}

/**
 * Brings the tenant's row into being (or back to active): a production deployment starts with no
 * tenants, and the first thing the team creates makes it. Only the team's server key reaches this.
 */
export async function ensureTenantRow(ctx: MutationCtx, slug: string): Promise<void> {
	const found = await ctx.db
		.query("tenants")
		.withIndex("by_slug", (q) => q.eq("slug", slug))
		.unique();
	if (found === null) await ctx.db.insert("tenants", { slug, timeZone: TENANT_ZONE, active: true });
	else if (!found.active) await ctx.db.patch(found._id, { active: true });
}
