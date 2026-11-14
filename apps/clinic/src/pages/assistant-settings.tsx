import {
	type AssistantSkillType,
	type AssistantSurfaceName,
	BUILT_IN_SETTINGS,
} from "@psi/scheduling-sdk/contract";
import { Banner } from "@psi/ui/admin";
import type { Context, Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import type { Env } from "../app";
import { areaText } from "../lib/area-labels";
import { ROLE_FIELD_NAMES } from "../lib/assistant-form";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { AssistantOrgConfigType } from "../port/port";
import type { Role } from "../port/schema";
import { Budget, Meter, SurfaceFields } from "./assistant-fields";
import { OrgFrame } from "./org-settings";

type O = ReturnType<typeof at>;
const NOCACHE = { "cache-control": "private, no-store" } as const;
const SURFACES: ReadonlyArray<AssistantSurfaceName> = ["staff", "visitor"];
const surfaceTitle = (s: AssistantSurfaceName, o: O): string =>
	s === "staff" ? m.as_surface_staff({}, o) : m.as_surface_visitor({}, o);

function Usage({ view, ctx, o }: { view: AssistantOrgConfigType; ctx: Ctx; o: O }): JSX.Element {
	return (
		<section class="adm-card adm-stack" aria-labelledby="as-usage">
			<h2 class="adm-h2" id="as-usage">
				{m.as_usage({}, o)}
			</h2>
			<div class="adm-grid">
				{SURFACES.map((s) => (
					<div key={s} class="adm-stack" data-usage={s}>
						<h3 class="adm-h3">{surfaceTitle(s, o)}</h3>
						<Budget
							used={view.usage[s].month.costMicroUsd}
							total={view.effective[s].budget.monthlyMicroUsd}
							locale={ctx.locale}
							o={o}
						/>
						<div class="adm-grid">
							<Meter
								title={m.as_usage_month({}, o)}
								meter={view.usage[s].month}
								locale={ctx.locale}
								o={o}
							/>
							<Meter
								title={m.as_usage_day({}, o)}
								meter={view.usage[s].day}
								locale={ctx.locale}
								o={o}
							/>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function Skill({
	skill,
	n,
	o,
}: {
	skill: AssistantSkillType | undefined;
	n: number;
	o: O;
}): JSX.Element {
	const name = (k: string): string => `skill.${n}.${k}`;
	return (
		<fieldset class="adm-card adm-stack" data-skill={skill?.id ?? "new"}>
			<legend class="adm-h3">{skill?.name ?? m.as_s_new({}, o)}</legend>
			<input type="hidden" name={name("id")} value={skill?.id ?? ""} />
			<label class="adm-field">
				<span>{m.as_s_name({}, o)}</span>
				<input class="adm-input" name={name("name")} value={skill?.name ?? ""} maxlength={80} />
			</label>
			<label class="adm-field">
				<span>{m.as_s_description({}, o)}</span>
				<input
					class="adm-input"
					name={name("description")}
					value={skill?.description ?? ""}
					maxlength={400}
				/>
			</label>
			<label class="adm-field">
				<span>{m.as_s_triggers({}, o)}</span>
				<input
					class="adm-input"
					name={name("triggers")}
					value={(skill?.triggers ?? []).join(", ")}
					maxlength={800}
				/>
			</label>
			<label class="adm-field">
				<span>{m.as_s_instructions({}, o)}</span>
				<textarea class="adm-input" name={name("instructions")} rows={4} maxlength={4_000}>
					{skill?.instructions ?? ""}
				</textarea>
			</label>
			<label class="adm-field">
				<span>{m.as_s_tools({}, o)}</span>
				<input
					class="adm-input"
					name={name("tools")}
					value={(skill?.tools ?? []).join(", ")}
					maxlength={4_000}
				/>
			</label>
			<fieldset class="adm-row">
				<legend>{m.as_s_surfaces({}, o)}</legend>
				{SURFACES.map((s) => (
					<label key={s} class="adm-row">
						<input
							type="checkbox"
							name={name(`surface.${s}`)}
							checked={skill === undefined ? s === "staff" : skill.surfaces.includes(s)}
						/>
						<span>{surfaceTitle(s, o)}</span>
					</label>
				))}
			</fieldset>
			<label class="adm-row">
				<input type="checkbox" name={name("enabled")} checked={skill?.enabled ?? true} />
				<span>{m.as_s_enabled({}, o)}</span>
			</label>
			{skill === undefined ? null : (
				<label class="adm-row">
					<input type="checkbox" name={name("remove")} />
					<span>{m.as_s_remove({}, o)}</span>
				</label>
			)}
		</fieldset>
	);
}

const ROLE_LABEL = {
	enabled: (o: O) => m.as_r_enabled({}, o),
	model: (o: O) => m.as_r_model({}, o),
	maxToolCalls: (o: O) => m.as_r_maxToolCalls({}, o),
	messagesPerDay: (o: O) => m.as_r_messagesPerDay({}, o),
	tokensPerRequest: (o: O) => m.as_r_tokensPerRequest({}, o),
} as const;

/** What a role's field inherits: the organisation's staff setting it overrides. */
function roleInherited(
	field: Exclude<(typeof ROLE_FIELD_NAMES)[number], "enabled">,
	s: AssistantOrgConfigType["effective"]["staff"],
): string {
	switch (field) {
		case "model":
			return s.model.primary;
		case "maxToolCalls":
			return String(s.maxToolCalls);
		case "messagesPerDay":
			return String(s.messages.perDay);
		case "tokensPerRequest":
			return String(s.tokens.perRequest);
		default: {
			const never: never = field;
			return never;
		}
	}
}

function Roles({
	view,
	roles,
	o,
}: {
	view: AssistantOrgConfigType;
	roles: ReadonlyArray<Role>;
	o: O;
}): JSX.Element {
	return (
		<section class="adm-card adm-stack" aria-labelledby="as-roles">
			<h2 class="adm-h2" id="as-roles">
				{m.as_roles({}, o)}
			</h2>
			<p class="adm-muted">{m.as_roles_hint({}, o)}</p>
			{roles.map((role) => {
				const own = view.doc?.roles[role.id] ?? {};
				return (
					<fieldset key={role.id} class="adm-stack" data-role={role.id}>
						<legend class="adm-h3">{role.name}</legend>
						<div class="adm-grid">
							{ROLE_FIELD_NAMES.map((field) => {
								const name = `role.${role.id}.${field}`;
								const value = own[field];
								return field === "enabled" ? (
									<label key={field} class="adm-field">
										<span>{ROLE_LABEL[field](o)}</span>
										<select class="adm-input" name={name}>
											<option value="" selected={value === undefined}>
												{m.as_inherit({}, o)}
											</option>
											<option value="on" selected={value === true}>
												{m.as_on({}, o)}
											</option>
											<option value="off" selected={value === false}>
												{m.as_off({}, o)}
											</option>
										</select>
									</label>
								) : (
									<label key={field} class="adm-field">
										<span>{ROLE_LABEL[field](o)}</span>
										<input
											class="adm-input"
											name={name}
											type={field === "model" ? "text" : "number"}
											value={value === undefined ? "" : String(value)}
											placeholder={roleInherited(field, view.effective.staff)}
										/>
									</label>
								);
							})}
						</div>
					</fieldset>
				);
			})}
		</section>
	);
}

export async function renderAssistantSettings(
	ctx: Ctx,
	flash: { saved: boolean; problem: string | undefined },
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let body: JSX.Element;
	try {
		const [view, roles] = await Promise.all([
			ctx.port.assistantConfig(ctx.app),
			ctx.port.roles(ctx.app),
		]);
		const writable = ctx.can.write("app_settings_edit");
		const skills = view.doc?.skills ?? [];
		body = (
			<div class="adm-stack" data-assistant-settings>
				{flash.saved ? (
					<Banner tone="info" icon="check">
						{m.as_saved({}, o)}
					</Banner>
				) : null}
				{flash.problem === undefined ? null : (
					<Banner tone="error" icon="alert">
						{flash.problem === "conflict"
							? m.as_problem_conflict({}, o)
							: m.as_problem_invalid({}, o)}
					</Banner>
				)}
				<Usage view={view} ctx={ctx} o={o} />
				<p class="adm-muted">{writable ? m.as_lead({}, o) : m.as_readonly({}, o)}</p>
				<form method="post" action="/settings/assistant" class="adm-stack" data-form="assistant">
					<fieldset class="adm-stack" disabled={!writable}>
						{SURFACES.map((s) => (
							<section key={s} class="adm-stack" aria-labelledby={`as-${s}`} data-surface={s}>
								<h2 class="adm-h2" id={`as-${s}`}>
									{surfaceTitle(s, o)}
								</h2>
								<SurfaceFields
									surface={s}
									prefix={s}
									own={view.doc?.[s] ?? {}}
									inherited={view.effective[s] ?? BUILT_IN_SETTINGS[s]}
									ceilings={view.ceilings[s]}
									o={o}
									note={<p class="adm-muted">{m.as_booking_fixed({}, o)}</p>}
								/>
							</section>
						))}
						<section class="adm-stack" aria-labelledby="as-skills">
							<h2 class="adm-h2" id="as-skills">
								{m.as_skills({}, o)}
							</h2>
							<p class="adm-muted">{m.as_skills_hint({}, o)}</p>
							{skills.map((skill, n) => (
								<Skill key={skill.id} skill={skill} n={n} o={o} />
							))}
							{skills.length < 20 ? <Skill skill={undefined} n={skills.length} o={o} /> : null}
						</section>
						<Roles view={view} roles={roles} o={o} />
						{writable ? (
							<button class="adm-btn adm-btn--primary" type="submit" data-action="assistant.save">
								{m.as_save({}, o)}
							</button>
						) : null}
					</fieldset>
				</form>
			</div>
		);
	} catch {
		body = (
			<Banner tone="error" icon="alert">
				<strong>{m.error_title({}, o)}</strong>
			</Banner>
		);
	}
	return OrgFrame({
		ctx,
		area: "assistant",
		title: areaText("assistant", ctx.locale).title,
		children: body,
	});
}

/** A form post as the action's parameters: text fields only (no file is ever part of these settings). */
export async function formFields(c: Context<Env>): Promise<Record<string, string>> {
	const body = await c.req.parseBody();
	return Object.fromEntries(
		Object.entries(body).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
	);
}

/** Runs a settings save through the registry (the same path the assistant takes) and goes back with what happened. */
export async function saveVia(c: Context<Env>, id: string, back: string): Promise<Response> {
	const result = await runAction(actionCtx(c.var.ctx), id, await formFields(c), {
		confirmed: true,
	});
	if (result.status === "ok") return c.redirect(result.to ?? `${back}?saved=1`, 303);
	if (result.status === "refused" && (result.code === "invalid" || result.code === "conflict"))
		return c.redirect(`${back}?problem=${result.code}`, 303);
	return c.text(
		result.status === "refused" ? result.code : "confirmation",
		result.status === "refused" && result.code === "forbidden" ? 403 : 400,
	);
}

export function registerAssistantSettings(app: Hono<Env>): void {
	app.get("/settings/assistant", async (c) => {
		const problem = c.req.query("problem");
		return c.html(
			await renderAssistantSettings(c.var.ctx, {
				saved: c.req.query("saved") !== undefined,
				problem: problem === "invalid" || problem === "conflict" ? problem : undefined,
			}),
			200,
			NOCACHE,
		);
	});
	app.post("/settings/assistant", (c) => saveVia(c, "assistant.save", "/settings/assistant"));
}
