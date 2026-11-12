/** @jsxRuntime automatic @jsxImportSource hono/jsx */

import { Doctype } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";

export interface OfflineText {
	/** `<title>` and heading. */
	title: string;
	lead: string;
	retry: string;
	home: string;
}

export interface OfflinePageProps {
	lang: string;
	theme: string;
	text: OfflineText;
	homeHref: string;
	/** The site's stylesheet (precached with the page). */
	stylesheet: string;
	appTitle: string;
}

/**
 * The page the worker shows when a page is asked for with no network and no kept copy. It is
 * precached, so it needs nothing from the network: the site's stylesheet (also precached) and no
 * script but "Try again", which reloads the address that failed.
 */
export function OfflinePage({
	lang,
	theme,
	text,
	homeHref,
	stylesheet,
	appTitle,
}: OfflinePageProps): JSX.Element {
	return (
		<>
			<Doctype />
			<html lang={lang} data-theme={theme} data-finish="flat">
				<head>
					<meta charset="utf-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1" />
					<meta name="robots" content="noindex" />
					<title>{`${text.title} — ${appTitle}`}</title>
					<link rel="stylesheet" href={stylesheet} />
				</head>
				<body class="bg-bg text-ink">
					<main class="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-5 py-20">
						<h1 class="display text-display-md text-ink">{text.title}</h1>
						<p class="text-body-lg text-ink-muted">{text.lead}</p>
						<p class="flex flex-wrap gap-3">
							<button type="button" class="pz-btn pz-btn--primary" onclick="location.reload()">
								{text.retry}
							</button>
							<a class="pz-btn pz-btn--glass" href={homeHref}>
								{text.home}
							</a>
						</p>
					</main>
				</body>
			</html>
		</>
	);
}
