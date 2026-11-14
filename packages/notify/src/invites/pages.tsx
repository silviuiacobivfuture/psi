import type { JSX } from "hono/jsx/jsx-runtime";
import { APP_DEFAULTS, type AppKey } from "../apps";
import { paletteOf } from "../palette";
import * as m from "../paraglide/messages.js";

export type InvitePageKind =
	| "ask"
	| "expired"
	| "replaced"
	| "revoked"
	| "active"
	| "unavailable"
	| "invalid";
type Locale = "ro" | "en";

function words(
	kind: InvitePageKind,
	locale: Locale,
): { title: string; body: string; button?: string } {
	const o = { locale } as const;
	switch (kind) {
		case "ask":
			return {
				title: m.invite_ask_title({}, o),
				body: m.invite_ask_body({}, o),
				button: m.invite_ask_button({}, o),
			};
		case "expired":
			return { title: m.invite_expired_title({}, o), body: m.invite_expired_body({}, o) };
		case "replaced":
			return { title: m.invite_replaced_title({}, o), body: m.invite_replaced_body({}, o) };
		case "revoked":
			return { title: m.invite_revoked_title({}, o), body: m.invite_revoked_body({}, o) };
		case "active":
			return {
				title: m.invite_active_title({}, o),
				body: m.invite_active_body({}, o),
				button: m.invite_active_button({}, o),
			};
		case "unavailable":
			return {
				title: m.invite_unavailable_title({}, o),
				body: m.invite_unavailable_body({}, o),
			};
		case "invalid":
			return { title: m.link_result_invalid_title({}, o), body: m.link_result_invalid_body({}, o) };
		default: {
			const never: never = kind;
			return never;
		}
	}
}

export interface InvitePageProps {
	app: AppKey;
	locale: Locale;
	kind: InvitePageKind;
	/** For `active`: where the sign-in is. */
	signInUrl?: string;
}

/** The page an invitation link lands on, in the app's brand and the person's language. No script, no tracking. */
export function InvitePage({ app, locale, kind, signInUrl }: InvitePageProps): JSX.Element {
	const settings = APP_DEFAULTS[app];
	const c = paletteOf(settings.theme);
	const { title, body, button } = words(kind, locale);
	const css = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:${c.bg};color:${c.ink};font:16px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}main{width:100%;max-width:480px;background:${c["surface-1"]};border:1px solid ${c.line};border-radius:14px;padding:28px}p.brand{margin:0 0 16px;font-weight:700;border-bottom:3px solid ${c.accent};padding-bottom:12px}h1{font-size:1.5rem;line-height:1.3;margin:0 0 8px}p{margin:0 0 20px;color:${c["ink-muted"]}}.cta{display:inline-block;font:inherit;font-weight:600;min-height:48px;line-height:48px;padding:0 24px;border:0;border-radius:10px;background:${c.accent};color:${c["on-accent"]};cursor:pointer;text-decoration:none}.cta:focus-visible{outline:3px solid ${c.ink};outline-offset:3px}`;
	return (
		<html lang={locale}>
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<meta name="robots" content="noindex,nofollow" />
				<meta name="referrer" content="no-referrer" />
				<title>{`${title} · ${settings.brandName}`}</title>
				<style>{css}</style>
			</head>
			<body>
				<main>
					<p class="brand">{settings.brandName}</p>
					<h1>{title}</h1>
					<p>{body}</p>
					{kind === "ask" ? (
						<form method="post">
							<button type="submit" class="cta">
								{button}
							</button>
						</form>
					) : null}
					{kind === "active" && signInUrl !== undefined ? (
						<a class="cta" href={signInUrl}>
							{button}
						</a>
					) : null}
				</main>
			</body>
		</html>
	);
}
