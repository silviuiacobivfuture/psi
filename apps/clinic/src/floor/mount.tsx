import { EmptyState } from "@psi/ui/admin";
import {
	FLOOR_PLAN_LABELS,
	FloorPlan,
	type FloorPlanPort,
	floorPlanRoutes,
	loadLiveData,
} from "@psi/ui/admin/floor-plan";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { hhmm } from "../lib/dates";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import { wallOf } from "../port/sdk/time";
import { devicesOf, liveSource, roomsOf } from "./live-data";

/** Where the plan's own routes (render, save, the live feed) are mounted. */
export const FLOOR_API = "/floor/api";
const PLAN_ID = "plan";

/** The plan as the port keeps it, for this person's app. */
function planPort(ctx: Ctx): FloorPlanPort {
	return {
		load: async () => (await ctx.port.floorPlan(ctx.app)).doc,
		save: async (doc) => ctx.port.saveFloorPlan(ctx.app, doc),
	};
}

/** Whether this person may draw: settings rights, not just looking as someone else, and a port that can keep the plan. */
async function mayDraw(ctx: Ctx): Promise<boolean> {
	if (!ctx.can.write("app_settings_edit")) return false;
	try {
		return (await ctx.port.floorPlan(ctx.app)).writable;
	} catch {
		return false;
	}
}

function routesFor(ctx: Ctx): Hono {
	return floorPlanRoutes({
		port: planPort(ctx),
		rooms: () => roomsOf(ctx),
		devices: () => devicesOf(ctx),
		live: liveSource(ctx),
		authorize: async (_c, need) => {
			if (need === "settings") return mayDraw(ctx);
			if (need === "calendar") return ctx.can.has("calendar_view");
			return ctx.can.has("clients_view");
		},
		labels: FLOOR_PLAN_LABELS[ctx.locale],
		locale: ctx.locale,
		timeZone: ctx.caps.timeZone,
		now: Date.now,
		endpoint: FLOOR_API,
		id: PLAN_ID,
		newBookingHref: (roomId, when) => {
			const wall = wallOf(when, ctx.caps.timeZone);
			return `/calendar?new=1&date=${wall.date}&time=${hhmm(wall.minutes)}&col=${encodeURIComponent(roomId)}`;
		},
	});
}

/** The instant the live view opens at: now, or today's `?at=HH:MM`. */
function openAt(ctx: Ctx, requested: string | undefined): number {
	const now = Date.now();
	const match = /^(\d{2}):(\d{2})$/.exec(requested ?? "");
	if (match === null) return now;
	const wall = wallOf(now, ctx.caps.timeZone);
	return now - (wall.minutes - (Number(match[1]) * 60 + Number(match[2]))) * 60_000;
}

function SoonState({ ctx }: { ctx: Ctx }): JSX.Element {
	const o = at(ctx.locale);
	return <EmptyState icon="clock" title={m.soon_title({}, o)} text={m.soon_text({}, o)} />;
}

/** The live view: who is in which room now, a day scrubber, the week's heat. */
export async function renderFloor(ctx: Ctx, requestedAt: string | undefined): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const draw = await mayDraw(ctx);
	let body: JSX.Element;
	try {
		const [{ doc }, rooms, devices] = await Promise.all([
			ctx.port.floorPlan(ctx.app),
			roomsOf(ctx),
			devicesOf(ctx),
		]);
		const when = openAt(ctx, requestedAt);
		const data = await loadLiveData(liveSource(ctx), when, ctx.caps.timeZone);
		const drawn = doc.floors.some((f) => f.shapes.length > 0);
		body = drawn ? (
			<FloorPlan
				id={PLAN_ID}
				mode="live"
				doc={doc}
				labels={FLOOR_PLAN_LABELS[ctx.locale]}
				locale={ctx.locale}
				rooms={rooms}
				devices={devices}
				endpoint={FLOOR_API}
				modeLinks={{ ...(draw ? { draw: "/settings/plan" } : {}), live: "/floor" }}
				live={{
					data,
					at: when,
					now: Date.now(),
					viewer: { seeClients: ctx.can.has("clients_view") },
					heat: false,
					timeZone: ctx.caps.timeZone,
					newBookingHref: (roomId, t) => {
						const wall = wallOf(t, ctx.caps.timeZone);
						return `/calendar?new=1&date=${wall.date}&time=${hhmm(wall.minutes)}&col=${encodeURIComponent(roomId)}`;
					},
				}}
			/>
		) : (
			<EmptyState
				icon="sidebar"
				title={m.floor_empty_title({}, o)}
				text={m.floor_empty_text({}, o)}
			>
				{draw ? (
					<a class="adm-btn adm-btn--primary" href="/settings/plan">
						{m.floor_draw({}, o)}
					</a>
				) : null}
			</EmptyState>
		);
	} catch (error) {
		if (!(error instanceof PortError) || error.code !== "not-available-yet") throw error;
		body = <SoonState ctx={ctx} />;
	}
	return Page({
		ctx,
		current: "floor",
		wide: true,
		title: m.nav_floor({}, o),
		children: <div class="adm-page">{body}</div>,
	});
}

/** Draw mode, as the body of the Settings "Plan cabinete" tab. */
export async function drawBody(ctx: Ctx): Promise<JSX.Element> {
	if (ctx.can.readOnly)
		return (
			<EmptyState
				icon="shield"
				title={m.forbidden_title({}, at(ctx.locale))}
				text={m.view_as_readonly({}, at(ctx.locale))}
			/>
		);
	if (!(await mayDraw(ctx))) return <SoonState ctx={ctx} />;
	const [{ doc }, rooms, devices] = await Promise.all([
		ctx.port.floorPlan(ctx.app),
		roomsOf(ctx),
		devicesOf(ctx),
	]);
	return (
		<FloorPlan
			id={PLAN_ID}
			mode="draw"
			doc={doc}
			labels={FLOOR_PLAN_LABELS[ctx.locale]}
			locale={ctx.locale}
			rooms={rooms}
			devices={devices}
			endpoint={FLOOR_API}
			modeLinks={{ draw: "/settings/plan", live: "/floor" }}
		/>
	);
}

export function registerFloor(app: Hono<Env>): void {
	app.get("/floor", async (c) =>
		c.html(await renderFloor(c.var.ctx, c.req.query("at")), 200, {
			"cache-control": "private, no-store",
		}),
	);
	// The plan's own routes answer for this request's person: built per request, since the port acts as them.
	app.all(`${FLOOR_API}/*`, async (c) => {
		const url = new URL(c.req.url);
		url.pathname = url.pathname.slice(FLOOR_API.length) || "/";
		const body = c.req.method === "GET" || c.req.method === "HEAD" ? undefined : await c.req.text();
		return routesFor(c.var.ctx).fetch(
			new Request(url, { method: c.req.method, headers: c.req.raw.headers, body }),
		);
	});
}
