// Bulwark's extensions as code: the official AI Assistant plugin, installed through Bulwark's OWN
// admin API (the same install, signature checks and permission review an administrator's click
// runs), pinned to one version, and switched on only when the estate holds an Anthropic key.
// Run by the bulwark-extensions CronJob (bulwark.yaml) in Bulwark's image (node, no packages).
//
//   BULWARK_URL      Bulwark's in-cluster address (http://bulwark:3000)
//   BULWARK_HOST     its public host: the admin API refuses a request from another origin
//   ADMIN_PASSWORD   Bulwark's admin password (bulwark-app; Stalwart's administrators never need it)
//   ANTHROPIC_API_KEY  the estate's key (bulwark-ai, from OpenBao platform/anthropic/api `key`);
//                    empty: the plugin stays installed and OFF
//   AI_MODEL, AI_BASE_URL  the model everybody gets by default, and the Messages API address
//
// The key goes to Bulwark's server-side plugin store as the plugin's `anthropicKey` secret: the
// plugin calls Anthropic through Bulwark's proxy (`api.proxy.fetch`, credential `anthropic`), so
// the key never reaches a browser. Idempotent; every refusal exits 1 naming its reason.
const PLUGIN = "ai-assistant";
const VERSION = "2.2.1";
// What an administrator accepts on install, beyond what the directory lists: refused if the
// directory's answer ever asks for anything else (a changed bundle is not accepted blindly).
const ACCEPTED_PERMISSIONS = ["settings:change", "calendar:respond", "ui:side-panel"];

const env = (k, required = true) => {
	const v = process.env[k] ?? "";
	if (required && !v) {
		console.error(`MISSING REQUIRED CONFIG: ${k}`);
		process.exit(1);
	}
	return v;
};
const base = env("BULWARK_URL");
const host = env("BULWARK_HOST");
const password = env("ADMIN_PASSWORD");
const key = env("ANTHROPIC_API_KEY", false).trim();
const model = env("AI_MODEL");
const aiBase = env("AI_BASE_URL");

let cookie = "";
/** @param {string} method @param {string} path @param {unknown} [body] */
async function call(method, path, body) {
	const r = await fetch(base + path, {
		method,
		headers: {
			"content-type": "application/json",
			origin: `https://${host}`,
			"x-forwarded-host": host,
			"x-forwarded-proto": "https",
			...(cookie ? { cookie } : {}),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(120000),
	});
	const set = r.headers.getSetCookie?.() ?? [];
	if (set.length) {
		const jar = new Map(cookie.split("; ").filter(Boolean).map((c) => c.split("=", 2)));
		for (const c of set) {
			const [pair] = c.split(";");
			const i = pair.indexOf("=");
			jar.set(pair.slice(0, i), pair.slice(i + 1));
		}
		cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
	}
	const text = await r.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = null;
	}
	return { status: r.status, json };
}
function die(what, r) {
	console.error(`REFUSED: ${what}: HTTP ${r.status} ${JSON.stringify(r.json)?.slice(0, 300)}`);
	process.exit(1);
}

const login = await call("POST", "/api/admin/auth", { password });
if (login.status !== 200) die("Bulwark refused the admin password", login);

const list = await call("GET", "/api/admin/plugins");
if (list.status !== 200) die("listing the plugins", list);
const plugins = Array.isArray(list.json) ? list.json : [];
let plugin = plugins.find((p) => p.id === PLUGIN);
if (!plugin || plugin.version !== VERSION) {
	const ask = { slug: PLUGIN, version: VERSION, type: "plugin", force: true };
	let r = await call("POST", "/api/admin/marketplace", ask);
	if (r.status === 409 && r.json?.permissionsAdded) {
		const extra = r.json.permissionsAdded.filter((p) => !ACCEPTED_PERMISSIONS.includes(p));
		const g = r.json.grantsAdded ?? {};
		const reach = ["httpOrigins", "apiPostPaths", "frameOrigins", "credentialOrigins", "formerSecrets"].filter(
			(k) => (g[k] ?? []).length > 0,
		);
		if (extra.length || reach.length || r.json.unexpected)
			die(`the install asks for more than was reviewed (${[...extra, ...reach].join(", ")})`, r);
		r = await call("POST", "/api/admin/marketplace", {
			...ask,
			acceptPermissions: r.json.permissionsAdded,
			acceptGrants: r.json.grantsAdded,
		});
	}
	if (r.status !== 200 && r.status !== 201) die(`installing ${PLUGIN} ${VERSION}`, r);
	const again = await call("GET", "/api/admin/plugins");
	plugin = (Array.isArray(again.json) ? again.json : []).find((p) => p.id === PLUGIN);
	if (!plugin) die(`${PLUGIN} is not listed after its install`, again);
	console.log(`${PLUGIN} ${VERSION} installed`);
}

if (key) {
	const settings = { defaultProvider: "anthropic", anthropicBaseUrl: aiBase, anthropicModel: model, anthropicKey: key };
	for (const [k, value] of Object.entries(settings)) {
		const cfg = await call("PUT", `/api/admin/plugins/${PLUGIN}/config`, { key: k, value });
		if (cfg.status !== 200) die(`storing the assistant's setting ${k}`, cfg);
	}
}
const want = Boolean(key);
if (plugin.enabled !== want) {
	const t = await call("PATCH", "/api/admin/plugins", { id: PLUGIN, enabled: want });
	if (t.status !== 200) die(`switching ${PLUGIN} ${want ? "on" : "off"}`, t);
}
console.log(`${PLUGIN} ${VERSION}: ${want ? `ON (${model})` : "installed, OFF: no key at platform/anthropic/api"}`);
