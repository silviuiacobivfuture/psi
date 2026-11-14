import type { JsonLdNode } from "@psi/ui";
import { Doctype } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { assets } from "./assets";
import type { Locale } from "./i18n";
import { PwaHeadTags } from "./pwa/site";
import { SiteHead } from "./seo";
import type { Theme } from "./theme";

export interface LayoutProps {
	locale: Locale;
	theme: Theme;
	title: string;
	description: string;
	alternate: { locale: Locale; href: string };
	jsonLd?: ReadonlyArray<JsonLdNode>;
	children: Child;
}

export function Layout({
	locale,
	theme,
	title,
	description,
	alternate,
	jsonLd,
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
					<meta name="color-scheme" content="light dark" />
					<SiteHead
						locale={locale}
						theme={theme}
						title={title}
						description={description}
						alternate={alternate}
						extraJsonLd={jsonLd}
					/>
					<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
					<PwaHeadTags locale={locale} />
					<assets.Head />
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
