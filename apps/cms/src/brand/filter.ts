import type { BaseFilter, PayloadRequest, Where } from "payload";
import { z } from "zod";
import { BRANDS, type Brand } from "../authz/types";

/** The admin's brand filter: a cookie the brand switcher sets; unset means every brand. */
export const BRAND_COOKIE = "psi-cms-brand";
const BrandValue = z.enum(BRANDS);

/** The brand the editor narrowed the admin to, if any, from the request's Cookie header. */
export function chosenBrand(cookieHeader: string | null): Brand | null {
	const raw = (cookieHeader ?? "")
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith(`${BRAND_COOKIE}=`))
		?.slice(BRAND_COOKIE.length + 1);
	const parsed = BrandValue.safeParse(raw);
	return parsed.success ? parsed.data : null;
}

/**
 * Lists narrowed to the chosen brand. A convenience only: what a person may see at all is the
 * access rule (`readByBrand`), never this filter. A collection without that brand (articles have
 * no `blog`) shows nothing for it, rather than asking the database for a value it cannot hold.
 */
export function brandWhere(
	brands: ReadonlyArray<string>,
	cookieHeader: string | null,
): Where | null {
	const brand = chosenBrand(cookieHeader);
	if (brand === null) return null;
	return brands.includes(brand) ? { brand: { equals: brand } } : { id: { exists: false } };
}

export function brandListFilter(brands: ReadonlyArray<string> = BRANDS): BaseFilter {
	return ({ req }: { req: PayloadRequest }) => brandWhere(brands, req.headers.get("cookie"));
}
