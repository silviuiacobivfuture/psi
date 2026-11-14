import { fileURLToPath } from "node:url";
import { siteAssets } from "@psi/delivery";

/**
 * The console's stylesheet, Datastar and brand fonts, linked by content hash; brand images and PWA icons from
 * `public/` (`@psi/delivery`). Only the text face (Manrope, Latin) is preloaded.
 */
export const assets = siteAssets({
	stylesheet: fileURLToPath(new URL("../public/assets/app.css", import.meta.url)),
	publicRoot: "./public",
	fonts: ["fraunces", "manrope", "ibm-plex-mono"],
	preload: ["manrope-latin.woff2"],
});
