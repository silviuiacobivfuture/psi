import {
	AssistantCeilings,
	type AssistantCeilingsType,
	type AssistantSurfaceName,
	BUILT_IN_CEILINGS,
	BUILT_IN_SETTINGS,
} from "@psi/scheduling-sdk/contract";
import { Banner, PageHeader } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import { ceilingShown } from "../lib/assistant-form";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { idOf, SurfaceFields } from "./assistant-fields";
import { saveVia } from "./assistant-settings";

type O = ReturnType<typeof at>;
const SURFACES: ReadonlyArray<AssistantSurfaceName> = ["staff", "visitor"];
const CEILING_KEYS = Object.keys(AssistantCeilings.shape).filter(
	(k): k is keyof AssistantCeilingsType => Object.hasOwn(AssistantCeilings.shape, k),
);

const CEILING_LABEL: Readonly<Record<keyof AssistantCeilingsType, (o: O) => string>> = {
	models: (o) => m.as_c_models({}, o),
	temperature: (o) => m.as_c_temperature({}, o),
	maxOutputTokens: (o) => m.as_c_maxOutputTokens({}, o),
	maxToolCalls: (o) => m.as_c_maxToolCalls({}, o),
	pageSize: (o) => m.as_c_pageSize({}, o),
	totalMs: (o) => m.as_c_totalMs({}, o),
	ratePerMinute: (o) => m.as_c_ratePerMinute({}, o),
	messagesPerDay: (o) => m.as_c_messagesPerDay({}, o),
	tokensPerRequest: (o) => m.as_c_tokensPerRequest({}, o),
	tokensPerMonth: (o) => m.as_c_tokensPerMonth({}, o),
	budgetMonthlyMicroUsd: (o) => m.as_c_budgetMonthlyMicroUsd({}, o),
	retentionDays: (o) => m.as_c_retentionDays({}, o),
	forceRedaction: (o) => m.as_c_forceRedaction({}, o),
};

function Ceilings({
	surface,
	held,
	o,
}: {
	surface: AssistantSurfaceName;
	held: AssistantCeilingsType;
	o: O;
}): JSX.Element {
	return (
		<fieldset class="adm-card adm-stack" data-ceilings={surface}>
			<legend class="adm-h3">{m.as_pl_ceilings({}, o)}</legend>
			<div class="adm-grid">
				{CEILING_KEYS.map((key) => {
					const name = `ceilings.${surface}.${key}`;
					const value = ceilingShown(key, held);
					return (
						<div key={key} class="adm-field">
							<label for={idOf(name)}>{CEILING_LABEL[key](o)}</label>
							{key === "forceRedaction" ? (
								<select class="adm-input" id={idOf(name)} name={name}>
									<option value="on" selected={value === "on"}>
										{m.as_on({}, o)}
									</option>
									<option value="off" selected={value === "off"}>
										{m.as_off({}, o)}
									</option>
								</select>
							) : (
								<input
									class="adm-input"
									id={idOf(name)}
									name={name}
									required
									value={value}
									{...(key === "models"
										? { maxlength: 2_000 }
										: { type: "number", step: "any", min: "0" })}
								/>
							)}
						</div>
					);
				})}
			</div>
		</fieldset>
	);
}

/** The estate's assistant tier: the defaults every organisation starts from and the ceilings none may pass. */
export async function renderAssistantPlatform(
	ctx: Ctx,
	flash: { saved: boolean; problem: string | undefined },
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let body: JSX.Element;
	try {
		const held = await ctx.port.assistantPlatform();
		body = (
			<div class="adm-stack" data-assistant-platform>
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
				<p class="adm-muted">{m.as_pl_lead({}, o)}</p>
				<form
					method="post"
					action="/platform/assistant"
					class="adm-stack"
					data-form="assistant-platform"
				>
					{SURFACES.map((s) => (
						<section key={s} class="adm-stack" aria-labelledby={`pl-${s}`} data-surface={s}>
							<h2 class="adm-h2" id={`pl-${s}`}>
								{s === "staff" ? m.as_surface_staff({}, o) : m.as_surface_visitor({}, o)}
							</h2>
							<Ceilings surface={s} held={held.doc?.ceilings[s] ?? BUILT_IN_CEILINGS[s]} o={o} />
							<h3 class="adm-h3">{m.as_pl_defaults({}, o)}</h3>
							<SurfaceFields
								surface={s}
								prefix={`defaults.${s}`}
								own={held.doc?.defaults[s] ?? {}}
								inherited={BUILT_IN_SETTINGS[s]}
								ceilings={undefined}
								o={o}
								note={<p class="adm-muted">{m.as_booking_fixed({}, o)}</p>}
							/>
						</section>
					))}
					<button
						class="adm-btn adm-btn--primary"
						type="submit"
						data-action="assistant.platform.save"
					>
						{m.as_save({}, o)}
					</button>
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
	return Page({
		ctx,
		current: "platform",
		title: m.as_pl_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.as_pl_title({}, o)} />
				{body}
			</div>
		),
	});
}

export function registerAssistantPlatform(app: Hono<Env>): void {
	app.get("/platform/assistant", async (c) => {
		const problem = c.req.query("problem");
		return c.html(
			await renderAssistantPlatform(c.var.ctx, {
				saved: c.req.query("saved") !== undefined,
				problem: problem === "invalid" || problem === "conflict" ? problem : undefined,
			}),
			200,
			{ "cache-control": "private, no-store" },
		);
	});
	app.post("/platform/assistant", (c) =>
		saveVia(c, "assistant.platform.save", "/platform/assistant"),
	);
}
