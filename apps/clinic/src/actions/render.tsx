import { Icon, type OverflowItem, type PaletteItem } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { actionCtx } from "./context";
import { listActions } from "./engine";
import type { ActionDef, EntityState, Placement, Screen } from "./types";

type Variant = "primary" | "default" | "ghost";

const classOf = (v: Variant): string =>
	v === "primary"
		? "adm-btn adm-btn--primary"
		: v === "ghost"
			? "adm-btn adm-btn--ghost"
			: "adm-btn";

/** The actions the person may do for a screen and a placement, as the registry says. */
export const actionsFor = (
	ctx: Ctx,
	screen: Screen,
	placement: Placement,
	entity: EntityState = {},
): ReadonlyArray<ActionDef> => listActions(actionCtx(ctx), { screen, placement, entity });

/** One button for an action: it opens its sheet when it has one, otherwise it goes where the action begins. */
export function ActionButton({
	action,
	ctx,
	entity = {},
	variant = "default",
}: {
	action: ActionDef;
	ctx: Ctx;
	entity?: EntityState;
	variant?: Variant;
}): JSX.Element {
	const text = action.label(ctx.locale);
	const inner = (
		<>
			<Icon name={action.icon} />
			{text}
		</>
	);
	if (action.opens !== undefined)
		return (
			<button
				type="button"
				class={classOf(variant)}
				data-action={action.id}
				data-on:click={`$${action.opens} = true`}
			>
				{inner}
			</button>
		);
	return (
		<a class={classOf(variant)} data-action={action.id} href={action.to?.(entity) ?? "#"}>
			{inner}
		</a>
	);
}

/** The primary actions of a screen (one row; on a phone it sits over the tab bar). */
export function ActionBar({
	ctx,
	screen,
	entity = {},
	placement = "primary",
}: {
	ctx: Ctx;
	screen: Screen;
	entity?: EntityState;
	placement?: Placement;
}): JSX.Element | null {
	const list = actionsFor(ctx, screen, placement, entity);
	if (list.length === 0) return null;
	return (
		<div class="adm-actionbar" data-actionbar={screen}>
			{list.map((a, i) => (
				<ActionButton
					key={a.id}
					action={a}
					ctx={ctx}
					entity={entity}
					variant={i === 0 ? "primary" : "default"}
				/>
			))}
		</div>
	);
}

/** The "⋯" items of an entity: each registry action placed in the menu for this screen. */
export function menuItems(
	ctx: Ctx,
	screen: Screen,
	entity: EntityState = {},
): ReadonlyArray<OverflowItem> {
	// What destroys something comes last in a menu, in the registry's own order otherwise.
	const destructive = (a: ActionDef): number => (a.icon === "trash" ? 1 : 0);
	return [...actionsFor(ctx, screen, "menu", entity)]
		.sort((a, b) => destructive(a) - destructive(b))
		.filter((a) => a.opens !== undefined || a.to !== undefined)
		.map((a) => ({
			key: a.id,
			label: a.label(ctx.locale),
			icon: a.icon,
			action: a.id,
			...(a.icon === "trash" ? { tone: "danger" as const } : {}),
			...(a.opens !== undefined
				? { onClick: `$${a.opens} = true` }
				: { href: a.to?.(entity) ?? "#" }),
		}));
}

/** Empty-state buttons for a screen. */
export function EmptyActions({
	ctx,
	screen,
	entity = {},
}: {
	ctx: Ctx;
	screen: Screen;
	entity?: EntityState;
}): JSX.Element | null {
	const list = actionsFor(ctx, screen, "empty", entity);
	return list.length === 0 ? null : (
		<>
			{list.map((a, i) => (
				<ActionButton
					key={a.id}
					action={a}
					ctx={ctx}
					entity={entity}
					variant={i === 0 ? "primary" : "default"}
				/>
			))}
		</>
	);
}

/** What the command palette offers on a screen: where to go, and what can be done to what is open. */
export function paletteItems(
	ctx: Ctx,
	screens: ReadonlyArray<Screen>,
	entity: EntityState = {},
): ReadonlyArray<PaletteItem> {
	const o = at(ctx.locale);
	const seen = new Set<string>();
	return screens.flatMap((screen) =>
		actionsFor(ctx, screen, "palette", entity).flatMap((a) => {
			const href = a.to?.(entity);
			if (seen.has(a.id) || href === undefined) return [];
			seen.add(a.id);
			return [
				{
					id: a.id,
					label: a.label(ctx.locale),
					icon: a.icon,
					href,
					group: a.id.startsWith("nav.") ? m.pal_go({}, o) : m.pal_do({}, o),
				},
			];
		}),
	);
}
