import { escapeHtml, toastElement } from "@psi/ui/admin";
import type { Context, Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import type { Env } from "../app";
import { suggest } from "../domain/conflicts";
import { parseAmountOrZero } from "../domain/numbers";
import type { Ctx } from "../lib/context";
import { IsoDay, todayIso } from "../lib/dates";
import { type Editor, EditorSignalsSchema, minutesOf } from "../lib/editor-signals";
import { refusalText } from "../lib/failures";
import { at } from "../lib/i18n";
import { type Stream, signalsOf, sse } from "../lib/sse";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import type { Appointment, Column, Service } from "../port/schema";
import { blankEditor, EditorForm, editorOf } from "./editor-form";
import { ClientResults, ConflictPanel, PackageChoice } from "./editor-parts";

const html = async (el: { toString(): string | Promise<string> }): Promise<string> =>
	await el.toString();

const OpenQuery = z.object({
	date: IsoDay.catch(""),
	time: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.catch("09:00"),
	col: z.string().max(40).catch(""),
	id: z.string().max(40).catch(""),
});

interface Live {
	columns: ReadonlyArray<Column>;
	services: ReadonlyArray<Service>;
	dayAppointments: ReadonlyArray<Appointment>;
}

async function loadLive(ctx: Ctx, date: string): Promise<Live> {
	const day = await ctx.port.calendar(ctx.app, date, date);
	return { columns: day.columns, services: day.services, dayAppointments: day.appointments };
}

const probeOf = (e: Editor, durationMin: number) => ({
	date: e.date,
	startMin: minutesOf(e.time),
	durationMin,
	columnIds: [e.col, e.room, e.device].filter((x) => x !== ""),
	...(e.id === "" ? {} : { ignoreId: e.id }),
});

/** The live fragments for what is typed now: conflicts with a way out, the client's packages. */
export async function liveFragments(
	ctx: Ctx,
	e: Editor,
	live: Live,
): Promise<{ conflicts: JSX.Element; packages: JSX.Element }> {
	const dur = Number.isFinite(e.dur) && e.dur >= 5 ? Math.trunc(e.dur) : 0;
	const probe = probeOf(e, dur);
	const conflicts = dur === 0 ? [] : await ctx.port.findConflicts(ctx.app, probe);
	const suggestions =
		conflicts.length === 0 ? null : suggest(live.dayAppointments, live.columns, probe);
	const [packages, appointments] =
		e.client === ""
			? [[], []]
			: await Promise.all([
					ctx.port.packages(ctx.app, e.client),
					ctx.port.clientAppointments(ctx.app, e.client),
				]);
	return {
		conflicts: (
			<ConflictPanel
				conflicts={conflicts}
				suggestions={suggestions}
				columns={live.columns}
				locale={ctx.locale}
			/>
		),
		packages: (
			<PackageChoice
				packages={packages}
				appointments={appointments}
				today={todayIso()}
				clientChosen={e.client !== ""}
				locale={ctx.locale}
			/>
		),
	};
}

/** The editor for an editor state: the form with its first live fragments. */
export async function editorBody(ctx: Ctx, e: Editor): Promise<string> {
	const live = await loadLive(ctx, e.date);
	const frag = await liveFragments(ctx, e, live);
	return await html(
		<EditorForm
			editor={e}
			columns={live.columns}
			services={live.services}
			locale={ctx.locale}
			clients={<ClientResults clients={[]} query="" locale={ctx.locale} />}
			conflicts={frag.conflicts}
			packages={frag.packages}
		/>,
	);
}

/** The editor's state for "open it here": a new appointment at a slot, or an existing one. */
export async function openState(
	ctx: Ctx,
	q: { date: string; time: string; col: string; id: string },
): Promise<Editor | null> {
	if (q.id !== "") {
		const a = await ctx.port.appointment(ctx.app, q.id);
		if (a === null) return null;
		const [columns, client] = await Promise.all([
			ctx.port.columns(ctx.app),
			a.clientId === null ? Promise.resolve(null) : ctx.port.client(ctx.app, a.clientId),
		]);
		return editorOf(a, client ?? undefined, columns, ctx.locale);
	}
	const [columns, services] = await Promise.all([
		ctx.port.columns(ctx.app),
		ctx.port.services(ctx.app),
	]);
	return blankEditor({
		date: q.date === "" ? todayIso() : q.date,
		startMin: minutesOf(q.time),
		col: columns.some((c) => c.id === q.col) ? q.col : (columns[0]?.id ?? ""),
		service: services[0],
	});
}

type Problem = "client" | "service" | "duration" | "date" | "price" | "repeat";

/** Everything the editor says is checked here; the first thing wrong is named. */
function problem(e: Editor, services: ReadonlyArray<Service>): Problem | null {
	if (e.client === "" && !(e.newc && e.nName.trim() !== "")) return "client";
	if (!services.some((s) => s.id === e.svc)) return "service";
	if (!Number.isInteger(e.dur) || e.dur < 5 || e.dur > 600) return "duration";
	if (!IsoDay.safeParse(e.date).success) return "date";
	if (e.pkg === "" && parseAmountOrZero(e.price) === null) return "price";
	if (e.rec === "count" && !(Number.isInteger(e.recN) && e.recN >= 2 && e.recN <= 52))
		return "repeat";
	if (e.rec === "until" && !(IsoDay.safeParse(e.recUntil).success && e.recUntil > e.date))
		return "repeat";
	return null;
}

const problemText = (p: Problem, locale: "ro" | "en"): string => {
	const o = at(locale);
	switch (p) {
		case "client":
			return m.ap_err_client({}, o);
		case "service":
			return m.ap_err_service({}, o);
		case "duration":
			return m.ap_err_duration({}, o);
		case "date":
			return m.ap_err_date({}, o);
		case "price":
			return m.pkg_invalid_value({}, o);
		case "repeat":
			return m.ap_err_repeat({}, o);
		default: {
			const never: never = p;
			return never;
		}
	}
};

async function signals(c: Context<Env>): Promise<Editor | null> {
	const s = await signalsOf(c, EditorSignalsSchema);
	return s === null ? null : s.ed;
}

export function registerEditor(app: Hono<Env>): void {
	// Opens the editor (new at a slot, or an existing appointment) into the side panel / sheet.
	app.get("/calendar/editor", async (c) => {
		const ctx = c.var.ctx;
		const q = OpenQuery.parse(c.req.query());
		const state = await openState(ctx, q);
		return sse(async (stream) => {
			if (state === null) {
				stream.patchElements(
					toastElement(m.error_title({}, at(ctx.locale)), m.dismiss({}, at(ctx.locale))),
				);
				return;
			}
			stream.patchElements(await editorBody(ctx, state));
			stream.patchSignals(JSON.stringify({ ed: state, editor: true, detail: false }));
			// Keyboard users land inside the panel, where Escape closes it.
			stream.executeScript(
				"setTimeout(() => document.querySelector('#editor-body input[type=search], #editor-body select')?.focus(), 60)",
			);
		});
	});

	app.post("/calendar/editor/check", async (c) => {
		const ctx = c.var.ctx;
		const e = await signals(c);
		return sse(async (stream) => {
			if (e === null || !IsoDay.safeParse(e.date).success) return;
			const frag = await liveFragments(ctx, e, await loadLive(ctx, e.date));
			stream.patchElements(await html(frag.conflicts));
			stream.patchElements(await html(frag.packages));
		});
	});

	app.post("/calendar/editor/clients", async (c) => {
		const ctx = c.var.ctx;
		const e = await signals(c);
		return sse(async (stream) => {
			if (e === null) return;
			const found =
				e.q.trim() === "" ? [] : (await ctx.port.clients(ctx.app, "current", e.q)).slice(0, 6);
			stream.patchElements(
				await html(<ClientResults clients={found} query={e.q} locale={ctx.locale} />),
			);
		});
	});

	app.post("/calendar/editor/save", async (c) => {
		const ctx = c.var.ctx;
		const o = at(ctx.locale);
		const e = await signals(c);
		return sse(async (stream) => {
			const toast = (text: string): void => {
				stream.patchElements(toastElement(text, m.dismiss({}, o)));
			};
			if (e === null) return toast(m.toast_invalid({}, o));
			const live = await loadLive(ctx, e.date).catch(() => null);
			if (live === null) return toast(m.error_title({}, o));
			const bad = problem(e, live.services);
			if (bad !== null) return toast(problemText(bad, ctx.locale));
			try {
				const saved = await write(ctx, e);
				stream.patchSignals(JSON.stringify({ editor: false }));
				toast(
					saved.created > 1 ? m.ap_created_many({ n: saved.created }, o) : m.toast_created({}, o),
				);
				stream.executeScript(`location.assign('/calendar?view=day&date=${escapeHtml(e.date)}')`);
			} catch (err) {
				await refused(ctx, e, live, err, stream, toast);
			}
		});
	});
}

async function write(ctx: Ctx, e: Editor): Promise<{ created: number }> {
	const price = e.pkg === "" ? (parseAmountOrZero(e.price) ?? 0) : 0;
	const resourceIds = [e.room, e.device].filter((x) => x !== "");
	const clientId =
		e.client !== ""
			? e.client
			: (
					await ctx.port.createClient(ctx.app, {
						name: e.nName,
						phone: e.nPhone.trim() === "" ? null : e.nPhone,
						guardian: e.nGuardian.trim() === "" ? null : e.nGuardian,
					})
				).id;
	if (e.id !== "") {
		const current = await ctx.port.appointment(ctx.app, e.id);
		if (current === null) throw new PortError("not-found", e.id);
		await ctx.port.updateAppointment(ctx.app, e.id, {
			date: e.date,
			startMin: minutesOf(e.time),
			durationMin: Math.trunc(e.dur),
			columnId: e.col,
			clientId,
			serviceId: e.svc,
			note: e.note,
			resourceIds,
			packageId: e.pkg === "" ? null : e.pkg,
			priceBani: price,
			remind: e.remind,
			...(current.status === "confirmed" || current.status === "requested"
				? { status: e.status }
				: {}),
		});
		return { created: 0 };
	}
	const made = await ctx.port.createAppointments(ctx.app, {
		date: e.date,
		startMin: minutesOf(e.time),
		columnId: e.col,
		clientId,
		serviceId: e.svc,
		durationMin: Math.trunc(e.dur),
		status: e.status,
		note: e.note,
		resourceIds,
		packageId: e.pkg === "" ? null : e.pkg,
		priceBani: price,
		remind: e.remind,
		recurrence:
			e.rec === "count"
				? { count: Math.trunc(e.recN) }
				: e.rec === "until"
					? { until: e.recUntil }
					: null,
	});
	const first = made[0];
	if (e.payNow && e.pkg === "" && first !== undefined)
		await ctx.port.collectPayment(ctx.app, first.id, e.payMethod);
	return { created: made.length };
}

async function refused(
	ctx: Ctx,
	e: Editor,
	live: Live,
	err: unknown,
	stream: Stream,
	toast: (text: string) => void,
): Promise<void> {
	const o = at(ctx.locale);
	if (err instanceof PortError && err.code === "conflict") {
		const dur = Math.trunc(e.dur);
		const suggestions = suggest(live.dayAppointments, live.columns, probeOf(e, dur));
		stream.patchElements(
			await html(
				<ConflictPanel
					conflicts={err.conflicts.length > 0 ? err.conflicts : []}
					suggestions={suggestions}
					columns={live.columns}
					locale={ctx.locale}
				/>,
			),
		);
		toast(m.ap_conflict_blocked({}, o));
		return;
	}
	toast(
		refusalText(err, ctx.locale) ??
			(err instanceof PortError && err.code === "invalid"
				? m.toast_invalid({}, o)
				: m.error_title({}, o)),
	);
}
