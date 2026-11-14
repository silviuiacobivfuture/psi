import { EmptyState } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Layout } from "../layout";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";

/**
 * The page a navigation gets when the service failed before the console knew who is asking (the request's context:
 * person, app, permissions). A whole document in the person's language with a way back in, never the bare word the
 * error code is. `retryHref` is the address the person asked for, so "Încearcă din nou" asks for it again.
 */
export function OutagePage({
	locale,
	retryHref,
}: {
	locale: Locale;
	retryHref: string;
}): JSX.Element {
	const o = at(locale);
	return (
		<Layout
			locale={locale}
			theme="admin-light"
			title={`${m.error_title({}, o)} · ${m.brand({}, o)}`}
		>
			<main class="adm-page" id="main">
				<EmptyState icon="alert" title={m.error_title({}, o)} text={m.error_text({}, o)}>
					<a class="adm-btn adm-btn--primary" href={retryHref}>
						{m.retry({}, o)}
					</a>
				</EmptyState>
			</main>
		</Layout>
	);
}
