import type { PayloadRequest } from "payload";
import { z } from "zod";
import { brandsFor } from "../authz/access";
import { BRANDS, type Brand, type Relation } from "../authz/types";
import { appendTrail, type TrailAction } from "../review/trail";
import { actorOf } from "./access";

/**
 * What every control-plane action shares: the body (a plain HTML form, or JSON from the test
 * question), the relation check on the brand the action names (the estate decides, every time),
 * the append-only log, and the answer: 303 back to the view with `?done=` or `?error=`.
 */
export async function bodyOf(req: PayloadRequest): Promise<Record<string, string>> {
	const type = req.headers.get("content-type") ?? "";
	const text = typeof req.text === "function" ? await req.text() : "";
	if (type.includes("application/json")) {
		const parsed = z.record(z.unknown()).safeParse(safeJson(text));
		if (!parsed.success) return {};
		return Object.fromEntries(
			Object.entries(parsed.data).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
		);
	}
	return Object.fromEntries(new URLSearchParams(text));
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

const BrandValue = z.enum(BRANDS);

export type Allowed = { brand: Brand; actor: string };

/** The action's brand if the person holds `relation` on it; otherwise the refusal to return. */
export async function allow(
	req: PayloadRequest,
	relation: Relation,
	rawBrand: string | undefined,
): Promise<Allowed | Response> {
	const d = decideAction(actorOf(req), await brandsFor(req, relation), rawBrand);
	return "status" in d ? Response.json({ error: d.error }, { status: d.status }) : d;
}

/** The decision itself: signed in, a known brand, and the relation held on that very brand. */
export function decideAction(
	actor: string | null,
	held: ReadonlyArray<Brand>,
	rawBrand: string | undefined,
): Allowed | { status: 400 | 401 | 403; error: string } {
	if (actor === null) return { status: 401, error: "sign in" };
	const brand = BrandValue.safeParse(rawBrand);
	if (!brand.success) return { status: 400, error: "brand" };
	if (!held.includes(brand.data)) return { status: 403, error: "forbidden" };
	return { brand: brand.data, actor };
}

/** 303 back to the view (same origin, an admin path only). */
export function back(
	path: string,
	brand: Brand,
	outcome: { done?: string; error?: string },
	extra = "",
): Response {
	const safe = path.startsWith("/admin/platform") ? path : "/admin/platform";
	const q = new URLSearchParams({ brand });
	if (outcome.done !== undefined) q.set("done", outcome.done);
	if (outcome.error !== undefined) q.set("error", outcome.error);
	return new Response(null, {
		status: 303,
		headers: { location: `${safe}?${q.toString()}${extra}` },
	});
}

/** One row in the editorial log: who (the CMS user), what, on which brand and object; no content. */
export async function log(
	req: PayloadRequest,
	a: Allowed,
	action: TrailAction,
	documentId: string,
	notes: string | null = null,
): Promise<void> {
	await appendTrail(req, {
		collectionSlug: "platform",
		documentId,
		brand: a.brand,
		locale: null,
		action,
		actor: a.actor,
		notes,
	});
}
