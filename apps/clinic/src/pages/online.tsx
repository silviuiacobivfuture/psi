import { Banner, EmptyState, Icon } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import type { Env } from "../app";
import { areaText } from "../lib/area-labels";
import { pauseRefusalText } from "../lib/availability-words";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type {
	BookableService,
	BookingPause,
	BookingPauses,
	Practitioner,
} from "../port/availability-port";
import { newPause, PauseEditor, type PauseValues, pauseValues } from "./online-editor";
import { OrgFrame } from "./org-settings";

const NOCACHE = { "cache-control": "private, no-store" } as const;

const OnlineQuery = z.object({
	edit: z.string().max(100).optional().catch(undefined),
	new: z.literal("1").optional().catch(undefined),
	saved: z.enum(["created", "updated", "lifted"]).optional().catch(undefined),
});
type OnlineQuery = z.output<typeof OnlineQuery>;

const when = (ms: number, locale: Locale, timeZone: string): string =>
	new Intl.DateTimeFormat(locale, {
		timeZone,
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(ms));

/** What a pause covers, in words. */
export function coverText(
	p: Pick<BookingPause, "scope">,
	locale: Locale,
	names: { services: ReadonlyArray<BookableService>; practitioners: ReadonlyArray<Practitioner> },
): string {
	const o = at(locale);
	const s = p.scope;
	switch (s.level) {
		case "organisation":
			return m.av_cover_organisation({}, o);
		case "site":
			return m.av_cover_site({ site: s.site }, o);
		case "service":
			return m.av_cover_service(
				{ name: names.services.find((x) => x.slug === s.service)?.name ?? s.service },
				o,
			);
		case "practitioner":
			return m.av_cover_practitioner(
				{
					name:
						names.practitioners.find((x) => x.id === s.practitionerId)?.name ?? s.practitionerId,
				},
				o,
			);
		default: {
			const never: never = s;
			return never;
		}
	}
}

const STATE_PILL: Readonly<Record<BookingPause["state"], string>> = {
	scheduled: "adm-pill adm-pill--requested",
	active: "adm-pill adm-pill--cancelled",
	ended: "adm-pill adm-pill--leave",
};

function stateText(state: BookingPause["state"], locale: Locale): string {
	const o = at(locale);
	switch (state) {
		case "scheduled":
			return m.av_state_scheduled({}, o);
		case "active":
			return m.av_state_active({}, o);
		case "ended":
			return m.av_state_ended({}, o);
		default: {
			const never: never = state;
			return never;
		}
	}
}

function PauseRow({
	ctx,
	p,
	names,
	editable,
}: {
	ctx: Ctx;
	p: BookingPause;
	names: { services: ReadonlyArray<BookableService>; practitioners: ReadonlyArray<Practitioner> };
	editable: boolean;
}): JSX.Element {
	const o = at(ctx.locale);
	const zone = ctx.caps.timeZone;
	const from =
		p.from === undefined
			? m.av_window_from_start({}, o)
			: m.av_window_from({ at: when(p.from, ctx.locale, zone) }, o);
	const until =
		p.until === undefined
			? m.av_window_until_lifted({}, o)
			: m.av_window_until({ at: when(p.until, ctx.locale, zone) }, o);
	return (
		<li class="adm-card adm-stack av-pause" data-pause={p.id} data-state={p.state}>
			<div class="av-pause__head">
				<strong>{coverText(p, ctx.locale, names)}</strong>
				<span class={STATE_PILL[p.state]}>{stateText(p.state, ctx.locale)}</span>
			</div>
			<span class="adm-muted">
				{from} · {until}
			</span>
			<p class="av-quote">{ctx.locale === "en" ? p.message.en : p.message.ro}</p>
			<ul class="av-flags">
				<li>
					{p.callbacksOpen ? m.av_flag_callbacks_open({}, o) : m.av_flag_callbacks_closed({}, o)}
				</li>
				<li>{p.blockStaff ? m.av_flag_staff_blocked({}, o) : m.av_flag_staff_free({}, o)}</li>
			</ul>
			{editable ? (
				<div class="adm-row av-pause__tools">
					<a
						class="adm-btn"
						href={`/settings/online?edit=${encodeURIComponent(p.id)}#editor`}
						data-action="booking_pause.update"
					>
						<Icon name="edit" />
						<span>{m.av_pause_edit({}, o)}</span>
					</a>
					<form
						method="post"
						action={`/settings/online/pauses/${encodeURIComponent(p.id)}/remove`}
						data-action="booking_pause.remove"
					>
						<button class="adm-btn adm-btn--ghost" type="submit">
							<Icon name="check" />
							<span>{p.state === "ended" ? m.av_pause_delete({}, o) : m.av_pause_lift({}, o)}</span>
						</button>
					</form>
				</div>
			) : null}
		</li>
	);
}

/** What a refused form brings back: what was sent, and the reason in words. */
export interface OnlineState {
	editing?: { id: string | null; values: PauseValues; problem: string };
	notice?: string;
}

/** Setări → Programări online: every pause (scheduled, in force, ended), and the form that makes or changes one. */
export async function renderOnline(
	ctx: Ctx,
	q: OnlineQuery,
	state: OnlineState = {},
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const editable = ctx.can.write("booking_pause_edit");
	let list: BookingPauses | null = null;
	try {
		list = await ctx.port.bookingPauses(ctx.app);
	} catch {
		list = null;
	}
	const [services, practitioners] = await Promise.all([
		ctx.port.bookableServices(ctx.app),
		ctx.port.practitioners(ctx.app),
	]);
	const names = { services, practitioners };
	const edited = list?.items.find((p) => p.id === q.edit);
	const editor =
		state.editing ??
		(edited !== undefined
			? { id: edited.id, values: pauseValues(edited, ctx.caps.timeZone), problem: null }
			: q.new === "1" || list?.items.length === 0
				? { id: null, values: newPause(), problem: null }
				: null);
	const saved = {
		created: m.av_pause_saved_created,
		updated: m.av_pause_saved_updated,
		lifted: m.av_pause_saved_lifted,
	};
	return OrgFrame({
		ctx,
		area: "online",
		title: areaText("online", ctx.locale).title,
		children: (
			<div class="adm-stack av-page" style="gap:var(--adm-section-gap)">
				<p class="adm-muted">{m.av_online_lead({}, o)}</p>
				{q.saved === undefined ? null : (
					<Banner tone="info" icon="check">
						<span data-saved>{saved[q.saved]({}, o)}</span>
					</Banner>
				)}
				{state.notice === undefined ? null : (
					<Banner tone="error" icon="alert">
						<span data-refused>{state.notice}</span>
					</Banner>
				)}
				{list === null ? (
					<Banner tone="error" icon="alert">
						{m.av_load_failed({}, o)}
					</Banner>
				) : list.items.length === 0 ? (
					<div class="adm-card">
						<EmptyState
							icon="check"
							title={m.av_pauses_empty({}, o)}
							text={m.av_pauses_empty_text({}, o)}
						/>
					</div>
				) : (
					<ul class="av-pauses" id="pauses">
						{list.items.map((p) => (
							<PauseRow key={p.id} ctx={ctx} p={p} names={names} editable={editable} />
						))}
					</ul>
				)}
				{editable && editor !== null && list !== null ? (
					<PauseEditor
						locale={ctx.locale}
						id={editor.id}
						values={editor.values}
						sites={list.sites}
						services={services}
						practitioners={practitioners}
						problem={editor.problem}
					/>
				) : null}
				{editable && editor === null ? (
					<div class="cl-buttons">
						<a
							class="adm-btn adm-btn--primary"
							href="/settings/online?new=1#editor"
							data-action="booking_pause.create"
						>
							<Icon name="plus" />
							<span>{m.av_pause_new({}, o)}</span>
						</a>
					</div>
				) : null}
			</div>
		),
	});
}

const Form = z.record(z.string(), z.union([z.string(), z.instanceof(File)]));
const textOf = (form: z.output<typeof Form>, k: string): string => {
	const v = form[k];
	return typeof v === "string" ? v : "";
};

function valuesOf(form: z.output<typeof Form>): PauseValues {
	const level = textOf(form, "level");
	return {
		level:
			level === "site" || level === "service" || level === "practitioner" ? level : "organisation",
		site: textOf(form, "site"),
		service: textOf(form, "service"),
		practitioner: textOf(form, "practitioner"),
		when: textOf(form, "when") === "window" ? "window" : "now",
		from: textOf(form, "from"),
		until: textOf(form, "until"),
		messageRo: textOf(form, "messageRo"),
		messageEn: textOf(form, "messageEn"),
		defaultRo: textOf(form, "defaultRo"),
		defaultEn: textOf(form, "defaultEn"),
		callbacksOpen: textOf(form, "callbacksOpen") !== "",
		blockStaff: textOf(form, "blockStaff") !== "",
	};
}

export function registerOnline(app: Hono<Env>): void {
	app.get("/settings/online", async (c) =>
		c.html(await renderOnline(c.var.ctx, OnlineQuery.parse(c.req.query())), 200, NOCACHE),
	);
	const save = (id: string | null) => async (c: import("hono").Context<Env>) => {
		const ctx = c.var.ctx;
		const values = valuesOf(Form.parse(await c.req.parseBody()));
		const result = await runAction(
			actionCtx(ctx),
			id === null ? "booking_pause.create" : "booking_pause.update",
			id === null ? values : { ...values, id },
			{ confirmed: true },
		);
		if (result.status === "ok") return c.redirect(result.to ?? "/settings/online", 303);
		const reason = result.status === "refused" ? result.reason : undefined;
		const problem =
			result.status === "refused" && result.code === "forbidden"
				? m.av_forbidden({}, at(ctx.locale))
				: pauseRefusalText(reason, ctx.locale);
		const status =
			result.status === "refused" && result.code === "forbidden"
				? 403
				: result.status === "refused" && result.code === "not-found"
					? 404
					: 400;
		return c.html(
			await renderOnline(ctx, {}, { editing: { id, values, problem } }),
			status,
			NOCACHE,
		);
	};
	app.post("/settings/online/pauses", save(null));
	app.post("/settings/online/pauses/:id", (c) => save(c.req.param("id") ?? "")(c));
	app.post("/settings/online/pauses/:id/remove", async (c) => {
		const ctx = c.var.ctx;
		const result = await runAction(
			actionCtx(ctx),
			"booking_pause.remove",
			{ id: c.req.param("id") ?? "" },
			{ confirmed: true },
		);
		if (result.status === "ok") return c.redirect(result.to ?? "/settings/online", 303);
		const status = result.status === "refused" && result.code === "not-found" ? 404 : 400;
		return c.html(
			await renderOnline(ctx, {}, { notice: m.av_not_saved({}, at(ctx.locale)) }),
			status,
			NOCACHE,
		);
	});
}
