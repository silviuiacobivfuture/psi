import {
	buildKeyRing,
	CryptoError,
	decryptField,
	type Encrypted,
	encryptField,
	generateDataKeyBytes,
	type KeyRing,
	type MasterKey,
	parseMasterKey,
	type WrappedKey,
	wrapDataKey,
} from "@psi/scheduling/crypto";

/**
 * Clinical text is sealed with the package's envelope and nothing else (`@psi/scheduling/crypto`, the one the import
 * writes with): an app's data keys, wrapped by CLINIC_MASTER_KEY, with the app and the field as authenticated data.
 * A sealed value travels as `<keyVersion>.<iv>.<data>` (base64 parts), the store's `Encrypted` on one line.
 */
export interface FieldCrypto {
	seal(app: string, field: string, plain: string): Promise<string>;
	/** Throws a CryptoError (`no_keys`, `unknown_key_version`, `decrypt_failed`, ...) rather than return anything wrong. */
	open(app: string, field: string, sealed: string): Promise<string>;
}

/** The fields the service seals: their names are the import's (`<table>.<column>`), which is how its rows open here. */
export const FIELDS = {
	record: "formResponses.payload",
	clinical: "clients.clinical",
	feedback: "feedback.text",
	/** What only the import writes: the old app's clinical texts, kept apart. */
	importedMainReason: "clients.mainReasonEnc",
	importedDiagnosis: "clients.diagnosisEnc",
	importedHealthNotes: "clients.healthNotesEnc",
	therapistNote: "visits.therapistNotes",
} as const;

/** Where an app's wrapped data keys are kept (the store; Convex returns them and can never unwrap one). */
export interface KeyStore {
	keys(app: string): Promise<WrappedKey[]>;
	/** Stores a key as a version; one that exists is never replaced. */
	install(app: string, version: number, wrapped: WrappedKey): Promise<void>;
}

export const sealedOf = (enc: Encrypted): string => [enc.keyVersion, enc.iv, enc.data].join(".");

export function encryptedOf(sealed: string): Encrypted {
	const [version, iv, data, extra] = sealed.split(".");
	const keyVersion = Number(version);
	if (
		extra !== undefined ||
		iv === undefined ||
		data === undefined ||
		!Number.isInteger(keyVersion) ||
		keyVersion < 1
	)
		throw new CryptoError("bad_envelope", "not a sealed value");
	return { keyVersion, iv, data };
}

export function createFieldCrypto(masterKeyText: string, keys: KeyStore): FieldCrypto {
	let master: Promise<MasterKey> | undefined;
	const rings = new Map<string, Promise<KeyRing>>();
	const masterKey = (): Promise<MasterKey> => {
		master ??= parseMasterKey(masterKeyText);
		return master;
	};
	const load = async (app: string): Promise<KeyRing> =>
		buildKeyRing(await masterKey(), app, await keys.keys(app));
	/** The app's ring, loaded once; `fresh` asks the store again (a key installed since, by another replica). */
	const ringOf = (app: string, fresh = false): Promise<KeyRing> => {
		const held = fresh ? undefined : rings.get(app);
		if (held !== undefined) return held;
		const loading = load(app);
		rings.set(app, loading);
		loading.catch(() => rings.delete(app));
		return loading;
	};
	/** The first data key of an app that has none: made here, wrapped by the master key, stored. */
	async function ensureKey(app: string): Promise<void> {
		if ((await keys.keys(app)).length > 0) return;
		await keys.install(
			app,
			1,
			await wrapDataKey(await masterKey(), generateDataKeyBytes(), app, 1),
		);
	}
	return {
		async seal(app, field, plain) {
			let ring: KeyRing;
			try {
				ring = await ringOf(app);
			} catch (error) {
				if (!(error instanceof CryptoError) || error.code !== "no_keys") throw error;
				await ensureKey(app);
				ring = await ringOf(app, true);
			}
			return sealedOf(await encryptField(ring, plain, `${app}|${field}`));
		},
		async open(app, field, sealed) {
			const enc = encryptedOf(sealed);
			let ring = await ringOf(app);
			if (!ring.byVersion.has(enc.keyVersion)) ring = await ringOf(app, true);
			return decryptField(ring, enc, `${app}|${field}`);
		},
	};
}
