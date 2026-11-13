import { Banner, EmptyState, Icon, PageHeader, Segmented, toastElement } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import type { WebRequest } from "../port/schema";

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

export function RequestsBody({
	all,
	show,
	failed,
	ctx,
}: {
	all: ReadonlyArray<WebRequest>;
	show: "open" | "handled";
	failed: boolean;
	ctx: Ctx;
}): JSX.Element {
	const o = at(ctx.locale);
	const list = all.filter((r) => r.handled === (show === "handled"));
	return (
		<div id="requests-live" class="adm-stack" style="display:contents">
			{failed ? (
				<Banner tone="error" icon="alert">
					<strong>{m.error_title({}, o)}</strong>
					<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
					<a class="adm-btn" href="/requests">
						{m.retry({}, o)}
					</a>
				</Banner>
			) : list.length === 0 ? (
				<EmptyState
					icon="inbox"
					title={m.requests_empty_title({}, o)}
					text={m.requests_empty_text({}, o)}
				/>
			) : (
				<div class="adm-stack" style="gap:var(--space-3)" id="requests">
					{list.map((r) => (
						<Request
							key={r.id}
							r={r}
							locale={ctx.locale}
							canDecide={ctx.can.write("web_requests_approve")}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/** The requests list again, for a live update. */
export async function renderRequestsLive(ctx: Ctx, show: "open" | "handled"): Promise<JSX.Element> {
	let all: ReadonlyArray<WebRequest> = [];
	let failed = false;
	try {
		all = await ctx.port.requests(ctx.app);
	} catch {
		failed = true;
	}
	return <RequestsBody all={all} show={show} failed={failed} ctx={ctx} />;
}

export async function renderRequests(ctx: Ctx, show: "open" | "handled"): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let all: ReadonlyArray<WebRequest> = [];
	let failed = false;
	try {
		all = await ctx.port.requests(ctx.app);
	} catch {
		failed = true;
	}
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
							label: `${m.requests_open({}, o)} (${all.filter((r) => !r.handled).length})`,
							href: "/requests?show=open",
						},
						{ key: "handled", label: m.requests_handled({}, o), href: "/requests?show=handled" },
					]}
				/>
				<RequestsBody all={all} show={show} failed={failed} ctx={ctx} />
			</div>
		),
	});
}

export function registerRequests(app: Hono<Env>): void {
	app.get("/requests", async (c) =>
		c.html(
			await renderRequests(c.var.ctx, c.req.query("show") === "handled" ? "handled" : "open"),
			200,
			{ "cache-control": "private, no-store" },
		),
	);
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
