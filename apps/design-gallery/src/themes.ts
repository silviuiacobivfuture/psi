import tokens from "@psi/design/tokens.json" with { type: "json" };
import { z } from "zod";

const Tokens = z.object({
	color: z.object({
		themes: z.array(z.object({ id: z.string(), name: z.string() })),
		tokens: z.array(z.object({ name: z.string(), value: z.record(z.string()) })),
	}),
});

const parsed = Tokens.parse(tokens);

/** The ten themes, in tokens.json order, with their display names (proper nouns, untranslated). */
export const THEMES: ReadonlyArray<{ id: string; name: string }> = parsed.color.themes;

/** The colour roles worth showing as swatches. */
export const SWATCHES: ReadonlyArray<string> = [
	"bg",
	"surface-1",
	"surface-2",
	"ink",
	"ink-muted",
	"glow-1",
	"glow-2",
	"glow-3",
	"accent",
	"focus",
];
