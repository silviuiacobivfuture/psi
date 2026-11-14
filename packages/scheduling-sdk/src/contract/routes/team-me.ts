import { route } from "../define";
import { MySettings, MySettingsOut } from "../entities-settings";
import { AppParam } from "../primitives";

/**
 * A person's own settings in an app. Any member reaches their own and nobody else's: the subject is the caller's, never
 * a parameter. Saving is audited; looking at the app as someone else cannot save.
 */
export const SETTINGS_ROUTES = [
	route({
		id: "me.settings",
		method: "GET",
		path: "/v1/apps/:app/me/settings",
		side: "team",
		summary:
			"The caller's own settings in this app (language, theme, first calendar view, quiet hours, channels per kind); the defaults while none were saved",
		params: AppParam,
		response: MySettingsOut,
	}),
	route({
		id: "me.saveSettings",
		method: "PUT",
		path: "/v1/apps/:app/me/settings",
		side: "team",
		summary:
			"Replace the caller's own settings in this app (the whole set; the same set again changes nothing). Notifications follow them from then on",
		params: AppParam,
		body: MySettings,
		response: MySettingsOut,
		audit: "settings.update",
	}),
] as const;
