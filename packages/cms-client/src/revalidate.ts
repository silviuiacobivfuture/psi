import { z } from "zod";
import { SiteSchema } from "./ai-settings";
import { signWebhook, verifyWebhook } from "./signing";

/**
 * The CMS tells the sites that something they cache changed: POST `<site>/__cms/revalidate`,
 * the JSON body signed with HMAC-SHA256 (`CMS_REVALIDATE_SECRET`, shared by the CMS and the four
 * sites) in `x-psi-signature: sha256=<hex>`. The body names what changed, never its content, and
 * carries `sentAt`: an event older than five minutes is refused (replay).
 */
const DocumentEvent = {
	event: z.enum(["publish", "unpublish", "update", "delete"]),
	id: z.string().min(1),
	slug: z.string().nullable(),
	brand: z.string().nullable(),
	sentAt: z.string().datetime(),
};

export const RevalidateEvent = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("offerings"), ...DocumentEvent }),
	z.object({
		kind: z.literal("articles"),
		event: z.enum(["publish", "unpublish", "update", "delete"]),
		id: z.string().min(1),
		slug: z.string().nullable(),
		brand: z.string().nullable(),
		sentAt: z.string().datetime(),
	}),
	z.object({
		kind: z.literal("ai-settings"),
		sites: z.array(SiteSchema).min(1),
		sentAt: z.string().datetime(),
	}),
]);
export type RevalidateEvent = z.infer<typeof RevalidateEvent>;

export const SIGNATURE_HEADER = "x-psi-signature";
export const REVALIDATE_PATH = "/__cms/revalidate";
const MAX_AGE_MS = 5 * 60 * 1000;

/** The body and header the CMS sends. */
export function signRevalidation(
	event: RevalidateEvent,
	secret: string,
): { body: string; signature: string } {
	const body = JSON.stringify(RevalidateEvent.parse(event));
	return { body, signature: `sha256=${signWebhook(body, secret)}` };
}

export type RevalidateHandlers = {
	[K in RevalidateEvent["kind"]]?: (
		event: Extract<RevalidateEvent, { kind: K }>,
	) => void | Promise<void>;
};

/**
 * The site's side, framework-agnostic (Hono: `c.req.raw`): 401 on a bad signature, 400 on a body
 * that is not an event or is stale, 204 once the matching handler ran.
 */
export async function handleRevalidate(
	request: Request,
	secret: string | undefined,
	handlers: RevalidateHandlers,
	now: () => number = Date.now,
): Promise<Response> {
	if (request.method !== "POST") return new Response(null, { status: 405 });
	if (secret === undefined || secret.length < 32) return new Response(null, { status: 503 });
	const body = await request.text();
	const sig = (request.headers.get(SIGNATURE_HEADER) ?? "").replace(/^sha256=/, "");
	if (!verifyWebhook(body, sig, secret)) return new Response(null, { status: 401 });
	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return new Response(null, { status: 400 });
	}
	const e = RevalidateEvent.safeParse(json);
	if (!e.success || Math.abs(now() - Date.parse(e.data.sentAt)) > MAX_AGE_MS) {
		return new Response(null, { status: 400 });
	}
	if (e.data.kind === "articles") await handlers.articles?.(e.data);
	else if (e.data.kind === "offerings") await handlers.offerings?.(e.data);
	else await handlers["ai-settings"]?.(e.data);
	return new Response(null, { status: 204 });
}
