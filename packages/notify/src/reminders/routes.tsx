import { Hono } from "hono";
import type { AppKey } from "../apps";
import type { Notifier } from "../notify";
import { renderIcs } from "./ics";
import { type PageKind, ResultPage } from "./pages";
import type { UsedLinks } from "./store";
import { type LinkAction, type TokenFailure, verifyToken } from "./token";

/** The appointment facts a link action returns: what reception's notice and the page need. */
export type AppointmentFacts = {
	appointmentId: string;
	clientName: string;
	serviceName: string;
	startsAt: string;
	practitionerName?: string;
};

export type ActionResult =
	| { status: "done"; appointment: AppointmentFacts }
	| { status: "already" }
	| { status: "gone" };

export interface CalendarEvent {
	summary: string;
	startsAt: number;
	endsAt: number;
	location: string;
	cancelled: boolean;
}

/** What the scheduling API implements: the calendar changes behind a link. */
export interface ReminderActions {
	/** Sets `client_confirmed`. `already` when it was set; `gone` when the appointment is cancelled, past or erased. */
	confirm(app: AppKey, appointmentId: string): Promise<ActionResult>;
	/** Cancels the appointment, freeing the slot. */
	cancel(app: AppKey, appointmentId: string): Promise<ActionResult>;
	calendar(app: AppKey, appointmentId: string): Promise<CalendarEvent | undefined>;
}

export interface ReminderRoutesOptions {
	secret: string;
	used: UsedLinks;
	actions: ReminderActions;
	notifier: Pick<Notifier, "notify">;
	/** The app the request belongs to (from the host); a token of another app is refused. */
	appOf: (host: string) => AppKey | undefined;
	now?: () => number;
}

const STATUS: Readonly<Record<TokenFailure, 400 | 410>> = {
	malformed: 400,
	tampered: 400,
	"wrong-action": 400,
	"wrong-app": 400,
	expired: 410,
};

/**
 * `/v1/public/reminders/:token/(confirm|cancel|ics)` for the scheduling API to mount.
 *
 * GET on confirm/cancel changes NOTHING: mail scanners and link previews fetch every link in a
 * message, and a fetch must not cancel an appointment or burn a one-time link. It shows a page with
 * one button; the button POSTs. A link is used up by the first POST; a repeat shows the outcome
 * ("already answered") instead of an error. The .ics link is read-only and can be fetched again.
 */
export function createReminderRoutes(options: ReminderRoutesOptions): Hono {
	const now = options.now ?? Date.now;
	const app = new Hono();

	function page(
		kind: PageKind,
		locale: "ro" | "en",
		appKey: AppKey,
		status: 200 | 400 | 410 = 200,
	): Response {
		return new Response(
			`<!doctype html>${(<ResultPage app={appKey} locale={locale} kind={kind} />).toString()}`,
			{
				status,
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store",
					"referrer-policy": "no-referrer",
					"x-robots-tag": "noindex",
					"content-security-policy":
						"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
				},
			},
		);
	}

	function check(host: string, token: string, action: LinkAction) {
		const expectApp = options.appOf(host);
		if (expectApp === undefined)
			return { ok: false as const, failure: "wrong-app" as const, app: undefined };
		const v = verifyToken({
			secret: options.secret,
			token,
			now: now(),
			expectApp,
			expectAction: action,
		});
		return { ...v, app: expectApp };
	}

	for (const action of ["confirm", "cancel"] as const) {
		app.get(`/:token/${action}`, (c) => {
			const v = check(new URL(c.req.url).host, c.req.param("token"), action);
			if (!v.ok)
				return page(
					v.failure === "expired" ? "expired" : "invalid",
					"ro",
					v.app ?? "psizone",
					STATUS[v.failure],
				);
			return page(action === "confirm" ? "ask-confirm" : "ask-cancel", v.claims.l, v.claims.a);
		});
		app.post(`/:token/${action}`, async (c) => {
			const v = check(new URL(c.req.url).host, c.req.param("token"), action);
			if (!v.ok)
				return page(
					v.failure === "expired" ? "expired" : "invalid",
					"ro",
					v.app ?? "psizone",
					STATUS[v.failure],
				);
			const { claims } = v;
			if (!(await options.used.claim(claims.j, claims.e * 1000)))
				return page("already", claims.l, claims.a);
			let result: ActionResult;
			try {
				result = await (action === "confirm" ? options.actions.confirm : options.actions.cancel)(
					claims.a,
					claims.i,
				);
			} catch {
				await options.used.release(claims.j);
				return new Response("", {
					status: 503,
					headers: { "retry-after": "30", "cache-control": "no-store" },
				});
			}
			if (result.status === "gone") return page("gone", claims.l, claims.a, 410);
			if (result.status === "already") return page("already", claims.l, claims.a);
			await options.notifier.notify(
				claims.a,
				action === "confirm" ? "reminder.confirmed" : "reminder.declined",
				{ ...result.appointment },
				[{ audience: "reception" }],
				claims.j,
			);
			return page(action === "confirm" ? "confirmed" : "declined", claims.l, claims.a);
		});
	}

	app.get("/:token/ics", async (c) => {
		const v = check(new URL(c.req.url).host, c.req.param("token"), "ics");
		if (!v.ok)
			return page(
				v.failure === "expired" ? "expired" : "invalid",
				"ro",
				v.app ?? "psizone",
				STATUS[v.failure],
			);
		const event = await options.actions.calendar(v.claims.a, v.claims.i);
		if (event === undefined) return page("gone", v.claims.l, v.claims.a, 410);
		const body = renderIcs({
			uid: `${v.claims.i}@${v.claims.a}.psi`,
			summary: event.summary,
			startsAt: event.startsAt,
			endsAt: event.endsAt,
			location: event.location,
			now: now(),
			cancelled: event.cancelled,
		});
		return new Response(body, {
			headers: {
				"content-type": "text/calendar; charset=utf-8",
				"content-disposition": 'attachment; filename="appointment.ics"',
				"cache-control": "no-store",
			},
		});
	});

	return app;
}
