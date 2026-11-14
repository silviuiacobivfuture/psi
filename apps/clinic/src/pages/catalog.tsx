import { EmptyState, OverflowMenu, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, EmptyActions, menuItems } from "../actions/render";
import type { Screen } from "../actions/types";
import { roleLabel, rolesText } from "../chrome";
import { formatMoney } from "../domain/money";
import type { Ctx } from "../lib/context";
import { hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Column, Role, Service } from "../port/schema";
import { DEVICE_TYPES } from "../port/schema-catalog";
import { SheetButtons } from "./client-sheets";
import { Check, Pick } from "./form-choices";

export type CatalogSegment = "people" | "rooms" | "devices" | "services";

export interface CatalogData {
	columns: ReadonlyArray<Column>;
	services: ReadonlyArray<Service>;
	roles: ReadonlyArray<Role>;
}

export interface CatalogOpen {
	create: boolean;
	editId: string | null;
	confirmId: string | null;
}

const SCREEN: Readonly<Record<CatalogSegment, Screen>> = {
	people: "settings.people",
	rooms: "settings.rooms",
	devices: "settings.devices",
	services: "settings.services",
};
const KIND: Readonly<Record<CatalogSegment, Column["kind"] | "service">> = {
	people: "person",
	rooms: "room",
	devices: "device",
	services: "service",
};

const roomsOf = (d: CatalogData): ReadonlyArray<Column> =>
	d.columns.filter((c) => c.kind === "room");
const peopleOf = (d: CatalogData): ReadonlyArray<Column> =>
	d.columns.filter((c) => c.kind === "person");
const devicesOf = (d: CatalogData): ReadonlyArray<Column> =>
	d.columns.filter((c) => c.kind === "device");
const timeText = (min: number): string => hhmm(min);
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function PersonForm({
	ctx,
	d,
	item,
}: {
	ctx: Ctx;
	d: CatalogData;
	item: Column | null;
}): JSX.Element {
	const o = at(ctx.locale);
	const hours = item?.hours ?? [null, null, null, null, null, null, null];
	return (
		<>
			<label class="adm-field">
				<span>{m.ap_c_name({}, o)}</span>
				<input class="adm-input" name="name" required maxlength={120} value={item?.name ?? ""} />
			</label>
			<label class="adm-field">
				<span>{m.email_label({}, o)}</span>
				<input
					class="adm-input"
					name="email"
					type="email"
					inputmode="email"
					autocomplete="off"
					maxlength={200}
					value={item?.email ?? ""}
				/>
				{item === null ? <span class="adm-muted">{m.cat_person_invite({}, o)}</span> : null}
			</label>
			<Pick
				legend={m.cat_person_roles({}, o)}
				name="roles"
				items={d.roles.map((r) => ({ id: r.id, name: roleLabel(r, ctx.locale) }))}
				on={item?.roles ?? []}
			/>
			<Check
				name="practitioner"
				label={m.cat_person_practitioner({}, o)}
				on={item === null ? true : item.bookable !== false}
			/>
			<label class="adm-field">
				<span>{m.cat_person_colour({}, o)}</span>
				<select class="adm-input" name="colour">
					{[1, 2, 3, 4, 5, 6].map((n) => (
						<option key={n} value={String(n)} selected={(item?.colour ?? 1) === n}>
							{m.cat_colour({ n }, o)}
						</option>
					))}
				</select>
			</label>
			<label class="adm-field">
				<span>{m.cat_person_specialty({}, o)}</span>
				<input class="adm-input" name="specialty" maxlength={120} value={item?.specialty ?? ""} />
			</label>
			<fieldset class="cl-hours">
				<legend>{m.cat_person_hours({}, o)}</legend>
				{DAYS.map((day, i) => (
					<div key={day} class="cl-hours__day">
						<span>{m[`cat_day_${day}` as const]({}, o)}</span>
						<input
							class="adm-input"
							type="time"
							name={`h${i}_from`}
							aria-label={`${m[`cat_day_${day}` as const]({}, o)} ${m.cat_from({}, o)}`}
							value={hours[i] ? timeText(hours[i]?.from ?? 0) : ""}
						/>
						<input
							class="adm-input"
							type="time"
							name={`h${i}_to`}
							aria-label={`${m[`cat_day_${day}` as const]({}, o)} ${m.cat_to({}, o)}`}
							value={hours[i] ? timeText(hours[i]?.to ?? 0) : ""}
						/>
					</div>
				))}
			</fieldset>
			<Pick
				legend={m.cat_person_rooms({}, o)}
				name="roomIds"
				items={roomsOf(d)}
				on={item?.roomIds ?? []}
			/>
			<Pick
				legend={m.cat_person_services({}, o)}
				name="serviceIds"
				items={d.services}
				on={item?.serviceIds ?? []}
			/>
			<Check name="active" label={m.cat_active({}, o)} on={item?.active !== false} />
		</>
	);
}

function RoomForm({
	ctx,
	d,
	item,
}: {
	ctx: Ctx;
	d: CatalogData;
	item: Column | null;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<>
			<label class="adm-field">
				<span>{m.ap_c_name({}, o)}</span>
				<input class="adm-input" name="name" required maxlength={120} value={item?.name ?? ""} />
			</label>
			<label class="adm-field">
				<span>{m.cat_room_floor({}, o)}</span>
				<input class="adm-input" name="floor" maxlength={40} value={item?.floor ?? ""} />
			</label>
			<label class="adm-field">
				<span>{m.cat_room_category({}, o)}</span>
				<select class="adm-input" name="category">
					{(["therapy", "neuro"] as const).map((c) => (
						<option key={c} value={c} selected={(item?.category ?? "therapy") === c}>
							{m[`cat_room_${c}` as const]({}, o)}
						</option>
					))}
				</select>
			</label>
			<label class="adm-field">
				<span>{m.cat_room_purpose({}, o)}</span>
				<input class="adm-input" name="purpose" maxlength={120} value={item?.purpose ?? ""} />
			</label>
			<label class="adm-field">
				<span>{m.cat_room_capacity({}, o)}</span>
				<input
					class="adm-input"
					name="capacity"
					type="text"
					inputmode="numeric"
					value={String(item?.capacity ?? 1)}
				/>
			</label>
			<label class="adm-field">
				<span>{m.cat_room_home({}, o)}</span>
				<select class="adm-input" name="homeOf">
					<option value="">{m.cl_rec_none({}, o)}</option>
					{peopleOf(d).map((p) => (
						<option key={p.id} value={p.id} selected={item?.homeOf === p.id}>
							{p.name}
						</option>
					))}
				</select>
			</label>
			<Check name="bookable" label={m.cat_bookable({}, o)} on={item?.bookable !== false} />
		</>
	);
}

function DeviceForm({
	ctx,
	d,
	item,
}: {
	ctx: Ctx;
	d: CatalogData;
	item: Column | null;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<>
			<label class="adm-field">
				<span>{m.ap_c_name({}, o)}</span>
				<input class="adm-input" name="name" required maxlength={120} value={item?.name ?? ""} />
			</label>
			<label class="adm-field">
				<span>{m.cat_device_type({}, o)}</span>
				<select class="adm-input" name="type">
					{DEVICE_TYPES.map((t) => (
						<option key={t} value={t} selected={(item?.deviceType ?? "other") === t}>
							{m[`cat_device_${t}` as const]({}, o)}
						</option>
					))}
				</select>
			</label>
			<label class="adm-field">
				<span>{m.cat_device_room({}, o)}</span>
				<select class="adm-input" name="roomId">
					<option value="">{m.cl_rec_none({}, o)}</option>
					{roomsOf(d).map((r) => (
						<option key={r.id} value={r.id} selected={item?.deviceRoom === r.id}>
							{r.name}
						</option>
					))}
				</select>
			</label>
			<Check name="bookable" label={m.cat_bookable({}, o)} on={item?.bookable !== false} />
		</>
	);
}

function ServiceForm({
	ctx,
	d,
	item,
}: {
	ctx: Ctx;
	d: CatalogData;
	item: Service | null;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<>
			<label class="adm-field">
				<span>{m.ap_c_name({}, o)}</span>
				<input class="adm-input" name="name" required maxlength={120} value={item?.name ?? ""} />
			</label>
			<label class="adm-field">
				<span>{m.cat_service_duration({}, o)}</span>
				<input
					class="adm-input"
					name="durationMin"
					required
					type="text"
					inputmode="numeric"
					value={item === null ? "" : String(item.durationMin)}
				/>
			</label>
			{ctx.can.group("money") ? (
				<label class="adm-field">
					<span>{m.cat_service_price({}, o)}</span>
					<input
						class="adm-input"
						name="price"
						type="text"
						inputmode="decimal"
						value={item?.priceBani == null ? "" : String(item.priceBani / 100)}
					/>
				</label>
			) : null}
			<label class="adm-field">
				<span>{m.cat_service_category({}, o)}</span>
				<input class="adm-input" name="category" maxlength={60} value={item?.category ?? ""} />
			</label>
			<label class="adm-field">
				<span>{m.cat_service_room_category({}, o)}</span>
				<select class="adm-input" name="roomCategory">
					<option value="">{m.cat_any({}, o)}</option>
					{(["therapy", "neuro"] as const).map((c) => (
						<option key={c} value={c} selected={item?.roomCategory === c}>
							{m[`cat_room_${c}` as const]({}, o)}
						</option>
					))}
				</select>
			</label>
			<label class="adm-field">
				<span>{m.cat_service_buffer({}, o)}</span>
				<input
					class="adm-input"
					name="bufferMin"
					type="text"
					inputmode="numeric"
					value={String(item?.bufferMin ?? 0)}
				/>
			</label>
			<Check name="online" label={m.cat_service_online({}, o)} on={item?.online !== false} />
			<Pick
				legend={m.cat_service_practitioners({}, o)}
				name="practitionerIds"
				items={peopleOf(d).filter((p) => p.bookable !== false)}
				on={item?.practitionerIds ?? []}
			/>
			<Pick
				legend={m.cat_service_rooms({}, o)}
				name="roomIds"
				items={roomsOf(d)}
				on={item?.roomIds ?? []}
			/>
			<Pick
				legend={m.cat_service_devices({}, o)}
				name="deviceIds"
				items={devicesOf(d)}
				on={item?.deviceIds ?? []}
			/>
			<Check name="active" label={m.cat_active({}, o)} on={item?.active !== false} />
		</>
	);
}

const title = (segment: CatalogSegment, editing: boolean, locale: Locale): string => {
	const o = at(locale);
	const add = {
		people: m.ac_person_add,
		rooms: m.ac_room_add,
		devices: m.ac_device_add,
		services: m.ac_service_add,
	};
	const edit = {
		people: m.ac_person_edit,
		rooms: m.ac_room_edit,
		devices: m.ac_device_edit,
		services: m.ac_service_edit,
	};
	return (editing ? edit : add)[segment]({}, o);
};

function describe(segment: CatalogSegment, c: Column | Service, d: CatalogData, ctx: Ctx): string {
	const o = at(ctx.locale);
	const parts: string[] = [];
	if (segment === "services" && "durationMin" in c) {
		parts.push(m.service_duration({ n: c.durationMin }, o));
		if (ctx.can.group("money") && c.priceBani !== null)
			parts.push(formatMoney(c.priceBani, ctx.locale));
		if (c.category !== undefined) parts.push(c.category);
		if (c.online === false) parts.push(m.cat_not_online({}, o));
	} else if ("kind" in c) {
		if (c.kind === "person") {
			parts.push(
				rolesText(
					c.roles ?? [],
					ctx.locale,
					Object.fromEntries(d.roles.map((r) => [r.id, r.name])),
				),
				c.specialty ?? "",
				c.bookable === false ? m.cat_no_calendar({}, o) : "",
			);
		} else if (c.kind === "room") {
			parts.push(
				c.floor ?? "",
				c.purpose ?? "",
				c.category === undefined ? "" : m[`cat_room_${c.category}` as const]({}, o),
			);
		} else if (c.kind === "device") {
			parts.push(
				c.deviceType === undefined
					? ""
					: m[
							`cat_device_${c.deviceType === "nfb" || c.deviceType === "qeeg" ? c.deviceType : "other"}` as const
						]({}, o),
			);
		}
		if (c.bookable === false && c.kind !== "person") parts.push(m.cat_not_bookable({}, o));
	}
	if (c.active === false) parts.push(m.cat_inactive({}, o));
	return parts.filter((p) => p !== "").join(" · ");
}

/** One settings tab of the catalogue: add, a row that opens its edit sheet, a menu per row, empty-state actions. */
export function CatalogTab({
	ctx,
	segment,
	data,
}: {
	ctx: Ctx;
	segment: CatalogSegment;
	data: CatalogData;
}): JSX.Element {
	const o = at(ctx.locale);
	const screen = SCREEN[segment];
	const rows: ReadonlyArray<Column | Service> =
		segment === "services" ? data.services : data.columns.filter((c) => c.kind === KIND[segment]);
	return (
		<div class="cl-tab" data-catalog={segment}>
			<ActionBar ctx={ctx} screen={screen} />
			{rows.length === 0 ? (
				<EmptyState
					icon="settings"
					title={m.settings_empty_title({}, o)}
					text={m.settings_empty_text({}, o)}
				>
					<EmptyActions ctx={ctx} screen={screen} />
				</EmptyState>
			) : (
				<ul class="cl-rows" aria-label={title(segment, true, ctx.locale)}>
					{rows.map((r) => (
						<li
							key={r.id}
							class="cl-row"
							data-item={r.id}
							data-active={r.active === false ? "false" : "true"}
						>
							{"colour" in r ? (
								<span class="adm-dot" style={`background:var(--cal-${r.colour})`} />
							) : null}
							{ctx.can.write(editKey(segment)) ? (
								<a
									class="cl-row__main"
									data-action={`${KIND[segment]}.edit`}
									href={`/settings/${segment}?edit=${encodeURIComponent(r.id)}`}
								>
									<strong>{r.name}</strong>
									<span class="adm-muted">{describe(segment, r, data, ctx)}</span>
								</a>
							) : (
								<div class="cl-row__main">
									<strong>{r.name}</strong>
									<span class="adm-muted">{describe(segment, r, data, ctx)}</span>
								</div>
							)}
							{(() => {
								const items = menuItems(ctx, screen, { id: r.id }).filter((i) =>
									i.key.endsWith(".remove"),
								);
								return items.length === 0 ? null : (
									<OverflowMenu
										id={`${segment}-${r.id}`}
										label={m.client_more({}, o)}
										items={items}
									/>
								);
							})()}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

const editKey = (s: CatalogSegment): string =>
	({
		people: "people_edit",
		rooms: "rooms_edit",
		devices: "devices_edit",
		services: "services_edit",
	})[s];

/** The add / edit sheet and the removal confirmation of a tab, opened from the address. */
export function CatalogSheets({
	ctx,
	segment,
	data,
	open,
}: {
	ctx: Ctx;
	segment: CatalogSegment;
	data: CatalogData;
	open: CatalogOpen;
}): JSX.Element {
	const o = at(ctx.locale);
	const col = data.columns.find((c) => c.id === open.editId) ?? null;
	const svc = data.services.find((s) => s.id === open.editId) ?? null;
	const editing = segment === "services" ? svc !== null : col !== null;
	const id = open.editId;
	const shown = open.create || (id !== null && editing);
	const action = `/settings/${segment}${id !== null && editing ? `/${encodeURIComponent(id)}/save` : "/save"}`;
	const doomed =
		open.confirmId === null
			? null
			: [...data.columns, ...data.services].find((x) => x.id === open.confirmId);
	return (
		<div
			data-signals={JSON.stringify({
				editItem: shown,
				askRemove: doomed !== null && doomed !== undefined,
			})}
		>
			<Sheet
				signal="editItem"
				title={title(segment, id !== null && editing, ctx.locale)}
				closeLabel={m.close({}, o)}
			>
				<form method="post" action={action} class="cl-form" data-form={`${KIND[segment]}-save`}>
					{segment === "people" ? <PersonForm ctx={ctx} d={data} item={col} /> : null}
					{segment === "rooms" ? <RoomForm ctx={ctx} d={data} item={col} /> : null}
					{segment === "devices" ? <DeviceForm ctx={ctx} d={data} item={col} /> : null}
					{segment === "services" ? <ServiceForm ctx={ctx} d={data} item={svc} /> : null}
					<SheetButtons go={m.cl_save({}, o)} signal="editItem" cancel={m.cancel({}, o)} />
				</form>
			</Sheet>
			{doomed === null || doomed === undefined ? null : (
				<Sheet signal="askRemove" title={m.cat_remove_title({}, o)} closeLabel={m.close({}, o)}>
					<form
						method="post"
						action={`/settings/${segment}/${encodeURIComponent(doomed.id)}/remove`}
						class="cl-form"
						data-form={`${KIND[segment]}-remove`}
					>
						<p>{m.cat_remove_text({ name: doomed.name }, o)}</p>
						<SheetButtons
							go={m.cat_remove_go({}, o)}
							signal="askRemove"
							danger
							cancel={m.cancel({}, o)}
						/>
					</form>
				</Sheet>
			)}
		</div>
	);
}
