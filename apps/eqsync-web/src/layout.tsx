import { Doctype } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Locale } from "./i18n";
import { PwaHeadTags } from "./pwa/site";
import { SiteHead } from "./seo";
import type { Theme } from "./theme";

/** EQ-SYNC's two faces only: Fraunces for headlines, IBM Plex Mono for everything else. */
const FONTS =
	"https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,100..900,0..100;1,9..144,100..900,0..100&family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap";

export interface LayoutProps {
	locale: Locale;
	theme: Theme;
	title: string;
	description: string;
	alternate: { locale: Locale; href: string };
	children: Child;
}

export function Layout({
	locale,
	theme,
	title,
	description,
	alternate,
	children,
}: LayoutProps): JSX.Element {
	return (
		<>
			<Doctype />
			<html lang={locale} data-theme={theme}>
				<head>
					<meta charset="utf-8" />
					<meta
						name="viewport"
						content="width=device-width, initial-scale=1, interactive-widget=resizes-content"
					/>
					<title>{title}</title>
					<meta name="description" content={description} />
					<meta name="color-scheme" content="dark light" />
					<SiteHead
						locale={locale}
						theme={theme}
						title={title}
						description={description}
						alternate={alternate}
					/>
					<PwaHeadTags locale={locale} />
					<link rel="preconnect" href="https://fonts.googleapis.com" />
					<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
					<link rel="stylesheet" href={FONTS} />
					<link rel="stylesheet" href="/assets/app.css" />
					<script type="module" src="/assets/datastar.js" />
				</head>
				<body
					class="pz-grain"
					data-on:pointermove="const b = evt.target.closest?.('.pz-btn--primary'); if (b) { const r = b.getBoundingClientRect(); b.style.setProperty('--mx', evt.clientX - r.left + 'px'); b.style.setProperty('--my', evt.clientY - r.top + 'px') }"
				>
					{children}
				</body>
			</html>
		</>
	);
}
