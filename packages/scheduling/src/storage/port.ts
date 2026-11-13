/**
 * Where file bytes live (docs/plans/clinic.md section 6): an object store, never Convex and never
 * git. A port, so the importer and the service run against S3 in the estate and against memory in
 * tests. The bytes it is given are already encrypted.
 */
export interface ObjectStorage {
	put(key: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>;
	/** The bytes, or undefined when there is no such object. */
	get(key: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
	/** Deleting a missing object is not an error. */
	delete(key: string): Promise<void>;
}

/** An object-store failure. The message names the operation and the status, never a key or a body. */
export class StorageError extends Error {
	readonly operation: "put" | "get" | "delete";

	constructor(operation: "put" | "get" | "delete", detail: string) {
		super(`storage ${operation}: ${detail}`);
		this.name = "StorageError";
		this.operation = operation;
	}
}
