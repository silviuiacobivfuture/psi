import { fileURLToPath } from "node:url";
import { siteAssets } from "@psi/delivery";

/**
 * The site's stylesheet, Datastar and brand fonts, linked by content hash; compression and cache policy for everything
 * it sends (`@psi/delivery`). Only the text face (Inter, Latin) is preloaded: Fraunces (120 KB) competes with the
 * largest paint on a slow phone, and arrives in time without it.
 */
export const assets = siteAssets({
	stylesheet: fileURLToPath(new URL("../public/assets/app.css", import.meta.url)),
	publicRoot: "./public",
	fonts: ["fraunces", "inter"],
	preload: ["inter-latin.woff2"],
});
