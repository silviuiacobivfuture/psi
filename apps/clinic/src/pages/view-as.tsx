import { Banner, EmptyState, Icon } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { AppDeps, Env } from "../app";
import { Page, roleLabel, roleName } from "../chrome";
import { canOf } from "../lib/can";
import type { Ctx } from "../lib/context";
import { landingFor } from "../lib/gates";
import { at, type Locale } from "../lib/i18n";
import { sse } from "../lib/sse";
import { clearViewAs, writeViewAs } from "../lib/view-as";
import { m } from "../paraglide/messages.js";
import type { TeamMember, ViewAsTarget } from "../port/port";
import { PortError } from "../port/port";
import type { Role } from "../port/schema";
import { RoleMenuBody } from "../role-switcher";

const TARGET = /^(role|member):[^\s:][^\s]{0,199}$/;
/** Who is being viewed, for people: a seed role is named in the person's language, a custom role or a member by their own name. */
function viewLabel(as: ViewAsTarget, displayName: string | undefined, locale: Locale): string {
	if (as.startsWith("role:")) {
		const id = as.slice("role:".length);
		const local = roleName(
			id,
			locale,
			displayName === undefined ? undefined : { [id]: displayName },
		);
		return (local === id ? (displayName ?? id) : local).slice(0, 120);
	}
	return (displayName ?? as).slice(0, 120);
}

const isTarget = (s: string): s is ViewAsTarget => TARGET.test(s);

function Choice({
	as,
	label,
	hint,
	go,
}: {
	as: ViewAsTarget;
	label: string;
	hint: string;
	go: string;
}): JSX.Element {
	return (
		<form method="post" action="/view-as" class="adm-card adm-row" data-view-as-choice={as}>
			<input type="hidden" name="as" value={as} />
			<input type="hidden" name="label" value={label} />
			<div style="flex:1">
				<strong>{label}</strong>
				<div class="adm-muted">{hint}</div>
			</div>
			<button class="adm-btn" type="submit">
				<Icon name="shield" />
				{go}
			</button>
		</form>
	);
}

export async function renderViewAs(
	ctx: Ctx,
	roles: ReadonlyArray<Role>,
	members: ReadonlyArray<TeamMember>,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const roleNames = new Map(roles.map((r) => [r.id, roleLabel(r, ctx.locale)]));
	return Page({
		ctx,
		current: "more",
		title: m.view_as_title({}, o),
		children: (
			<div class="adm-page">
				<Banner tone="info" icon="shield">
					{m.view_as_lead({}, o)}
				</Banner>
				{ctx.platformAdmin ? <h2 class="adm-h2">{m.view_as_group_platform({}, o)}</h2> : null}
				{ctx.platformAdmin ? (
					<form method="post" action="/view-as/stop" class="adm-card adm-row" data-view-as-platform>
						<div style="flex:1">
							<strong>{m.role_platform_admin({}, o)}</strong>
							<div class="adm-muted">{m.view_as_platform_hint({}, o)}</div>
						</div>
						{ctx.viewAs === null ? (
							<span class="adm-pill adm-pill--attended">
								<Icon name="check" />
								{m.view_as_current({}, o)}
							</span>
						) : (
							<button class="adm-btn" type="submit">
								<Icon name="shield" />
								{m.view_as_back({}, o)}
							</button>
						)}
					</form>
				) : null}
				<h2 class="adm-h2">{m.view_as_group_org({}, o)}</h2>
				{roles.length === 0 ? (
					<EmptyState icon="shield" title={m.view_as_none({}, o)} />
				) : (
					<div class="adm-stack" style="gap:var(--space-2)">
						{roles.map((r) => (
							<Choice
								key={r.id}
								as={`role:${r.id}`}
								label={roleLabel(r, ctx.locale)}
								hint={r.description}
								go={m.view_as_start(
									{
										name: roleLabel(r, ctx.locale),
									},
									o,
								)}
							/>
						))}
					</div>
				)}
				<h2 class="adm-h2">{m.view_as_members({}, o)}</h2>
				{members.length === 0 ? (
					<EmptyState icon="users" title={m.view_as_none({}, o)} />
				) : (
					<div class="adm-stack" style="gap:var(--space-2)">
						{members.map((p) => (
							<Choice
								key={p.subject}
								as={`member:${p.subject}`}
								label={p.displayName}
								hint={p.roles.map((r) => roleNames.get(r) ?? r).join(", ")}
								go={m.view_as_start({ name: p.displayName }, o)}
							/>
						))}
					</div>
				)}
			</div>
		),
	});
}

/** "Vezi ca…": start and stop. Both go to the service as the person themselves (audited as theirs), never as the role. */
export function registerViewAs(app: Hono<Env>, deps: AppDeps): void {
	const guardAdmin = (ctx: Ctx): void => {
		if (!ctx.mayViewAs) throw new PortError("forbidden", "roles administrators only");
	};
	app.get("/view-as", async (c) => {
		const ctx = c.var.ctx;
		guardAdmin(ctx);
		const own = await deps.ports.forPerson(c);
		const [roles, members] = await Promise.all([
			own.roles(ctx.app),
			own.members(ctx.app).catch(() => []),
		]);
		return c.html(await renderViewAs(ctx, roles, members), 200, {
			"cache-control": "private, no-store",
		});
	});
	// The pill's menu fills itself on first open, so no page pays for the lists until someone asks.
	app.get("/view-as/menu", async (c) => {
		const ctx = c.var.ctx;
		guardAdmin(ctx);
		const own = await deps.ports.forPerson(c);
		const [roles, members] = await Promise.all([
			own.roles(ctx.app),
			own.members(ctx.app).catch(() => []),
		]);
		const body = (
			<RoleMenuBody
				ctx={ctx}
				roles={roles}
				members={members}
				roleLabel={(r) => roleLabel(r, ctx.locale)}
			/>
		).toString();
		return sse((stream) => {
			stream.patchElements(body);
		});
	});
	app.post("/view-as", async (c) => {
		const ctx = c.var.ctx;
		guardAdmin(ctx);
		const form = await c.req.parseBody();
		const as = typeof form.as === "string" ? form.as : "";
		if (!isTarget(as)) return c.text("invalid", 400);
		const own = await deps.ports.forPerson(c);
		const seen = await own.startViewAs(ctx.person.subject, ctx.app, as);
		await writeViewAs(
			c,
			deps.viewAsSecret,
			{
				subject: ctx.person.subject,
				app: ctx.app,
				as: as,
				label: viewLabel(as, seen.displayName, ctx.locale),
			},
			deps.origin.startsWith("https:"),
		);
		return c.redirect(landingFor(canOf(seen, true)), 303);
	});
	app.post("/view-as/stop", async (c) => {
		const ctx = c.var.ctx;
		if (ctx.viewAs !== null) {
			const own = await deps.ports.forPerson(c);
			await own.stopViewAs(ctx.person.subject, ctx.app);
		}
		clearViewAs(c);
		return c.redirect("/", 303);
	});
}
