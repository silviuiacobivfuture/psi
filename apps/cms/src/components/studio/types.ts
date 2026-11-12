import type { CopyDefaults } from "@psi/cms-client/behaviour";
import type { Brand } from "../../authz/types";
import type { CustomKey } from "../../i18n";
import type { ModelChoice } from "../../studio/catalog";
import type { Version } from "../../studio/history";
import type { StudioSettings } from "../../studio/settings";

/**
 * What the studio's server view hands its page: the brand's live settings and stamps, the saved
 * draft, the history, the site's built-in copy, the choices, and what this person may do. Plain
 * data (it crosses from the server render to the browser).
 */
export type { Brand };
export type Settings = StudioSettings;
export type ModelRow = ModelChoice;
export type VersionRow = Pick<Version, "id" | "by" | "at" | "note" | "settings">;

export interface StudioInitial {
	brand: Brand;
	brandName: string;
	live: Settings;
	liveStamp: { by: string | null; at: string | null };
	draft: { settings: Settings; by: string | null; at: string } | null;
	history: ReadonlyArray<VersionRow>;
	/** The site's built-in copy per locale; null when the site did not say (older, unreachable). */
	defaults: { ro: CopyDefaults; en: CopyDefaults } | null;
	/** The model the site runs when none is chosen (its configuration), when it answered. */
	siteModel: string | null;
	models: ReadonlyArray<ModelRow>;
	topics: ReadonlyArray<string>;
	canEdit: boolean;
	canPreview: boolean;
	/** The site's control route is configured (the preview can reach the guide). */
	previewReady: boolean;
	/** The brand takes bookings (booking is a sensible contact route). */
	books: boolean;
}

export type T = (key: CustomKey) => string;

/** Replaces `{name}` in a message. */
export function fill(text: string, values: Readonly<Record<string, string | number>>): string {
	return text.replace(/\{(\w+)\}/g, (all, k: string) => (k in values ? String(values[k]) : all));
}
