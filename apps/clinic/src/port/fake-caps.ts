import { extraCapabilities } from "./fake-caps-extra";
import { type ClinicPort, PortError, type TeamMember } from "./port";
import { capabilityMap } from "./role-map";
import type { AppSlug, Membership } from "./schema";
import type { AppData } from "./seed";

export interface AccessDeps {
	members: Readonly<Record<string, ReadonlyArray<Membership>>>;
	names: Readonly<Record<string, string>> | undefined;
	platformAdmins: ReadonlySet<string> | undefined;
	data: (app: AppSlug) => AppData;
	guard: (method: keyof ClinicPort) => void;
	log: (d: AppData, actor: string, action: string, target: string) => void;
}

/** Who may do what in the fake: the capabilities of a person, a role or a member, the team, and "Vezi ca…". */
export function createFakeAccess(
	deps: AccessDeps,
): Pick<ClinicPort, "capabilities" | "members" | "startViewAs" | "stopViewAs"> {
	const { data, guard, log } = deps;
	const opts = { members: deps.members, names: deps.names };
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
			const mine = opts.members[subject]?.find((x) => x.app === app);
			if (mine === undefined) throw new PortError("not-found", app);
			const d = data(app);
			const holds = (ids: ReadonlyArray<string>) => d.roles.filter((r) => ids.includes(r.id));
			let roles = holds(mine.roles);
			let who = subject;
			if (as !== undefined) {
				// As at the service: the estate administrator alone, never an app's owner or admin.
				if (deps.platformAdmins?.has(subject) !== true)
					throw new PortError("forbidden", "estate administrators only");
				const [kind, id = ""] = [as.slice(0, as.indexOf(":")), as.slice(as.indexOf(":") + 1)];
				if (kind === "role") {
					roles = holds([id]);
					if (roles.length === 0) throw new PortError("not-found", as);
				} else {
					const other = Object.entries(opts.members).find(
						([s, ms]) => s === id && ms.some((x) => x.app === app),
					);
					if (other === undefined) throw new PortError("not-found", as);
					roles = holds(other[1].find((x) => x.app === app)?.roles ?? []);
				}
				who = as;
			}
			const permissions: Record<string, ("all" | "assigned" | "own")[]> = {};
			const groups = new Set<string>();
			for (const r of roles) {
				for (const [k, v] of Object.entries({ ...capabilityMap(r), ...extraCapabilities(r) })) {
					const had = permissions[k] ?? [];
					permissions[k] = [...new Set([...had, ...v])];
				}
				for (const g of r.fieldGroups) groups.add(g);
				if (r.grants.calendars?.view !== undefined || r.grants.settings?.view !== undefined)
					for (const k of LOOKUPS) permissions[k] = ["all"];
			}
			return {
				app,
				appName: app === "psizone" ? "Psizone" : "Hemi-Sync",
				timeZone: "Europe/Bucharest",
				subject: who,
				displayName:
					as === undefined
						? (opts.names?.[subject] ?? subject)
						: as.startsWith("role:")
							? (roles[0]?.name ?? as)
							: (opts.names?.[as.slice("member:".length)] ?? as),
				roles: roles.map((r) => r.id),
				permissions,
				denied: [],
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
			return Object.entries(opts.members).flatMap(([subject, ms]) =>
				ms
					.filter((x) => x.app === app)
					.map((x) => ({ subject, displayName: opts.names?.[subject] ?? subject, roles: x.roles })),
			);
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
