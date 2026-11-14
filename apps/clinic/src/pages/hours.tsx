import { Banner, EmptyState, Tabs } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { actionCtx } from "../actions/context";
import { mayTouch } from "../actions/registry-availability";
import { areaText } from "../lib/area-labels";
import type { Ctx } from "../lib/context";
import { addDays, todayIso, weekStart } from "../lib/dates";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Availability, Practitioner } from "../port/availability-port";
import { instantOf } from "../port/sdk/time";
import { Pick } from "./form-choices";
import { type Draft, draftFromRules } from "./hours-draft";
import { blankOneOff, OneOffs, type OneOffValues } from "./hours-one-offs";
import { Preview, type PreviewState } from "./hours-preview";
import { blankClosure, type ClosureValues, RoomClosures } from "./hours-rooms";
import { NOTHING_PLACED, type Placed, RulesEditor } from "./hours-rules";
import { OrgFrame } from "./org-settings";

const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const HoursQuery = z.object({
	tab: z.enum(["hours", "rooms"]).catch("hours"),
	person: z.string().max(100).optional().catch(undefined),
	room: z.string().max(100).optional().catch(undefined),
	service: z.string().max(42).optional().catch(undefined),
	week: DateKey.optional().catch(undefined),
	saved: z
		.enum(["rules", "copy", "one-off", "one-off-removed", "closure", "closure-removed"])
		.optional()
		.catch(undefined),
});
export type HoursQuery = z.output<typeof HoursQuery>;

/** What a refused or unsaved change brings back to the page: the draft as typed, the form as sent, and its problems. */
export interface HoursState {
	draft?: { draft: Draft; placed: Placed; dirty: boolean };
	oneOff?: { values: OneOffValues; problems: ReadonlyArray<string> };
	closure?: { values: ClosureValues; problems: ReadonlyArray<string> };
	/** A refusal that is about nothing on the page in particular. */
	notice?: string;
}

/** The practitioners this person may look at: all of them, or only their own calendar with the `own` scope. */
export async function visiblePractitioners(ctx: Ctx): Promise<ReadonlyArray<Practitioner>> {
	const all = await ctx.port.practitioners(ctx.app);
	if (ctx.can.scopes("availability_view").includes("all")) return all;
	const own = ctx.caps.reach.own;
	return own.map((id) => all.find((p) => p.id === id) ?? { id, name: ctx.person.name });
}

/** Whether this person may change this practitioner's hours now (held at a reach that covers them, and not viewing as). */
export const mayEdit = (ctx: Ctx, personId: string): boolean =>
	ctx.can.write("availability_edit") && mayTouch(actionCtx(ctx), "availability_edit", personId);

const SAVED = {
	rules: m.av_saved_rules,
	copy: m.av_saved_copy,
	"one-off": m.av_saved_one_off,
	"one-off-removed": m.av_saved_one_off_removed,
	closure: m.av_saved_closure,
	"closure-removed": m.av_saved_closure_removed,
} as const;

function PersonPick({
	ctx,
	people,
	person,
}: {
	ctx: Ctx;
	people: ReadonlyArray<Practitioner>;
	person: string;
}): JSX.Element | null {
	const o = at(ctx.locale);
	if (people.length <= 1) return null;
	return (
		<form method="get" action="/settings/hours" class="av-dates av-pick">
			<label class="adm-field">
				<span>{m.av_person_pick({}, o)}</span>
				<select class="adm-input" name="person">
					{people.map((p) => (
						<option key={p.id} value={p.id} selected={p.id === person}>
							{p.name}
						</option>
					))}
				</select>
			</label>
			<div class="av-dates__go">
				<button class="adm-btn" type="submit">
					{m.av_person_show({}, o)}
				</button>
			</div>
		</form>
	);
}

/** "Apply to other practitioners": their weekly rules become this one's saved ones, all of them or none. */
function CopyToOthers({
	ctx,
	person,
	others,
}: {
	ctx: Ctx;
	person: string;
	others: ReadonlyArray<Practitioner>;
}): JSX.Element | null {
	const o = at(ctx.locale);
	if (others.length === 0) return null;
	return (
		<section class="adm-card adm-stack" id="copy" aria-labelledby="av-copy">
			<h2 class="adm-h2" id="av-copy">
				{m.av_copy_title({}, o)}
			</h2>
			<p class="adm-muted">{m.av_copy_lead({}, o)}</p>
			<form
				method="post"
				action={`/settings/hours/${encodeURIComponent(person)}/copy`}
				class="adm-stack"
				data-action="availability.copy"
			>
				<Pick legend={m.av_copy_to({}, o)} name="to" items={others} on={[]} />
				<div class="cl-buttons">
					<button class="adm-btn" type="submit">
						{m.av_copy_go({}, o)}
					</button>
				</div>
			</form>
		</section>
	);
}

async function previewState(
	ctx: Ctx,
	person: string,
	service: string,
	week: string,
): Promise<PreviewState> {
	if (service === "") return { kind: "none" };
	const zone = ctx.caps.timeZone;
	try {
		const preview = await ctx.port.availabilityPreview(
			ctx.app,
			person,
			service,
			instantOf(week, 0, zone),
			instantOf(addDays(week, 7), 0, zone),
		);
		return { kind: "shown", preview };
	} catch {
		return { kind: "failed" };
	}
}

async function hoursTab(ctx: Ctx, q: HoursQuery, state: HoursState): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const today = todayIso();
	const people = await visiblePractitioners(ctx);
	const person = people.find((p) => p.id === q.person)?.id ?? people[0]?.id;
	if (person === undefined)
		return (
			<div class="adm-card">
				<EmptyState icon="users" title={m.av_no_practitioners({}, o)} />
			</div>
		);
	const editable = mayEdit(ctx, person);
	let availability: Availability;
	try {
		availability = await ctx.port.availability(ctx.app, person, today);
	} catch {
		return (
			<>
				<PersonPick ctx={ctx} people={people} person={person} />
				<Banner tone="error" icon="alert">
					{m.av_load_failed({}, o)}
				</Banner>
			</>
		);
	}
	const services = await ctx.port.bookableServices(ctx.app);
	const service = q.service ?? services[0]?.slug ?? "";
	const week = weekStart(q.week ?? today);
	const others = people.filter((p) => p.id !== person && mayEdit(ctx, p.id));
	const draft = state.draft ?? {
		draft: draftFromRules(availability.rules),
		placed: NOTHING_PLACED,
		dirty: false,
	};
	return (
		<>
			<PersonPick ctx={ctx} people={people} person={person} />
			{editable ? null : (
				<Banner tone="info" icon="shield">
					<span data-read-only>{m.av_read_only({}, o)}</span>
				</Banner>
			)}
			<section class="adm-stack" aria-labelledby="av-rules">
				<h2 class="adm-h2" id="av-rules">
					{m.av_rules_title({}, o)}
				</h2>
				<p class="adm-muted">{m.av_rules_lead({}, o)}</p>
				<RulesEditor
					locale={ctx.locale}
					person={person}
					draft={draft.draft}
					editable={editable}
					placed={draft.placed}
					dirty={draft.dirty}
				/>
			</section>
			{editable ? <CopyToOthers ctx={ctx} person={person} others={others} /> : null}
			<OneOffs
				locale={ctx.locale}
				person={person}
				items={availability.exceptions}
				editable={editable}
				others={others}
				values={state.oneOff?.values ?? blankOneOff(today)}
				problems={state.oneOff?.problems ?? []}
			/>
			<Preview
				locale={ctx.locale}
				person={person}
				services={services}
				service={service}
				week={week}
				state={await previewState(ctx, person, service, week)}
			/>
		</>
	);
}

async function roomsTab(ctx: Ctx, q: HoursQuery, state: HoursState): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const today = todayIso();
	const rooms = (await ctx.port.columns(ctx.app)).filter((c) => c.kind === "room");
	const room = rooms.find((r) => r.id === q.room)?.id ?? rooms[0]?.id ?? "";
	let items: Awaited<ReturnType<typeof ctx.port.roomClosures>> = [];
	if (room !== "")
		try {
			items = await ctx.port.roomClosures(ctx.app, room, today);
		} catch {
			return (
				<Banner tone="error" icon="alert">
					{m.av_load_failed({}, o)}
				</Banner>
			);
		}
	return (
		<RoomClosures
			locale={ctx.locale}
			rooms={rooms}
			room={room}
			items={items}
			editable={ctx.can.write("rooms_edit")}
			values={state.closure?.values ?? blankClosure(today)}
			problems={state.closure?.problems ?? []}
		/>
	);
}

/** Setări → Program: a practitioner's weekly hours, one-off days and the week the site offers; the rooms' closed days. */
export async function renderHours(
	ctx: Ctx,
	q: HoursQuery,
	state: HoursState = {},
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const rooms = ctx.can.has("rooms_view");
	const tab = rooms ? q.tab : "hours";
	const saved = q.saved === undefined ? null : SAVED[q.saved]({}, o);
	return OrgFrame({
		ctx,
		area: "hours",
		title: areaText("hours", ctx.locale).title,
		children: (
			<div class="adm-stack av-page" style="gap:var(--adm-section-gap)">
				{rooms ? (
					<Tabs
						label={m.av_tabs({}, o)}
						selected={tab}
						tabs={[
							{ key: "hours", label: m.av_tab_hours({}, o), href: "/settings/hours" },
							{ key: "rooms", label: m.av_tab_rooms({}, o), href: "/settings/hours?tab=rooms" },
						]}
					/>
				) : null}
				{saved === null ? null : (
					<Banner tone="info" icon="check">
						<span data-saved>{saved}</span>
					</Banner>
				)}
				{state.notice === undefined ? null : (
					<Banner tone="error" icon="alert">
						<span data-refused>{state.notice}</span>
					</Banner>
				)}
				{tab === "rooms" ? await roomsTab(ctx, q, state) : await hoursTab(ctx, q, state)}
			</div>
		),
	});
}
