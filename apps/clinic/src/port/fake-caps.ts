import { extraCapabilities } from "./fake-caps-extra";
import { type FakeTeam, type TeamEntry, withOverrides } from "./fake-members";
import { offsetPage } from "./offset-page";
import { type ClinicPort, LIST_PAGE, PortError, type TeamMember } from "./port";
import { capabilityMap } from "./role-map";
import type { AppSlug } from "./schema";
import type { AppData } from "./seed";

export interface AccessDeps {
	team: FakeTeam;
	platformAdmins: ReadonlySet<string> | undefined;
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
}

/** Who may do what in the fake: the capabilities of a person, a role or a member, the team, and "Vezi ca…". */
export function createFakeAccess(
	deps: AccessDeps,
): Pick<ClinicPort, "capabilities" | "members" | "memberPage" | "startViewAs" | "stopViewAs"> {
	const { data, guard, log, team } = deps;
	const LOOKUPS = [
		"people_view",
		"rooms_view",
		"devices_view",
		"services_view",
		"group_activities_view",
	];
	return {
		async capabilities(subject, app, as) {
			guard("capabilities");
			const mine = team.get(app)?.get(subject);
			if (mine === undefined) throw new PortError("not-found", app);
			const d = data(app);
			const holds = (ids: ReadonlyArray<string>) => d.roles.filter((r) => ids.includes(r.id));
			let roles = holds(mine.roles);
			let who = subject;
			// A member is seen with their own grants and denials; a role has none.
			let overrides: typeof mine | undefined = mine;
			if (as !== undefined) {
				// As at the service: the estate administrator alone, never an app's owner or admin.
				if (deps.platformAdmins?.has(subject) !== true)
					throw new PortError("forbidden", "estate administrators only");
				const [kind, id = ""] = [as.slice(0, as.indexOf(":")), as.slice(as.indexOf(":") + 1)];
				if (kind === "role") {
					roles = holds([id]);
					overrides = undefined;
					if (roles.length === 0) throw new PortError("not-found", as);
				} else {
					const other = team.get(app)?.get(id);
					if (other === undefined) throw new PortError("not-found", as);
					roles = holds(other.roles);
					overrides = other;
				}
				who = as;
			}
			const fromRoles: Record<string, ("all" | "assigned" | "own")[]> = {};
			const groups = new Set<string>();
			for (const r of roles) {
				for (const [k, v] of Object.entries({ ...capabilityMap(r), ...extraCapabilities(r) })) {
					const had = fromRoles[k] ?? [];
					fromRoles[k] = [...new Set([...had, ...v])];
				}
				for (const g of r.fieldGroups) groups.add(g);
				if (r.grants.calendars?.view !== undefined || r.grants.settings?.view !== undefined)
					for (const k of LOOKUPS) fromRoles[k] = ["all"];
			}
			const permissions = withOverrides(fromRoles, overrides);
			return {
				app,
				appName: app === "psizone" ? "Psizone" : "Hemi-Sync",
				timeZone: "Europe/Bucharest",
				subject: who,
				displayName:
					as === undefined
						? mine.displayName
						: as.startsWith("role:")
							? (roles[0]?.name ?? as)
							: (overrides?.displayName ?? as),
				roles: roles.map((r) => r.id),
				permissions,
				denied: [...(overrides?.denies ?? [])],
				...(as === undefined
					? {}
					: {
							viewAs: {
								kind: as.startsWith("role:") ? ("role" as const) : ("member" as const),
								id: as.slice(as.indexOf(":") + 1),
							},
						}),
				fieldGroups: (["contact", "guardian", "money", "clinical"] as const).filter((g) =>
					groups.has(g),
				),
				// A therapist is the first person column: the fake has no link between people and columns, so one is chosen.
				reach: {
					own:
						(as === undefined || as.startsWith("member:")) &&
						roles.some((r) => r.id === "therapist")
							? d.columns
									.filter((c) => c.kind === "person")
									.slice(0, 1)
									.map((c) => c.id)
							: [],
					assigned: [],
				},
				platformAdmin: as === undefined && deps.platformAdmins?.has(subject) === true,
			};
		},
		async members(app): Promise<ReadonlyArray<TeamMember>> {
			guard("members");
			return [...(team.get(app) ?? new Map<string, TeamEntry>())].map(([subject, e]) => ({
				subject,
				displayName: e.displayName,
				roles: [...e.roles],
				...(e.email === undefined ? {} : { email: e.email }),
			}));
		},
		async memberPage(app, cursor) {
			guard("memberPage");
			const all = [...(await this.members(app))].sort((a, b) =>
				a.displayName.localeCompare(b.displayName),
			);
			return offsetPage(all, cursor, LIST_PAGE);
		},
		async startViewAs(subject, app, as) {
			guard("startViewAs");
			const caps = await this.capabilities(subject, app, as);
			log(data(app), subject, "view_as.start", as);
			return caps;
		},
		async stopViewAs(subject, app) {
			guard("stopViewAs");
			log(data(app), subject, "view_as.stop", app);
		},
	};
}
