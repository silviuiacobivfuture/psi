import { REVALIDATE_PATH, RevalidateEvent } from "@psi/cms-client";
import { BrandSchema, blogPaths } from "@psi/content";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { account } from "../account";
import { findArticle } from "../content/articles";
import { ESTATE, SITE } from "../estate";
import { at } from "../i18n";
import { AccountFrame } from "../pages/account";
import { m } from "../paraglide/messages.js";
import { themeFrom } from "../theme";
import { notificationsPath, pwa } from "./site";

/**
 * After the CMS's signed webhook has been accepted (204: signature, freshness and shape checked by
 * `handleRevalidate`, and the articles re-read), a `publish` of an article that is now public
 * notifies that brand's subscribers on every site, once per article (the store claims its id).
 * Only the title and the link travel; nothing else about the article.
 */
async function announce(raw: string): Promise<void> {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return;
	}
	const e = RevalidateEvent.safeParse(json);
	if (
		!e.success ||
		e.data.kind !== "articles" ||
		e.data.event !== "publish" ||
		e.data.slug === null
	) {
		return;
	}
	const article = findArticle(e.data.slug);
	const brand = BrandSchema.safeParse(article?.brand);
	if (article === undefined || article.status !== "published" || !brand.success) return;
	const notifier = await pwa.notifier();
	if (notifier === null) return;
	const origin = ESTATE[SITE];
	const report = await notifier.notify({
		kind: "article.published",
		brand: brand.data,
		id: e.data.id,
		url: {
			ro: `${origin}${blogPaths.article("ro", article.slug)}`,
			en: `${origin}${blogPaths.article("en", article.slug)}`,
		},
		headline: { ro: article.title.ro, en: article.title.en },
	});
	console.log(`[pwa:blog] article ${e.data.id}: ${JSON.stringify(report)}`);
}

/**
 * The PWA's routes on the blog: manifest, worker, offline pages and push API (`pwa.mount`),
 * /cont/notificari, and the publish announcement. Registered before the CMS routes, so it sees the
 * webhook's answer without touching the handler that gives it.
 */
export function registerPwa(app: Hono): void {
	pwa.mount(app);
	app.use(REVALIDATE_PATH, async (c, next) => {
		const body = c.req.method === "POST" ? c.req.raw.clone().text() : null;
		await next();
		if (body === null || c.res.status !== 204) return;
		await announce(await body).catch((err: unknown) =>
			console.warn(`[pwa:blog] announce: ${String(err)}`),
		);
	});
	for (const locale of ["ro", "en"] as const) {
		app.get(notificationsPath(locale), account.recognise(), async (c) => {
			const o = at(locale);
			const subject = account.current(c)?.subject ?? null;
			return c.html(
				<AccountFrame
					locale={locale}
					theme={themeFrom(getCookie(c, "theme"))}
					origin={new URL(c.req.url).origin}
					title={m.pwa_page_title({}, o)}
				>
					<div class="flex max-w-[680px] flex-col gap-8">
						<p class="bl-standfirst">{m.pwa_page_lead({}, o)}</p>
						{pwa.notifications({
							locale,
							signedIn: subject !== null,
							signInHref: account.signInHref(notificationsPath(locale)),
							devices: await pwa.devices(subject),
						})}
					</div>
				</AccountFrame>,
				200,
				{ "cache-control": "private, no-store" },
			);
		});
	}
}
