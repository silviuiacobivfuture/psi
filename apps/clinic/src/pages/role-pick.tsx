import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { containersOf } from "../port/role-composition";
import type { Role } from "../port/schema";

/**
 * The member's roles, each a checkbox, and beside each one held entirely by another ticked role: "inclus în Proprietar"
 * (the service keeps only the containing role on save). Containment is the roles' permissions, never their names; the
 * mark follows the ticks as they change. A choice the list cannot describe (a role this person may not read) is kept.
 */
export function RolePick({
	legend,
	items,
	roles,
	on,
	locale,
}: {
	legend: string;
	items: ReadonlyArray<{ id: string; name: string }>;
	roles: ReadonlyArray<Role>;
	on: ReadonlyArray<string>;
	locale: Locale;
}): JSX.Element | null {
	if (items.length === 0) return null;
	const o = at(locale);
	const containers = containersOf(roles);
	// One signal per choice, by position: role ids are not signal names (dashes, opaque ids).
	const sig = (i: number): string => `rp.r${i}`;
	const index = new Map(items.map((it, i) => [it.id, i]));
	const nameOf = (id: string): string => items.find((it) => it.id === id)?.name ?? id;
	const signals = { rp: Object.fromEntries(items.map((it, i) => [`r${i}`, on.includes(it.id)])) };
	return (
		<fieldset class="cl-choices" data-signals={JSON.stringify(signals)} data-role-pick>
			<legend>{legend}</legend>
			{items.map((it, i) => {
				const within = (containers.get(it.id) ?? []).filter((c) => index.has(c));
				const held = within.filter((c) => on.includes(c));
				const show = within.map((c) => `$${sig(index.get(c) ?? 0)}`).join(" || ");
				return (
					<div key={it.id} class="cl-choice">
						<label class="adm-check">
							<input
								type="checkbox"
								name="roles"
								value={it.id}
								checked={on.includes(it.id)}
								data-on:change={`$${sig(i)} = el.checked`}
							/>
							{it.name}
						</label>
						{within.length === 0 ? null : (
							<small
								class="adm-muted"
								data-included-in={within.join(" ")}
								data-show={`$${sig(i)} && (${show})`}
								style={on.includes(it.id) && held.length > 0 ? undefined : "display:none"}
							>
								{m.mb_included_in({ role: within.map(nameOf).join(", ") }, o)}
							</small>
						)}
					</div>
				);
			})}
		</fieldset>
	);
}
