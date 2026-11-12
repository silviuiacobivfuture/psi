import type { SettingsProvider } from "@psi/engine";

/**
 * `PSI_GUIDE_SETTINGS`: the runtime settings as JSON, for local development until the CMS's
 * `ai-settings` global is wired (e.g. `{"exchangeLimit":3}`). The engine parses what it returns,
 * so a malformed value falls back to the defaults (reported as a `settings` failure). Unset: no
 * provider, the defaults.
 */
export function settingsFromEnv(
	env: Readonly<Record<string, string | undefined>>,
): SettingsProvider | undefined {
	const raw = env.PSI_GUIDE_SETTINGS?.trim();
	if (raw === undefined || raw === "") return undefined;
	return async (): Promise<unknown> => JSON.parse(raw);
}
