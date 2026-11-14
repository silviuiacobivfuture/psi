import type { JSX } from "hono/jsx/jsx-runtime";
import { appName, roleName, type SeedKey, seedKeyOf, sortRoles } from "../chrome";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Role } from "../port/schema";

/** What a seed role lets a person do, in a sentence. */
function seedGist(seed: SeedKey, locale: Locale): string {
	const o = at(locale);
	switch (seed) {
		case "admin":
			return m.role_gist_admin({}, o);
		case "owner":
			return m.role_gist_owner({}, o);
		case "coordinator":
			return m.role_gist_coordinator({}, o);
		case "reception":
			return m.role_gist_reception({}, o);
		case "therapist":
			return m.role_gist_therapist({}, o);
		case "accountant":
			return m.role_gist_accountant({}, o);
		case "volunteer":
			return m.role_gist_volunteer({}, o);
		default: {
			const never: never = seed;
			return never;
		}
	}
}

/** A role's gist: the seed roles have their sentence; a custom role says what its owners wrote about it, if anything. */
export function roleGist(
	id: string,
	locale: Locale,
	names: Readonly<Record<string, string>> | undefined,
	roles: ReadonlyArray<Role>,
): string {
	const seed = seedKeyOf(id, names);
	if (seed !== null) return seedGist(seed, locale);
	return roles.find((r) => r.id === id)?.description ?? "";
}

/**
 * "Rolurile mele": the platform role (only the estate's administrator holds one) and every role held in each
 * organisation, highest first, each with what it allows. Nothing here is a permission check: it tells, the service decides.
 */
export function MyRoles({ ctx, roles }: { ctx: Ctx; roles: ReadonlyArray<Role> }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<section class="adm-card pf-card" aria-labelledby="pf-my-roles" data-my-roles>
			<h2 class="adm-h2" id="pf-my-roles">
				{m.pf_my_roles({}, o)}
			</h2>
			<p class="adm-muted">{m.pf_my_roles_lead({}, o)}</p>
			{ctx.platformAdmin ? (
				<div class="pf-level" data-role-level="platform">
					<h3 class="adm-h3">{m.pf_level_platform({}, o)}</h3>
					<dl class="pf-roles-list">
						<dt>{m.role_platform_admin({}, o)}</dt>
						<dd class="adm-muted">{m.pf_platform_gist({}, o)}</dd>
					</dl>
				</div>
			) : null}
			{ctx.memberships.map((mb) => {
				const names = mb.app === ctx.app ? ctx.caps.roleNames : undefined;
				const ordered = sortRoles(mb.roles, names);
				return (
					<div key={mb.app} class="pf-level" data-role-level="org" data-app={mb.app}>
						<h3 class="adm-h3">{m.pf_level_org({ app: appName(mb.app, ctx.locale) }, o)}</h3>
						{ordered.length === 0 ? (
							<p class="adm-muted">{m.pf_no_roles({}, o)}</p>
						) : (
							<dl class="pf-roles-list">
								{ordered.map((id) => {
									const gist = roleGist(id, ctx.locale, names, mb.app === ctx.app ? roles : []);
									return (
										<>
											<dt key={`${id}-t`}>{roleName(id, ctx.locale, names)}</dt>
											{gist === "" ? null : (
												<dd key={`${id}-d`} class="adm-muted">
													{gist}
												</dd>
											)}
										</>
									);
								})}
							</dl>
						)}
					</div>
				);
			})}
		</section>
	);
}
