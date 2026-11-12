import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT } from "./paths";

/** Licences the estate accepts for free imagery: none of them forbids cropping or regrading. */
export const LICENCES = ["CC0 1.0", "Public Domain Mark 1.0", "CC BY 3.0", "CC BY 4.0"] as const;

/** The owner's own artwork (the logo): recorded for completeness, never fetched or re-encoded here. */
export const OWNED = "Owner's own asset";

const credit = z.object({
	/** The pipeline's key: also the output file stem. */
	name: z.string().regex(/^[a-z0-9-]+$/),
	title: z.string().min(1),
	/** The page that states the licence. */
	sourceUrl: z.string().url(),
	/** The original file the pipeline downloads. */
	downloadUrl: z.string().url(),
	provider: z.enum(["wikimedia", "wordpress-photos", "stocksnap", "flickr", "rawpixel", "owner"]),
	author: z.string().min(1),
	authorUrl: z.string().url().optional(),
	licence: z.enum([...LICENCES, OWNED]),
	/** Required for every licensed image; the owner's own assets have none. */
	licenceUrl: z.string().url().optional(),
	attributionRequired: z.boolean(),
	/** What the pipeline changes (CC BY asks for it to be said). */
	modifications: z.string().min(1),
	downloaded: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	usedIn: z.array(z.string().min(1)).min(1),
});

export type Credit = z.infer<typeof credit>;

const file = z.object({
	$comment: z.string().optional(),
	images: z.array(credit),
});

export const CREDITS_PATH = join(ROOT, "packages/design/imagery/credits.json");

/** Every image the estate ships, with its provenance; parsed, never trusted. */
export function readCredits(): ReadonlyArray<Credit> {
	const parsed = file.parse(JSON.parse(readFileSync(CREDITS_PATH, "utf8")));
	const names = new Set<string>();
	for (const c of parsed.images) {
		if (names.has(c.name)) throw new Error(`credits.json: "${c.name}" is listed twice`);
		names.add(c.name);
		if (
			(c.licence === OWNED) !== (c.provider === "owner") ||
			(c.licence !== OWNED && !c.licenceUrl)
		) {
			throw new Error(
				`credits.json: "${c.name}" needs a licence URL, or provider "owner" for owned art`,
			);
		}
		if (c.licence.startsWith("CC BY") !== c.attributionRequired) {
			throw new Error(`credits.json: "${c.name}" attributionRequired does not match ${c.licence}`);
		}
	}
	return parsed.images;
}
