import { Banner } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { OverrideFields } from "./assistant-overrides";
import { saveVia } from "./assistant-settings";
import { OrgFrame } from "./org-settings";

const NOCACHE = { "cache-control": "private, no-store" } as const;

/**
 * Setări → Asistent → per persoană: each member of the team with their own overrides of the staff assistant (access,
 * model, tool steps, messages a day, tokens per request), applied after their roles'. Empty is what their roles and
 * the organisation give. Saved with the organisation's tier and its revision, everything else in it kept.
 */
export async function renderAssistantPeople(
	ctx: Ctx,
	flash: { saved: boolean; problem: string | undefined },
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let body: JSX.Element;
	try {
		const [view, members] = await Promise.all([
			ctx.port.assistantConfig(ctx.app),
			ctx.port.members(ctx.app),
		]);
		const writable = ctx.can.write("app_settings_edit");
		const people = [...members].sort((a, b) => a.displayName.localeCompare(b.displayName, "ro"));
		body = (
			<div class="adm-stack" data-assistant-people>
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
				<a class="adm-btn" href="/settings/assistant">
					{m.as_people_back({}, o)}
				</a>
				<p class="adm-muted">{writable ? m.as_people_hint({}, o) : m.as_readonly({}, o)}</p>
				{people.length === 0 ? (
					<p class="adm-muted" data-empty="people">
						{m.as_people_none({}, o)}
					</p>
				) : (
					<form
						method="post"
						action="/settings/assistant/people"
						class="adm-stack"
						data-form="assistant-people"
					>
						<input type="hidden" name="revision" value={String(view.revision)} />
						<input type="hidden" name="whole" value="1" />
						<fieldset class="adm-stack" disabled={!writable}>
							{people.map((p) => (
								<OverrideFields
									key={p.subject}
									of="person"
									id={p.subject}
									legend={p.displayName}
									own={view.doc?.people[p.subject] ?? {}}
									staff={view.effective.staff}
									o={o}
								/>
							))}
							{writable ? (
								<button
									class="adm-btn adm-btn--primary"
									type="submit"
									data-action="assistant.people.save"
								>
									{m.as_save({}, o)}
								</button>
							) : null}
						</fieldset>
					</form>
				)}
			</div>
		);
	} catch {
		body = (
			<Banner tone="error" icon="alert">
				<strong>{m.error_title({}, o)}</strong>
			</Banner>
		);
	}
	return OrgFrame({ ctx, area: "assistant", title: m.as_people_title({}, o), children: body });
}

export function registerAssistantPeople(app: Hono<Env>): void {
	app.get("/settings/assistant/people", async (c) => {
		const problem = c.req.query("problem");
		return c.html(
			await renderAssistantPeople(c.var.ctx, {
				saved: c.req.query("saved") !== undefined,
				problem: problem === "invalid" || problem === "conflict" ? problem : undefined,
			}),
			200,
			NOCACHE,
		);
	});
	app.post("/settings/assistant/people", (c) =>
		saveVia(c, "assistant.people.save", "/settings/assistant/people"),
	);
}
