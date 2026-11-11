/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";

export interface ArticleListRowProps {
	href: string;
	title: string;
	/** Brand and topic, already translated: "Psizone · Autism". */
	overline: string;
	/** One line that answers the headline. */
	standfirst?: string;
	/** Mono metadata, already composed: a date, a reading time, a review state. */
	meta?: Child;
	headingLevel?: 2 | 3;
	class?: string;
}

/** One entry of the ruled editorial list (Stripe Press): a hairline above, the title in Fraunces. */
export function ArticleListRow({
	href,
	title,
	overline,
	standfirst,
	meta,
	headingLevel = 3,
	class: className,
}: ArticleListRowProps): JSX.Element {
	const Heading = headingLevel === 2 ? "h2" : "h3";
	return (
		<li class={cx("pz-row", className)}>
			<a class="pz-row__link" href={href}>
				<span class="pz-row__overline">{overline}</span>
				<Heading class="pz-row__title">{title}</Heading>
				{standfirst !== undefined ? <span class="pz-row__standfirst">{standfirst}</span> : null}
				{meta !== undefined ? <span class="pz-row__meta">{meta}</span> : null}
			</a>
		</li>
	);
}

/** The list that holds ArticleListRows: rules between entries, one at the end. */
export function ArticleList({
	label,
	class: className,
	children,
}: {
	label?: string;
	class?: string;
	children?: Child;
}): JSX.Element {
	return (
		<ol class={cx("pz-rows", className)} aria-label={label}>
			{children}
		</ol>
	);
}
