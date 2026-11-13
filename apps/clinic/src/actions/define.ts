import { z } from "zod";
import type { at, Locale } from "../lib/i18n";
import type { ActionCtx, ActionDef, ActionResult } from "./types";

type Shape = z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>;

type Definition<S extends Shape> = Omit<ActionDef, "params" | "run"> & {
	params: S;
	run?: (ctx: ActionCtx, params: z.output<S>) => Promise<ActionResult>;
};

/** An action whose `run` receives the parameters already parsed by its own schema. */
export function define<S extends Shape>(d: Definition<S>): ActionDef {
	const { run, ...rest } = d;
	return run === undefined ? rest : { ...rest, run: (ctx, raw) => run(ctx, d.params.parse(raw)) };
}

/** A checkbox or a boolean in a form: "on", "true", "1" and true are yes. */
export const flag = z
	.union([z.boolean(), z.string()])
	.optional()
	.transform((v) => v === true || v === "on" || v === "true" || v === "1");

/** An empty form field is "none". */
export const orNull = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((v) => (v === undefined || v === "" ? null : v));

export const none = z.object({});

export const label =
	(f: (o: ReturnType<typeof at>) => string) =>
	(locale: Locale): string =>
		f({ locale });
