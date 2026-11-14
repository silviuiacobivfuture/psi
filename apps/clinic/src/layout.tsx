import { Doctype } from "@psi/ui";
import { THEME_BOOT } from "@psi/ui/admin";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { assetPath } from "./assets";
import type { Locale } from "./lib/i18n";
import type { Theme } from "./lib/theme";

const FONTS =
	"https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,100..900,0..100&family=Manrope:wght@400..800&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

export interface LayoutProps {
	locale: Locale;
	theme: Theme;
	title: string;
	head?: Child;
	children?: Child;
}

/** The document: admin theme resolved before first paint, self-hosted Datastar, the built stylesheet. */
export function Layout({ locale, theme, title, head, children }: LayoutProps): JSX.Element {
	return (
		<>
			<Doctype />
			<html lang={locale} data-theme={theme} data-finish="flat">
				<head>
					<meta charset="utf-8" />
					<meta
						name="viewport"
						content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
					/>
					<title>{title}</title>
					<meta name="color-scheme" content="light dark" />
					<meta name="robots" content="noindex, nofollow" />
					<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
					<script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
					{head}
					<link rel="preconnect" href="https://fonts.googleapis.com" />
					<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
					<link rel="stylesheet" href={FONTS} />
					<link rel="stylesheet" href={assetPath("app.css")} />
					<script type="module" src={assetPath("datastar.js")} />
				</head>
				<body>{children}</body>
			</html>
		</>
	);
}
