import { z } from "zod/v4";
import { Id, Ms, Subject } from "./primitives";

/**
 * What a client file may be. The list is closed: a type outside it is refused when the upload is announced, and the
 * object the store actually holds is checked again when the upload is completed. The list is the contract's, so a
 * console can offer exactly these and a script can test them.
 */
export const FILE_TYPES = [
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
	"text/plain",
	"text/csv",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.oasis.opendocument.text",
] as const;
export type FileType = (typeof FILE_TYPES)[number];

/** The largest file, in bytes (25 MB). A bigger one is refused when announced and again when completed. */
export const FILE_MAX_BYTES = 25_000_000;

export const FileMeta = z.object({
	id: Id,
	clientId: Id,
	name: z.string().max(200),
	contentType: z.string().max(100),
	size: z.number().int().min(1),
	status: z.enum(["pending", "ready"]),
	uploadedBy: Subject,
	createdAt: Ms,
	updatedAt: Ms,
});
export const FileInit = z.object({
	name: z.string().trim().min(1).max(200),
	contentType: z.enum(FILE_TYPES),
	size: z.number().int().min(1).max(FILE_MAX_BYTES),
});
/**
 * A new name for a file: only what people read changes (the stored object, its type and size stay what was signed).
 * The name is trimmed; blank or longer than 200 characters is refused.
 */
export const FileRename = z.object({ name: z.string().trim().min(1).max(200) });
export const SignedUrl = z.object({
	url: z.string().url(),
	expiresAt: Ms,
	method: z.enum(["GET", "PUT"]),
});
export const FileInitResult = z.object({ file: FileMeta, upload: SignedUrl });
/** Deleting a file is for good: the caller says so with `confirm=true`, and without it nothing is touched. */
export const FileRemoveQuery = z.object({ confirm: z.literal("true") });
