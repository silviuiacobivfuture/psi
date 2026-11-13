import tokens from "@psi/design/tokens.json" with { type: "json" };
import { z } from "zod";
import type { EmailTheme } from "./apps";

const TokenFile = z.object({
	color: z.object({
		tokens: z.array(z.object({ name: z.string(), value: z.record(z.string(), z.string()) })),
	}),
});

const ROLES = ["bg", "surface-1", "line", "ink", "ink-muted", "accent", "on-accent"] as const;

/** The e-mail colours of one theme, read from the design language's tokens (never written here). */
export type Palette = Readonly<Record<(typeof ROLES)[number], string>>;

export function paletteOf(theme: EmailTheme): Palette {
	const file = TokenFile.parse(tokens);
	const entries = ROLES.map((role) => {
		const token = file.color.tokens.find((t) => t.name === role);
		const value = token?.value[theme];
		if (value === undefined) throw new Error(`design token ${role} has no value in ${theme}`);
		return [role, value] as const;
	});
	return Object.fromEntries(entries) as Palette;
}
