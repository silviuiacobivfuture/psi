// The lock contract: `key = value` lines, '#' comments; version and source once each, digest at
// most once (absent until the estate's Harbor holds the bundle). Anything else throws.

/**
 * @param {string} text
 * @returns {{ version: string, digest: string, source: string }}
 */
export function parseLock(text) {
	/** @type {Map<string, string>} */
	const kv = new Map();
	for (const [i, raw] of text.split("\n").entries()) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		const m = line.match(/^([a-z]+)\s*=\s*(\S+)$/);
		if (!m || m[1] === undefined || m[2] === undefined)
			throw new Error(`estate/platform.lock line ${i + 1} is not key = value`);
		if (!["version", "digest", "source"].includes(m[1]))
			throw new Error(`estate/platform.lock: unknown key ${m[1]}`);
		if (kv.has(m[1])) throw new Error(`estate/platform.lock: ${m[1]} twice`);
		kv.set(m[1], m[2]);
	}
	const version = kv.get("version") ?? "";
	const digest = kv.get("digest") ?? "";
	const source = kv.get("source") ?? "";
	if (!/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/.test(version))
		throw new Error(`estate/platform.lock: version "${version}" is not major.minor.patch[-pre]`);
	if (digest !== "" && !/^sha256:[0-9a-f]{64}$/.test(digest))
		throw new Error(`estate/platform.lock: digest "${digest}" is not sha256:<64 hex>`);
	if (!/^oci:\/\/[a-z0-9.-]+(:[0-9]+)?\/[a-z0-9._-]+(\/[a-z0-9._-]+)+$/.test(source))
		throw new Error(
			`estate/platform.lock: source "${source}" is not oci://<host>/<project>/<repository>`,
		);
	return { version, digest, source };
}
