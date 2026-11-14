import { MAX_AVAILABILITY_RULES } from "@psi/scheduling-sdk/contract";
import type { Context, Hono } from "hono";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import type { ActionResult } from "../actions/types";
import type { Env } from "../app";
import { entryReasonText, planReasonText } from "../lib/availability-words";
import type { Ctx } from "../lib/context";
import { dayLong, todayIso } from "../lib/dates";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { EntryProblemItem, PlanProblemItem } from "../port/availability-port";
import { HoursQuery, type HoursState, renderHours, visiblePractitioners } from "./hours";
import {
	applyOp,
	type Built,
	buildRules,
	type Draft,
	DraftForm,
	draftOf,
	opOf,
} from "./hours-draft";
import type { OneOffValues } from "./hours-one-offs";
import type { ClosureValues } from "./hours-rooms";
import type { Placed } from "./hours-rules";

const NOCACHE = { "cache-control": "private, no-store" } as const;
/** Problems about a schedule's dates, shown once on its dates rather than on each of its rows. */
const DATE_REASONS = new Set<PlanProblemItem["reason"]>(["bad_date", "validity", "period_start"]);

type FormValue = string | ReadonlyArray<string>;

/** A posted form's text fields (a repeated field as a list); files are not read here. */
async function formOf(c: Context<Env>): Promise<Record<string, FormValue>> {
	const body = await c.req.parseBody({ all: true });
	const out: Record<string, FormValue> = {};
	for (const [k, v] of Object.entries(body)) {
		if (typeof v === "string") out[k] = v;
		else if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
	}
	return out;
}
const text = (v: FormValue | undefined): string => (typeof v === "string" ? v : (v?.[0] ?? ""));
const list = (v: FormValue | undefined): string[] =>
	v === undefined ? [] : typeof v === "string" ? [v] : [...v];

const scheduleOf = (key: string): number => Number(/^s(\d+)\./.exec(key)?.[1] ?? "0");

/** A refused plan's problems, each beside the row (or the schedule's dates) it is about. */
export function placePlan(
	problems: ReadonlyArray<PlanProblemItem>,
	built: Pick<Built, "keys" | "unreadable" | "modeless">,
	ctx: Pick<Ctx, "locale">,
): Placed {
	const rows = new Map<string, string[]>();
	const schedules = new Map<number, string[]>();
	const general: string[] = [];
	const add = <K,>(map: Map<K, string[]>, key: K, say: string): void => {
		const held = map.get(key) ?? [];
		if (!held.includes(say)) map.set(key, [...held, say]);
	};
	for (const key of built.unreadable) add(rows, key, m.av_reason_times({}, at(ctx.locale)));
	for (const key of built.modeless) add(rows, key, planReasonText("no_mode", ctx.locale));
	for (const p of problems) {
		const say = planReasonText(p.reason, ctx.locale);
		const key = p.index === undefined ? undefined : built.keys[p.index];
		if (key === undefined) general.push(say);
		else if (DATE_REASONS.has(p.reason)) add(schedules, scheduleOf(key), say);
		else add(rows, key, say);
	}
	return { rows, schedules, general };
}

/** A refused entry's problems in words: the date and, when several practitioners were asked, whose day it is. */
async function entryLines(
	ctx: Ctx,
	problems: ReadonlyArray<EntryProblemItem>,
	several: boolean,
): Promise<string[]> {
	const names = several ? await visiblePractitioners(ctx) : [];
	return [
		...new Set(
			problems.map((p) => {
				const say = entryReasonText(p.reason, ctx.locale);
				const who = names.find((n) => n.id === p.personId)?.name;
				const date = p.date === undefined ? undefined : dayLong(ctx.locale, p.date);
				const where = [date, who].filter((x) => x !== undefined).join(" · ");
				return where === "" ? say : `${where}: ${say}`;
			}),
		),
	];
}

/** What a refusal says when it is about nothing on the form in particular. */
function noticeOf(result: ActionResult, ctx: Ctx): string {
	const o = at(ctx.locale);
	if (result.status !== "refused") return m.av_not_saved({}, o);
	if (result.code === "forbidden") return m.av_forbidden({}, o);
	if (result.code === "not-found") return m.av_not_found({}, o);
	return m.av_not_saved({}, o);
}

async function page(
	c: Context<Env>,
	q: Partial<HoursQuery>,
	state: HoursState,
	status: 200 | 400 | 403 | 404,
): Promise<Response> {
	return c.html(await renderHours(c.var.ctx, HoursQuery.parse(q), state), status, NOCACHE);
}

const statusOf = (result: ActionResult): 400 | 403 | 404 =>
	result.status === "refused" && result.code === "forbidden"
		? 403
		: result.status === "refused" && result.code === "not-found"
			? 404
			: 400;

/** Saves the draft, or changes it and shows it again unsaved (an interval added or removed, Monday copied). */
async function rules(c: Context<Env>): Promise<Response> {
	const ctx = c.var.ctx;
	const person = c.req.param("person") ?? "";
	const form = DraftForm.parse(
		Object.fromEntries(Object.entries(await formOf(c)).map(([k, v]) => [k, text(v)])),
	);
	const draft: Draft = draftOf(form);
	const op = opOf(form.op, todayIso());
	const empty: Placed = { rows: new Map(), schedules: new Map(), general: [] };
	if (op !== null)
		return page(
			c,
			{ person },
			{ draft: { draft: applyOp(draft, op), placed: empty, dirty: true } },
			200,
		);
	const built = buildRules(draft);
	// Past the contract's own bound the service would not read the plan at all: said as its `too_many`, nothing sent.
	if (built.rules.length > MAX_AVAILABILITY_RULES)
		return page(
			c,
			{ person },
			{ draft: { draft, placed: placePlan([{ reason: "too_many" }], built, ctx), dirty: true } },
			400,
		);
	if (built.unreadable.length > 0 || built.modeless.length > 0)
		return page(
			c,
			{ person },
			{ draft: { draft, placed: placePlan([], built, ctx), dirty: true } },
			400,
		);
	const result = await runAction(
		actionCtx(ctx),
		"availability.rules",
		{ person, rules: built.rules },
		{ confirmed: true },
	);
	if (result.status === "ok") return c.redirect(result.to ?? "/settings/hours", 303);
	const problems =
		result.status === "refused" && result.problems?.reason === "plan"
			? result.problems.problems
			: null;
	if (problems !== null)
		return page(
			c,
			{ person },
			{ draft: { draft, placed: placePlan(problems, built, ctx), dirty: true } },
			400,
		);
	return page(
		c,
		{ person },
		{ draft: { draft, placed: empty, dirty: true }, notice: noticeOf(result, ctx) },
		statusOf(result),
	);
}

async function copy(c: Context<Env>): Promise<Response> {
	const ctx = c.var.ctx;
	const person = c.req.param("person") ?? "";
	const form = await formOf(c);
	const result = await runAction(
		actionCtx(ctx),
		"availability.copy",
		{ person, to: list(form.to) },
		{ confirmed: true },
	);
	if (result.status === "ok") return c.redirect(result.to ?? "/settings/hours", 303);
	const plan = result.status === "refused" && result.problems?.reason === "plan";
	const notice = plan
		? m.av_copy_refused({}, at(ctx.locale))
		: list(form.to).length === 0
			? m.av_copy_none({}, at(ctx.locale))
			: noticeOf(result, ctx);
	return page(c, { person }, { notice }, statusOf(result));
}

const oneOffValues = (form: Record<string, FormValue>): OneOffValues => {
	const kind = text(form.kind);
	return {
		from: text(form.from),
		until: text(form.until),
		kind: kind === "closed-part" || kind === "open" ? kind : "closed-day",
		start: text(form.start),
		end: text(form.end),
		onsite: text(form.onsite) !== "",
		online: text(form.online) !== "",
		also: list(form.also),
	};
};

async function oneOff(c: Context<Env>): Promise<Response> {
	const ctx = c.var.ctx;
	const person = c.req.param("person") ?? "";
	const form = await formOf(c);
	const values = oneOffValues(form);
	const params = { ...values, person, until: values.until, also: [...values.also] };
	const result = await runAction(actionCtx(ctx), "availability.one_off_add", params, {
		confirmed: true,
	});
	if (result.status === "ok") return c.redirect(result.to ?? "/settings/hours", 303);
	const problems =
		result.status === "refused" && result.problems?.reason === "entry"
			? result.problems.problems
			: null;
	const lines =
		problems !== null
			? await entryLines(ctx, problems, values.also.length > 0)
			: result.status === "refused" && result.code === "invalid"
				? [m.av_reason_entry_form({}, at(ctx.locale))]
				: [];
	return page(
		c,
		{ person },
		{
			oneOff: { values, problems: lines },
			...(lines.length === 0 ? { notice: noticeOf(result, ctx) } : {}),
		},
		statusOf(result),
	);
}

async function oneOffRemove(c: Context<Env>): Promise<Response> {
	const ctx = c.var.ctx;
	const person = c.req.param("person") ?? "";
	const entry = c.req.param("entry") ?? "";
	const result = await runAction(
		actionCtx(ctx),
		"availability.one_off_remove",
		{ person, entry },
		{ confirmed: true },
	);
	if (result.status === "ok") return c.redirect(result.to ?? "/settings/hours", 303);
	return page(c, { person }, { notice: noticeOf(result, ctx) }, statusOf(result));
}

const closureValues = (form: Record<string, FormValue>): ClosureValues => ({
	from: text(form.from),
	until: text(form.until),
	part: text(form.part) !== "",
	start: text(form.start),
	end: text(form.end),
});

async function closure(c: Context<Env>): Promise<Response> {
	const ctx = c.var.ctx;
	const room = c.req.param("room") ?? "";
	const values = closureValues(await formOf(c));
	const result = await runAction(
		actionCtx(ctx),
		"rooms.closure_add",
		{ ...values, room },
		{ confirmed: true },
	);
	if (result.status === "ok") return c.redirect(result.to ?? "/settings/hours?tab=rooms", 303);
	const problems =
		result.status === "refused" && result.problems?.reason === "entry"
			? result.problems.problems
			: null;
	const lines =
		problems !== null
			? await entryLines(ctx, problems, false)
			: result.status === "refused" && result.code === "invalid"
				? [m.av_reason_entry_form({}, at(ctx.locale))]
				: [];
	return page(
		c,
		{ tab: "rooms", room },
		{
			closure: { values, problems: lines },
			...(lines.length === 0 ? { notice: noticeOf(result, ctx) } : {}),
		},
		statusOf(result),
	);
}

async function closureRemove(c: Context<Env>): Promise<Response> {
	const ctx = c.var.ctx;
	const room = c.req.param("room") ?? "";
	const id = c.req.param("closure") ?? "";
	const result = await runAction(
		actionCtx(ctx),
		"rooms.closure_remove",
		{ room, closure: id },
		{ confirmed: true },
	);
	if (result.status === "ok") return c.redirect(result.to ?? "/settings/hours?tab=rooms", 303);
	return page(c, { tab: "rooms", room }, { notice: noticeOf(result, ctx) }, statusOf(result));
}

export function registerHours(app: Hono<Env>): void {
	app.get("/settings/hours", async (c) =>
		c.html(await renderHours(c.var.ctx, HoursQuery.parse(c.req.query())), 200, NOCACHE),
	);
	app.post("/settings/hours/rooms/:room/closures", closure);
	app.post("/settings/hours/rooms/:room/closures/:closure/remove", closureRemove);
	app.post("/settings/hours/:person/rules", rules);
	app.post("/settings/hours/:person/copy", copy);
	app.post("/settings/hours/:person/one-offs", oneOff);
	app.post("/settings/hours/:person/one-offs/:entry/remove", oneOffRemove);
}
