/** Why a cryptographic step refused. Messages name the cause and never a key or a value. */
export type CryptoFailure =
	| "bad_master_key"
	| "bad_envelope"
	| "decrypt_failed"
	| "unknown_key_version"
	| "no_keys";

export class CryptoError extends Error {
	readonly code: CryptoFailure;

	constructor(code: CryptoFailure, detail: string) {
		super(`${code}: ${detail}`);
		this.name = "CryptoError";
		this.code = code;
	}
}
