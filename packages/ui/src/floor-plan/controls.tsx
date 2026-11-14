/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import type { FloorPlanLabels } from "./labels";
import { HEAT_LEVELS } from "./live";
import { type FloorPlanProps, type LivePart, SCRUB_STEP, snapInstant } from "./model";
import { DEVICE_TYPES } from "./schema";
import { clockOf, dateOf, dayRange } from "./zone";

export function Btn(p: {
	label: string;
	children: Child;
	attrs?: Record<string, string | boolean>;
	class?: string;
}): JSX.Element {
	return (
		<button
			type="button"
			class={cx("pz-fp__btn", p.class)}
			aria-label={p.label}
			title={p.label}
			{...(p.attrs ?? {})}
		>
			{p.children}
		</button>
	);
}

const ICONS: Readonly<Record<string, string>> = {
	select: "M5 3 L5 17 L9 13 L12 20 L14.5 19 L11.5 12.5 L17 12.5 Z",
	rect: "M4 6 H20 V18 H4 Z",
	polygon: "M4 18 L8 6 L16 4 L20 14 L12 19 Z",
	door: "M5 20 V4 H15 V20 M5 20 H19 M15 20 A10 10 0 0 0 5 10",
	window: "M4 12 H20 M4 9 H20 M4 15 H20",
	device: "M7 8 H17 V16 H7 Z M9 12 l1.5 -2 l1.5 4 l1.5 -4 l1.5 2",
	rotate: "M19 8 A8 8 0 1 0 20 13 M19 3 V8 H14",
	delete: "M5 7 H19 M9 7 V4 H15 V7 M7 7 L8 20 H16 L17 7",
	undo: "M9 7 L4 12 L9 17 M4 12 H14 A6 6 0 0 1 14 24",
	redo: "M15 7 L20 12 L15 17 M20 12 H10 A6 6 0 0 0 10 24",
	plus: "M12 5 V19 M5 12 H19",
	minus: "M5 12 H19",
	fit: "M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15",
	save: "M5 4 H16 L19 7 V20 H5 Z M8 4 V9 H15 V4 M8 20 V14 H16 V20",
	fullscreen: "M14 4 H20 V10 M20 4 L13 11 M10 20 H4 V14 M4 20 L11 13",
	panel: "M4 5 H20 V19 H4 Z M14 5 V19",
	close: "M6 6 L18 18 M18 6 L6 18",
};

export function Icon({ name }: { name: string }): JSX.Element {
	return (
		<svg
			viewBox="0 0 24 24"
			width="20"
			height="20"
			aria-hidden="true"
			focusable="false"
			class="pz-fp__icon"
		>
			<path d={ICONS[name] ?? ""} />
		</svg>
	);
}

export function DrawBar(p: FloorPlanProps): JSX.Element {
	const L = p.labels;
	const tools = [
		["select", L.toolSelect],
		["rect", L.toolRect],
		["polygon", L.toolPolygon],
		["door", L.toolDoor],
		["window", L.toolWindow],
		["device", L.toolDevice],
	] as const;
	return (
		<div class="pz-fp__bar" role="toolbar" aria-label={L.toolbar}>
			<div class="pz-fp__group">
				{tools.map(([t, label]) => (
					<Btn
						label={label}
						attrs={{ "data-fp-tool": t, "aria-pressed": t === "select" ? "true" : "false" }}
					>
						<Icon name={t} />
					</Btn>
				))}
			</div>
			<div class="pz-fp__group">
				<select class="pz-fp__select" data-fp-device-type aria-label={L.fieldDeviceType}>
					{DEVICE_TYPES.map((t) => (
						<option value={t}>
							{
								L[
									t === "nfb-amplifier"
										? "deviceNfb"
										: t === "hemisync-headphones"
											? "deviceHemisync"
											: t === "therapy-mat"
												? "deviceMat"
												: "deviceOther"
								]
							}
						</option>
					))}
				</select>
				<Btn label={L.addRoomHere} attrs={{ "data-fp-add-room": true }}>
					<Icon name="plus" />
				</Btn>
				<Btn label={L.rotate} attrs={{ "data-fp-cmd": "rotate" }}>
					<Icon name="rotate" />
				</Btn>
				<Btn label={L.delete} attrs={{ "data-fp-cmd": "delete" }}>
					<Icon name="delete" />
				</Btn>
			</div>
			<div class="pz-fp__group">
				<Btn label={L.undo} attrs={{ "data-fp-cmd": "undo", disabled: true }}>
					<Icon name="undo" />
				</Btn>
				<Btn label={L.redo} attrs={{ "data-fp-cmd": "redo", disabled: true }}>
					<Icon name="redo" />
				</Btn>
			</div>
			<div class="pz-fp__group pz-fp__group--end">
				<Btn
					class="pz-fp__btn--primary"
					label={L.save}
					attrs={{ "data-fp-save": true, "data-on:click": `@post('${p.endpoint}/draw/save')` }}
				>
					<Icon name="save" />
					<span class="pz-fp__btn-text">{L.save}</span>
				</Btn>
			</div>
		</div>
	);
}

export function Floors(p: FloorPlanProps, current: string): JSX.Element {
	return (
		<div class="pz-fp__floorbar">
			<div class="pz-fp__floors" role="tablist" aria-label={p.labels.floors}>
				{p.doc.floors.map((f) => (
					<button
						type="button"
						role="tab"
						class="pz-fp__tab"
						data-fp-floor={f.id}
						aria-selected={f.id === current ? "true" : "false"}
						tabindex={f.id === current ? 0 : -1}
					>
						{f.name}
					</button>
				))}
			</div>
			{p.mode === "draw" ? (
				<button type="button" class="pz-fp__tab pz-fp__tab--add" data-fp-add-floor>
					+ {p.labels.addFloor}
				</button>
			) : null}
		</div>
	);
}

export function dayLabel(at: number, tz: string, locale: string): string {
	return new Intl.DateTimeFormat(locale, {
		timeZone: tz,
		weekday: "short",
		day: "numeric",
		month: "short",
	}).format(new Date(at));
}

export function TimeLabel(p: {
	id: string;
	live: LivePart;
	locale: string;
	labels: FloorPlanLabels;
}): JSX.Element {
	const at = snapInstant(p.live.at, p.live.timeZone);
	return (
		<output id={`${p.id}-time`} class="pz-fp__time" for={`${p.id}-scrub`} aria-live="polite">
			{dayLabel(at, p.live.timeZone, p.locale)} · <strong>{clockOf(at, p.live.timeZone)}</strong>
		</output>
	);
}

export function Scrubber(p: {
	id: string;
	live: LivePart;
	endpoint: string;
	labels: FloorPlanLabels;
}): JSX.Element {
	const at = snapInstant(p.live.at, p.live.timeZone);
	const { start, end } = dayRange(dateOf(at, p.live.timeZone), p.live.timeZone);
	return (
		<input
			id={`${p.id}-scrub`}
			class="pz-fp__scrub"
			type="range"
			min={start}
			max={end - SCRUB_STEP}
			step={SCRUB_STEP}
			value={at}
			data-bind="fpAt"
			{...{ "data-on:input__debounce.80ms": `@post('${p.endpoint}/live/render')` }}
			aria-label={p.labels.time}
		/>
	);
}

export function LiveStrip(p: FloorPlanProps & { live: LivePart }): JSX.Element {
	const L = p.labels;
	const post = `@post('${p.endpoint}/live/render')`;
	return (
		<div class="pz-fp__strip">
			<div class="pz-fp__group">
				<Btn
					label={L.prevDay}
					attrs={{
						"data-on:click": `$fpShift = -1; $fpJump = true; ${post}; $fpShift = 0; $fpJump = false`,
					}}
				>
					<span aria-hidden="true">‹</span>
				</Btn>
				<Btn
					label={L.nextDay}
					attrs={{
						"data-on:click": `$fpShift = 1; $fpJump = true; ${post}; $fpShift = 0; $fpJump = false`,
					}}
				>
					<span aria-hidden="true">›</span>
				</Btn>
				<button
					type="button"
					class="pz-fp__btn pz-fp__btn--text"
					data-on:click={`$fpAt = Date.now(); $fpJump = true; ${post}; $fpJump = false`}
				>
					{L.now}
				</button>
			</div>
			<Scrubber id={p.id} live={p.live} endpoint={p.endpoint} labels={L} />
			<TimeLabel id={p.id} live={p.live} locale={p.locale} labels={L} />
			<label class="pz-fp__check">
				<input type="checkbox" data-bind="fpHeat" checked={p.live.heat} data-on:change={post} />
				<span>{L.heatmap}</span>
			</label>
		</div>
	);
}

/** What the room colours mean: one line per category the plan names, in the person's language. */
export function CategoryLegend(p: {
	categories: ReadonlyArray<{ id: string; label: { ro: string; en: string } }>;
	locale: string;
}): JSX.Element {
	const key = p.locale === "en" ? "en" : "ro";
	return (
		<ul class="pz-fp__category-legend" data-fp-categories>
			{p.categories.map((c) => (
				<li key={c.id}>
					<span class="pz-fp__swatch" data-category={c.id} aria-hidden="true" />
					{c.label[key]}
				</li>
			))}
		</ul>
	);
}

export function Legend(p: { labels: FloorPlanLabels; heat: boolean }): JSX.Element {
	const L = p.labels;
	return (
		<ul id="fp-legend" class="pz-fp__legend" aria-label={L.legend}>
			{(["free", "booked", "closed", "conflict"] as const).map((s) => (
				<li>
					<span class={cx("pz-fp__dot", `pz-fp__dot--${s}`)} aria-hidden="true" />
					{
						L[
							(
								{
									free: "stateFree",
									booked: "stateBooked",
									closed: "stateClosed",
									conflict: "stateConflict",
								} as const
							)[s]
						]
					}
				</li>
			))}
			{p.heat ? (
				<li class="pz-fp__heat-key">
					{L.heatLegend}:{" "}
					<span class="pz-fp__heat-ramp" aria-hidden="true">
						{Array.from({ length: HEAT_LEVELS }, (_v, i) => (
							<i data-heat={i} />
						))}
					</span>
				</li>
			) : null}
		</ul>
	);
}
