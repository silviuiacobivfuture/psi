import { escapeHtml } from "@psi/ui/admin";
import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../app";
import { Page } from "../chrome";
import { at } from "../lib/i18n";
import { signalsOf, sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import type { SearchHit } from "../port/schema";

const SearchSignalsSchema = z.object({ q: z.string().max(200) });

function hitHref(h: SearchHit): string {
	return h.kind === "client" ? `/clients/${h.id}` : `/calendar?view=day&date=${h.date}`;
}

function hitsHtml(hits: ReadonlyArray<SearchHit>, q: string, locale: "ro" | "en"): string {
	const o = at(locale);
	if (hits.length === 0)
		return `<div id="adm-search-results" class="adm-search__results" aria-live="polite"><p class="adm-muted" style="padding:var(--space-3)">${escapeHtml(m.search_empty({ q }, o))}</p></div>`;
	const items = hits
		.map(
			(h) =>
				`<a class="adm-menu__item" href="${escapeHtml(hitHref(h))}"><span class="adm-pill adm-pill--attended">${escapeHtml(h.kind === "client" ? m.search_client({}, o) : m.search_appointment({}, o))}</span><span>${escapeHtml(h.label)} <span class="adm-muted">${escapeHtml(h.detail)}</span></span></a>`,
		)
		.join("");
	return `<div id="adm-search-results" class="adm-search__results" aria-live="polite">${items}</div>`;
}

/** Global search over clients and appointments: live results patched in by SSE; a plain page without JS. */
export function registerSearch(app: Hono<Env>): void {
	app.get("/search/live", async (c) => {
		const ctx = c.var.ctx;
		const signals = await signalsOf(c, SearchSignalsSchema);
		const q = signals?.q.trim() ?? "";
		return sse(async (stream) => {
			if (q === "") {
				stream.patchElements(`<div id="adm-search-results" class="adm-search__results"></div>`);
				return;
			}
			try {
				stream.patchElements(hitsHtml(await ctx.port.search(ctx.app, q), q, ctx.locale));
			} catch {
				stream.patchElements(
					`<div id="adm-search-results" class="adm-search__results"><p style="padding:var(--space-3)" role="alert">${escapeHtml(m.error_title({}, at(ctx.locale)))}</p></div>`,
				);
			}
		});
	});
	app.get("/search", async (c) => {
		const ctx = c.var.ctx;
		const q = (c.req.query("q") ?? "").slice(0, 200);
		let hits: ReadonlyArray<SearchHit> = [];
		let failed = false;
		try {
			hits = await ctx.port.search(ctx.app, q);
		} catch {
			failed = true;
		}
		return c.html(
			await Page({
				ctx,
				current: "calendar",
				title: m.search_label({}, at(ctx.locale)),
				children: (
					<div class="adm-page">
						{failed ? <p role="alert">{m.error_title({}, at(ctx.locale))}</p> : null}
						<div class="adm-card adm-stack">
							{hits.length === 0 && !failed ? (
								<p class="adm-muted">{m.search_empty({ q }, at(ctx.locale))}</p>
							) : null}
							{hits.map((h) => (
								<a key={`${h.kind}${h.id}`} class="adm-menu__item" href={hitHref(h)}>
									{h.label} <span class="adm-muted">{h.detail}</span>
								</a>
							))}
						</div>
					</div>
				),
			}),
		);
	});
}
