import { createAdminClient } from "../../src/admin-client";
import {
	buildKeyRing,
	encryptBytes,
	encryptField,
	fingerprint,
	generateDataKeyBytes,
	type KeyRing,
	parseMasterKey,
	wrapDataKey,
} from "../../src/crypto";
import type { ObjectStorage } from "../../src/storage";
import type { Mapping } from "./mapping";
import type { Target } from "./run";
import { createConvexSink } from "./sink";
import type { Encryptor } from "./support";

/**
 * Everything a real run needs: the app (made if it does not exist), its data key (generated and
 * stored wrapped on the first run), and the encryptor and sink built on them. The master key is
 * read here and nowhere else; it is never sent to the store.
 */
interface ConnectConfig {
	url: string;
	adminKey: string;
	masterKey: string | undefined;
	mapping: Mapping;
	storage: ObjectStorage;
}

/**
 * Opens the store for READING: no app is created and no key installed. `undefined` when the app has no data key
 * yet (nothing has ever been imported there), which a sync reports as "every row is new".
 */
export async function connectReadOnly(config: ConnectConfig): Promise<Target | undefined> {
	const { mapping } = config;
	const master = await parseMasterKey(config.masterKey);
	const sink = createConvexSink(createAdminClient({ url: config.url, adminKey: config.adminKey }));
	const wrapped = await sink.keys(mapping.app);
	if (wrapped.length === 0) return undefined;
	return {
		sink,
		enc: encryptorOf(await buildKeyRing(master, mapping.app, wrapped), mapping.app),
		storage: config.storage,
	};
}

function encryptorOf(ring: KeyRing, app: string): Encryptor {
	return {
		encrypt: (plain, field) => encryptField(ring, plain, `${app}|${field}`),
		fingerprint: (message) => fingerprint(ring, message),
		encryptBytes: (bytes, context) => encryptBytes(ring, bytes, `${app}|${context}`),
	};
}

export async function connect(config: ConnectConfig): Promise<Target> {
	const { mapping } = config;
	const master = await parseMasterKey(config.masterKey);
	const sink = createConvexSink(createAdminClient({ url: config.url, adminKey: config.adminKey }));
	await sink.ensureApp({
		slug: mapping.app,
		name: mapping.appName,
		kind: mapping.appKind,
		...(mapping.address === undefined ? {} : { address: mapping.address }),
	});
	let wrapped = await sink.keys(mapping.app);
	if (wrapped.length === 0) {
		await sink.installKey(
			mapping.app,
			1,
			await wrapDataKey(master, generateDataKeyBytes(), mapping.app, 1),
		);
		wrapped = await sink.keys(mapping.app);
	}
	const enc = encryptorOf(await buildKeyRing(master, mapping.app, wrapped), mapping.app);
	return { sink, enc, storage: config.storage };
}
