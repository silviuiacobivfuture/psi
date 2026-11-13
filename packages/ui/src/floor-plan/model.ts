import type { JSX } from "hono/jsx/jsx-runtime";
import { planIssues } from "./issues";
import type { FloorPlanLabels } from "./labels";
import { snapshotAt, weekHeat } from "./live";
import type { LiveData, Viewer } from "./live-types";
import type { LiveScene, SceneProps, StoreRoomInfo } from "./scene";
import type { Floor, FloorPlanDoc } from "./schema";
import { addDays, dateOf, dayRange, dayStart, MINUTE, mondayOf } from "./zone";

export const SCRUB_STEP = 5 * MINUTE;

export interface LivePart {
	data: LiveData;
	/** The instant shown (epoch ms); clamped into its day and to five minutes. */
	at: number;
	now: number;
	viewer: Viewer;
	heat: boolean;
	timeZone: string;
	openRoomId?: string;
	/** Where "new booking here" goes (the console's booking form), given the room and the instant. */
	newBookingHref: (roomId: string, at: number) => string;
}

export interface FloorPlanProps {
	/** A prefix for every id inside, so two plans on one page never clash. */
	id: string;
	mode: "draw" | "live";
	doc: FloorPlanDoc;
	floorId?: string;
	labels: FloorPlanLabels;
	locale: "ro" | "en";
	rooms: ReadonlyArray<StoreRoomInfo>;
	devices?: ReadonlyArray<{ id: string; name: string }>;
	/** Where the routes of `floorPlanRoutes` are mounted, e.g. "/floor". */
	endpoint: string;
	selection?: ReadonlySet<string>;
	live?: LivePart;
	/** Links between the two modes, for people who hold both permissions. */
	modeLinks?: { draw?: string; live?: string };
	/**
	 * The plan as a full-viewport canvas: it fills the space it is given, with its toolbars floating over it, the side
	 * panel as an overlay (a bottom sheet on a phone), the zoom in a corner and an "Ecran complet" toggle. Without it the
	 * plan is a block in a page, as before.
	 */
	canvas?: boolean;
	/** Canvas only: a link or two kept beside the mode switch (the way back to Settings). */
	extra?: JSX.Element;
}

export function snapInstant(at: number, timeZone: string): number {
	const { start, end } = dayRange(dateOf(at, timeZone), timeZone);
	const snapped = start + Math.round((at - start) / SCRUB_STEP) * SCRUB_STEP;
	return Math.max(start, Math.min(end - SCRUB_STEP, snapped));
}

export function floorOf(doc: FloorPlanDoc, id: string | undefined): Floor {
	return (
		doc.floors.find((f) => f.id === id) ?? doc.floors[0] ?? { id: "none", name: "", shapes: [] }
	);
}

export function liveSceneOf(p: LivePart): LiveScene {
	const at = snapInstant(p.at, p.timeZone);
	const snap = snapshotAt(p.data, at, p.now, p.viewer);
	const week = mondayOf(dateOf(at, p.timeZone));
	const heat = p.heat
		? new Map(
				weekHeat(
					p.data,
					dayStart(week, p.timeZone),
					dayStart(addDays(week, 7), p.timeZone),
					p.now,
				).map((h) => [h.roomId, h.level]),
			)
		: undefined;
	return {
		timeZone: p.timeZone,
		rooms: new Map(p.data.rooms.map((r) => [r.id, r])),
		state: snap.rooms,
		devices: snap.devices,
		...(heat ? { heat } : {}),
		...(p.openRoomId ? { selectedRoomId: p.openRoomId } : {}),
	};
}

export function sceneProps(p: FloorPlanProps): SceneProps {
	const rooms = new Map(p.rooms.map((r) => [r.id, r]));
	return {
		floor: floorOf(p.doc, p.floorId),
		doc: p.doc,
		labels: p.labels,
		mode: p.mode,
		rooms,
		selection: p.selection ?? new Set(),
		issues: p.mode === "draw" ? planIssues(p.doc, p.rooms) : [],
		...(p.live ? { live: liveSceneOf(p.live) } : {}),
	};
}
