// The Novu dashboard's Authentik gate AND sign-in (apps/novu-sso), proven live in
// a real browser. apps/novu-sso/verify-live.sh runs this.
//
//   OPENBAO_ADDR=… OPENBAO_ROOT_TOKEN=… node gitops/services/novu/selftest/gate.mjs [apex]
//   (both from infrastructure/hetzner/.env of the MAIN checkout; the apex, the tailnet and the
//   organisation default to the estate identity — ESTATE_IDENTITY_FILE, else estate/identity.yaml —
//   and apps/novu-sso/mapping.json)
//
// The robots' credentials come from OpenBao at run time and are never printed:
// secret/platform/authentik/e2e-hub   (member of app-novu-admin)
// secret/platform/authentik/e2e-coleg (member of NO Novu group)
// G10b needs kubectl (KUBECONFIG) for a port-forward to novu-sso.
//
// NAMED CASES — each states what it asserts and what it proves:
//   G1 signed out, GET https://novu.<apex>/ is a 302 to auth.<apex> naming
//      novu.<apex>'s OWN callback — the page is gated, by the `novu` provider
//      (not the domain-wide one, whose bindings are Plane's).
//   G2 signed out, POST https://novu.<apex>/v1/auth/login is the same 302 — the
//      API paths on the gated host never reach Novu without Authentik.
//   G3 signed out, POST https://novu.<apex>/v2/environments is the same 302 —
//      the second API prefix is gated as well.
//   G4 POST https://novu-api.<apex>/v1/auth/login is 403 — the apps' host offers
//      no sign-in at all.
//   G5 e2e-hub signs in through Authentik (identifier, password, TOTP, consent)
//      in headless Chromium and lands in the Novu DASHBOARD signed in — the
//      session is in localStorage, the page is not Novu's sign-in, no password
//      field is drawn, and the SPA's own /v1/users/me answered 200.
//   G6 that session is the robot itself, in the first declared organisation
//      (the estate has one), as admin (app-novu-admin) — read back from Novu's own
//      API with the session the dashboard holds: Novu accepts the JWT novu-sso
//      minted and the membership it wrote.
//   G7 in that session, POST /v1/auth/login is refused 403 MANAGED_BY_SSO by
//      novu-sso — Novu's own login is closed on this host even past Authentik.
//   G8 e2e-coleg (no Novu group) signs in and is REFUSED by Authentik: the
//      browser never reaches novu.<apex> — the binding, not just the login,
//      decides.
//   G9 the tailnet door still works: https://novu.<tailnet>/ 200 and the tailnet
//      api health ok. Off the tailnet, or for an estate with no TAILNET_DOMAIN, this case is
//      reported SKIPPED, never passed.
//   G10a signed out, GET /sso/ with a forged X-authentik-email is the gate's 302 —
//      a header alone opens nothing at the edge.
//   G10b bypassing the edge (port-forward to novu-sso), a forged X-authentik-email
//      with no Authentik session is refused 403 identity-unverified and carries
//      no session.
//   G10c in e2e-hub's real session, /sso/ with a forged header naming somebody
//      else still signs in e2e-hub — the edge replaced the header, nobody was
//      impersonated.
//   G11 sign-out the way the dashboard does it (delete the session, route to
//      /auth/sign-in) lands on Authentik's sign-out, and afterwards the page is
//      the gate's 302 again — the Authentik session ended too.
//   G12 ?org= naming an organisation that is not declared (the retired
//      "<organisation> Sign") is refused 403, never a silent landing elsewhere.
//   G13 a sign-in begun in another browser: the callback's 400 is answered by
//       the restart page and this browser lands signed in (callback.mjs).
//   G14 a stale outpost cookie still signs in (callback.mjs).
//   G15 cookieless requests racing the sign-in still land signed in (callback.mjs).
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { callbackCases } from "./callback.mjs";

const repo = join(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const require = createRequire(join(repo, "package.json"));
const { chromium } = require(
	require.resolve("playwright", { paths: [join(repo, "node_modules/.pnpm/node_modules")] }),
);

// The estate identity, found as infrastructure/hetzner/scripts/identity-tf.sh finds it.
const ESTATE_ROOT = process.env.ESTATE_REPO_ROOT ?? repo;
const IDENTITY = process.env.ESTATE_IDENTITY_FILE ?? join(ESTATE_ROOT, "estate", "identity.yaml");
const LOADER =
	process.env.ESTATE_IDENTITY_LOADER ?? join(ESTATE_ROOT, "tools", "identity", "load.mjs");
/** One estate identity value; null for an optional key the estate does not set. */
function estate(key, { optional = false } = {}) {
	try {
		return execFileSync(process.execPath, [LOADER, "get", IDENTITY, key], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch (e) {
		if (optional) return null;
		throw e;
	}
}
const APEX = process.argv[2] ?? estate("BASE_DOMAIN");
const TAILNET = estate("TAILNET_DOMAIN", { optional: true });
// The first declared organisation: where a sign-in lands (apps/novu-sso/mapping.json).
const ORG = JSON.parse(readFileSync(join(repo, "apps/novu-sso/mapping.json"), "utf8"))
	.organizations[0];
// Somebody else, named in a forged header: the edge must replace it with the real identity.
const FORGED = `forged-admin@${APEX}`;
const NOVU = `https://novu.${APEX}`;
const AUTH = `https://auth.${APEX}`;
const API = `https://novu-api.${APEX}`;
const TAILNET_PAGE = TAILNET ? `https://novu.${TAILNET}/` : null;
const TAILNET_HEALTH = TAILNET ? `https://novu-api.${TAILNET}/v1/health-check` : null;
const OWN_CALLBACK = `novu.${APEX}%2Foutpost.goauthentik.io%2Fcallback`;

const results = [];
function record(id, ok, what) {
	results.push({ id, ok, what });
	console.log(`${ok === null ? "SKIP" : ok ? "PASS" : "FAIL"}  ${id}  ${what}`);
}

function env(name) {
	const v = process.env[name];
	if (v === undefined || v === "")
		throw new Error(`${name} is not set (source infrastructure/hetzner/.env)`);
	return v;
}

async function robot(path) {
	const r = await fetch(`${env("OPENBAO_ADDR")}/v1/secret/data/${path}`, {
		headers: { "X-Vault-Token": env("OPENBAO_ROOT_TOKEN") },
	});
	if (!r.ok) throw new Error(`OpenBao secret/${path} -> ${r.status}`);
	const body = await r.json();
	const d = body?.data?.data ?? {};
	for (const k of ["email", "password", "totp_secret"]) {
		if (typeof d[k] !== "string" || d[k] === "") throw new Error(`secret/${path} has no ${k}`);
	}
	return { user: d.email, password: d.password, totp: d.totp_secret };
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret, atMs) {
	let bits = 0;
	let value = 0;
	const bytes = [];
	for (const c of secret.toUpperCase().replace(/=+$/, "")) {
		const i = B32.indexOf(c);
		if (i === -1) throw new Error("the TOTP secret is not base32");
		value = (value << 5) | i;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((value >>> bits) & 0xff);
			value &= (1 << bits) - 1;
		}
	}
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
	const mac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
	const off = (mac[mac.length - 1] ?? 0) & 0x0f;
	return String((mac.readUInt32BE(off) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function signedOut(method, url) {
	try {
		const r = await fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(15_000) });
		return { status: r.status, location: r.headers.get("location") ?? "" };
	} catch (e) {
		// No answer is a FAIL of the case, reported with its reason, never a crash.
		const why =
			e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e);
		return { status: 0, location: `no answer: ${why}` };
	}
}

// Authentik's flow, stage by stage. Returns the URL the browser settles on once
// it has left auth.<apex>, or null if it never left (a refusal).
async function throughAuthentik(page, account) {
	try {
		await page.goto(`${NOVU}/`, { waitUntil: "commit" });
	} catch {
		return null;
	}
	return signInHere(page, account);
}

// The TOTP step last used, across sign-ins: the same robot signs in several
// times a run (G5, G13–G15), and a code is never offered twice.
let lastStep = 0;

// The same, from wherever the page already is (callback.mjs opens the sign-in
// page itself). Returns the first novu.<apex> URL off the outpost's paths.
async function signInHere(page, account) {
	const uid = page.locator('input[name="uidField"]:visible').first();
	const pw = page.locator('input[name="password"]:visible').first();
	const code = page.locator('input[name="code"]:visible').first();
	const consent = page.getByRole("button", { name: /continu/i });
	for (let i = 0; i < 40; i++) {
		const u = new URL(page.url());
		if (u.origin === NOVU && !u.pathname.startsWith("/outpost.goauthentik.io")) return page.url();
		if (u.origin === AUTH) {
			if (await uid.isVisible()) {
				await uid.fill(account.user);
				if (await pw.isVisible()) await pw.fill(account.password);
				await uid.press("Enter");
			} else if (await pw.isVisible()) {
				await pw.fill(account.password);
				await pw.press("Enter");
			} else if (await code.isVisible()) {
				while (Date.now() % 30_000 > 27_000 || Math.floor(Date.now() / 30_000) <= lastStep) {
					await page.waitForTimeout(1_000);
				}
				lastStep = Math.floor(Date.now() / 30_000);
				await code.fill(totp(account.totp, Date.now()));
				await code.press("Enter");
			} else if (await consent.first().isVisible()) {
				await consent.first().click();
			}
		}
		await page.waitForTimeout(1_500);
	}
	return null;
}

/** @param {string} token */
function claims(token) {
	try {
		return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
	} catch {
		return null;
	}
}

/** The session the dashboard holds, and Novu's own answer to it. */
async function session(page) {
	const token = await page.evaluate(() => localStorage.getItem("self-hosted-jwt"));
	if (!token) return { token: null, claims: null, me: null, org: null };
	const call = (path) =>
		page.evaluate(
			async ([p, t]) => {
				const r = await fetch(p, { headers: { Authorization: `Bearer ${t}` } });
				return { status: r.status, body: r.ok ? await r.json() : null };
			},
			[path, token],
		);
	return {
		token,
		claims: claims(token),
		me: await call("/v1/users/me"),
		org: await call("/v1/organizations/me"),
	};
}

/** G10b: novu-sso reached without the edge, through a port-forward. */
async function bypassingTheEdge() {
	const { spawn } = await import("node:child_process");
	// Local port 0: kubectl picks a free one and names it. A fixed port answered
	// 404 from whatever else held it (measured 2026-10-29: a podman container).
	const pf = spawn("kubectl", ["-n", "novu", "port-forward", "svc/novu-sso", ":8080"], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	try {
		const port = await new Promise((resolve, reject) => {
			const t = setTimeout(() => reject(new Error("port-forward did not start")), 15_000);
			pf.stdout.on("data", (d) => {
				const m = /Forwarding from 127\.0\.0\.1:(\d+)/.exec(String(d));
				if (m) {
					clearTimeout(t);
					resolve(m[1]);
				}
			});
			pf.on("exit", () => reject(new Error("port-forward exited")));
		});
		const r = await fetch(`http://127.0.0.1:${port}/sso/`, {
			headers: {
				"X-authentik-email": FORGED,
				"X-authentik-groups": "platform-admins",
			},
			redirect: "manual",
		});
		const body = await r.text();
		return {
			status: r.status,
			refused: body.includes("identity-unverified"),
			leaked: body.includes("self-hosted-jwt"),
		};
	} finally {
		pf.kill();
	}
}

async function main() {
	// G1–G4: signed out, no browser needed.
	const g1 = await signedOut("GET", `${NOVU}/`);
	record(
		"G1",
		g1.status === 302 && g1.location.startsWith(`${AUTH}/`) && g1.location.includes(OWN_CALLBACK),
		`signed-out page -> ${g1.status} ${g1.location.slice(0, 60)}`,
	);
	const g2 = await signedOut("POST", `${NOVU}/v1/auth/login`);
	record(
		"G2",
		g2.status === 302 && g2.location.includes(OWN_CALLBACK),
		`signed-out /v1/auth/login -> ${g2.status} ${g2.location.slice(0, 60)}`,
	);
	const g3 = await signedOut("POST", `${NOVU}/v2/environments`);
	record(
		"G3",
		g3.status === 302 && g3.location.includes(OWN_CALLBACK),
		`signed-out /v2 -> ${g3.status} ${g3.location.slice(0, 60)}`,
	);
	const g4 = await signedOut("POST", `${API}/v1/auth/login`);
	record("G4", g4.status === 403, `apps' host /v1/auth/login -> ${g4.status}`);
	try {
		const r = await fetch(`${NOVU}/sso/`, {
			headers: { "X-authentik-email": FORGED },
			redirect: "manual",
			signal: AbortSignal.timeout(15_000),
		});
		const loc = r.headers.get("location") ?? "";
		record(
			"G10a",
			r.status === 302 && loc.includes(OWN_CALLBACK),
			`signed out + forged header, /sso/ -> ${r.status}`,
		);
	} catch (e) {
		record("G10a", false, `no answer: ${e instanceof Error ? e.message : String(e)}`);
	}
	try {
		const b = await bypassingTheEdge();
		record(
			"G10b",
			b.status === 403 && b.refused && !b.leaked,
			`forged header straight at novu-sso -> ${b.status}${b.refused ? " identity-unverified" : ""}${b.leaked ? " WITH A SESSION" : ""}`,
		);
	} catch (e) {
		record(
			"G10b",
			false,
			`could not reach novu-sso in-cluster: ${e instanceof Error ? e.message : String(e)}`,
		);
	}

	const browser = await chromium.launch({ headless: true });
	try {
		// G5–G7, G10c, G12, G11: the member.
		const hub = await browser.newContext();
		const page = await hub.newPage();
		let usersMe = 0;
		page.on("response", (r) => {
			if (new URL(r.url()).pathname === "/v1/users/me" && r.status() === 200) usersMe += 1;
		});
		const account = await robot("platform/authentik/e2e-hub");
		const landed = await throughAuthentik(page, account);
		let s = { token: null, claims: null, me: null, org: null };
		if (landed !== null) {
			try {
				await page.waitForFunction(() => localStorage.getItem("self-hosted-jwt") !== null, null, {
					timeout: 30_000,
				});
				await page.waitForURL(
					(u) =>
						u.origin === NOVU && !u.pathname.startsWith("/sso") && !u.pathname.startsWith("/auth/"),
					{ timeout: 30_000 },
				);
				for (let i = 0; i < 30 && usersMe === 0; i++) await page.waitForTimeout(1_000);
			} catch {
				// reported below with what was seen
			}
			s = await session(page);
		}
		const form =
			landed !== null && (await page.locator('input[type="password"]:visible').count()) > 0;
		const at = new URL(page.url());
		record(
			"G5",
			landed !== null &&
				s.token !== null &&
				!at.pathname.startsWith("/auth/") &&
				!form &&
				usersMe > 0,
			`e2e-hub at ${at.origin}${at.pathname}; session ${s.token ? "held" : "ABSENT"}; Novu sign-in form ${form ? "SHOWN" : "absent"}; dashboard /v1/users/me 200 x${usersMe}`,
		);
		const email = account.user.toLowerCase();
		record(
			"G6",
			s.me?.status === 200 &&
				String(s.me.body?.data?.email).toLowerCase() === email &&
				s.org?.status === 200 &&
				s.org.body?.data?.name === ORG &&
				JSON.stringify(s.claims?.roles) === '["admin"]',
			`users/me ${s.me?.status ?? "-"} ${s.me?.body?.data?.email === undefined ? "" : "(robot)"}; organizations/me ${s.org?.status ?? "-"} ${s.org?.body?.data?.name ?? ""}; roles ${JSON.stringify(s.claims?.roles ?? null)}`,
		);
		if (landed === null) {
			for (const id of ["G7", "G10c", "G12", "G11"])
				record(id, false, "not signed in through the gate (G5)");
		} else {
			const login = await page.request.post(`${NOVU}/v1/auth/login`, {
				data: { email: "nobody@estate.invalid", password: "definitely-wrong-1A!" },
				maxRedirects: 0,
			});
			const lb = login.status() === 403 ? await login.json() : null;
			record(
				"G7",
				lb?.code === "MANAGED_BY_SSO",
				`gated /v1/auth/login -> ${login.status()} ${lb?.code ?? ""}`,
			);

			const forged = await page.request.get(`${NOVU}/sso/`, {
				headers: { "X-authentik-email": FORGED },
				maxRedirects: 0,
			});
			const ft = /"self-hosted-jwt","([^"]+)"/.exec(await forged.text())?.[1];
			const fc = ft ? claims(ft) : null;
			record(
				"G10c",
				forged.status() === 200 && String(fc?.email).toLowerCase() === email,
				`robot's session + forged header -> ${forged.status()}, signed in as ${fc ? (String(fc.email).toLowerCase() === email ? "the robot" : "SOMEONE ELSE") : "nobody"}`,
			);

			// One organisation for the estate (D1, 2026-10-29): the retired one is
			// not declared, so asking for it is refused, never a landing elsewhere.
			const other = await page.request.get(
				`${NOVU}/sso/?org=${encodeURIComponent(`${ORG} Sign`)}`,
				{ maxRedirects: 0 },
			);
			record("G12", other.status() === 403, `?org=<a retired organisation> -> ${other.status()}`);

			await page.evaluate(() => {
				localStorage.removeItem("self-hosted-jwt");
				history.pushState({}, "", "/auth/sign-in");
			});
			await page.waitForURL((u) => u.origin === AUTH, { timeout: 30_000 }).catch(() => {});
			// Authentik's invalidation flow ends the session, then tells the outposts
			// through a worker task — asynchronously. Measured 2026-10-29 17:00:31:
			// the signal reached the outpost ~6 s after the flow ran, so a fixed 3 s
			// wait read a sign-out that was still on its way as a failure. Poll up to
			// 30 s, and report how long it took.
			await page.waitForLoadState("networkidle").catch(() => {});
			const signedOutAt = Date.now();
			let after = await page.request.get(`${NOVU}/`, { maxRedirects: 0 });
			while (after.status() !== 302 && Date.now() - signedOutAt < 30_000) {
				await page.waitForTimeout(1_000);
				after = await page.request.get(`${NOVU}/`, { maxRedirects: 0 });
			}
			const loc = after.headers().location ?? "";
			record(
				"G11",
				after.status() === 302 && loc.includes(OWN_CALLBACK),
				`sign-out went to ${new URL(page.url()).host}${new URL(page.url()).pathname}; afterwards / -> ${after.status()} after ${Math.round((Date.now() - signedOutAt) / 1000)} s`,
			);
		}
		await hub.close();

		// G8: the non-member.
		const coleg = await browser.newContext();
		const p2 = await coleg.newPage();
		const landed2 = await throughAuthentik(p2, await robot("platform/authentik/e2e-coleg"));
		record(
			"G8",
			landed2 === null && new URL(p2.url()).origin === AUTH,
			`e2e-coleg ${landed2 === null ? `refused, stays at ${new URL(p2.url()).host}` : `REACHED ${landed2}`}`,
		);
		await coleg.close();

		// G13–G15: the callback as real browsers reach it (callback.mjs).
		await callbackCases(browser, { NOVU, AUTH, account, signInHere, record });
	} finally {
		await browser.close();
	}

	// G9: the tailnet door.
	if (!TAILNET_PAGE || !TAILNET_HEALTH)
		record("G9", null, "the estate has no TAILNET_DOMAIN — not checked");
	else
		try {
			const tp = await fetch(TAILNET_PAGE, { signal: AbortSignal.timeout(10_000) });
			const th = await fetch(TAILNET_HEALTH, { signal: AbortSignal.timeout(10_000) });
			const tb = th.ok ? await th.json() : null;
			record(
				"G9",
				tp.status === 200 && tb?.data?.status === "ok",
				`tailnet page ${tp.status}, tailnet api ${tb?.data?.status ?? th.status}`,
			);
		} catch {
			record("G9", null, "tailnet unreachable from here — not checked");
		}

	const failed = results.filter((r) => r.ok === false).length;
	console.log(
		`\n${results.filter((r) => r.ok).length} passed, ${failed} failed, ${results.filter((r) => r.ok === null).length} skipped`,
	);
	process.exit(failed === 0 ? 0 : 1);
}

await main();
