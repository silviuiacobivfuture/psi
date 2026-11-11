import { z } from "zod";

/** The three brands the estate publishes for. */
export const BRANDS = ["psizone", "eqsync", "hemisync"] as const;
export const BrandSchema = z.enum(BRANDS);
export type Brand = z.infer<typeof BrandSchema>;
