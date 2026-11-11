// What a live outpost session says after the directory changed: the real Authentik at the
// estate's pin, a throwaway user. Run by outpost-stale-groups.sh, which supplies the stack.
const AUTH = process.env.AUTH_URL;
const APP = process.env.APP_URL;
const TOKEN = process.env.AK_TOKEN;
const EXPECT = process.env.EXPECT ?? "stale";
const verify = `${AUTH}/outpost.goauthentik.io/auth/traefik`;

const ak = async (method, path, body) => {
	const res = await fetch(`${AUTH}/api/v3${path}`, {
		method,
		headers: {
			authorization: `Bearer ${TOKEN}`,
			"content-type": "application/json",
			accept: "application/json",
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`authentik ${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
	return text ? JSON.parse(text) : {};
};

const jar = new Map();
const browser = async (url, init = {}) => {
	const host = new URL(url).hostname;
	const box = jar.get(host) ?? new Map();
	const headers = new Headers(init.headers);
	if (box.size) headers.set("cookie", [...box].map(([k, v]) => `${k}=${v}`).join("; "));
	const res = await fetch(url, { ...init, headers, redirect: "manual" });
	for (const c of res.headers.getSetCookie()) {
		const [p] = c.split(";");
		const i = p.indexOf("=");
		box.set(p.slice(0, i), p.slice(i + 1));
	}
	jar.set(host, box);
	return res;
};
async function signIn(email, password) {
	let url = `${APP}/`;
	const first = await browser(verify, {
		headers: {
			"x-forwarded-proto": "http",
			"x-forwarded-host": new URL(APP).host,
			"x-forwarded-uri": "/",
			"x-forwarded-method": "GET",
			accept: "text/html",
		},
	});
	// The outpost set its session cookie on the app's host; carry it there.
	const appBox = jar.get(new URL(AUTH).hostname);
	jar.set(new URL(APP).hostname, new Map(appBox));
	url = new URL(first.headers.get("location"), AUTH).toString();
	for (let i = 0; i < 25; i++) {
		const res = await browser(url);
		if (res.status >= 300 && res.status < 400) {
			url = new URL(res.headers.get("location"), url).toString();
			continue;
		}
		const m = /^\/if\/flow\/([^/]+)\/?$/.exec(new URL(url).pathname);
		if (!m) return;
		const exec = `${AUTH}/api/v3/flows/executor/${m[1]}/?query=${encodeURIComponent(new URL(url).searchParams.toString())}`;
		const settle = async (r0) => {
			let r = r0;
			while (r.status >= 300 && r.status < 400)
				r = await browser(new URL(r.headers.get("location"), AUTH).toString(), {
					headers: { accept: "application/json" },
				});
			return JSON.parse(await r.text());
		};
		let step = await settle(await browser(exec, { headers: { accept: "application/json" } }));
		for (let j = 0; j < 8 && step.component !== "xak-flow-redirect"; j++) {
			const body =
				step.component === "ak-stage-identification"
					? { uid_field: email, password }
					: step.component === "ak-stage-password"
						? { password }
						: {};
			step = await settle(
				await browser(exec, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						accept: "application/json",
						referer: AUTH,
					},
					body: JSON.stringify(body),
				}),
			);
		}
		url = new URL(step.to, url).toString();
	}
	throw new Error("too many redirects");
}
const askOutpost = async () => {
	const box = jar.get(new URL(APP).hostname) ?? new Map();
	const cookie = [...box]
		.filter(([k]) => k.startsWith("authentik_proxy_"))
		.map(([k, v]) => `${k}=${v}`)
		.join("; ");
	const res = await fetch(verify, {
		redirect: "manual",
		headers: {
			"x-forwarded-proto": "http",
			"x-forwarded-host": new URL(APP).host,
			"x-forwarded-uri": "/",
			"x-forwarded-method": "GET",
			accept: "text/html",
			cookie,
		},
	});
	return {
		status: res.status,
		email: res.headers.get("x-authentik-email") ?? "",
		groups: res.headers.get("x-authentik-groups") ?? "",
	};
};
const directory = async (email) => {
	const b = await ak(
		"GET",
		`/core/users/?email=${encodeURIComponent(email)}&is_active=true&include_groups=true&page_size=2`,
	);
	return (b.results[0]?.groups_obj ?? []).map((g) => g.name);
};

const out = (label, o) => console.log(`${label}: ${JSON.stringify(o)}`);
const group = (await ak("GET", "/core/groups/?name=app-probe-admin")).results[0].pk;
const email = `probe-${Date.now()}@example.test`;
const user = await ak("POST", "/core/users/", {
	username: email.split("@")[0],
	email,
	name: "Probe",
	path: "users",
	type: "internal",
	is_active: true,
	groups: [group],
});
const password = `Pw-${Date.now()}-A1!`;
await ak("POST", `/core/users/${user.pk}/set_password/`, { password });
await signIn(email, password);

const before = await askOutpost();
out("signed in, in the group", { outpost: before, directory: await directory(email) });
if (before.status !== 200 || !before.groups.includes("app-probe-admin"))
	throw new Error("the outpost should vouch for the group at first");

await ak("POST", `/core/groups/${group}/remove_user/`, { pk: user.pk });
await new Promise((r) => setTimeout(r, 15000));
const removed = await askOutpost();
const fresh = await directory(email);
out("removed from the group, 15 s later", { outpost: removed, directory: fresh });
if (fresh.includes("app-probe-admin"))
	throw new Error("the directory should have dropped the group");
const stale = removed.status === 200 && removed.groups.includes("app-probe-admin");
console.log(
	stale
		? "RESULT the outpost still vouches for the removed group"
		: "RESULT the outpost dropped the group",
);

await ak("PATCH", `/core/users/${user.pk}/`, { is_active: false });
await new Promise((r) => setTimeout(r, 15000));
const off = await askOutpost();
out("deactivated, 15 s later", { outpost: off, directory: await directory(email) });
console.log(
	off.status === 200
		? "RESULT the outpost still passes a deactivated person"
		: "RESULT the outpost refuses a deactivated person",
);
if (EXPECT === "stale" && !stale) process.exit(1);
