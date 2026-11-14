import { SchedulingApiError } from "@psi/scheduling-sdk";
import { emptyPlan, type FloorPlanDoc, parsePlan, type SaveResult } from "@psi/ui/admin/floor-plan";
import { addDays } from "../../lib/dates";
import { type Numbered, offsetAt, type PageAt, pageOfOffset } from "../numbered";
import { type AuditPage, PortError, type TeamMember } from "../port";
import { composed } from "../role-composition";
import { grantsFromRelations, relationsFromGrants } from "../role-map";
import {
	type AppSlug,
	AppSlugSchema,
	type AssistantMode,
	type AuditEvent,
	type Membership,
	type Role,
	type WebRequest,
} from "../schema";
import type {
	MyNotifications,
	MyNotificationsView,
	MySettings,
	MySettingsView,
} from "../schema-settings";
import type { SdkContext } from "./context";
import { toPortError } from "./errors";
import { auditOf, drain, requestOf } from "./map";
import { instantOf } from "./time";

const DAY = 86_400_000;

type ApiMember = Awaited<ReturnType<SdkContext["api"]["members"]["list"]>>["items"][number];

const teamMemberOf = (m: ApiMember): TeamMember => ({
	subject: m.subject,
	displayName: m.displayName,
	roles: m.roles,
	...(m.email === undefined ? {} : { email: m.email }),
});

/** The service's answer as the console keeps it (when it was saved is the service's own business). */
const settingsView = ({
	updatedAt: _at,
	...s
}: MySettingsView & { updatedAt?: number }): MySettingsView => s;

/** Requests, roles, audit, the team, capabilities and "Vezi ca…". */
export function adminGroup(sdk: SdkContext) {
	const { api, run } = sdk;

	async function memberCounts(app: AppSlug): Promise<Map<string, number>> {
		const counts = new Map<string, number>();
		try {
			const members = await drain((cursor) =>
				api.members.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
			);
			for (const m of members) for (const r of m.roles) counts.set(r, (counts.get(r) ?? 0) + 1);
		} catch (error) {
			// Seeing roles does not need seeing the team: the count is simply not known.
			if (toPortError(error).code !== "forbidden") throw error;
		}
		return counts;
	}

	/** The roles with what each includes and inherits, from the service's own relations. */
	async function rolesOf(app: AppSlug): Promise<Role[]> {
		const [list, counts] = await Promise.all([
			drain((cursor) =>
				api.roles.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
			),
			memberCounts(app),
		]);
		return composed(
			list.map((r) => ({
				id: r.id,
				name: r.name,
				description: r.description ?? "",
				members: counts.get(r.id) ?? 0,
				...grantsFromRelations(r.permissions),
			})),
			list.map((r) => ({ id: r.id, relations: r.permissions, includes: r.includes })),
		);
	}

	return {
		memberships: (_subject: string): Promise<Membership[]> =>
			run(async () => {
				const me = await api.me.get({});
				return me.apps.flatMap((a) => {
					const slug = AppSlugSchema.safeParse(a.app);
					return slug.success ? [{ app: slug.data, roles: a.roles }] : [];
				});
			}),

		// Through the port's one answer: the page's middleware, its zone and its screens share it (and its source keeps it).
		capabilities: (_subject: string, app: AppSlug, as?: `role:${string}` | `member:${string}`) =>
			run(() => sdk.me(app, as)),

		startViewAs: (_subject: string, app: AppSlug, as: `role:${string}` | `member:${string}`) =>
			run(() => api.viewAs.start({ app, as })),

		stopViewAs: (_subject: string, app: AppSlug): Promise<void> =>
			run(async () => {
				await api.viewAs.stop({ app });
			}),

		members: (app: AppSlug): Promise<TeamMember[]> =>
			run(async () => {
				const all = await drain((cursor) =>
					api.members.list({ app, limit: 500, ...(cursor === undefined ? {} : { cursor }) }),
				);
				return all.map(teamMemberOf);
			}),

		memberPage: (app: AppSlug, at: PageAt): Promise<Numbered<TeamMember>> =>
			run(async () => {
				const got = await api.members.list({ app, limit: at.size, offset: offsetAt(at) });
				return {
					items: got.items.map(teamMemberOf),
					total: got.total,
					page: pageOfOffset(got.offset, at.size),
				};
			}),

		requests: (app: AppSlug): Promise<WebRequest[]> =>
			run(async () => {
				const now = Date.now();
				const got = await drain((cursor) =>
					api.requests.list({
						app,
						from: now - 90 * DAY,
						to: now + 365 * DAY,
						limit: 500,
						...(cursor === undefined ? {} : { cursor }),
					}),
				);
				return got.map(requestOf).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
			}),

		requestPage: (
			app: AppSlug,
			show: "open" | "handled",
			at: PageAt,
		): Promise<Numbered<WebRequest>> =>
			run(async () => {
				const now = Date.now();
				const got = await api.requests.list({
					app,
					from: now - 90 * DAY,
					to: now + 365 * DAY,
					state: show,
					limit: at.size,
					offset: offsetAt(at),
				});
				return {
					items: got.items.map(requestOf),
					total: got.total,
					page: pageOfOffset(got.offset, at.size),
				};
			}),

		/** The console's "handled": the team answered the request. */
		markRequestHandled: (app: AppSlug, id: string): Promise<void> =>
			run(async () => {
				const now = Date.now();
				const found = (
					await drain((cursor) =>
						api.requests.list({
							app,
							from: now - 90 * DAY,
							to: now + 365 * DAY,
							limit: 500,
							...(cursor === undefined ? {} : { cursor }),
						}),
					)
				).find((r) => r.reference === id);
				if (found === undefined) throw new PortError("not-found", id);
				// A held slot is confirmed; a callback has no slot, it was called back.
				await api.requests.decide({
					app,
					reference: id,
					decision: found.start === undefined ? "handle" : "confirm",
				});
			}),

		roles: (app: AppSlug): Promise<Role[]> => run(() => rolesOf(app)),

		saveRole: (app: AppSlug, role: Role): Promise<Role> =>
			run(async () => {
				const held = await api.roles.get({ app, id: role.id });
				const next = relationsFromGrants(role, held.role.permissions);
				if (role.name !== held.role.name || role.description !== (held.role.description ?? ""))
					await api.roles.update({
						app,
						id: role.id,
						name: role.name,
						description: role.description,
					});
				// The roles it includes first: a permission moved into an included role is never held by nobody in between.
				const includes = [...new Set(role.includes ?? held.role.includes)].sort();
				if (includes.join(",") !== [...held.role.includes].sort().join(","))
					await api.roles.setIncludes({ app, id: role.id, includes });
				await api.roles.setPermissions({ app, id: role.id, permissions: next });
				const saved = (await rolesOf(app)).find((r) => r.id === role.id);
				if (saved === undefined) throw new PortError("not-found", role.id);
				return saved;
			}),

		/**
		 * The service has no route to add an audit entry: it records every write itself, with the signed-in person as the
		 * actor. The assistant's own note ("done through the assistant") is therefore not stored over the SDK, and the
		 * write it follows is never failed for that.
		 */
		appendAudit: async (
			_app: AppSlug,
			_entry: { actor: string; action: string; target: string },
		): Promise<void> => {},

		/**
		 * The app's stored plan (an empty one when none was drawn), and whether this person may draw: the service's
		 * `app_settings_edit`, asked of their capabilities. Reading needs only the calendar.
		 */
		floorPlan: (app: AppSlug): Promise<{ doc: FloorPlanDoc; writable: boolean }> =>
			run(async () => {
				const [stored, me] = await Promise.all([api.floorPlan.get({ app }), sdk.me(app)]);
				const writable = me.platformAdmin || Object.hasOwn(me.permissions, "app_settings_edit");
				if (stored.doc === undefined) return { doc: emptyPlan(), writable };
				const parsed = parsePlan(stored.doc);
				if (!parsed.success)
					throw new PortError(
						"unavailable",
						"the stored floor plan is not one this console can draw",
					);
				return { doc: parsed.data, writable };
			}),

		/** A save from a revision the store has moved past is the editor's `stale`, never an error. */
		saveFloorPlan: (app: AppSlug, doc: FloorPlanDoc): Promise<SaveResult> =>
			run(async () => {
				try {
					const saved = await api.floorPlan.put({ app, doc });
					const parsed = parsePlan(saved.doc);
					if (!parsed.success)
						throw new PortError("unavailable", "the saved floor plan cannot be read");
					return { ok: true, doc: parsed.data };
				} catch (error) {
					if (error instanceof SchedulingApiError) {
						if (error.code === "conflict" && error.detail?.reason === "stale")
							return { ok: false, reason: "stale" };
						if (error.code === "invalid") return { ok: false, reason: "invalid" };
					}
					throw error;
				}
			}),

		audit: (app: AppSlug): Promise<AuditEvent[]> =>
			run(async () => (await api.audit.list({ app, limit: 200 })).items.map(auditOf)),

		// The person's own settings: the token says whose, so the subject is never sent.
		mySettings: (app: AppSlug, _subject: string): Promise<MySettingsView> =>
			run(async () => settingsView(await api.me.settings({ app }))),
		saveMySettings: (app: AppSlug, _subject: string, s: MySettings): Promise<MySettingsView> =>
			run(async () => settingsView(await api.me.saveSettings({ app, ...s }))),
		myNotifications: (app: AppSlug, _subject: string): Promise<MyNotificationsView> =>
			run(() => api.me.notifications({ app })),
		saveMyNotifications: (
			app: AppSlug,
			_subject: string,
			prefs: MyNotifications,
		): Promise<MyNotificationsView> => run(() => api.me.notificationsSave({ app, ...prefs })),
		auditPage: (
			app: AppSlug,
			window: { from?: string; to?: string },
			cursor: string | null,
			limit: number,
		): Promise<AuditPage> =>
			run(async () => {
				const tz =
					window.from === undefined && window.to === undefined ? null : await sdk.zone(app);
				const got = await api.audit.list({
					app,
					limit,
					...(cursor === null ? {} : { cursor }),
					...(tz === null || window.from === undefined
						? {}
						: { from: instantOf(window.from, 0, tz) }),
					...(tz === null || window.to === undefined
						? {}
						: { to: instantOf(addDays(window.to, 1), 0, tz) }),
				});
				return { events: got.items.map(auditOf), nextCursor: got.nextCursor ?? null };
			}),

		// The service has no route for how a person's assistant shows: the console keeps the choice on the device meanwhile.
		assistantMode: (_subject: string): Promise<AssistantMode | null> =>
			Promise.reject(new PortError("not-available-yet", "assistant mode")),
		saveAssistantMode: (_subject: string, _mode: AssistantMode): Promise<void> =>
			Promise.reject(new PortError("not-available-yet", "assistant mode")),
	};
}
