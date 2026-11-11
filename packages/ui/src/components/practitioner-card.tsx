/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface PractitionerCardProps {
	name: string;
	role?: string;
	photo?: string;
	specialties?: ReadonlyArray<string>;
	action?: Child;
	class?: string;
}

export function PractitionerCard({
	name,
	role,
	photo,
	specialties = [],
	action,
	class: className,
}: PractitionerCardProps): JSX.Element {
	const initials = name
		.split(" ")
		.map((p) => p.charAt(0))
		.slice(0, 2)
		.join("");
	return (
		<article class={cx("pz-person", className)}>
			<div class="pz-person__avatar" aria-hidden={photo ? undefined : "true"}>
				{photo ? <img src={photo} alt={name} /> : initials}
			</div>
			<div>
				<h3 class="pz-person__name">{name}</h3>
				{role ? <p class="pz-person__role">{role}</p> : null}
			</div>
			{specialties.length > 0 ? (
				<div class="pz-person__tags">
					{specialties.map((s) => (
						<span class="pz-chip pz-chip--static pz-chip--neutral">{s}</span>
					))}
				</div>
			) : null}
			{action ?? null}
		</article>
	);
}
