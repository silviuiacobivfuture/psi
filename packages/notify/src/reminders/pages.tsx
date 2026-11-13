import type { JSX } from "hono/jsx/jsx-runtime";
import { APP_DEFAULTS, type AppKey } from "../apps";
import { paletteOf } from "../palette";
import * as m from "../paraglide/messages.js";

export type PageKind =
	| "ask-confirm"
	| "ask-cancel"
	| "confirmed"
	| "declined"
	| "expired"
	| "invalid"
	| "already"
	| "gone";
type Locale = "ro" | "en";

function words(kind: PageKind, locale: Locale): { title: string; body: string } {
	const o = { locale } as const;
	switch (kind) {
		case "ask-confirm":
			return { title: m.link_confirm_title({}, o), body: m.link_ask_body({}, o) };
		case "ask-cancel":
			return { title: m.link_cancel_title({}, o), body: m.link_ask_body({}, o) };
		case "confirmed":
			return {
				title: m.link_result_confirmed_title({}, o),
				body: m.link_result_confirmed_body({}, o),
			};
		case "declined":
			return {
				title: m.link_result_declined_title({}, o),
				body: m.link_result_declined_body({}, o),
			};
		case "expired":
			return { title: m.link_result_expired_title({}, o), body: m.link_result_expired_body({}, o) };
		case "invalid":
			return { title: m.link_result_invalid_title({}, o), body: m.link_result_invalid_body({}, o) };
		case "already":
			return { title: m.link_result_already_title({}, o), body: m.link_result_already_body({}, o) };
		case "gone":
			return { title: m.link_result_gone_title({}, o), body: m.link_result_gone_body({}, o) };
		default: {
			const never: never = kind;
			return never;
		}
	}
}

export interface ResultPageProps {
	app: AppKey;
	locale: Locale;
	kind: PageKind;
}

/** The friendly page a reminder link lands on, in the app's brand and the person's language. No script, no tracking. */
export function ResultPage({ app, locale, kind }: ResultPageProps): JSX.Element {
	const settings = APP_DEFAULTS[app];
	const c = paletteOf(settings.theme);
	const { title, body } = words(kind, locale);
	const asking = kind === "ask-confirm" || kind === "ask-cancel";
	const button =
		kind === "ask-confirm"
			? m.link_confirm_button({}, { locale })
			: m.link_cancel_button({}, { locale });
	const css = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:${c.bg};color:${c.ink};font:16px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}main{width:100%;max-width:480px;background:${c["surface-1"]};border:1px solid ${c.line};border-radius:14px;padding:28px}p.brand{margin:0 0 16px;font-weight:700;border-bottom:3px solid ${c.accent};padding-bottom:12px}h1{font-size:1.5rem;line-height:1.3;margin:0 0 8px}p{margin:0 0 20px;color:${c["ink-muted"]}}button{font:inherit;font-weight:600;min-height:48px;padding:0 24px;border:0;border-radius:10px;background:${c.accent};color:${c["on-accent"]};cursor:pointer}button:focus-visible{outline:3px solid ${c.ink};outline-offset:3px}`;
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
					{asking ? (
						<form method="post">
							<button type="submit">{button}</button>
						</form>
					) : null}
				</main>
			</body>
		</html>
	);
}
