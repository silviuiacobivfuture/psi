/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { APPLE_TOUCH_ICON } from "./manifest";

export interface PwaHeadProps {
	/** This locale's manifest (`/manifest.webmanifest`, `/en/manifest.webmanifest`). */
	manifest: string;
	/** The home-screen label on iOS (the manifest's short name). */
	appTitle: string;
	/** The hashed client script. */
	client: string;
	/** The VAPID public key; absent when push is off. */
	vapidPublicKey: string | null;
	/** Pages that must stay out of search and the sitemap (offline, notifications). */
	noindex?: boolean;
}

/**
 * What `<head>` needs for install and push, beside `SeoHead` (which already prints
 * `theme-color`, so it is not repeated here): the manifest, the Apple touch icon and web-app
 * metas, the VAPID public key the client subscribes with, and the client itself.
 */
export function PwaHead({
	manifest,
	appTitle,
	client,
	vapidPublicKey,
	noindex = false,
}: PwaHeadProps): JSX.Element {
	return (
		<>
			<link rel="manifest" href={manifest} />
			<link rel="apple-touch-icon" href={APPLE_TOUCH_ICON} />
			<meta name="mobile-web-app-capable" content="yes" />
			<meta name="apple-mobile-web-app-capable" content="yes" />
			<meta name="apple-mobile-web-app-title" content={appTitle} />
			<meta name="apple-mobile-web-app-status-bar-style" content="default" />
			{vapidPublicKey !== null ? <meta name="psi-pwa-vapid" content={vapidPublicKey} /> : null}
			{noindex ? <meta name="robots" content="noindex" /> : null}
			<script type="module" src={client} />
		</>
	);
}
