import type { ObjectStorage } from "./port";

/** An in-memory object store: tests, dry runs, local development. */
export class MemoryStorage implements ObjectStorage {
	readonly objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; contentType: string }>();

	async put(key: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void> {
		this.objects.set(key, { bytes: new Uint8Array(bytes), contentType });
	}

	async get(key: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
		const found = this.objects.get(key);
		return found === undefined ? undefined : new Uint8Array(found.bytes);
	}

	async delete(key: string): Promise<void> {
		this.objects.delete(key);
	}
}
