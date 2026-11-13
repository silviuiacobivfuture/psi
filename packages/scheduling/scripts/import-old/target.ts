import { createAdminClient } from "../../src/admin-client";
import {
	buildKeyRing,
	encryptBytes,
	encryptField,
	fingerprint,
	generateDataKeyBytes,
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
export async function connect(config: {
	url: string;
	adminKey: string;
	masterKey: string | undefined;
	mapping: Mapping;
	storage: ObjectStorage;
}): Promise<Target> {
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
	const ring = await buildKeyRing(master, mapping.app, wrapped);
	const enc: Encryptor = {
		encrypt: (plain, field) => encryptField(ring, plain, `${mapping.app}|${field}`),
		fingerprint: (message) => fingerprint(ring, message),
		encryptBytes: (bytes, context) => encryptBytes(ring, bytes, `${mapping.app}|${context}`),
	};
	return { sink, enc, storage: config.storage };
}
