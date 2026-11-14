import { z } from "zod";

/** What every sealed export carries beside it: what it holds, and the hashes that tie the two files together. */
export const Manifest = z.object({
	format: z.literal(1),
	env: z.enum(["dev", "prod"]),
	createdAt: z.string(),
	key: z.string(),
	bytes: z.number().int().nonnegative(),
	plainSha256: z.string().regex(/^[0-9a-f]{64}$/),
	sealedSha256: z.string().regex(/^[0-9a-f]{64}$/),
	tables: z.record(z.string(), z.number().int().nonnegative()),
});
export type Manifest = z.infer<typeof Manifest>;
