import { Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Layout } from "../layout";
import { at, type Locale } from "../lib/i18n";
import type { Theme } from "../lib/theme";
import { m } from "../paraglide/messages.js";

/** Signed in, but a member of no app: a plain, kind page — never an error. */
export function NoAccessPage({
	locale,
	theme,
	name,
	signOutAction,
}: {
	locale: Locale;
	theme: Theme;
	name: string;
	signOutAction: string;
}): JSX.Element {
	const o = at(locale);
	return (
		<Layout locale={locale} theme={theme} title={`${m.noaccess_title({}, o)} · ${m.brand({}, o)}`}>
			<main class="adm gate">
				<section class="gate__card adm-card">
					<span class="adm-brand__mark gate__mark" aria-hidden="true" />
					<Icon name="shield" />
					<h1 class="adm-h1">{m.noaccess_title({}, o)}</h1>
					<p class="adm-muted">{m.noaccess_text({ name }, o)}</p>
					<form method="post" action={signOutAction}>
						<button class="adm-btn" type="submit">
							{m.sign_out({}, o)}
						</button>
					</form>
				</section>
			</main>
		</Layout>
	);
}

/** Sign-in is not configured on this server (never a silent open door). */
export function SignInUnavailable({
	locale,
	theme,
}: {
	locale: Locale;
	theme: Theme;
}): JSX.Element {
	const o = at(locale);
	return (
		<Layout locale={locale} theme={theme} title={`${m.signin_title({}, o)} · ${m.brand({}, o)}`}>
			<main class="adm gate">
				<section class="gate__card adm-card">
					<span class="adm-brand__mark gate__mark" aria-hidden="true" />
					<h1 class="adm-h1">{m.signin_title({}, o)}</h1>
					<p class="adm-muted">{m.signin_unavailable({}, o)}</p>
				</section>
			</main>
		</Layout>
	);
}
