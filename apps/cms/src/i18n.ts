import { en } from "@payloadcms/translations/languages/en";
import { ro } from "@payloadcms/translations/languages/ro";

/** cms's own interface strings, beside Payload's (which come in Romanian and English). */
export const custom = {
	ro: { psi: { signInWithDirectory: "Intră cu contul Psi" } },
	en: { psi: { signInWithDirectory: "Sign in with your Psi account" } },
} as const;
export type CustomKey = "psi:signInWithDirectory";

export const i18n = {
	fallbackLanguage: "ro" as const,
	supportedLanguages: { ro, en },
	translations: custom,
};
