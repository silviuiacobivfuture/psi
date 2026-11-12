/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { type Brand, Logo } from "./logo";

export interface MastheadProps {
	homeHref: string;
	/** Whose article this is: shows that brand's Logo (explicit, never "auto" under the Blog themes). */
	brand?: Exclude<Brand, "auto" | "blog">;
	/** The publication's wordmark, shown when no brand is named (the shared index). */
	title?: string;
	/** A quiet label after the logo or wordmark, e.g. "Blog". */
	kicker?: string;
	/** Something quiet at the far end, e.g. a dateline. */
	aside?: Child;
	class?: string;
}

/**
 * The reading masthead: the brand alone at the top of the page, in the flow of the paper. Not a bar
 * and not sticky; navigation lives in the Compass at the foot of the screen.
 */
export function Masthead({
	homeHref,
	brand,
	title,
	kicker,
	aside,
	class: className,
}: MastheadProps): JSX.Element {
	return (
		<header class={cx("pz-masthead", className)}>
			<a class="pz-masthead__home" href={homeHref}>
				{brand !== undefined ? (
					<Logo size={26} brand={brand} />
				) : (
					<>
						<Logo size={30} brand="blog" variant="mark" />
						<span class="pz-masthead__title">{title}</span>
					</>
				)}
				{kicker !== undefined ? <span class="pz-masthead__kicker">{kicker}</span> : null}
			</a>
			{aside !== undefined ? <span class="pz-masthead__aside">{aside}</span> : null}
		</header>
	);
}
