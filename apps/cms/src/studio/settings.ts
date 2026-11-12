import { AiBehaviour, AiSettings, type Site, settingsFor } from "@psi/cms-client";
import { z } from "zod";

/**
 * What the studio edits for one brand: the brand's whole `ai-settings` group but the stamps. On
 * the way in (a draft, a publish) it is parsed strictly, the behaviour included; what is stored
 * is read back leniently (`settingsFor`), so an older row never breaks the page.
 */
export const StudioSettings = AiSettings.omit({ updatedBy: true, updatedAt: true }).extend({
	behaviour: AiBehaviour,
});
export type StudioSettings = z.infer<typeof StudioSettings>;

/** The brand's settings from the global (or a stored snapshot), stamps dropped; null if absent. */
export function studioSettingsOf(rawGlobal: unknown, brand: Site): StudioSettings | null {
	const s = settingsFor(rawGlobal, brand);
	if (s === null) return null;
	const { updatedBy: _by, updatedAt: _at, ...rest } = s;
	return rest;
}

/** A snapshot row's settings, read as the brand's group would be. */
export function snapshotSettings(raw: unknown, brand: Site): StudioSettings | null {
	return studioSettingsOf({ [brand]: z.record(z.unknown()).catch({}).parse(raw) }, brand);
}
