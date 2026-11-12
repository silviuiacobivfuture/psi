import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import type { Theme } from "../theme";
import { PageShell } from "./shell";

/** A page of the account journey in Psizone's shell and theme: /cont and everything under it. */
export function AccountFrame({
	locale,
	theme,
	origin,
	path,
	title,
	children,
}: {
	locale: Locale;
	theme: Theme;
	origin: string;
	path: string;
	title: string;
	children: Child;
}): JSX.Element {
	return (
		<PageShell
			locale={locale}
			theme={theme}
			origin={origin}
			path={path}
			title={title}
			lead={m.account_lead({}, at(locale))}
		>
			<section class="mx-auto max-w-6xl px-5 pb-28">{children}</section>
		</PageShell>
	);
}
