/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Context, Hono } from "hono";
import type { Child } from "hono/jsx";
import { z } from "zod";
import { type SignedIn, sameOrigin } from "../guard";
import { PURPOSES, type Purpose } from "../stores/types";
import { accountRef, formOf, type JourneyOptions, PRIVATE, WORDING_VERSION } from "./context";
import { exportOf } from "./export";
import type { JourneyKey, Say } from "./labels";
import { overviewOf } from "./overview";
import { registerHistoryRoutes } from "./routes-history";
import { timelineOf } from "./timeline";
import { ConsentsBody, DataBody, ProfileBody } from "./views-manage";
import { HomeBody } from "./views-overview";
import {
	ComingSoon,
	JOURNEY_PAGES,
	type JourneyPage,
	JourneyShell,
	SignInInvite,
	Unavailable,
} from "./views-shell";

const ProfileForm = z
	.object({
		displayName: z.string().trim().max(120),
		phone: z
			.string()
			.trim()
			.max(32)
			.refine((v) => v === "" || /^\+?[0-9 ()-]{6,20}$/.test(v)),
		preferredContact: z.enum(["email", "phone"]),
		language: z.enum(["ro", "en"]),
	})
	.refine((p) => p.preferredContact !== "phone" || p.phone !== "");
const ConsentForm = z.object({
	purpose: z.enum(PURPOSES),
	action: z.enum(["grant", "withdraw"]),
	back: z.enum(["conversations"]).optional(),
});

/** The tools every journey route shares: who, may they, and how a page is drawn. */
export interface Journey {
	o: JourneyOptions;
	say: Say;
	path(page: JourneyPage, rest?: string): string;
	/** A signed-in person allowed `relation` on their own account, or the Response that ends the request. */
	gate(
		c: Context,
		relation: "viewer" | "editor" | "eraser",
		back?: JourneyPage,
	): Promise<SignedIn | Response>;
	page(
		c: Context,
		person: SignedIn,
		active: JourneyPage,
		title: JourneyKey,
		body: Child,
		notice?: string,
	): Response | Promise<Response>;
	unavailable(c: Context): Response | Promise<Response>;
	/** A write from this site's own origin only (the sites are same-site with each other). */
	foreign(c: Context): boolean;
}

function journeyOf(o: JourneyOptions): Journey {
	const say = o.say;
	const path = (page: JourneyPage, rest = "") => `${o.base}${JOURNEY_PAGES[page]}${rest}`;
	const unavailable = (c: Context) =>
		o.render(c, {
			title: say("account_unavailable_title"),
			body: <Unavailable say={say} />,
			status: 503,
		});
	return {
		o,
		say,
		path,
		unavailable,
		foreign: (c) => !sameOrigin(c.req.raw.headers, c.req.method, o.account.origin),
		async gate(c, relation, back = "home") {
			const person = await o.account.person(c);
			if (person === null) {
				// A write whose session ended: back through sign-in to the page it came from, never a blank 401.
				if (c.req.method !== "GET") return c.redirect(o.account.signInHref(path(back)), 303);
				const here = new URL(c.req.url);
				return o.render(c, {
					title: say("account_title"),
					body: (
						<SignInInvite
							say={say}
							signInHref={o.account.signInHref(`${here.pathname}${here.search}`)}
							signInReady={o.account.status.identity === "ready"}
						/>
					),
				});
			}
			const decision = await o.account.decide(c, relation, accountRef(person.subject));
			if (decision === "allowed") return person;
			if (decision === "unavailable") return unavailable(c);
			return c.body(null, 404);
		},
		page(c, person, active, title, body, notice) {
			return o.render(c, {
				title: say(title),
				body: (
					<JourneyShell
						say={say}
						base={o.base}
						active={active}
						person={person}
						signOutAction={o.account.signOutAction}
						{...(notice === undefined ? {} : { notice })}
					>
						{body}
					</JourneyShell>
				),
			});
		},
	};
}

/** Mounts the whole signed-in journey under `<base>/cont` (docs/plans/accounts.md, "Journey"). */
export function registerJourney(app: Hono, o: JourneyOptions): void {
	const j = journeyOf(o);
	const { say, path } = j;
	const now = o.now ?? Date.now;

	if (!o.account.enabled) {
		// Accounts off: every account page (any method, the site's own /cont routes too) says "coming soon".
		const soon = (c: Context) =>
			o.render(c, {
				title: say("account_soon_title"),
				body: <ComingSoon say={say} />,
			});
		app.all(path("home"), soon);
		app.all(path("home", "/*"), soon);
		return;
	}

	// Silent SSO on every journey page (GET only, once per 120 s): a person signed in on another site
	// arrives recognised, even on a deep link such as /cont/date.
	app.get(path("home"), o.account.recognise());
	app.get(path("home", "/*"), o.account.recognise());

	app.get(path("home"), async (c) => {
		c.header("cache-control", PRIVATE["cache-control"]);
		const person = await j.gate(c, "viewer");
		if (person instanceof Response) return person;
		const stores = await o.account.stores();
		const [timeline, overview] = await Promise.all([
			timelineOf(j, stores, person.subject),
			overviewOf(j, c, stores, person.subject),
		]);
		const extra = o.homeExtra === undefined ? undefined : await o.homeExtra(c, person);
		return j.page(
			c,
			person,
			"home",
			"account_title",
			<HomeBody
				say={say}
				base={o.base}
				overview={overview}
				locale={o.locale}
				timeline={timeline}
				extra={extra}
			/>,
		);
	});

	app.get(path("profile"), async (c) => {
		c.header("cache-control", PRIVATE["cache-control"]);
		const person = await j.gate(c, "viewer");
		if (person instanceof Response) return person;
		const saved = await (await o.account.stores()).profiles.get(person.subject);
		const profile = saved ?? {
			displayName: person.name,
			phone: null,
			preferredContact: "email" as const,
			language: o.locale,
		};
		return j.page(
			c,
			person,
			"profile",
			"account_profile_title",
			<ProfileBody
				say={say}
				base={o.base}
				email={person.email}
				profile={profile}
				invalid={c.req.query("invalid") === "1"}
			/>,
			c.req.query("ok") === "1" ? say("account_profile_saved") : undefined,
		);
	});

	app.post(path("profile"), async (c) => {
		if (j.foreign(c)) return c.body(null, 403);
		const person = await j.gate(c, "editor", "profile");
		if (person instanceof Response) return person;
		const form = ProfileForm.safeParse(await formOf(c));
		if (!form.success) return c.redirect(`${path("profile")}?invalid=1`, 303);
		await (await o.account.stores()).profiles.save(
			person.subject,
			{
				displayName: form.data.displayName === "" ? null : form.data.displayName,
				phone: form.data.phone === "" ? null : form.data.phone,
				preferredContact: form.data.preferredContact,
				language: form.data.language,
			},
			now(),
		);
		return c.redirect(`${path("profile")}?ok=1`, 303);
	});

	app.get(path("consents"), async (c) => {
		c.header("cache-control", PRIVATE["cache-control"]);
		const person = await j.gate(c, "viewer");
		if (person instanceof Response) return person;
		const records = await (await o.account.stores()).consents.list(person.subject);
		return j.page(
			c,
			person,
			"consents",
			"account_consents_title",
			<ConsentsBody
				say={say}
				base={o.base}
				locale={o.locale}
				records={records}
				purposes={o.purposes ?? ["guide_memory"]}
			/>,
		);
	});

	app.post(path("consents"), async (c) => {
		if (j.foreign(c)) return c.body(null, 403);
		const person = await j.gate(c, "editor", "consents");
		if (person instanceof Response) return person;
		const form = ConsentForm.safeParse(await formOf(c));
		if (!form.success || !(o.purposes ?? ["guide_memory"]).includes(form.data.purpose))
			return c.redirect(path("consents"), 303);
		const consents = (await o.account.stores()).consents;
		const purpose: Purpose = form.data.purpose;
		if (form.data.action === "grant")
			await consents.grant(person.subject, purpose, WORDING_VERSION, now());
		else await consents.withdraw(person.subject, purpose, now());
		return c.redirect(
			form.data.back === "conversations" ? path("conversations") : path("consents"),
			303,
		);
	});

	app.get(path("data"), async (c) => {
		c.header("cache-control", PRIVATE["cache-control"]);
		const person = await j.gate(c, "viewer");
		if (person instanceof Response) return person;
		return j.page(
			c,
			person,
			"data",
			"account_data_title",
			<DataBody
				say={say}
				base={o.base}
				signOutAction={o.account.signOutAction}
				mismatch={c.req.query("mismatch") === "1"}
				{...(o.reservations === undefined && o.dataHome !== undefined
					? { elsewhere: o.dataHome }
					: {})}
			/>,
		);
	});

	app.get(path("data", "/export"), async (c) => {
		if (o.dataHome !== undefined && o.reservations === undefined)
			return c.redirect(o.dataHome, 303);
		const person = await j.gate(c, "viewer");
		if (person instanceof Response) return person;
		const data = await exportOf(j, await o.account.stores(), person.subject);
		return c.body(JSON.stringify(data, null, 2), 200, {
			...PRIVATE,
			"content-type": "application/json; charset=utf-8",
			"content-disposition": `attachment; filename="psi-account-${new Date(now()).toISOString().slice(0, 10)}.json"`,
		});
	});

	app.post(path("data", "/sterge"), async (c) => {
		if (j.foreign(c)) return c.body(null, 403);
		if (o.dataHome !== undefined && o.reservations === undefined)
			return c.redirect(o.dataHome, 303);
		const person = await j.gate(c, "eraser", "data");
		if (person instanceof Response) return person;
		const typed = (await formOf(c)).confirm?.trim().toLocaleUpperCase(o.locale) ?? "";
		if (typed !== say("account_erase_word").toLocaleUpperCase(o.locale)) {
			return c.redirect(`${path("data")}?mismatch=1`, 303);
		}
		// The reservations first: an erasure never half-happens (the store away → nothing is deleted).
		try {
			await o.reservations?.unlink(person.subject);
		} catch {
			return j.unavailable(c);
		}
		const signedOut = await o.account.signOutEverywhere(c);
		await (await o.account.stores()).accounts.erase(person.subject);
		return signedOut;
	});

	registerHistoryRoutes(app, j);
}
