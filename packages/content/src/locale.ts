import { z } from "zod";

/** The estate's locales: Romanian is the reference, English the second. */
export const LOCALES = ["ro", "en"] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

/** Content carries its own `ro` and `en`; interface text goes through each app's Paraglide. */
export const Localized = z.object({ ro: z.string().trim().min(1), en: z.string().trim().min(1) });
export type Localized = z.infer<typeof Localized>;
