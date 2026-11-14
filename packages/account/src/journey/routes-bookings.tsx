/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { SignedIn } from "../guard";
import { bookingRef, formOf, PRIVATE } from "./context";
import type { BookingRefusal, OwnBooking, OwnBookingsPort } from "./ports";
import type { Journey } from "./routes";
import { MoveBody, OwnBookingsBody } from "./views-bookings";
import { LinkSection } from "./views-history";

const DAY = 86_400_000;
/** How far ahead a move looks for free times. */
const MOVE_WINDOW_DAYS = 14;
const Id = z.string().trim().min(1).max(64);
const MoveForm = z.object({
	start: z.coerce.number().int().positive(),
	mode: z.enum(["onsite", "online"]),
});
const Problem = z.enum(["too_late", "taken"]).optional().catch(undefined);

/**
 * "Programările mele" through the scheduling service, called with the person's own token: list, cancel, move. The
 * service decides whose a booking is; OpenFGA is asked again for each row (viewer to see, editor to change), as for
 * the rest of the account. A token the service no longer takes sends the person through a silent sign-in ONCE; a
 * second refusal is the "unavailable" page, never a loop.
 */
export function registerBookingRoutes(app: Hono, j: Journey, port: OwnBookingsPort): void {
	const { o, say, path } = j;
	const now = o.now ?? Date.now;
	const tokenOf = (c: Context, person: SignedIn): Promise<string | null> =>
		o.tokenFor === undefined ? o.account.idToken(c) : o.tokenFor(c, person);

	/** Once through a silent sign-in, back to `back`; already tried (`fresh=1`): the service is unavailable. */
	function renew(c: Context, back: string): Response | Promise<Response> {
		if (c.req.query("fresh") === "1") return j.unavailable(c);
		const glue = back.includes("?") ? "&" : "?";
		return c.redirect(`${o.account.signInHref(`${back}${glue}fresh=1`)}&prompt=none`, 303);
	}

	/** The person's rows, each allowed `relation` by OpenFGA; a refusal of the service or of OpenFGA as itself. */
	async function own(
		c: Context,
		person: SignedIn,
		token: string,
		relation: "viewer" | "editor",
	): Promise<ReadonlyArray<OwnBooking> | BookingRefusal> {
		const rows = await port.list(token);
		if (typeof rows === "string") return rows;
		const refs = rows.map((r) => bookingRef(r.reference, person.subject));
		const decisions = await o.account.decideMany(c, relation, refs);
		if (refs.some((r) => decisions.get(r.object) === "unavailable")) return "unavailable";
		return rows.filter((_, i) => decisions.get(refs[i]?.object ?? "") === "allowed");
	}

	/** The refusals every write answers the same way. */
	function refused(c: Context, why: BookingRefusal, back: string): Response | Promise<Response> {
		switch (why) {
			case "expired":
				return renew(c, back);
			case "not_found":
				return c.body(null, 404);
			case "unavailable":
				return j.unavailable(c);
			case "too_late":
				return c.redirect(`${path("bookings")}?problem=too_late`, 303);
			case "taken":
				return c.redirect(`${back}${back.includes("?") ? "&" : "?"}taken=1`, 303);
			default: {
				const never: never = why;
				return never;
			}
		}
	}

	app.get(path("bookings"), async (c) => {
		c.header("cache-control", PRIVATE["cache-control"]);
		const person = await j.gate(c, "viewer");
		if (person instanceof Response) return person;
		const token = await tokenOf(c, person);
		if (token === null) return renew(c, path("bookings"));
		const rows = await own(c, person, token, "viewer");
		if (rows === "expired") return renew(c, path("bookings"));
		// Renewed: the address loses its marker, so a later lapse renews again instead of stopping.
		if (c.req.query("fresh") === "1") return c.redirect(path("bookings"), 303);
		const ok = c.req.query("ok");
		return j.page(
			c,
			person,
			"bookings",
			"account_bookings_title",
			<>
				<OwnBookingsBody
					say={say}
					base={o.base}
					locale={o.locale}
					rows={typeof rows === "string" ? null : rows}
					now={now()}
					notice={Problem.parse(c.req.query("problem"))}
				/>
				{o.reservations === undefined ? null : (
					<LinkSection say={say} base={o.base} failed={c.req.query("link") === "failed"} />
				)}
			</>,
			ok === "cancelled"
				? say("account_status_cancelled")
				: ok === "moved"
					? say("account_bookings_moved")
					: undefined,
		);
	});

	app.post(path("bookings", "/anuleaza"), async (c) => {
		if (j.foreign(c)) return c.body(null, 403);
		const person = await j.gate(c, "viewer", "bookings");
		if (person instanceof Response) return person;
		const id = Id.safeParse((await formOf(c)).id);
		if (!id.success) return c.body(null, 404);
		const token = await tokenOf(c, person);
		if (token === null) return renew(c, path("bookings"));
		const rows = await own(c, person, token, "editor");
		if (typeof rows === "string") return refused(c, rows, path("bookings"));
		if (!rows.some((r) => r.id === id.data)) return c.body(null, 404);
		const done = await port.cancel(token, id.data);
		return done === "ok"
			? c.redirect(`${path("bookings")}?ok=cancelled`, 303)
			: refused(c, done, path("bookings"));
	});

	const moving = (id: string) => path("bookings", `/${encodeURIComponent(id)}/muta`);

	app.get(path("bookings", "/:id/muta"), async (c) => {
		c.header("cache-control", PRIVATE["cache-control"]);
		const person = await j.gate(c, "viewer", "bookings");
		if (person instanceof Response) return person;
		const id = Id.safeParse(c.req.param("id"));
		if (!id.success) return c.body(null, 404);
		const token = await tokenOf(c, person);
		if (token === null) return renew(c, moving(id.data));
		const rows = await own(c, person, token, "editor");
		if (typeof rows === "string") return refused(c, rows, moving(id.data));
		if (c.req.query("fresh") === "1") return c.redirect(moving(id.data), 303);
		const booking = rows.find((r) => r.id === id.data);
		if (booking === undefined) return c.body(null, 404);
		if (!booking.canMove) return refused(c, "too_late", moving(id.data));
		const from = now();
		const times = await port.freeTimes(token, booking, from, from + MOVE_WINDOW_DAYS * DAY);
		if (typeof times === "string") return refused(c, times, moving(id.data));
		return j.page(
			c,
			person,
			"bookings",
			"account_bookings_move_title",
			<MoveBody
				say={say}
				base={o.base}
				locale={o.locale}
				booking={booking}
				times={times}
				taken={c.req.query("taken") === "1"}
			/>,
		);
	});

	app.post(path("bookings", "/:id/muta"), async (c) => {
		if (j.foreign(c)) return c.body(null, 403);
		const person = await j.gate(c, "viewer", "bookings");
		if (person instanceof Response) return person;
		const id = Id.safeParse(c.req.param("id"));
		if (!id.success) return c.body(null, 404);
		const form = MoveForm.safeParse(await formOf(c));
		if (!form.success) return c.redirect(`${moving(id.data)}?taken=1`, 303);
		const token = await tokenOf(c, person);
		if (token === null) return renew(c, moving(id.data));
		const rows = await own(c, person, token, "editor");
		if (typeof rows === "string") return refused(c, rows, moving(id.data));
		if (!rows.some((r) => r.id === id.data)) return c.body(null, 404);
		const done = await port.reschedule(token, id.data, form.data.start, form.data.mode);
		return done === "ok"
			? c.redirect(`${path("bookings")}?ok=moved`, 303)
			: refused(c, done, moving(id.data));
	});
}
