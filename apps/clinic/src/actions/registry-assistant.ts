import { z } from "zod";
import { PLATFORM_KEY } from "../lib/areas";
import { orgDocFromForm, platformDocFromForm } from "../lib/assistant-form";
import { m } from "../paraglide/messages.js";
import { define, label } from "./define";
import type { ActionDef } from "./types";

/** The settings form as it was posted: every field by its name (`staff.maxToolCalls`, `skill.0.name`, …). */
const FormFields = z.record(z.string().max(200), z.string().max(10_000));

/**
 * The revision the form was edited from (its hidden field): without it a save could overwrite someone else's, or
 * (an empty call) erase the tier, so it is refused.
 */
function editedFrom(form: Readonly<Record<string, string>>): number | undefined {
	const raw = form.revision;
	if (raw === undefined || !/^\d{1,9}$/.test(raw)) return undefined;
	return Number(raw);
}

/**
 * Saving the assistants' configuration: the organisation's tier (Owner and Admin, `app_settings_edit`) and the
 * estate's (the platform administrator). The same `run` serves the screen's Save and the assistant; the service checks
 * the ceilings and the permission again.
 */
export const ASSISTANT_ACTIONS: ReadonlyArray<ActionDef> = [
	define({
		id: "assistant.save",
		tier: "org",
		entity: "none",
		label: label((o) => m.as_save({}, o)),
		icon: "check",
		placements: { screen: ["settings.assistant"] },
		mobile: "bar",
		needs: { write: ["app_settings_edit"] },
		route: { method: "POST", path: "/settings/assistant" },
		confirm: "none",
		params: FormFields,
		run: async (ctx, form) => {
			const [held, roles] = await Promise.all([
				ctx.port.assistantConfig(ctx.app),
				ctx.port.roles(ctx.app),
			]);
			const revision = editedFrom(form);
			if (revision === undefined) return { status: "refused", code: "invalid" };
			const doc = orgDocFromForm(
				form,
				held.doc,
				revision,
				roles.map((r) => r.id),
			);
			if (!doc.ok) return { status: "refused", code: "invalid" };
			await ctx.port.saveAssistantConfig(ctx.app, doc.doc);
			return { status: "ok", to: "/settings/assistant?saved=1" };
		},
	}),
	define({
		id: "assistant.platform.save",
		tier: "platform",
		entity: "none",
		label: label((o) => m.as_save({}, o)),
		icon: "check",
		placements: { screen: ["platform"] },
		mobile: "bar",
		needs: { write: [PLATFORM_KEY] },
		route: { method: "POST", path: "/platform/assistant" },
		confirm: "none",
		params: FormFields,
		run: async (ctx, form) => {
			const revision = editedFrom(form);
			if (revision === undefined) return { status: "refused", code: "invalid" };
			const doc = platformDocFromForm(form, revision);
			if (!doc.ok) return { status: "refused", code: "invalid" };
			await ctx.port.saveAssistantPlatform(doc.doc);
			return { status: "ok", to: "/platform/assistant?saved=1" };
		},
	}),
];
