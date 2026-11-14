import { Segmented } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import type { Env } from "../app";
import { appName, Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { MatrixList } from "./list";
import { columnName, Legend } from "./marks";
import { areasOf, type Column, columnsOf, onlyDifferences, PLATFORM_COLUMN } from "./model";
import { ROLES_MATRIX_PATH } from "./path";
import { MatrixTable } from "./table";

const Id = z.string().trim().min(1).max(100).optional().catch(undefined);
/** What the page is asked to show: every choice is a link or a GET form, so it works without scripts. */
const QuerySchema = z.object({
	diff: z.literal("1").optional().catch(undefined),
	detail: z.literal("all").optional().catch(undefined),
	a: Id,
	b: Id,
	role: Id,
});
type Query = z.output<typeof QuerySchema>;

/** The address of the page with some choices changed, the others kept. */
function hrefWith(q: Query, change: Partial<Query>): string {
	const next = { ...q, ...change };
	const params = new URLSearchParams(
		Object.entries(next).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]])),
	);
	const s = params.toString();
	return s === "" ? ROLES_MATRIX_PATH : `${ROLES_MATRIX_PATH}?${s}`;
}

function Choices({
	ctx,
	q,
	columns,
	phone,
}: {
	ctx: Ctx;
	q: Query;
	columns: ReadonlyArray<Column>;
	phone: string;
}): JSX.Element {
	const o = at(ctx.locale);
	const options = (selected: string | undefined, none: boolean) =>
		[
			...(none ? [{ value: "", label: m.rm_compare_all({}, o) }] : []),
			...columns.map((c) => ({ value: c.id, label: columnName(c, ctx.locale) })),
		].map((x) => (
			<option key={x.value} value={x.value} selected={x.value === (selected ?? "")}>
				{x.label}
			</option>
		));
	return (
		<form
			method="get"
			action={ROLES_MATRIX_PATH}
			class="adm-card rm-filters"
			aria-label={m.rm_filters({}, o)}
			data-filters
		>
			<label class="adm-field rm-phone">
				<span>{m.rm_role_pick({}, o)}</span>
				<select class="adm-input" name="role">
					{options(phone, false)}
				</select>
			</label>
			<label class="adm-field">
				<span>{m.rm_compare_a({}, o)}</span>
				<select class="adm-input" name="a">
					{options(q.a, true)}
				</select>
			</label>
			<label class="adm-field">
				<span>{m.rm_compare_b({}, o)}</span>
				<select class="adm-input" name="b">
					{options(q.b, true)}
				</select>
			</label>
			<label class="adm-check">
				<input type="checkbox" name="diff" value="1" checked={q.diff === "1"} />
				{m.rm_diff({}, o)}
			</label>
			{q.detail === undefined ? null : <input type="hidden" name="detail" value={q.detail} />}
			<div class="rm-filters__buttons">
				<button type="submit" class="adm-btn adm-btn--primary">
					{m.rm_apply({}, o)}
				</button>
				<a class="adm-btn adm-btn--ghost" href={ROLES_MATRIX_PATH}>
					{m.rm_reset({}, o)}
				</a>
			</div>
		</form>
	);
}

/** "Matricea rolurilor": what every role of the organisation may do, side by side, for every member to read. */
export async function RolesMatrixPage(ctx: Ctx, raw: Record<string, string>): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const q = QuerySchema.parse(raw);
	const summary = await ctx.port.roleSummary(ctx.app);
	const all = columnsOf(summary, m.rm_platform({}, o));
	const known = (id: string | undefined): Column | undefined => all.find((c) => c.id === id);
	const yours = new Set<string>([
		...ctx.caps.roles,
		...(ctx.platformAdmin && ctx.viewAs === null ? [PLATFORM_COLUMN] : []),
	]);
	const a = known(q.a);
	const b = known(q.b);
	const pair = a !== undefined && b !== undefined && a.id !== b.id ? [a, b] : null;
	const shown = pair ?? all;
	const full = areasOf(shown);
	const diff = q.diff === "1";
	const areas = diff ? onlyDifferences(full, shown) : full;
	// The phone shows one role: the one asked for, else the viewer's own, else the first organisation role.
	const phoneOne =
		known(q.role) ??
		all.find((c) => c.kind === "role" && yours.has(c.id)) ??
		all.find((c) => c.kind === "role") ??
		all[0];
	const phone = pair ?? (phoneOne === undefined ? [] : [phoneOne]);
	const expanded = diff || q.detail === "all";
	return Page({
		ctx,
		current: "me",
		title: m.rm_title({}, o),
		children: (
			<div class="adm-page rm-page" data-roles-matrix>
				<p class="adm-muted">{m.rm_lead({ app: appName(ctx.app, ctx.locale) }, o)}</p>
				<div class="rm-notes">
					<section class="adm-card rm-note" data-platform-note>
						<h2 class="adm-h2">{m.rm_platform({}, o)}</h2>
						<p>{m.rm_platform_note({}, o)}</p>
					</section>
					<section class="adm-card rm-note" data-assistant-note>
						<h2 class="adm-h2">{m.rm_assistant_title({}, o)}</h2>
						<p>{m.rm_assistant_note({}, o)}</p>
					</section>
				</div>
				<Choices ctx={ctx} q={q} columns={all} phone={phoneOne?.id ?? ""} />
				<div class="rm-desktop">
					<Segmented
						label={m.rm_view_label({}, o)}
						current={expanded ? "all" : "areas"}
						items={[
							{
								key: "areas",
								label: m.rm_detail_areas({}, o),
								href: hrefWith(q, { detail: undefined }),
							},
							{
								key: "all",
								label: m.rm_detail_all({}, o),
								href: hrefWith(q, { detail: "all" }),
							},
						]}
					/>
				</div>
				<Legend locale={ctx.locale} />
				{areas.length === 0 ? (
					<p class="adm-card" role="status" data-no-diff>
						{m.rm_no_diff({}, o)}
					</p>
				) : (
					<>
						<MatrixTable
							areas={areas}
							columns={shown}
							yours={yours}
							expanded={expanded}
							locale={ctx.locale}
						/>
						<MatrixList areas={areas} columns={phone} yours={yours} locale={ctx.locale} />
					</>
				)}
			</div>
		),
	});
}

/** Every member may open it: it needs nothing but membership (the service answers the summary to any member). */
export function registerRolesMatrix(app: Hono<Env>): void {
	app.get(ROLES_MATRIX_PATH, async (c) =>
		c.html(await RolesMatrixPage(c.var.ctx, c.req.query()), 200, {
			"cache-control": "private, no-store",
		}),
	);
}
