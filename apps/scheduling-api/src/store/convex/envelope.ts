import { encryptedSchema } from "@psi/scheduling/crypto";
import { encryptedOf, sealedOf } from "../../ports/crypto";

/**
 * The service seals clinical text with `ports/crypto.ts`, which is the package's envelope (an app's data key wrapped by
 * the master key, the app and the field as authenticated data): one scheme, the one the import writes with. A sealed
 * value travels as `<keyVersion>.<iv>.<data>`; Convex stores it in the shape its validators take (`encryptedValidator`:
 * key version, IV, data; all base64) and never decrypts. These two functions are the whole translation, both ways, with
 * nothing lost.
 */
export const Encrypted = encryptedSchema;
export type EncryptedField = typeof Encrypted._output;

export const toEncrypted = encryptedOf;
export const toSealed = sealedOf;
