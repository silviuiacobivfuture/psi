import { z } from "zod";
import { overridesFromForm } from "../pages/member-summary";
import { m } from "../paraglide/messages.js";
import { MemberInputSchema, SubjectSchema } from "../port/schema-members";
import { define, label } from "./define";
import type { ActionCtx, ActionDef, ActionResult, EntityState } from "./types";

const BASE = "/settings/members";
const SCREEN = "settings.members" as const;
const at = (subject: string, extra = ""): string =>
	`${BASE}?edit=${encodeURIComponent(subject)}${extra}`;
/** A form sends one value as a string and several as a list: both are a list here. */
const list = (item: z.ZodTypeAny) =>
	z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(item).max(300));
const relation = z
	.string()
	.min(1)
	.max(120)
	.regex(/^[a-z0-9_]+$/);

/** Nobody changes their own membership (the service refuses it too): the control is not offered, the call is refused. */
const notSelf = (ctx: ActionCtx, e: EntityState): boolean => e.id !== ctx.actor.subject;
const SELF: ActionResult = { status: "refused", code: "forbidden" };

/**
 * The team's members (Setări → Membri): adding a sign-in account, the roles they hold (several at once, their
 * permissions add up), the per-person extra and withdrawn permissions, the calendar bound to them, and removing them.
 */
export const MEMBER_ACTIONS: ReadonlyArray<ActionDef> = [
	define({
		id: "member.new",
		tier: "org",
		entity: "member",
		label: label((o) => m.ac_member_add({}, o)),
		icon: "plus",
		placements: { primary: [SCREEN], empty: [SCREEN], palette: ["global"] },
		mobile: "fab",
		needs: { write: ["members_create"] },
		route: { method: "POST", path: `${BASE}/save` },
		confirm: "none",
		opens: "newMember",
		to: () => `${BASE}?new=1`,
		params: z.object({ subject: SubjectSchema, input: MemberInputSchema }),
		run: async (ctx, p) => {
			if (p.subject === ctx.actor.subject) return SELF;
			await ctx.port.saveMember(ctx.app, p.subject, p.input);
			return { status: "ok", to: at(p.subject, "&saved=1") };
		},
	}),
	define({
		id: "member.edit",
		tier: "org",
		entity: "member",
		label: label((o) => m.ac_member_edit({}, o)),
		icon: "edit",
		placements: { screen: [SCREEN], menu: [SCREEN] },
		mobile: "sheet",
		needs: { write: ["members_edit"] },
		route: { method: "POST", path: `${BASE}/:subject/save` },
		confirm: "none",
		to: (e) => at(e.id ?? ""),
		when: notSelf,
		params: z.object({ subject: SubjectSchema, input: MemberInputSchema }),
		run: async (ctx, p) => {
			if (p.subject === ctx.actor.subject) return SELF;
			await ctx.port.saveMember(ctx.app, p.subject, p.input);
			return { status: "ok", to: at(p.subject, "&saved=1") };
		},
	}),
	define({
		id: "member.overrides",
		tier: "org",
		entity: "member",
		label: label((o) => m.ac_member_overrides({}, o)),
		icon: "shield",
		placements: { screen: [SCREEN] },
		mobile: "sheet",
		needs: { write: ["members_edit"] },
		route: { method: "POST", path: `${BASE}/:subject/overrides` },
		confirm: "none",
		to: (e) => at(e.id ?? ""),
		when: notSelf,
		params: z.object({
			subject: SubjectSchema,
			/** Extra permissions, as stored relations (`people_view_all`). */
			grant: list(relation),
			/** Withdrawn permissions, as catalogue keys (`clients_delete`): withdrawn at every scope. */
			deny: list(relation),
		}),
		run: async (ctx, p) => {
			if (p.subject === ctx.actor.subject) return SELF;
			const held = await ctx.port.member(ctx.app, p.subject);
			if (held === null) return { status: "refused", code: "not-found" };
			const next = overridesFromForm(held.matrix, held, { grant: p.grant, deny: p.deny });
			if (next === "invalid") return { status: "refused", code: "invalid" };
			await ctx.port.saveMemberOverrides(ctx.app, p.subject, next);
			return { status: "ok", to: at(p.subject, "&saved=1") };
		},
	}),
	define({
		id: "member.calendar",
		tier: "org",
		entity: "member",
		label: label((o) => m.ac_member_calendar({}, o)),
		icon: "calendar",
		placements: { screen: [SCREEN] },
		mobile: "sheet",
		needs: { write: ["people_edit"] },
		route: { method: "POST", path: `${BASE}/:subject/calendar` },
		confirm: "none",
		to: (e) => at(e.id ?? ""),
		params: z.object({ subject: SubjectSchema, personId: z.string().min(1).max(100) }),
		run: async (ctx, p) => {
			const held = await ctx.port.member(ctx.app, p.subject);
			if (held === null) return { status: "refused", code: "not-found" };
			// A calendar bound to someone else stays theirs: binding it here would take their own reach away.
			if (held.taken.includes(p.personId)) return { status: "refused", code: "conflict" };
			await ctx.port.linkCalendar(ctx.app, p.subject, p.personId);
			return { status: "ok", to: at(p.subject, "&saved=1") };
		},
	}),
	define({
		id: "member.remove",
		tier: "org",
		entity: "member",
		label: label((o) => m.ac_member_remove({}, o)),
		icon: "trash",
		placements: { menu: [SCREEN] },
		mobile: "menu",
		needs: { write: ["members_delete"] },
		route: { method: "POST", path: `${BASE}/:subject/remove` },
		confirm: "confirm",
		to: (e) => `${BASE}?confirm=${encodeURIComponent(e.id ?? "")}`,
		when: notSelf,
		params: z.object({ subject: SubjectSchema }),
		run: async (ctx, p) => {
			if (p.subject === ctx.actor.subject) return SELF;
			await ctx.port.removeMember(ctx.app, p.subject);
			return { status: "ok", to: `${BASE}?removed=1` };
		},
	}),
];
