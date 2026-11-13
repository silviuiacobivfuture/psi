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
 * The object-storage key of a file: the app, the kind, the file's own id and its content hash. The
 * id keeps two rows with identical bytes apart, so erasing one client's file can never delete
 * another's. The key carries no name.
 */
export function storageKeyFor(
	tenant: string,
	kind: FileKind,
	uniqueId: string,
	sha256: string,
): string {
	return `${tenant}/${kind}/${uniqueId}/${sha256}`;
}
