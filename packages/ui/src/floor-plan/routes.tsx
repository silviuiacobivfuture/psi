/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import {
	DrawPieces,
	FloorPlan,
	type FloorPlanProps,
	type LivePart,
	LivePieces,
	Scrubber,
	sceneProps,
	snapInstant,
	TimeLabel,
} from "./floor-plan";
import { hasBlockingIssue, planIssues } from "./issues";
import type { FloorPlanLabels } from "./labels";
import { type LiveData, LiveDataSchema, type Viewer } from "./live-types";
import type { FloorPlanPort } from "./port";
import { OverlayLayer, ShapesLayer, type StoreRoomInfo } from "./scene";
import { type FloorPlanDoc, parsePlan } from "./schema";
import { addDays, dateOf, dayRange, dayStart, mondayOf } from "./zone";

/** What a request may do. `settings` draws and saves; `calendar` watches live; `clients` shows clients' initials. */
export type Need = "settings" | "calendar" | "clients";

/** The bookings, closures and devices the live view needs, and a way to hear that they changed. */
export interface LiveSource {
	load(range: { from: number; until: number }): Promise<LiveData>;
	/** Calls `listener` whenever bookings, closures or devices change; returns the way to stop. */
	subscribe(listener: () => void): () => void;
}

export interface FloorPlanRoutesOptions {
	port: FloorPlanPort;
	rooms: () => Promise<ReadonlyArray<StoreRoomInfo>>;
	devices?: () => Promise<ReadonlyArray<{ id: string; name: string }>>;
	live: LiveSource;
	authorize: (c: Context, need: Need) => boolean | Promise<boolean>;
	labels: FloorPlanLabels;
	locale: "ro" | "en";
	timeZone: string;
	now: () => number;
	/** Where these routes are mounted ("/floor"): the page's attributes post here. */
	endpoint: string;
	/** The `id` the page gives `FloorPlan`. */
	id: string;
	newBookingHref: (roomId: string, at: number) => string;
}

const DrawSignals = z.object({ fpDoc: z.string(), fpSel: z.string(), fpFloor: z.string() });
const LiveSignals = z.object({
	fpAt: z.number(),
	fpHeat: z.boolean(),
	fpRoom: z.string(),
	fpFloor: z.string(),
	fpShift: z.number().int().default(0),
	fpJump: z.boolean().default(false),
});

async function signalsOf(c: Context): Promise<unknown> {
	if (c.req.method === "GET") {
		const raw = c.req.query("datastar");
		return raw === undefined ? {} : JSON.parse(raw);
	}
	return c.req.json();
}

/** Loads the week around `at` (the heatmap needs it) as the live view's data, parsed at the boundary. */
export async function loadLiveData(
	source: LiveSource,
	at: number,
	timeZone: string,
): Promise<LiveData> {
	const week = mondayOf(dateOf(at, timeZone));
	const data = await source.load({
		from: dayStart(week, timeZone),
		until: dayStart(addDays(week, 7), timeZone),
	});
	return LiveDataSchema.parse(data);
}

async function html(el: unknown): Promise<string> {
	const s = await (el as { toString(): string | Promise<string> }).toString();
	return s.replace(/\n/g, " ");
}

type Writer = { writeSSE(m: { event: string; data: string }): Promise<void> };
const patch = async (w: Writer, el: unknown, svg = false): Promise<void> =>
	w.writeSSE({
		event: "datastar-patch-elements",
		// An SVG fragment must be parsed in the SVG namespace, or its <g> and <path> become unknown HTML elements.
		data: `${svg ? "namespace svg\n" : ""}elements ${await html(el)}`,
	});
const patchSignals = async (w: Writer, signals: Record<string, unknown>): Promise<void> =>
	w.writeSSE({ event: "datastar-patch-signals", data: `signals ${JSON.stringify(signals)}` });

export function floorPlanRoutes(o: FloorPlanRoutesOptions): Hono {
	const app = new Hono();
	const base = (doc: FloorPlanDoc, floorId: string, mode: "draw" | "live"): FloorPlanProps => ({
		id: o.id,
		mode,
		doc,
		floorId,
		labels: o.labels,
		locale: o.locale,
		rooms: [],
		endpoint: o.endpoint,
	});

	const refuse = (c: Context): Response => c.text("forbidden", 403);

	app.post("/draw/render", async (c) => {
		if (!(await o.authorize(c, "settings"))) return refuse(c);
		const sig = DrawSignals.safeParse(await signalsOf(c));
		const rooms = await o.rooms();
		const devices = (await o.devices?.()) ?? [];
		return streamSSE(c, async (w) => {
			const parsed = sig.success ? parsePlan(safeJson(sig.data.fpDoc)) : undefined;
			if (!sig.success || !parsed?.success) {
				return patch(
					w,
					<p id={`${o.id}-status`} class="pz-fp__status pz-fp__status--error" role="status">
						{o.labels.saveInvalid}
					</p>,
				);
			}
			const props: FloorPlanProps = {
				...base(parsed.data, sig.data.fpFloor, "draw"),
				rooms,
				devices,
				selection: new Set(sig.data.fpSel.split(",").filter(Boolean)),
			};
			const sp = sceneProps(props);
			const pieces = DrawPieces(props, o.labels.unsaved);
			await patch(w, <ShapesLayer {...sp} />, true);
			await patch(w, <OverlayLayer {...sp} />, true);
			await patch(w, pieces.inspector);
			await patch(w, pieces.list);
			await patch(w, pieces.status);
		});
	});

	app.post("/draw/save", async (c) => {
		if (!(await o.authorize(c, "settings"))) return refuse(c);
		const sig = DrawSignals.safeParse(await signalsOf(c));
		const rooms = await o.rooms();
		return streamSSE(c, async (w) => {
			const status = async (text: string, kind: "ok" | "error", rev?: number): Promise<void> =>
				patch(
					w,
					<p
						id={`${o.id}-status`}
						class={`pz-fp__status pz-fp__status--${kind}`}
						role="status"
						data-fp-rev={rev}
					>
						{text}
					</p>,
				);
			const parsed = sig.success ? parsePlan(safeJson(sig.data.fpDoc)) : undefined;
			if (!parsed?.success) return status(o.labels.saveInvalid, "error");
			if (hasBlockingIssue(planIssues(parsed.data, rooms)))
				return status(o.labels.saveUnknownRoom, "error");
			const result = await o.port.save(parsed.data);
			if (result.ok)
				return status(
					o.labels.saved.replace("{n}", String(result.doc.revision)),
					"ok",
					result.doc.revision,
				);
			return status(result.reason === "stale" ? o.labels.saveStale : o.labels.saveInvalid, "error");
		});
	});

	app.post("/live/render", async (c) => {
		if (!(await o.authorize(c, "calendar"))) return refuse(c);
		const sig = LiveSignals.safeParse(await signalsOf(c));
		if (!sig.success) return c.text("bad signals", 400);
		const viewer: Viewer = { seeClients: await o.authorize(c, "clients") };
		const doc = await o.port.load();
		const rooms = await o.rooms();
		const s = sig.data;
		const now = o.now();
		let at = snapInstant(s.fpAt, o.timeZone);
		if (s.fpShift !== 0) {
			const from = dayStart(dateOf(at, o.timeZone), o.timeZone);
			const day = addDays(dateOf(at, o.timeZone), s.fpShift);
			const range = dayRange(day, o.timeZone);
			at = snapInstant(
				Math.min(range.end - 1, dayStart(day, o.timeZone) + (at - from)),
				o.timeZone,
			);
		}
		const data = await loadLiveData(o.live, at, o.timeZone);
		const live: LivePart = {
			data,
			at,
			now,
			viewer,
			heat: s.fpHeat,
			timeZone: o.timeZone,
			...(s.fpRoom === "" ? {} : { openRoomId: s.fpRoom }),
			newBookingHref: o.newBookingHref,
		};
		const props: FloorPlanProps = { ...base(doc, s.fpFloor, "live"), rooms, live };
		const sp = sceneProps(props);
		const pieces = LivePieces({ ...props, live });
		return streamSSE(c, async (w) => {
			await patch(w, <ShapesLayer {...sp} />, true);
			await patch(w, pieces.list);
			await patch(w, pieces.sheet);
			await patch(w, pieces.status);
			await patch(w, <TimeLabel id={o.id} live={live} locale={o.locale} labels={o.labels} />);
			if (s.fpJump) {
				await patchSignals(w, { fpAt: at });
				await patch(w, <Scrubber id={o.id} live={live} endpoint={o.endpoint} labels={o.labels} />);
			}
		});
	});

	app.get("/live/stream", async (c) => {
		if (!(await o.authorize(c, "calendar"))) return refuse(c);
		return streamSSE(c, async (w) => {
			let tick = 0;
			const open = new Promise<void>((resolve) => w.onAbort(resolve));
			const stop = o.live.subscribe(() => {
				tick += 1;
				void patchSignals(w, { fpTick: tick }).catch(() => undefined);
			});
			const beat = setInterval(
				() =>
					void w
						.writeSSE({ event: "datastar-patch-signals", data: "signals {}" })
						.catch(() => undefined),
				25_000,
			);
			await open;
			clearInterval(beat);
			stop();
		});
	});

	return app;
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

export { FloorPlan };
