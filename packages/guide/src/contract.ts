import type { Brand, Locale } from "@psi/knowledge";
import { z } from "zod";

/**
 * The knowledge contract, from `@psi/knowledge` (type-only: nothing of that package runs inside
 * the guide unless the app hands a `Knowledge` in). Whatever a `Knowledge` returns is parsed by
 * the engine before it is trusted.
 */
export type { Brand, Knowledge, Locale, Passage, Source } from "@psi/knowledge";

export const BRANDS: ReadonlyArray<Brand> = ["psizone", "eqsync", "hemisync", "blog"];
export const LOCALES: readonly [Locale, ...Locale[]] = ["ro", "en"];

export const BrandSchema: z.ZodType<Brand> = z.enum(["psizone", "eqsync", "hemisync", "blog"]);
export const LocaleSchema: z.ZodType<Locale> = z.enum(["ro", "en"]);
