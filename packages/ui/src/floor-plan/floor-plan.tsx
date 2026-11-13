/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { FLOOR_PLAN_JS } from "./client.generated";
import { Btn, CategoryLegend, DrawBar, Floors, Icon, Legend, LiveStrip } from "./controls";
import { type FloorPlanLabels, say } from "./labels";
import type { RoomLive } from "./live";
import { type FloorPlanProps, type LivePart, liveSceneOf, sceneProps, snapInstant } from "./model";
import { Inspector, RoomList, ShapeList, Sheet } from "./parts";
import { Defs, OverlayLayer, roomAriaLabel, ShapesLayer } from "./scene";
import { clockOf, dateOf, dayRange } from "./zone";

export { Scrubber, TimeLabel } from "./controls";
export {
	type FloorPlanProps,
	floorOf,
	type LivePart,
	liveSceneOf,
	SCRUB_STEP,
	sceneProps,
	snapInstant,
} from "./model";

/** One room's sentence for the list: name and state in words. */
export function roomText(
	name: string,
	live: RoomLive,
	tz: string,
	labels: FloorPlanLabels,
): string {
	return roomAriaLabel(name, live, tz, labels);
}

export function LivePieces(p: FloorPlanProps & { live: LivePart }): {
	list: JSX.Element;
	sheet: JSX.Element;
	status: JSX.Element;
} {
	const scene = liveSceneOf(p.live);
	const at = snapInstant(p.live.at, p.live.timeZone);
	const { start, end } = dayRange(dateOf(at, p.live.timeZone), p.live.timeZone);
	const open =
		p.live.openRoomId === undefined
			? undefined
			: p.live.data.rooms.find((r) => r.id === p.live.openRoomId);
	return {
		list: (
			<RoomList
				idBase={p.id}
				labels={p.labels}
				live={scene}
				text={(id, st) => roomText(scene.rooms.get(id)?.name ?? id, st, p.live.timeZone, p.labels)}
			/>
		),
		sheet: (
			<Sheet
				idBase={p.id}
				labels={p.labels}
				room={open}
				bookings={p.live.data.bookings}
				from={start}
				to={end}
				now={p.live.now}
				at={at}
				timeZone={p.live.timeZone}
				seeClients={p.live.viewer.seeClients}
				href={p.live.newBookingHref}
			/>
		),
		status: (
			<p id={`${p.id}-status`} class="pz-fp__status" role="status" data-fp-rev={p.doc.revision}>
				{say(p.labels, "updated", { time: clockOf(p.live.now, p.live.timeZone) })}
			</p>
		),
	};
}

export function DrawPieces(
	p: FloorPlanProps,
	status?: string,
): { list: JSX.Element; inspector: JSX.Element; status: JSX.Element } {
	const sp = sceneProps(p);
	const sel = p.selection ?? new Set<string>();
	return {
		list: (
			<ShapeList
				idBase={p.id}
				floorId={sp.floor.id}
				doc={p.doc}
				selection={sel}
				labels={p.labels}
				rooms={sp.rooms}
			/>
		),
		inspector: (
			<Inspector
				doc={p.doc}
				floorId={sp.floor.id}
				selection={sel}
				labels={p.labels}
				rooms={sp.rooms}
				devices={p.devices ?? []}
				issues={sp.issues}
				idBase={p.id}
			/>
		),
		status: (
			<p id={`${p.id}-status`} class="pz-fp__status" role="status" data-fp-rev={p.doc.revision}>
				{status ?? ""}
			</p>
		),
	};
}

function jsonScript(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

const HINT_KEYS = [
	"floorDefault",
	"hintSelect",
	"hintRect",
	"hintRectSecond",
	"hintPolygon",
	"hintDoor",
	"hintWindow",
	"hintDevice",
	"fullscreen",
	"exitFullscreen",
] as const;

/**
 * The floor plan, in two modes. DRAW is for the people who may change the settings; LIVE for everyone
 * who sees the calendar. Server-rendered SVG; a small client module owns only the pointer geometry
 * (pan, zoom, drawing, dragging) and posts the edited plan, and Datastar patches the layers back.
 */
export function FloorPlan(p: FloorPlanProps): JSX.Element {
	const L = p.labels;
	const sp = sceneProps(p);
	const floor = sp.floor;
	const live = p.live;
	const sig =
		p.mode === "draw"
			? { fpDoc: "", fpSel: "", fpFloor: floor.id }
			: {
					fpAt: live ? snapInstant(live.at, live.timeZone) : 0,
					fpHeat: live?.heat ?? false,
					fpRoom: live?.openRoomId ?? "",
					fpFloor: floor.id,
					fpShift: 0,
					fpJump: false,
					fpTick: 0,
				};
	const pieces = p.mode === "live" && live ? LivePieces({ ...p, live }) : undefined;
	const draw = p.mode === "draw" ? DrawPieces(p) : undefined;
	const sync = `@post('${p.endpoint}/${p.mode}/render')`;
	const canvas = p.canvas === true;
	const head = (
		<div class="pz-fp__head">
			<h2 class="pz-fp__title">{L.plan}</h2>
			{p.modeLinks ? (
				<nav class="pz-fp__modes" aria-label={L.plan}>
					<a
						href={p.modeLinks.draw}
						aria-current={p.mode === "draw" ? "page" : undefined}
						class={cx("pz-fp__mode", !p.modeLinks.draw && "is-off")}
					>
						{L.drawMode}
					</a>
					<a
						href={p.modeLinks.live}
						aria-current={p.mode === "live" ? "page" : undefined}
						class={cx("pz-fp__mode", !p.modeLinks.live && "is-off")}
					>
						{L.liveMode}
					</a>
				</nav>
			) : null}
			{canvas ? (
				<>
					{p.extra}
					<Btn
						label={L.fullscreen}
						class="pz-fp__btn--full"
						attrs={{ "data-fp-cmd": "fullscreen", "aria-pressed": "false" }}
					>
						<Icon name="fullscreen" />
					</Btn>
					<Btn
						label={p.mode === "draw" ? L.inspector : L.roomsList}
						class="pz-fp__btn--panel"
						attrs={{
							"data-fp-cmd": "panel",
							"aria-pressed": "false",
							"aria-controls": `${p.id}-panel`,
						}}
					>
						<Icon name="panel" />
					</Btn>
				</>
			) : null}
		</div>
	);
	const floors = Floors(p, floor.id);
	const bar = p.mode === "draw" ? <DrawBar {...p} /> : null;
	const strip = live ? <LiveStrip {...p} live={live} /> : null;
	return (
		<section
			id={p.id}
			class={cx("pz-fp", `pz-fp--${p.mode}`, canvas && "pz-fp--canvas")}
			data-fp-root
			data-fp-mode={p.mode}
			{...(canvas ? { "data-panel": "closed" } : {})}
			data-fp-config={jsonScript({ mode: p.mode, step: 5 })}
			data-signals={JSON.stringify(sig)}
			data-on:fp-sync={sync}
			data-on:fp-pick={`$fpRoom = evt.detail.id; ${sync}`}
			data-on:fp-close={`$fpRoom = ''; ${sync}`}
			{...(p.mode === "live"
				? {
						"data-effect": `$fpTick > 0 && ${sync}`,
						"data-init": `@get('${p.endpoint}/live/stream', {retry: 'always'})`,
					}
				: {})}
		>
			<input type="hidden" data-bind="fpFloor" data-fp-in="floor" />
			{p.mode === "draw" ? <input type="hidden" data-bind="fpDoc" data-fp-in="doc" /> : null}
			{p.mode === "draw" ? <input type="hidden" data-bind="fpSel" data-fp-in="sel" /> : null}
			{canvas ? (
				<div class="pz-fp__overlay">
					{head}
					{bar}
					{strip}
					{floors}
				</div>
			) : (
				<>
					{head}
					{p.mode === "draw" ? (
						<p class="pz-fp__phone-note" role="note">
							{L.phoneDraw}
						</p>
					) : null}
					{bar}
					{strip}
					{floors}
				</>
			)}
			<div class="pz-fp__main">
				{/* biome-ignore lint/a11y/useSemanticElements: the stage is a keyboard-focusable pan and zoom surface, not a form group */}
				<div
					class="pz-fp__stage"
					data-fp-stage
					tabindex={0}
					role="group"
					aria-label={L.plan}
					aria-describedby={`${p.id}-keys`}
				>
					<svg
						class="pz-fp__svg"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 400 300"
						data-fp-svg
					>
						<title>{L.plan}</title>
						<Defs />
						<rect class="pz-fp__paper" x="-5000" y="-5000" width="10000" height="10000" />
						<g id={`${p.id}-view`} data-fp-view>
							<rect
								class="pz-fp__grid"
								x="0"
								y="0"
								width={p.doc.width}
								height={p.doc.height}
								fill="url(#fp-grid-major)"
							/>
							<ShapesLayer {...sp} />
							<OverlayLayer {...sp} />
							<g id="fp-ghost" class="pz-fp__ghost" />
						</g>
					</svg>
					{/* biome-ignore lint/a11y/useSemanticElements: a group of icon buttons over the canvas */}
					<div class="pz-fp__zoom" role="group" aria-label={L.fit}>
						<Btn label={L.zoomIn} attrs={{ "data-fp-cmd": "zoomIn" }}>
							<Icon name="plus" />
						</Btn>
						<Btn label={L.zoomOut} attrs={{ "data-fp-cmd": "zoomOut" }}>
							<Icon name="minus" />
						</Btn>
						<Btn label={L.fit} attrs={{ "data-fp-cmd": "fit" }}>
							<Icon name="fit" />
						</Btn>
					</div>
					<p class="pz-fp__hint" data-fp-hint aria-live="polite" />
				</div>
				<div class="pz-fp__side" id={`${p.id}-panel`} data-fp-panel>
					{canvas ? (
						<div class="pz-fp__panel-head">
							<strong>{p.mode === "draw" ? L.inspector : L.roomsList}</strong>
							<Btn label={L.closePanel} attrs={{ "data-fp-cmd": "panel" }}>
								<Icon name="close" />
							</Btn>
						</div>
					) : null}
					{draw ? draw.inspector : null}
					{draw ? draw.list : pieces?.list}
					{live ? <Legend labels={L} heat={live.heat} /> : null}
					{p.doc.categories === undefined ? null : (
						<CategoryLegend categories={p.doc.categories} locale={p.locale} />
					)}
					{draw ? draw.status : pieces?.status}
				</div>
				{pieces?.sheet}
			</div>
			<p id={`${p.id}-keys`} class="pz-fp__keys">
				{L.keysHelp}
			</p>
			<ul hidden data-fp-hints>
				{HINT_KEYS.map((k) => (
					<li data-hint={k}>{L[k]}</li>
				))}
			</ul>
			<script
				type="application/json"
				data-fp-doc
				dangerouslySetInnerHTML={{ __html: jsonScript(p.doc) }}
			/>
			<script dangerouslySetInnerHTML={{ __html: FLOOR_PLAN_JS }} />
		</section>
	);
}
