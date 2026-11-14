import type { AssistantSettingsType } from "@psi/scheduling-sdk/contract";
import { BUILT_IN_STAFF_CONFIG, type StaffConfig } from "../assistant-config";

/** The built-in staff configuration with some settings (and other parts) changed, for tests. */
export function staffConfigWith(
	settings: Partial<AssistantSettingsType>,
	rest: Partial<Omit<StaffConfig, "settings">> = {},
): StaffConfig {
	return {
		...BUILT_IN_STAFF_CONFIG,
		...rest,
		settings: { ...BUILT_IN_STAFF_CONFIG.settings, ...settings },
	};
}
