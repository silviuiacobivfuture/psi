import { type AiSettingsClient, aiSettingsFromEnv } from "@psi/cms-client";

/**
 * This site's AI settings from the shared CMS (`ai-settings`, the hemisync group), read with the site's
 * read-only key (CMS_URL, CMS_API_KEY): 60 s cache, refreshed at once by the CMS's webhook
 * (cms.ts), last known value on failure, then the defaults. Null without a key: the guide then
 * runs on PSI_GUIDE_SETTINGS (development) or the defaults.
 */
export const aiSettings: AiSettingsClient | null = aiSettingsFromEnv(process.env, "hemisync");
