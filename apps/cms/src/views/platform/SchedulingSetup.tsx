import type { StaffAvailability, StaffCatalog } from "@psi/scheduling";
import type { ReactElement } from "react";
import type { Brand } from "../../authz/types";
import type { PsiKey } from "../../i18n";
import { cell } from "../shell";
import { box, buttonStyle, inputStyle, muted, type Say, Table, word } from "./parts";
import { hhmm } from "./time";

/**
 * Practitioners, services (duration, buffer, notice, horizon) and each practitioner's weekly hours
 * and exceptions. Forms post to /api/platform/scheduling/*; a viewer sees the same, read-only.
 */
type Catalog = Extract<StaffCatalog, { ok: true }>;
type Availability = Extract<StaffAvailability, { ok: true }>;
const DAYS: ReadonlyArray<PsiKey> = ["day_1", "day_2", "day_3", "day_4", "day_5", "day_6", "day_7"];

function Hidden({
	brand,
	fields,
}: {
	brand: Brand;
	fields: Readonly<Record<string, string>>;
}): ReactElement {
	return (
		<>
			<input type="hidden" name="brand" value={brand} />
			{Object.entries(fields).map(([k, v]) => (
				<input key={k} type="hidden" name={k} value={v} />
			))}
		</>
	);
}

function Num({
	name,
	value,
	label,
	form,
}: {
	name: string;
	value: number;
	label: string;
	form: string;
}): ReactElement {
	return (
		<input
			type="number"
			form={form}
			name={name}
			defaultValue={value}
			min={0}
			aria-label={label}
			style={{ ...inputStyle, width: 80 }}
		/>
	);
}

function Services({
	catalog,
	manager,
	say,
}: {
	catalog: Catalog;
	manager: boolean;
	say: Say;
}): ReactElement {
	return (
		<Table
			head={[
				say("services"),
				say("duration"),
				say("buffer"),
				say("notice"),
				say("horizon"),
				say("modes"),
				say("colState"),
				"",
			]}
		>
			{catalog.services.map((s) => {
				const form = `svc-${s.slug}`;
				return (
					<tr key={s.id}>
						<td style={cell}>
							<code>{s.slug}</code>
						</td>
						{manager ? (
							<>
								<td style={cell}>
									<Num
										form={form}
										name="durationMinutes"
										value={s.durationMinutes}
										label={say("duration")}
									/>
								</td>
								<td style={cell}>
									<Num
										form={form}
										name="bufferMinutes"
										value={s.bufferMinutes}
										label={say("buffer")}
									/>
								</td>
								<td style={cell}>
									<Num
										form={form}
										name="minNoticeMinutes"
										value={s.minNoticeMinutes}
										label={say("notice")}
									/>
								</td>
								<td style={cell}>
									<Num
										form={form}
										name="horizonDays"
										value={s.horizonDays}
										label={say("horizon")}
									/>
								</td>
							</>
						) : (
							<>
								<td style={cell}>{s.durationMinutes}</td>
								<td style={cell}>{s.bufferMinutes}</td>
								<td style={cell}>{s.minNoticeMinutes}</td>
								<td style={cell}>{s.horizonDays}</td>
							</>
						)}
						<td style={cell}>{s.modes.map((m) => word(say, "mode", m)).join(", ")}</td>
						<td style={cell}>
							{manager ? (
								<select
									form={form}
									name="active"
									defaultValue={s.active ? "on" : "off"}
									aria-label={say("colState")}
									style={inputStyle}
								>
									<option value="on">{say("active")}</option>
									<option value="off">{say("inactive")}</option>
								</select>
							) : s.active ? (
								say("active")
							) : (
								say("inactive")
							)}
						</td>
						<td style={cell}>
							{manager ? (
								<button type="submit" form={form} style={buttonStyle}>
									{say("save")}
								</button>
							) : null}
						</td>
					</tr>
				);
			})}
		</Table>
	);
}

/** Each service row's inputs belong to one form, by the `form` attribute (a table cannot nest forms). */
function ServiceForms({ brand, catalog }: { brand: Brand; catalog: Catalog }): ReactElement {
	return (
		<>
			{catalog.services.map((s) => (
				<form
					key={s.id}
					id={`svc-${s.slug}`}
					method="post"
					action="/api/platform/scheduling/service"
				>
					<Hidden brand={brand} fields={{ service: s.slug }} />
				</form>
			))}
		</>
	);
}

function Practitioner({
	brand,
	id,
	name,
	availability,
	manager,
	say,
}: {
	brand: Brand;
	id: string;
	name: string;
	availability: Availability | null;
	manager: boolean;
	say: Say;
}): ReactElement {
	return (
		<section style={box}>
			<h3 style={{ marginTop: 0 }}>{name}</h3>
			<h4>{say("weekly")}</h4>
			{availability === null ? (
				<p>{say("unreachable")}</p>
			) : (
				<ul>
					{availability.rules.map((r) => (
						<li key={r.id}>
							{say(DAYS[r.weekday - 1] ?? "day_1")} {hhmm(r.start)}–{hhmm(r.end)}{" "}
							<span style={muted}>({r.modes.map((m) => word(say, "mode", m)).join(", ")})</span>{" "}
							{manager ? (
								<form
									method="post"
									action="/api/platform/scheduling/rule/remove"
									style={{ display: "inline" }}
								>
									<Hidden brand={brand} fields={{ rule: r.id }} />
									<button type="submit" style={buttonStyle}>
										{say("remove")}
									</button>
								</form>
							) : null}
						</li>
					))}
				</ul>
			)}
			{manager ? (
				<form
					method="post"
					action="/api/platform/scheduling/rule/add"
					style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
				>
					<Hidden brand={brand} fields={{ practitioner: id }} />
					<select name="weekday" aria-label={say("weekday")} style={inputStyle}>
						{DAYS.map((d, i) => (
							<option key={d} value={String(i + 1)}>
								{say(d)}
							</option>
						))}
					</select>
					<input
						name="start"
						placeholder="09:00"
						aria-label={say("from")}
						required
						pattern="\d{1,2}:\d{2}"
						style={inputStyle}
					/>
					<input
						name="end"
						placeholder="13:00"
						aria-label={say("to")}
						required
						pattern="\d{1,2}:\d{2}"
						style={inputStyle}
					/>
					<select name="mode" aria-label={say("modes")} style={inputStyle}>
						<option value="onsite">{say("mode_onsite")}</option>
						<option value="online">{say("mode_online")}</option>
					</select>
					<button type="submit" style={buttonStyle}>
						{say("add")}
					</button>
				</form>
			) : null}
			<h4>{say("exceptions")}</h4>
			{availability === null ? null : (
				<ul>
					{availability.exceptions.map((x) => (
						<li key={x.id}>
							{x.date} · {x.kind === "closed" ? say("kindClosed") : say("kindOpen")}
							{x.start === undefined ? "" : ` ${hhmm(x.start)}–${hhmm(x.end ?? 0)}`}{" "}
							{manager ? (
								<form
									method="post"
									action="/api/platform/scheduling/exception/remove"
									style={{ display: "inline" }}
								>
									<Hidden brand={brand} fields={{ exception: x.id }} />
									<button type="submit" style={buttonStyle}>
										{say("remove")}
									</button>
								</form>
							) : null}
						</li>
					))}
				</ul>
			)}
			{manager ? (
				<form
					method="post"
					action="/api/platform/scheduling/exception/add"
					style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
				>
					<Hidden brand={brand} fields={{ practitioner: id }} />
					<input type="date" name="date" required aria-label={say("date")} style={inputStyle} />
					<select name="kind" aria-label={say("colState")} style={inputStyle}>
						<option value="closed">{say("kindClosed")}</option>
						<option value="open">{say("kindOpen")}</option>
					</select>
					<input
						name="start"
						placeholder="09:00"
						aria-label={say("from")}
						pattern="\d{1,2}:\d{2}"
						style={inputStyle}
					/>
					<input
						name="end"
						placeholder="13:00"
						aria-label={say("to")}
						pattern="\d{1,2}:\d{2}"
						style={inputStyle}
					/>
					<button type="submit" style={buttonStyle}>
						{say("add")}
					</button>
				</form>
			) : null}
		</section>
	);
}

export function SchedulingSetup({
	brand,
	catalog,
	availability,
	manager,
	say,
}: {
	brand: Brand;
	catalog: Catalog;
	availability: ReadonlyMap<string, Availability | null>;
	manager: boolean;
	say: Say;
}): ReactElement {
	return (
		<>
			<h2>{say("services")}</h2>
			{manager ? <ServiceForms brand={brand} catalog={catalog} /> : null}
			<Services catalog={catalog} manager={manager} say={say} />
			<h2>{say("practitioners")}</h2>
			{catalog.practitioners.map((p) => (
				<Practitioner
					key={p.id}
					brand={brand}
					id={p.id}
					name={`${p.displayName}${p.active ? "" : ` (${say("inactive")})`}`}
					availability={availability.get(p.id) ?? null}
					manager={manager}
					say={say}
				/>
			))}
		</>
	);
}
