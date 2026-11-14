import { Banner, EmptyState, Icon, PageHeader, Segmented, toastElement } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { appendPage, MoreQuery, moreHref, ShowMore } from "../lib/show-more";
import { sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { type Paged, PortError } from "../port/port";
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

/** The next page of the shown requests, appended to the list; nothing on the last page. */
function MoreRequests({
	ctx,
	show,
	cursor,
	shown,
}: {
	ctx: Ctx;
	show: Show;
	cursor: string | null;
	shown: number;
}): JSX.Element {
	return (
		<ShowMore
			id="requests-more"
			href={moreHref("/requests/more", cursor, shown, { show })}
			label={m.ls_more({}, at(ctx.locale))}
		/>
	);
}

const requestRow = (ctx: Ctx, r: WebRequest): JSX.Element => (
	<Request key={r.id} r={r} locale={ctx.locale} canDecide={ctx.can.write("web_requests_approve")} />
);

/**
 * The first page of the open or the handled requests and a "show more"; a live update re-renders it from the first
 * page again (what was appended folds back into the first page, the newest first).
 */
export function RequestsBody({
	page,
	show,
	ctx,
}: {
	/** null: the requests could not be read. */
	page: Paged<WebRequest> | null;
	show: Show;
	ctx: Ctx;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<div id="requests-live" class="adm-stack" style="display:contents">
			{page === null ? (
				<Banner tone="error" icon="alert">
					<strong>{m.error_title({}, o)}</strong>
					<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
					<a class="adm-btn" href="/requests">
						{m.retry({}, o)}
					</a>
				</Banner>
			) : page.items.length === 0 ? (
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
					<MoreRequests ctx={ctx} show={show} cursor={page.nextCursor} shown={page.items.length} />
				</>
			)}
		</div>
	);
}

const firstPage = (ctx: Ctx, show: Show): Promise<Paged<WebRequest> | null> =>
	ctx.port.requestPage(ctx.app, show, null).catch(() => null);

/** The requests list again, for a live update. */
export async function renderRequestsLive(ctx: Ctx, show: Show): Promise<JSX.Element> {
	return <RequestsBody page={await firstPage(ctx, show)} show={show} ctx={ctx} />;
}

export async function renderRequests(ctx: Ctx, show: Show): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const [page, open] = await Promise.all([
		firstPage(ctx, show),
		show === "open" ? null : firstPage(ctx, "open"),
	]);
	// How many are open: exact on one page, "50+" when more follow.
	const opened = show === "open" ? page : open;
	const openCount =
		opened === null
			? null
			: opened.nextCursor === null
				? String(opened.items.length)
				: m.ls_count_more({ n: String(opened.items.length) }, o);
	return Page({
		ctx,
		current: "requests",
		title: m.requests_title({}, o),
		children: (
			<div class="adm-page" data-init={`@get('/live?screen=requests&show=${show}')`}>
				<PageHeader title={m.requests_title({}, o)} />
				<Segmented
					label={m.requests_filter({}, o)}
					current={show}
					items={[
						{
							key: "open",
							label:
								openCount === null
									? m.requests_open({}, o)
									: `${m.requests_open({}, o)} (${openCount})`,
							href: "/requests?show=open",
						},
						{ key: "handled", label: m.requests_handled({}, o), href: "/requests?show=handled" },
					]}
				/>
				<RequestsBody page={page} show={show} ctx={ctx} />
			</div>
		),
	});
}

const showOf = (raw: string | undefined): Show => (raw === "handled" ? "handled" : "open");

export function registerRequests(app: Hono<Env>): void {
	app.get("/requests", async (c) =>
		c.html(await renderRequests(c.var.ctx, showOf(c.req.query("show"))), 200, {
			"cache-control": "private, no-store",
		}),
	);
	// The next page of the shown requests, appended to the open list.
	app.get("/requests/more", async (c) => {
		const ctx = c.var.ctx;
		const show = showOf(c.req.query("show"));
		const asked = MoreQuery.parse(c.req.query());
		const page = await ctx.port.requestPage(
			ctx.app,
			show,
			asked.cursor === "" ? null : asked.cursor,
		);
		const shown = asked.shown + page.items.length;
		return appendPage({
			list: "#requests",
			rows: page.items.map((r) => requestRow(ctx, r)),
			more: <MoreRequests ctx={ctx} show={show} cursor={page.nextCursor} shown={shown} />,
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
