import { z } from "zod";

export const FILE_KINDS = ["client_file", "notice"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** What the store keeps about a file: where its bytes are, how to check them, who put them there. */
export const fileMetaSchema = z.object({
	kind: z.enum(FILE_KINDS),
	storageKey: z.string().min(1),
	/** SHA-256 of the original bytes, hex. */
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	/** Size of the original bytes. */
	sizeBytes: z.number().int().nonnegative(),
	contentType: z.string().min(1).max(200),
	uploadedBy: z.string().min(1).max(200),
});
export type FileMeta = z.infer<typeof fileMetaSchema>;

/**
 * The object-storage key of a file: the app, the kind and the content hash, so the same bytes
 * are one object and a key never carries a client's name.
 */
export function storageKeyFor(tenant: string, kind: FileKind, sha256: string): string {
	return `${tenant}/${kind}/${sha256.slice(0, 2)}/${sha256}`;
}
