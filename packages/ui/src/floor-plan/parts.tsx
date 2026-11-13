/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { findShape } from "./edit";
import { areaSquareMetres, boundsOfShape, isArea } from "./geometry";
import { type FloorPlanLabels, type LabelKey, say } from "./labels";
import { type RoomLive, roomDay } from "./live";
import type { LiveBooking, LiveRoom } from "./live-types";
import { deviceName, type LiveScene, type SceneProps, type StoreRoomInfo } from "./scene";
import { DEVICE_TYPES, type FloorPlanDoc, type PlanIssue, type Shape, SPACE_TYPES } from "./schema";
import { clockOf } from "./zone";

const UNITS = 10;
const metres = (units: number): string => (units / UNITS).toFixed(1);

const DEVICE_LABEL: Readonly<Record<(typeof DEVICE_TYPES)[number], LabelKey>> = {
	"nfb-amplifier": "deviceNfb",
	"hemisync-headphones": "deviceHemisync",
	"therapy-mat": "deviceMat",
	other: "deviceOther",
};
const SPACE_LABEL: Readonly<Record<(typeof SPACE_TYPES)[number], LabelKey>> = {
	reception: "spaceReception",
	waiting: "spaceWaiting",
	corridor: "spaceCorridor",
	wc: "spaceWc",
	storage: "spaceStorage",
	other: "spaceOther",
};
const KIND_LABEL: Readonly<Record<Shape["kind"], LabelKey>> = {
	room: "kindRoom",
	space: "kindSpace",
	door: "kindDoor",
	window: "kindWindow",
	device: "kindDevice",
};

export function shapeName(s: Shape, p: Pick<SceneProps, "labels" | "rooms">): string {
	if (s.label !== "") return s.label;
	if (s.kind === "room" && s.roomId !== undefined)
		return p.rooms.get(s.roomId)?.name ?? p.labels.unlinkedRoom;
	if (s.kind === "space") return p.labels[SPACE_LABEL[s.spaceType]];
	if (s.kind === "device") return deviceName(s, p.labels);
	return p.labels[KIND_LABEL[s.kind]];
}

function Field(props: { label: string; id: string; children: JSX.Element }): JSX.Element {
	return (
		<div class="pz-fp__field">
			<label for={props.id}>{props.label}</label>
			{props.children}
		</div>
	);
}

export interface InspectorProps {
	doc: FloorPlanDoc;
	floorId: string;
	selection: ReadonlySet<string>;
	labels: FloorPlanLabels;
	rooms: ReadonlyMap<string, StoreRoomInfo>;
	devices: ReadonlyArray<{ id: string; name: string }>;
	issues: ReadonlyArray<PlanIssue>;
	idBase: string;
}

/** The selected shape's fields. Every field is an ordinary input: moving and resizing work without a pointer. */
export function Inspector(p: InspectorProps): JSX.Element {
	const { labels, idBase } = p;
	const ids = [...p.selection];
	const shape = ids.length === 1 && ids[0] !== undefined ? findShape(p.doc, ids[0]) : undefined;
	const num = (field: string, label: string, value: number): JSX.Element => (
		<Field label={label} id={`${idBase}-${field}`}>
			<input
				id={`${idBase}-${field}`}
				type="number"
				step="0.1"
				value={metres(value)}
				data-fp-field={field}
				data-fp-id={shape?.id}
			/>
		</Field>
	);
	return (
		<div id={`${idBase}-inspector`} class="pz-fp__inspector" aria-live="polite">
			<h3 class="pz-fp__h">{labels.inspector}</h3>
			{shape === undefined ? (
				<>
					<p class="pz-fp__muted">{ids.length > 1 ? `${ids.length} ×` : labels.nothingSelected}</p>
					{ids.length === 0 ? (
						<>
							<Field label={labels.floorName} id={`${idBase}-floorName`}>
								<input
									id={`${idBase}-floorName`}
									type="text"
									maxlength={40}
									value={p.doc.floors.find((f) => f.id === p.floorId)?.name ?? ""}
									data-fp-field="floorName"
								/>
							</Field>
							<button
								type="button"
								class="pz-fp__btn pz-fp__btn--text"
								data-fp-cmd="removeFloor"
								disabled={p.doc.floors.length < 2}
							>
								{labels.removeFloor}
							</button>
						</>
					) : null}
				</>
			) : (
				<>
					<p class="pz-fp__muted">{labels[KIND_LABEL[shape.kind]]}</p>
					<Field label={labels.fieldLabel} id={`${idBase}-label`}>
						<input
							id={`${idBase}-label`}
							type="text"
							maxlength={60}
							value={shape.label}
							data-fp-field="label"
							data-fp-id={shape.id}
						/>
					</Field>
					{isArea(shape) ? (
						<Field label={labels.fieldKind} id={`${idBase}-kind`}>
							<select id={`${idBase}-kind`} data-fp-field="kind" data-fp-id={shape.id}>
								<option value="room" selected={shape.kind === "room"}>
									{labels.kindRoom}
								</option>
								<option value="space" selected={shape.kind === "space"}>
									{labels.kindSpace}
								</option>
							</select>
						</Field>
					) : null}
					{shape.kind === "room" ? (
						<Field label={labels.fieldRoom} id={`${idBase}-roomId`}>
							<select id={`${idBase}-roomId`} data-fp-field="roomId" data-fp-id={shape.id}>
								<option value="" selected={shape.roomId === undefined}>
									{labels.fieldNoRoom}
								</option>
								{[...p.rooms.values()].map((r) => (
									<option value={r.id} selected={shape.roomId === r.id}>
										{r.name}
									</option>
								))}
							</select>
						</Field>
					) : null}
					{shape.kind === "space" ? (
						<Field label={labels.fieldSpaceType} id={`${idBase}-spaceType`}>
							<select id={`${idBase}-spaceType`} data-fp-field="spaceType" data-fp-id={shape.id}>
								{SPACE_TYPES.map((t) => (
									<option value={t} selected={shape.spaceType === t}>
										{labels[SPACE_LABEL[t]]}
									</option>
								))}
							</select>
						</Field>
					) : null}
					{shape.kind === "device" ? (
						<>
							<Field label={labels.fieldDeviceType} id={`${idBase}-deviceType`}>
								<select
									id={`${idBase}-deviceType`}
									data-fp-field="deviceType"
									data-fp-id={shape.id}
								>
									{DEVICE_TYPES.map((t) => (
										<option value={t} selected={shape.deviceType === t}>
											{labels[DEVICE_LABEL[t]]}
										</option>
									))}
								</select>
							</Field>
							<Field label={labels.fieldDeviceId} id={`${idBase}-deviceId`}>
								<select id={`${idBase}-deviceId`} data-fp-field="deviceId" data-fp-id={shape.id}>
									<option value="" selected={shape.deviceId === undefined}>
										{labels.fieldNoDevice}
									</option>
									{p.devices.map((d) => (
										<option value={d.id} selected={shape.deviceId === d.id}>
											{d.name}
										</option>
									))}
								</select>
							</Field>
						</>
					) : null}
					{shape.kind === "door" ? (
						<Field label={labels.fieldSwing} id={`${idBase}-swing`}>
							<select id={`${idBase}-swing`} data-fp-field="swing" data-fp-id={shape.id}>
								<option value="left" selected={shape.swing === "left"}>
									{labels.swingLeft}
								</option>
								<option value="right" selected={shape.swing === "right"}>
									{labels.swingRight}
								</option>
							</select>
						</Field>
					) : null}
					{isArea(shape) ? (
						<>
							{num("x", labels.fieldX, boundsOfShape(shape).x)}
							{num("y", labels.fieldY, boundsOfShape(shape).y)}
							{shape.geometry.type === "rect"
								? num("w", labels.fieldWidth, shape.geometry.w)
								: null}
							{shape.geometry.type === "rect"
								? num("h", labels.fieldHeight, shape.geometry.h)
								: null}
							<p class="pz-fp__muted">
								{say(labels, "area", { n: areaSquareMetres(shape.geometry).toFixed(1) })}
							</p>
						</>
					) : (
						<>
							{num("x", labels.fieldX, shape.at.x)}
							{num("y", labels.fieldY, shape.at.y)}
							{shape.kind !== "device" ? num("length", labels.fieldLength, shape.length) : null}
						</>
					)}
				</>
			)}
			<IssueList
				doc={p.doc}
				floorId={p.floorId}
				issues={p.issues}
				labels={labels}
				rooms={p.rooms}
			/>
		</div>
	);
}

function IssueList(p: {
	doc: FloorPlanDoc;
	floorId: string;
	issues: ReadonlyArray<PlanIssue>;
	labels: FloorPlanLabels;
	rooms: ReadonlyMap<string, StoreRoomInfo>;
}): JSX.Element | null {
	if (p.issues.length === 0) return null;
	const nameOf = (id: string | undefined): string => {
		const s = id === undefined ? undefined : findShape(p.doc, id);
		return s === undefined ? (id ?? "") : shapeName(s, p);
	};
	return (
		<ul class="pz-fp__issues" aria-label="!">
			{p.issues.map((i) => (
				<li class={cx("pz-fp__issue", `pz-fp__issue--${i.severity}`)}>
					{i.code === "unknown-room"
						? say(p.labels, "issueUnknownRoom", { name: nameOf(i.shapeId) })
						: say(p.labels, "issueOverlap", { name: nameOf(i.shapeId), other: nameOf(i.other) })}
				</li>
			))}
		</ul>
	);
}

/** Draw mode: the floor's shapes as buttons, the keyboard and screen-reader way to select one. */
export function ShapeList(p: {
	idBase: string;
	floorId: string;
	doc: FloorPlanDoc;
	selection: ReadonlySet<string>;
	labels: FloorPlanLabels;
	rooms: ReadonlyMap<string, StoreRoomInfo>;
}): JSX.Element {
	const floor = p.doc.floors.find((f) => f.id === p.floorId);
	return (
		<div id={`${p.idBase}-list`} class="pz-fp__list">
			<h3 class="pz-fp__h">{p.labels.shapesList}</h3>
			<ul>
				{(floor?.shapes ?? []).map((s) => (
					<li>
						<button
							type="button"
							class="pz-fp__row"
							data-fp-select={s.id}
							aria-pressed={p.selection.has(s.id) ? "true" : "false"}
						>
							<span class="pz-fp__row-kind">{p.labels[KIND_LABEL[s.kind]]}</span> {shapeName(s, p)}
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

/** Live mode: every room with its state in words (the plan's text equivalent), each a button that opens the sheet. */
export function RoomList(p: {
	idBase: string;
	labels: FloorPlanLabels;
	live: LiveScene;
	text: (id: string, live: RoomLive) => string;
}): JSX.Element {
	return (
		<div id={`${p.idBase}-list`} class="pz-fp__list">
			<h3 class="pz-fp__h">{p.labels.roomsList}</h3>
			<ul>
				{[...p.live.rooms.values()].map((r) => {
					const st = p.live.state.get(r.id);
					return (
						<li>
							<button
								type="button"
								class="pz-fp__row"
								data-fp-room={r.id}
								data-state={st?.state}
								aria-haspopup="dialog"
							>
								<span
									class={cx("pz-fp__dot", st && `pz-fp__dot--${st.state}`)}
									aria-hidden="true"
								/>{" "}
								{st ? p.text(r.id, st) : r.name}
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

export interface SheetProps {
	idBase: string;
	labels: FloorPlanLabels;
	room: LiveRoom | undefined;
	bookings: ReadonlyArray<LiveBooking>;
	from: number;
	to: number;
	now: number;
	at: number;
	timeZone: string;
	seeClients: boolean;
	href: (roomId: string, at: number) => string;
}

/** The side sheet (bottom sheet on a phone): the room's day, and the way to book it. Empty when no room is open. */
export function Sheet(p: SheetProps): JSX.Element {
	const { labels: L, room } = p;
	if (room === undefined) return <aside id={`${p.idBase}-sheet`} class="pz-fp__sheet" hidden />;
	const entries = roomDay(room, p.bookings, p.from, p.to, p.now, { seeClients: p.seeClients });
	const tz = p.timeZone;
	return (
		<aside
			id={`${p.idBase}-sheet`}
			class="pz-fp__sheet is-open"
			role="dialog"
			aria-label={room.name}
			data-room-id={room.id}
		>
			<header class="pz-fp__sheet-head">
				<div>
					<h2 class="pz-fp__sheet-title">{room.name}</h2>
					<p class="pz-fp__muted">{say(L, "capacity", { n: room.capacity })}</p>
				</div>
				<button type="button" class="pz-fp__btn" data-fp-close aria-label={L.sheetClose}>
					<span aria-hidden="true">×</span>
				</button>
			</header>
			<h3 class="pz-fp__h">{L.sheetTimeline}</h3>
			{entries.length === 0 ? (
				<p class="pz-fp__muted">{L.timelineEmpty}</p>
			) : (
				<ol class="pz-fp__timeline">
					{entries.map((e) => (
						<li
							class={cx(
								"pz-fp__entry",
								e.kind === "closure" && "is-closed",
								e.conflict && "is-conflict",
							)}
						>
							<time class="pz-fp__entry-time">
								{clockOf(e.start, tz)}–{clockOf(e.until, tz)}
							</time>
							<span class="pz-fp__entry-what">
								{e.kind === "closure"
									? `${L.closureEntry}${e.reason ? ` · ${e.reason}` : ""}`
									: `${e.booking?.monogram ?? ""} · ${e.booking?.service ?? ""}${e.booking?.clientInitials ? ` · ${e.booking.clientInitials.join(" ")}` : ""}`}
								{e.conflict ? <strong class="pz-fp__flag"> · {L.conflictEntry}</strong> : null}
							</span>
						</li>
					))}
				</ol>
			)}
			<a class="pz-fp__cta" href={p.href(room.id, p.at)}>
				{L.newBookingHere}
			</a>
		</aside>
	);
}
