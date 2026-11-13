/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import {
	areaSquareMetres,
	type Bounds,
	boundsOfShape,
	centroidOf,
	cornersOf,
	HANDLES,
	handlePosition,
	isArea,
	unionBounds,
} from "./geometry";
import { DeviceGlyph, StateGlyph } from "./glyphs";
import { type FloorPlanLabels, say } from "./labels";
import type { DeviceState, RoomLive } from "./live";
import type { LiveRoom } from "./live-types";
import type { AreaShape, Floor, FloorPlanDoc, PlanIssue, PointShape, Shape } from "./schema";
import { clockOf } from "./zone";

export const SCENE_IDS = { shapes: "fp-shapes", overlay: "fp-overlay" } as const;

export interface LiveScene {
	timeZone: string;
	rooms: ReadonlyMap<string, LiveRoom>;
	state: ReadonlyMap<string, RoomLive>;
	devices: ReadonlyMap<string, DeviceState>;
	/** Heat level 0 to 4 per room when the heatmap is on. */
	heat?: ReadonlyMap<string, number>;
	selectedRoomId?: string;
}

export interface StoreRoomInfo {
	id: string;
	name: string;
	capacity: number;
}

export interface SceneProps {
	floor: Floor;
	doc: FloorPlanDoc;
	labels: FloorPlanLabels;
	mode: "draw" | "live";
	rooms: ReadonlyMap<string, StoreRoomInfo>;
	selection: ReadonlySet<string>;
	issues: ReadonlyArray<PlanIssue>;
	live?: LiveScene;
}

/** Plan margin around the drawing's content, in units. */
export const CONTENT_MARGIN = 14;

export function contentBounds(floor: Floor): Bounds {
	const b = unionBounds(floor.shapes.map(boundsOfShape));
	return b ?? { x: 0, y: 0, w: 120, h: 80 };
}

function fitSize(text: string, width: number, max: number, min: number): number {
	const wanted = text.length * 0.56;
	return Math.max(min, Math.min(max, wanted === 0 ? max : (width - 3) / wanted));
}

function pathOf(s: AreaShape): string {
	const pts = cornersOf(s.geometry);
	return `${pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")} Z`;
}

function spaceName(s: Extract<Shape, { kind: "space" }>, labels: FloorPlanLabels): string {
	if (s.label !== "") return s.label;
	const map = {
		reception: labels.spaceReception,
		waiting: labels.spaceWaiting,
		corridor: labels.spaceCorridor,
		wc: labels.spaceWc,
		storage: labels.spaceStorage,
		other: labels.spaceOther,
	} as const;
	return map[s.spaceType];
}

export function deviceName(s: Extract<Shape, { kind: "device" }>, labels: FloorPlanLabels): string {
	if (s.label !== "") return s.label;
	const map = {
		"nfb-amplifier": labels.deviceNfb,
		"hemisync-headphones": labels.deviceHemisync,
		"therapy-mat": labels.deviceMat,
		other: labels.deviceOther,
	} as const;
	return map[s.deviceType];
}

function stateText(live: RoomLive, tz: string, labels: FloorPlanLabels): string {
	switch (live.state) {
		case "free":
			return live.nextStart === undefined
				? labels.stateFree
				: `${labels.stateFree} · ${say(labels, "freeUntil", { time: clockOf(live.nextStart, tz) })}`;
		case "booked": {
			const until =
				live.changesAt === undefined
					? ""
					: ` · ${say(labels, "until", { time: clockOf(live.changesAt, tz) })}`;
			return `${labels.stateBooked}${until}`;
		}
		case "closed":
			return live.changesAt === undefined
				? labels.stateClosed
				: say(labels, "closedUntil", { time: clockOf(live.changesAt, tz) });
		case "conflict":
			return labels.stateConflict;
		default: {
			const never: never = live.state;
			return never;
		}
	}
}

/** Who is in the room, as the plan prints it: the practitioner's monogram, and the client's initials only when the data has them. */
function whoText(live: RoomLive): string {
	return live.active
		.map((b) =>
			b.clientInitials && b.clientInitials.length > 0
				? `${b.monogram} · ${b.clientInitials.join(" ")}`
				: b.monogram,
		)
		.join(" / ");
}

export function roomAriaLabel(
	name: string,
	live: RoomLive,
	tz: string,
	labels: FloorPlanLabels,
): string {
	const who = whoText(live);
	return `${name}, ${stateText(live, tz, labels)}${who === "" ? "" : `, ${who}`}`;
}

function AreaView(p: SceneProps & { shape: AreaShape }): JSX.Element {
	const { shape, labels, mode, live, rooms } = p;
	const b = boundsOfShape(shape);
	const centre = centroidOf(shape.geometry);
	const c = shape.geometry.type === "rect" && b.h >= 30 ? { x: centre.x, y: b.y + 11 } : centre;
	const store =
		shape.kind === "room" && shape.roomId !== undefined ? rooms.get(shape.roomId) : undefined;
	const liveRoom =
		shape.kind === "room" && shape.roomId !== undefined ? live?.rooms.get(shape.roomId) : undefined;
	const roomLive =
		shape.kind === "room" && shape.roomId !== undefined ? live?.state.get(shape.roomId) : undefined;
	const name =
		shape.kind === "space"
			? spaceName(shape, labels)
			: (liveRoom?.name ?? store?.name ?? (shape.label || labels.unlinkedRoom));
	const selected = p.selection.has(shape.id);
	const heat =
		shape.kind === "room" && shape.roomId !== undefined ? live?.heat?.get(shape.roomId) : undefined;
	const interactive = mode === "live" && roomLive !== undefined && liveRoom !== undefined;
	const nameSize = fitSize(name, b.w, 5, 2.8);
	const tall = b.h >= 16;
	const lines: string[] = [];
	if (mode === "live" && roomLive !== undefined && live !== undefined) {
		lines.push(stateText(roomLive, live.timeZone, labels));
		const who = whoText(roomLive);
		if (who !== "") lines.push(who);
	} else if (shape.kind === "room") {
		const parts = [
			store ? say(labels, "capacity", { n: store.capacity }) : labels.unlinkedRoom,
			say(labels, "area", { n: areaSquareMetres(shape.geometry).toFixed(1) }),
		];
		lines.push(parts.join(" · "));
	} else {
		lines.push(labels.nonBookable);
	}
	const shown = tall ? lines : lines.slice(0, 1);
	const topY = c.y - ((shown.length - 1) * 4.4) / 2 - 1.2;
	const state = roomLive?.state;
	const classes = cx(
		"pz-fp__area",
		shape.kind === "space" ? "pz-fp__area--space" : "pz-fp__area--room",
		selected && "is-selected",
		state && `is-${state}`,
		heat !== undefined && `has-heat`,
		live?.selectedRoomId !== undefined &&
			live.selectedRoomId === (shape.kind === "room" ? shape.roomId : undefined) &&
			"is-open",
	);
	const body = (
		<>
			<path d={pathOf(shape)} class="pz-fp__fill" data-heat={heat} fill-rule="evenodd" />
			<path d={pathOf(shape)} class="pz-fp__texture" />
			<path d={pathOf(shape)} class="pz-fp__wall" />
			{state ? (
				<g
					transform={`translate(${b.x + 3.5} ${b.y + 3.5})`}
					class={`pz-fp__state pz-fp__state--${state}`}
				>
					<StateGlyph state={state} />
				</g>
			) : null}
			<text
				x={c.x}
				y={topY}
				text-anchor="middle"
				class="pz-fp__name"
				style={`font-size:${nameSize}px`}
			>
				{name}
			</text>
			{shown.map((line, i) => (
				<text
					x={c.x}
					y={topY + 4.6 + i * 4.2}
					text-anchor="middle"
					class="pz-fp__sub"
					style={`font-size:${fitSize(line, b.w, 3.4, 2.4)}px`}
				>
					{line}
				</text>
			))}
		</>
	);
	if (interactive && roomLive !== undefined && live !== undefined && shape.kind === "room") {
		return (
			// biome-ignore lint/a11y/useSemanticElements: an SVG group cannot be a <button>; the room is a focusable, keyboard-operable button role
			<g
				id={`fp-s-${shape.id}`}
				class={classes}
				data-shape-id={shape.id}
				data-room-id={shape.roomId}
				data-state={state}
				role="button"
				tabindex={0}
				aria-label={roomAriaLabel(name, roomLive, live.timeZone, labels)}
				aria-haspopup="dialog"
			>
				{body}
			</g>
		);
	}
	return (
		<g id={`fp-s-${shape.id}`} class={classes} data-shape-id={shape.id}>
			{body}
		</g>
	);
}

function OpeningView({
	shape,
	floor,
}: {
	shape: Extract<Shape, { kind: "door" | "window" }>;
	floor: Floor;
}): JSX.Element {
	void floor;
	const L = shape.length;
	const h = L / 2;
	const transform = `translate(${shape.at.x} ${shape.at.y}) rotate(${shape.rotation})`;
	if (shape.kind === "window") {
		return (
			<g class="pz-fp__opening pz-fp__window" data-shape-id={shape.id} transform={transform}>
				<rect x={-h} y="-1.3" width={L} height="2.6" class="pz-fp__gap" />
				<path d={`M${-h} -0.9 H${h} M${-h} 0.9 H${h}`} class="pz-fp__window-line" />
				<path d={`M${-h} 0 H${h}`} class="pz-fp__window-glass" />
			</g>
		);
	}
	const mirror = shape.swing === "right" ? "scale(-1 1)" : undefined;
	return (
		<g class="pz-fp__opening pz-fp__door" data-shape-id={shape.id} transform={transform}>
			<rect x={-h} y="-1.3" width={L} height="2.6" class="pz-fp__gap" />
			<g transform={mirror}>
				<path d={`M${-h} 0 V${-L}`} class="pz-fp__leaf" />
				<path d={`M${h} 0 A${L} ${L} 0 0 0 ${-h} ${-L}`} class="pz-fp__swing" />
			</g>
		</g>
	);
}

function DeviceView({
	shape,
	p,
}: {
	shape: Extract<Shape, { kind: "device" }>;
	p: SceneProps;
}): JSX.Element {
	const state = shape.deviceId !== undefined ? p.live?.devices.get(shape.deviceId) : undefined;
	const name = deviceName(shape, p.labels);
	const text =
		state === undefined
			? name
			: `${name}, ${state === "in-use" ? p.labels.deviceInUse : p.labels.deviceFree}`;
	return (
		<g
			class={cx(
				"pz-fp__device",
				state === "in-use" && "is-use",
				p.selection.has(shape.id) && "is-selected",
			)}
			data-shape-id={shape.id}
			transform={`translate(${shape.at.x} ${shape.at.y}) rotate(${shape.rotation})`}
		>
			<title>{text}</title>
			<circle r="4.6" class="pz-fp__device-disc" />
			<DeviceGlyph type={shape.deviceType} />
		</g>
	);
}

function Handles({ shape, doc }: { shape: Shape; doc: FloorPlanDoc }): JSX.Element | null {
	void doc;
	if (isArea(shape) && shape.geometry.type === "rect") {
		const g = shape.geometry;
		return (
			<g data-for={shape.id}>
				{HANDLES.map((h) => {
					const pos = handlePosition(g, h);
					return (
						<g
							class="pz-fp__handle"
							data-handle={h}
							data-for={shape.id}
							transform={`translate(${pos.x} ${pos.y})`}
						>
							<rect class="pz-fp__handle-hit" x="-0.5" y="-0.5" width="1" height="1" />
							<rect class="pz-fp__handle-dot" x="-0.5" y="-0.5" width="1" height="1" />
						</g>
					);
				})}
			</g>
		);
	}
	if (isArea(shape) && shape.geometry.type === "polygon") {
		return (
			<g data-for={shape.id}>
				{shape.geometry.points.map((pt, i) => (
					<g
						class="pz-fp__handle"
						data-vertex={i}
						data-for={shape.id}
						transform={`translate(${pt.x} ${pt.y})`}
					>
						<rect class="pz-fp__handle-hit" x="-0.5" y="-0.5" width="1" height="1" />
						<rect class="pz-fp__handle-dot" x="-0.5" y="-0.5" width="1" height="1" />
					</g>
				))}
			</g>
		);
	}
	const point = shape as PointShape;
	const b = boundsOfShape(point);
	return (
		<rect
			class="pz-fp__ring"
			x={b.x - 1.5}
			y={b.y - 1.5}
			width={b.w + 3}
			height={b.h + 3}
			data-for={shape.id}
		/>
	);
}

/** North arrow and scale bar, in plan units next to the drawing so they scale with it. */
function Chrome({
	floor,
	doc,
	labels,
}: {
	floor: Floor;
	doc: FloorPlanDoc;
	labels: FloorPlanLabels;
}): JSX.Element {
	const b = contentBounds(floor);
	const nx = b.x + b.w + 6;
	const ny = b.y + 8;
	const sy = b.y + b.h + 8;
	return (
		<g class="pz-fp__chrome">
			<g transform={`translate(${nx} ${ny}) rotate(${doc.northDeg})`}>
				<title>{labels.northArrow}</title>
				<circle r="5.2" class="pz-fp__north-ring" />
				<path d="M0 -4.2 L2.2 2.6 L0 1.2 L-2.2 2.6 Z" class="pz-fp__north-arrow" />
				<text y="-6.8" text-anchor="middle" class="pz-fp__north-n">
					N
				</text>
			</g>
			<g transform={`translate(${b.x} ${sy})`}>
				<title>{`${labels.scaleBar}: 5 m`}</title>
				<path
					d="M0 0 H50 M0 -1.6 V1.6 M10 -1 V1 M20 -1 V1 M30 -1 V1 M40 -1 V1 M50 -1.6 V1.6"
					class="pz-fp__scale"
				/>
				<text x="0" y="5" class="pz-fp__scale-text">
					0
				</text>
				<text x="50" y="5" text-anchor="middle" class="pz-fp__scale-text">
					5 m
				</text>
			</g>
		</g>
	);
}

/** The plan's drawn layer: areas, then openings, then devices; the chrome (north, scale) last. */
export function ShapesLayer(p: SceneProps): JSX.Element {
	const areas = p.floor.shapes.filter(isArea);
	return (
		<g id={SCENE_IDS.shapes}>
			{areas.map((shape) => (
				<AreaView {...p} shape={shape} />
			))}
			{p.floor.shapes.map((s) =>
				s.kind === "window" || s.kind === "door" ? <OpeningView shape={s} floor={p.floor} /> : null,
			)}
			{p.floor.shapes.map((s) => (s.kind === "device" ? <DeviceView shape={s} p={p} /> : null))}
			<Chrome floor={p.floor} doc={p.doc} labels={p.labels} />
		</g>
	);
}

/** Selection handles (draw mode only). */
export function OverlayLayer(p: SceneProps): JSX.Element {
	const picked = p.mode === "draw" ? p.floor.shapes.filter((s) => p.selection.has(s.id)) : [];
	return (
		<g id={SCENE_IDS.overlay}>
			{picked.map((s) => (
				<Handles shape={s} doc={p.doc} />
			))}
		</g>
	);
}

export function Defs(): JSX.Element {
	return (
		<defs>
			<pattern id="fp-grid-minor" width="10" height="10" patternUnits="userSpaceOnUse">
				<path d="M10 0 H0 V10" class="pz-fp__grid-line" />
			</pattern>
			<pattern id="fp-grid-major" width="50" height="50" patternUnits="userSpaceOnUse">
				<rect width="50" height="50" fill="url(#fp-grid-minor)" />
				<path d="M50 0 H0 V50" class="pz-fp__grid-major" />
			</pattern>
			<pattern
				id="fp-hatch"
				width="3"
				height="3"
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(45)"
			>
				<path d="M0 0 V3" class="pz-fp__hatch-line" />
			</pattern>
			<pattern
				id="fp-hatch-alert"
				width="2.4"
				height="2.4"
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(-45)"
			>
				<path d="M0 0 V2.4" class="pz-fp__hatch-alert" />
			</pattern>
			<pattern id="fp-hatch-closed" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
				<path d="M0 0 L3.2 3.2 M3.2 0 L0 3.2" class="pz-fp__hatch-closed" />
			</pattern>
		</defs>
	);
}
