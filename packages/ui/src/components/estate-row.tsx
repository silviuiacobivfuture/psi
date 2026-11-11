/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import type { EstateLink } from "../estate";

export interface EstateRowProps {
	/** Names the row, visibly and for assistive technology ("Site-uri înrudite"). */
	label: string;
	/** From `estateLinks`: every estate site in its own name, the current one marked. */
	links: ReadonlyArray<EstateLink>;
	class?: string;
}

/**
 * The estate row: one quiet line at the foot of every site that names the four psi sites, each
 * linking to its own canonical origin. It reads the theme's roles only, so it sits in any brand.
 */
export function EstateRow({ label, links, class: className }: EstateRowProps): JSX.Element {
	const id = "pz-estate-label";
	return (
		<nav
			aria-labelledby={id}
			class={cx(
				"flex flex-col gap-x-5 gap-y-2 text-body-sm sm:flex-row sm:items-center",
				className,
			)}
		>
			<span id={id} class="text-ink-faint">
				{label}
			</span>
			<ul class="flex flex-wrap items-center gap-x-6 gap-y-2">
				{links.map((link) => (
					<li>
						<a
							href={link.href}
							aria-current={link.current ? "true" : undefined}
							class={
								link.current
									? "text-ink underline decoration-line-strong underline-offset-4"
									: "text-ink-muted underline-offset-4 hover:text-ink hover:underline"
							}
						>
							{link.label}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
