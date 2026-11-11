import type { locales } from "./paraglide/runtime.js";

export type Locale = (typeof locales)[number];
