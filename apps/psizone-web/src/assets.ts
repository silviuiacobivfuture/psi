import { fileURLToPath } from "node:url";
import { siteAssets } from "@psi/delivery";

/**
 * The site's stylesheet, Datastar and brand fonts, linked by content hash; compression and cache policy for everything
 * it sends (`@psi/delivery`). Only the text face (Manrope, Latin) is preloaded: preloading Fraunces too (120 KB) kept
 * the headings from shifting but pushed the largest paint from 2.5 s to 3.3 s on a throttled phone.
 */
export const assets = siteAssets({
	stylesheet: fileURLToPath(new URL("../public/assets/app.css", import.meta.url)),
	publicRoot: "./public",
	fonts: ["fraunces", "manrope", "ibm-plex-mono"],
	preload: ["manrope-latin.woff2"],
});
