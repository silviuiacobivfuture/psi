import { CLIENT_PAGE_SIZES } from "@psi/scheduling-sdk/contract";
import { Pager, type PagerLabels } from "@psi/ui/admin";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { m } from "../paraglide/messages.js";
import { DEFAULT_PAGE_SIZE } from "../port/port";
import type { Ctx } from "./context";
import { at, type Locale } from "./i18n";
import { sse } from "./sse";

/**
 * A list of the console shown as numbered pages (the shared pager of `@psi/ui`): what its address says (`page`, `size`,
 * and `from` when the size picker changed the size), the size the person last picked, and the in-place answer a
 * Datastar request gets (the list patched, the address bar following it, the focus moved to the list on a page link).
 */

/** The page sizes a person may pick. */
export const PAGE_SIZES = CLIENT_PAGE_SIZES;
export type PageSize = (typeof PAGE_SIZES)[number];
const Size = z.coerce
	.number()
	.int()
	.refine((n): n is PageSize => (PAGE_SIZES as ReadonlyArray<number>).includes(n));

/** The paging part of a list's address. `via` says which control asked (the filters or the size picker; a link: none). */
export const PageParams = z.object({
	page: z.coerce.number().int().min(1).max(1_000_000).catch(1),
	size: Size.optional().catch(undefined),
	from: z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined),
	via: z.enum(["filters", "size"]).optional().catch(undefined),
});
export type PageParams = z.infer<typeof PageParams>;

/**
 * The device keeps the person's size (as it keeps their language and theme): the service is asked once per device and
 * person, then the cookie answers. The cookie names the person, so a shared desk computer never hands one person's
 * size to the next.
 */
const SIZE_COOKIE = "page-size";
const COOKIE_OPTIONS = { path: "/", maxAge: 31536000, sameSite: "Lax" as const, httpOnly: true };
const Kept = z.string().regex(/^(25|50|100|none):.+$/);

/** What this request already put in the cookie (a cookie set now is only read from the next request on). */
const keptNow = new WeakMap<Context, string>();

function keptOnDevice(ctx: Ctx): PageSize | "none" | undefined {
	const raw = Kept.safeParse(keptNow.get(ctx.c) ?? getCookie(ctx.c, SIZE_COOKIE));
	if (!raw.success) return undefined;
	const at = raw.data.indexOf(":");
	if (raw.data.slice(at + 1) !== ctx.person.subject) return undefined;
	const size = raw.data.slice(0, at);
	return size === "none" ? "none" : (Number(size) as PageSize);
}

/** Remembers the person's size on this device (`none`: they never picked one). */
export function keepSizeOnDevice(c: Context, subject: string, size: PageSize | "none"): void {
	const value = `${size}:${subject}`;
	keptNow.set(c, value);
	setCookie(c, SIZE_COOKIE, value, COOKIE_OPTIONS);
}

const keepOnDevice = (ctx: Ctx, size: PageSize | "none"): void =>
	keepSizeOnDevice(ctx.c, ctx.person.subject, size);

/** The size a list opens with: the address's, else the one the person last picked, else the default. */
export async function sizeOf(ctx: Ctx, asked: PageParams): Promise<PageSize> {
	if (asked.size !== undefined) return asked.size as PageSize;
	const kept = keptOnDevice(ctx);
	if (kept !== undefined) return kept === "none" ? DEFAULT_PAGE_SIZE : kept;
	try {
		const held = (await ctx.port.mySettings(ctx.app, ctx.person.subject)).pageSize;
		if (ctx.viewAs === null) keepOnDevice(ctx, held ?? "none");
		return held ?? DEFAULT_PAGE_SIZE;
	} catch {
		return DEFAULT_PAGE_SIZE;
	}
}

/**
 * Keeps a size the person picked with the size picker (never one a shared link carried) for every list, across
 * devices. A failure to keep it is not the list's failure: the list still opens at the size asked.
 */
export async function rememberSize(ctx: Ctx, asked: PageParams, size: PageSize): Promise<void> {
	if (asked.via !== "size" || ctx.viewAs !== null) return;
	keepOnDevice(ctx, size);
	try {
		const { stored: _stored, ...held } = await ctx.port.mySettings(ctx.app, ctx.person.subject);
		if (held.pageSize !== size)
			await ctx.port.saveMySettings(ctx.app, ctx.person.subject, {
				...held,
				pageSize: size,
			});
	} catch {
		// The size still applies to this page and this device; the other devices just do not learn it.
	}
}

/** The page asked: after a size change, the page holding the first row that was shown; else `page`. */
export const pageAsked = (asked: PageParams, size: number): number =>
	asked.from === undefined ? asked.page : Math.floor(asked.from / size) + 1;

/** A list's address: its path and parameters in a fixed order, empty ones left out, so equal lists have equal URLs. */
export function listHref(
	path: string,
	params: ReadonlyArray<readonly [string, string | number | null]>,
): string {
	const q = new URLSearchParams();
	for (const [k, v] of params) if (v !== null && v !== "") q.set(k, String(v));
	const s = q.toString();
	return s === "" ? path : `${path}?${s}`;
}

/** The pager's words in the person's language. */
export function pagerLabels(locale: Locale, nav: string): PagerLabels {
	const o = at(locale);
	return {
		nav,
		first: m.pg_first({}, o),
		prev: m.pg_prev({}, o),
		next: m.pg_next({}, o),
		last: m.pg_last({}, o),
		page: (n) => m.pg_page({ n: String(n) }, o),
		range: (from, to, total) =>
			m.pg_range({ from: String(from), to: String(to), total: String(total) }, o),
		size: m.pg_size({}, o),
		apply: m.pg_apply({}, o),
	};
}

/** The console's pager for one list: live (Datastar) links over real addresses. */
export function ListPager(o: {
	ctx: Ctx;
	id: string;
	nav: string;
	page: number;
	size: number;
	total: number;
	href: (page: number, size: number) => string;
	action: string;
	params: Readonly<Record<string, string>>;
}): JSX.Element {
	return (
		<Pager
			id={o.id}
			page={o.page}
			size={o.size}
			total={o.total}
			sizes={PAGE_SIZES}
			href={o.href}
			action={o.action}
			params={{ ...o.params, via: "size" }}
			labels={pagerLabels(o.ctx.locale, o.nav)}
			live
		/>
	);
}

/** Whether the request is Datastar's in-place fetch (answered with patches) rather than a page load. */
export const inPlace = (c: Context): boolean => c.req.header("datastar-request") === "true";

/**
 * The in-place answer of a list: each element (by its id) replaced, the address bar moved to `url` unless it is there
 * already (Back and Forward fetch the address they land on, so they never push), and, when a page link asked (no
 * `via`), the focus moved to the region so a keyboard or screen reader user lands on the new rows. The filters ask with
 * `via`, so the field being typed in keeps the focus.
 */
export async function patchList(o: {
	/** The request: the cookies it set (the size the person picked) travel with the patches. */
	c: Context;
	elements: ReadonlyArray<JSX.Element>;
	regionId: string;
	url: string;
	asked: PageParams;
}): Promise<Response> {
	const parts = await Promise.all(o.elements.map((e) => e.toString()));
	const url = JSON.stringify(o.url);
	const res = sse((stream) => {
		for (const html of parts) stream.patchElements(html);
		stream.executeScript(
			`if (location.pathname + location.search !== ${url}) history.pushState(null, "", ${url});${
				o.asked.via === undefined
					? ` document.getElementById(${JSON.stringify(o.regionId)})?.focus({ preventScroll: false });`
					: ""
			}`,
		);
	});
	for (const cookie of o.c.res.headers.getSetCookie()) res.headers.append("set-cookie", cookie);
	return res;
}
