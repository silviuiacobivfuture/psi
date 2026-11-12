import { registerJourney, type SignedIn, sameOrigin } from "@psi/account";
import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { account, accountPaths, accountSay, savedRef } from "./account";
import { findArticle } from "./content/articles";
import { ESTATE, SITE, siteNames } from "./estate";
import type { Locale } from "./i18n";
import {
	AccountFrame,
	AccountUnavailablePage,
	ReadingList,
	SaveConfirmPage,
	type ShownSaved,
} from "./pages/account";
import { routes } from "./routes";
import { themeFrom } from "./theme";

const PRIVATE = { "cache-control": "private, no-store" };
const SaveForm = z.object({ articol: z.string().min(1).max(200) });

/**
 * The signed-in journey (docs/plans/accounts.md) with the blog's reading list on /cont. Reading the list asks
 * OpenFGA about every row (viewer); removing one asks editor. Saving needs a signed-in person and a same-origin
 * POST. Export and erasure happen on Psizone, where the reservations are kept.
 */
export function registerAccountRoutes(app: Hono, locale: Locale, prefix: string): void {
	const frame = (c: Context) => ({
		locale,
		theme: themeFrom(getCookie(c, "theme")),
		origin: new URL(c.req.url).origin,
	});
	const unavailable = (c: Context): Response | Promise<Response> =>
		c.html(<AccountUnavailablePage {...frame(c)} />, 503, PRIVATE);
	const foreign = (c: Context): boolean =>
		!sameOrigin(c.req.raw.headers, c.req.method, ESTATE[SITE]);

	/** The person's saved articles, each allowed as viewer; null when OpenFGA could not be asked. */
	const readingList = async (c: Context, person: SignedIn) => {
		const rows = await (await account.stores()).savedArticles.list(person.subject);
		const decisions = await account.decideMany(c, "viewer", rows.map(savedRef));
		const shown: ShownSaved[] = [];
		let partial = false;
		for (const row of rows) {
			const d = decisions.get(savedRef(row).object);
			if (d === "unavailable") partial = true;
			const article = findArticle(row.slug);
			if (d !== "allowed" || article === undefined) continue;
			shown.push({
				id: row.id,
				title: article.title[locale],
				href: routes.article(locale, row.slug),
			});
		}
		const saved = partial && shown.length === 0 ? null : shown;
		return <ReadingList locale={locale} saved={saved} partial={partial} />;
	};

	registerJourney(app, {
		account,
		locale,
		base: prefix,
		site: "blog",
		say: accountSay(locale),
		siteNames: siteNames(locale),
		dataHome: `${ESTATE.psizone}${prefix}/cont/date`,
		bookHref: `${ESTATE.psizone}${prefix}/contact`,
		readingHref: `${prefix}/`,
		savedListHref: `${prefix}/cont#salvate`,
		savedArticle: (slug) => {
			const article = findArticle(slug);
			return article === undefined
				? undefined
				: { title: article.title[locale], href: routes.article(locale, slug) };
		},
		homeExtra: readingList,
		render: (c, page) =>
			c.html(
				<AccountFrame {...frame(c)} title={page.title}>
					{page.body}
				</AccountFrame>,
				page.status === 503 ? 503 : 200,
				PRIVATE,
			),
	});

	app.get(`${prefix}/cont/salvate/nou`, account.requireSignIn(), (c) => {
		const article = findArticle(c.req.query("articol") ?? "");
		if (article === undefined) return c.redirect(accountPaths.home(locale), 302);
		return c.html(
			<SaveConfirmPage {...frame(c)} slug={article.slug} title={article.title[locale]} />,
			200,
			PRIVATE,
		);
	});

	app.post(
		`${prefix}/cont/salvate`,
		async (c, next) => {
			if (foreign(c)) return c.body(null, 403);
			return account.requireSignIn()(c, next);
		},
		async (c) => {
			const person = account.current(c);
			const form = SaveForm.safeParse(await c.req.parseBody());
			const article = form.success ? findArticle(form.data.articol) : undefined;
			if (person === null || article === undefined) return c.body(null, 400);
			await (await account.stores()).savedArticles.save(person.subject, article.slug, Date.now());
			return c.redirect(accountPaths.home(locale), 303);
		},
	);

	app.post(
		`${prefix}/cont/salvate/:id/sterge`,
		async (c, next) => {
			if (foreign(c)) return c.body(null, 403);
			await next();
		},
		account.can(
			"editor",
			async (c) => {
				const row = await (await account.stores()).savedArticles.get(c.req.param("id") ?? "");
				return row === null ? null : savedRef(row);
			},
			{ unavailable },
		),
		async (c) => {
			await (await account.stores()).savedArticles.remove(c.req.param("id") ?? "");
			return c.redirect(accountPaths.home(locale), 303);
		},
	);
}
