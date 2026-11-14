import { Banner, EmptyState, Icon, PageHeader, Segmented, toastElement } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { inPlace, ListHistory, ListPager, listHref, pageRequested, patchList } from "../lib/paging";
import { sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import type { Numbered, PageAt } from "../port/numbered";
import { PortError } from "../port/port";
import type { WebRequest } from "../port/schema";

type Show = "open" | "handled";

function Request({
	r,
	locale,
	canDecide,
}: {
	r: WebRequest;
	locale: Locale;
	canDecide: boolean;
}): JSX.Element {
	const o = at(locale);
	const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
		new Date(r.receivedAt),
	);
	return (
		<article
			class="adm-card request"
			id={`req-${r.id}`}
			data-handled={r.handled ? "true" : "false"}
		>
			<div class="adm-pagehead">
				<div>
					<strong>{r.name}</strong>
					<div class="adm-muted">
						{when} · {r.service}
					</div>
				</div>
				{r.handled ? (
					<span class="adm-pill adm-pill--attended">{m.request_done({}, o)}</span>
				) : null}
			</div>
			<p style="margin:var(--space-2) 0">{r.message}</p>
			<div class="adm-row">
				<a class="adm-btn" href={`tel:${r.phone.replace(/\s/g, "")}`}>
					<Icon name="chat" />
					{m.request_call({ phone: r.phone }, o)}
				</a>
				{r.handled || !canDecide ? null : (
					<button
						type="button"
						class="adm-btn adm-btn--primary"
						data-action="request.handled"
						data-on:click={`@post('/requests/${r.id}/handled')`}
					>
						<Icon name="check" />
						{m.request_mark({}, o)}
					</button>
				)}
			</div>
		</article>
	);
}

const requestRow = (ctx: Ctx, r: WebRequest): JSX.Element => (
	<Request key={r.id} r={r} locale={ctx.locale} canDecide={ctx.can.write("web_requests_approve")} />
);

/** The canonical address of a page of the open or the handled requests. */
export const requestsHref = (show: Show, pos: PageAt): string =>
	listHref("/requests", [
		["show", show === "open" ? null : show],
		["page", pos.page],
		["size", pos.size],
	]);

/** The region a page change replaces and a live update re-renders: the rows and the pager. */
export const REQUESTS_ID = "requests-live";

/** One numbered page of the open or the handled requests, newest first, and the pager. */
export function RequestsBody({
	page,
	show,
	pos,
	ctx,
}: {
	/** null: the requests could not be read. */
	page: Numbered<WebRequest> | null;
	show: Show;
	pos: PageAt;
	ctx: Ctx;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<section
			id={REQUESTS_ID}
			class="adm-stack list-region"
			tabindex={-1}
			aria-label={m.requests_title({}, o)}
		>
			{page === null ? (
				<Banner tone="error" icon="alert">
					<strong>{m.error_title({}, o)}</strong>
					<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
					<a class="adm-btn" href={requestsHref(show, pos)}>
						{m.retry({}, o)}
					</a>
				</Banner>
			) : page.total === 0 ? (
				<EmptyState
					icon="inbox"
					title={m.requests_empty_title({}, o)}
					text={m.requests_empty_text({}, o)}
				/>
			) : (
				<>
					<div class="adm-stack" style="gap:var(--space-3)" id="requests">
						{page.items.map((r) => requestRow(ctx, r))}
					</div>
					<ListPager
						ctx={ctx}
						id="requests-pager"
						nav={m.rq_pager_nav({}, o)}
						page={page.page}
						size={pos.size}
						total={page.total}
						href={(p, size) => requestsHref(show, { page: p, size })}
						action="/requests"
						params={show === "open" ? {} : { show }}
					/>
				</>
			)}
		</section>
	);
}

const pageOf = (ctx: Ctx, show: Show, pos: PageAt): Promise<Numbered<WebRequest> | null> =>
	ctx.port.requestPage(ctx.app, show, pos).catch(() => null);

/** The page actually shown (past the end: the last). */
const shownAt = (page: Numbered<WebRequest> | null, pos: PageAt): PageAt =>
	page === null ? pos : { page: page.page, size: pos.size };

/** The requests list again, at the page shown, for a live update. */
export async function renderRequestsLive(ctx: Ctx, show: Show, pos: PageAt): Promise<JSX.Element> {
	const page = await pageOf(ctx, show, pos);
	return <RequestsBody page={page} show={show} pos={shownAt(page, pos)} ctx={ctx} />;
}

export async function renderRequests(ctx: Ctx, show: Show, pos: PageAt): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const [page, open] = await Promise.all([
		pageOf(ctx, show, pos),
		show === "open" ? null : pageOf(ctx, "open", { page: 1, size: 1 }),
	]);
	// How many are open: the service's count.
	const opened = show === "open" ? page : open;
	const shown = shownAt(page, pos);
	const first = { page: 1, size: pos.size };
	return Page({
		ctx,
		current: "requests",
		title: m.requests_title({}, o),
		children: (
			<div
				class="adm-page"
				data-init={`@get('/live?screen=requests&show=${show}&page=${shown.page}&size=${shown.size}')`}
			>
				<PageHeader title={m.requests_title({}, o)} />
				<ListHistory url={requestsHref(show, shown)} />
				<Segmented
					label={m.requests_filter({}, o)}
					current={show}
					items={[
						{
							key: "open",
							label:
								opened === null
									? m.requests_open({}, o)
									: `${m.requests_open({}, o)} (${opened.total})`,
							href: requestsHref("open", first),
						},
						{
							key: "handled",
							label: m.requests_handled({}, o),
							href: requestsHref("handled", first),
						},
					]}
				/>
				<RequestsBody page={page} show={show} pos={shown} ctx={ctx} />
			</div>
		),
	});
}

const showOf = (raw: string | undefined): Show => (raw === "handled" ? "handled" : "open");

export function registerRequests(app: Hono<Env>): void {
	// One address per page: a page load answers the page, Datastar's in-place fetch of it the patch.
	app.get("/requests", async (c) => {
		const ctx = c.var.ctx;
		const show = showOf(c.req.query("show"));
		const { at: pos, paging } = await pageRequested(ctx, c.req.query());
		if (!inPlace(c))
			return c.html(await renderRequests(ctx, show, pos), 200, {
				"cache-control": "private, no-store",
			});
		const page = await pageOf(ctx, show, pos);
		const shown = shownAt(page, pos);
		return patchList({
			c,
			elements: [<RequestsBody key="body" page={page} show={show} pos={shown} ctx={ctx} />],
			regionId: REQUESTS_ID,
			url: requestsHref(show, shown),
			asked: paging,
		});
	});
	app.post("/requests/:id/handled", async (c) => {
		const ctx = c.var.ctx;
		const o = at(ctx.locale);
		const id = c.req.param("id");
		try {
			await ctx.port.markRequestHandled(ctx.app, id);
		} catch (err) {
			if (err instanceof PortError && err.code === "not-found") return c.notFound();
			throw err;
		}
		return sse((stream) => {
			stream.removeElements(`#req-${id}`);
			stream.patchElements(toastElement(m.toast_request_done({}, o), m.dismiss({}, o)));
		});
	});
}
