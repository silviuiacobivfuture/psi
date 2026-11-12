import type { PayloadRequest } from "payload";
import { z } from "zod";
import { brandsFor, subjectOf } from "../authz/access";
import { BRANDS, type Brand, type Relation } from "../authz/types";
import { chosenBrand } from "../brand/filter";

/**
 * Who may see or do what in the control plane: always the estate's answer for this request
 * (`brandsFor`), per brand, per section. Custom views render for anyone, so every view and every
 * action asks again; nothing here trusts the brand filter, which is a preference only.
 */
export interface Scope {
	/** The brands on which the person holds the section's relation. */
	brands: Brand[];
	/** The brand the page shows: asked for (?brand=), else the filter, else the first allowed. */
	brand: Brand | null;
}

const BrandValue = z.enum(BRANDS);

export async function scopeFor(
	req: PayloadRequest,
	relation: Relation,
	asked: unknown,
): Promise<Scope> {
	const brands = await brandsFor(req, relation);
	return { brands, brand: pickBrand(brands, asked, chosenBrand(req.headers.get("cookie"))) };
}

/** The brand to show: the one asked for, else the filter's, if allowed; else the first allowed. */
export function pickBrand(
	brands: ReadonlyArray<Brand>,
	asked: unknown,
	filter: Brand | null,
): Brand | null {
	const wanted = BrandValue.safeParse(Array.isArray(asked) ? asked[0] : asked);
	const pick = [wanted.success ? wanted.data : null, filter].find(
		(b): b is Brand => b !== null && brands.includes(b),
	);
	return pick ?? brands[0] ?? null;
}

/** The acting staff member as other services log them: the CMS user id, never an e-mail. */
export function actorOf(req: PayloadRequest): string | null {
	return subjectOf(req.user)?.userId ?? null;
}

/** The person's directory subject (their estate account), for "send a test push to me". */
export function directorySubject(req: PayloadRequest): string | null {
	return subjectOf(req.user)?.sub ?? null;
}
