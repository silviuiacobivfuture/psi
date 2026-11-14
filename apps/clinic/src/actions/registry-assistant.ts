import { z } from "zod";
import { PLATFORM_KEY } from "../lib/areas";
import {
	fieldsOf,
	formOfDoc,
	formOfPeople,
	orgDocFromForm,
	peopleDocFromForm,
	platformDocFromForm,
} from "../lib/assistant-form";
import { m } from "../paraglide/messages.js";
import { define, label } from "./define";
import type { ActionDef } from "./types";

/**
 * One field's value: text as the screen posts it, or a number or a switch as the assistant may send it (a switch is
 * the form's "on"/"off"), so both reach the same reading of the form.
 */
const Value = z
	.union([z.string().max(10_000), z.number().finite(), z.boolean()])
	.transform((v) => (typeof v === "boolean" ? (v ? "on" : "off") : String(v)));

const present = (o: Readonly<Record<string, string | undefined>>): Record<string, string> =>
	Object.fromEntries(
		Object.entries(o).flatMap(([k, v]) => (v === undefined ? [] : [[k, v] as const])),
	);

/**
 * A settings form as posted, every field by its name. The fields given by name are what the assistant is shown it can
 * set (`staff.maxToolCalls`, `visitor.booking.horizonDays`, …); any other (`skill.0.name`, `role.<id>.model`,
 * `person.<subject>.messagesPerDay`) is taken too, as text.
 */
function formOf(names: ReadonlyArray<string>) {
	return z
		.object({
			revision: Value.optional(),
			whole: Value.optional(),
			...Object.fromEntries(names.map((name) => [name, Value.optional()])),
		})
		.catchall(Value)
		.refine((o) => Object.keys(o).length <= 400 && Object.keys(o).every((k) => k.length <= 200))
		.transform(present);
}
const OrgForm = formOf(
	(["staff", "visitor"] as const).flatMap((s) => fieldsOf(s).map((f) => `${s}.${f.path}`)),
);
const FormFields = formOf([]);

/** The revision a save was edited from, when it says (the form's hidden field); a malformed one is `null`. */
function editedFrom(form: Readonly<Record<string, string>>): number | undefined | null {
	const raw = form.revision;
	if (raw === undefined) return undefined;
	return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}

/** The fields a save names besides how it was sent: what it changes. */
const changes = (form: Readonly<Record<string, string>>): Record<string, string> =>
	Object.fromEntries(Object.entries(form).filter(([k]) => k !== "revision" && k !== "whole"));

type Planned =
	| { ok: true; fields: Readonly<Record<string, string>>; revision: number }
	| { ok: false; code: "invalid" | "conflict" };

/**
 * How an organisation's save is read. The screen posts the whole form (`whole=1`, with the revision it was edited
 * from): what it leaves empty is inherited. Anything else is a change of the fields it names, laid over the tier as it
 * is now (`current`), so nothing it does not name is lost; its revision, when it gives none, is the one just read, and
 * a revision it gives must be that one. Either way a save that someone else's overtook is refused as a conflict, with
 * nothing written (the service compares the revision in the same write), and a change that names nothing is refused.
 */
function plan(
	form: Readonly<Record<string, string>>,
	heldRevision: number,
	current: () => Readonly<Record<string, string>>,
): Planned {
	const given = editedFrom(form);
	if (given === null) return { ok: false, code: "invalid" };
	if (form.whole === "1")
		return given === undefined
			? { ok: false, code: "invalid" }
			: { ok: true, fields: form, revision: given };
	const changed = changes(form);
	if (Object.keys(changed).length === 0) return { ok: false, code: "invalid" };
	if (given !== undefined && given !== heldRevision) return { ok: false, code: "conflict" };
	return { ok: true, fields: { ...current(), ...changed }, revision: heldRevision };
}

/**
 * Saving the assistants' configuration: the organisation's tier (Owner and Admin, `app_settings_edit`), its per-person
 * overrides (the same) and the estate's (the platform administrator). The same `run` serves the screen's Save and the
 * assistant; the service checks the ceilings and the permission again.
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
		params: OrgForm,
		run: async (ctx, form) => {
			// Someone who may not read the roles (an Administrator) saves without them: the role overrides stay as they are.
			const [held, roles] = await Promise.all([
				ctx.port.assistantConfig(ctx.app),
				ctx.can.has("roles_view") ? ctx.port.roles(ctx.app) : Promise.resolve(undefined),
			]);
			const roleIds = roles?.map((r) => r.id);
			const planned = plan(form, held.revision, () => formOfDoc(held.doc, roleIds ?? []));
			if (!planned.ok) return { status: "refused", code: planned.code };
			const doc = orgDocFromForm(planned.fields, held.doc, planned.revision, roleIds);
			if (!doc.ok) return { status: "refused", code: "invalid" };
			await ctx.port.saveAssistantConfig(ctx.app, doc.doc);
			return { status: "ok", to: "/settings/assistant?saved=1" };
		},
	}),
	define({
		id: "assistant.people.save",
		tier: "org",
		entity: "none",
		label: label((o) => m.as_save({}, o)),
		icon: "check",
		placements: { screen: ["settings.assistant.people"] },
		mobile: "bar",
		needs: { write: ["app_settings_edit"] },
		route: { method: "POST", path: "/settings/assistant/people" },
		confirm: "none",
		params: FormFields,
		run: async (ctx, form) => {
			const [held, members] = await Promise.all([
				ctx.port.assistantConfig(ctx.app),
				ctx.port.members(ctx.app),
			]);
			const subjects = members.map((p) => p.subject);
			const planned = plan(form, held.revision, () => formOfPeople(held.doc, subjects));
			if (!planned.ok) return { status: "refused", code: planned.code };
			const doc = peopleDocFromForm(planned.fields, held.doc, planned.revision, subjects);
			if (!doc.ok) return { status: "refused", code: "invalid" };
			await ctx.port.saveAssistantConfig(ctx.app, doc.doc);
			return { status: "ok", to: "/settings/assistant/people?saved=1" };
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
			if (revision === undefined || revision === null)
				return { status: "refused", code: "invalid" };
			const doc = platformDocFromForm(form, revision);
			if (!doc.ok) return { status: "refused", code: "invalid" };
			await ctx.port.saveAssistantPlatform(doc.doc);
			return { status: "ok", to: "/platform/assistant?saved=1" };
		},
	}),
];
