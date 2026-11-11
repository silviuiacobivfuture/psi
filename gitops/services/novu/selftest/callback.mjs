// The outpost's callback, the way real browsers reach it — not only the one
// clean path G5 walks. Run by gate.mjs (G13–G15); each case uses its own fresh
// browser context and the e2e-hub robot, never a person's account.
//
//   G13 a sign-in BEGUN in one browser and FINISHED in another (the owner's
//       2026-10-29 16:40 400: Firefox started it, Chrome finished it). The
//       outpost must refuse that state — it belongs to the other browser's
//       session — and it does, 400. What is asserted is what the person sees
//       next: the refusal is answered by the estate's restart page
//       (authentik/sso-restart, chained by novu-dashboard-callback), which starts a fresh
//       sign-in in THIS browser, and the browser lands in the dashboard signed
//       in. Before the restart route it stayed on a blank 400 that reloading
//       repeated (measured, scratch repro the same day).
//   G14 a STALE outpost cookie — a session id the directory no longer has
//       (signed out elsewhere, expired, or lost with the database) — still
//       signs in: the outpost reuses the id for the new sign-in.
//   G15 cookieless requests RACING the page: five API calls fired with the
//       navigation, before any outpost cookie exists, and three more while the
//       person signs in (an open dashboard tab polling). Each mints its own
//       session and the last Set-Cookie wins, so the callback's state may name
//       a session the browser no longer holds — reproduced as a 400 the same
//       day. Asserted: the browser still lands signed in.

/**
 * @param {import('playwright').Browser} browser
 * @param {{
 *   NOVU: string, AUTH: string,
 *   account: {user: string, password: string, totp: string},
 *   signInHere: (page: import('playwright').Page, account: unknown) => Promise<string | null>,
 *   record: (id: string, ok: boolean | null, what: string) => void,
 * }} o
 */
export async function callbackCases(browser, o) {
	const { NOVU, AUTH, account, signInHere, record } = o;

	/** Watches what the outpost's callback answered in this page. */
	const watch = (/** @type {import('playwright').Page} */ page) => {
		/** @type {number[]} */
		const callbacks = [];
		let restarted = 0;
		page.on("response", (r) => {
			const u = new URL(r.url());
			if (u.origin !== NOVU) return;
			if (u.pathname === "/outpost.goauthentik.io/callback") {
				callbacks.push(r.status());
				if (r.status() === 400) restarted += 1;
			}
		});
		return { callbacks, restarted: () => restarted };
	};

	/** Signed in = the dashboard's session is stored and the page is the dashboard. */
	const landed = async (/** @type {import('playwright').Page} */ page) => {
		try {
			await page.waitForFunction(() => localStorage.getItem("self-hosted-jwt") !== null, null, {
				timeout: 45_000,
			});
			await page.waitForURL(
				(u) =>
					u.origin === NOVU &&
					!u.pathname.startsWith("/sso") &&
					!u.pathname.startsWith("/auth/") &&
					!u.pathname.startsWith("/outpost.goauthentik.io"),
				{ timeout: 30_000 },
			);
			return true;
		} catch {
			return false;
		}
	};

	// G13 — begun in A, finished in B.
	{
		const a = await browser.newContext();
		const b = await browser.newContext();
		try {
			const pa = await a.newPage();
			await pa.goto(`${NOVU}/`, { waitUntil: "commit" });
			await pa.waitForURL((u) => u.origin === AUTH, { timeout: 20_000 });
			const begunInA = pa.url();
			const pb = await b.newPage();
			const seen = watch(pb);
			// B has been to Novu before (its own outpost cookie), then opens A's sign-in.
			await pb.goto(`${NOVU}/`, { waitUntil: "commit" });
			await pb.waitForURL((u) => u.origin === AUTH, { timeout: 20_000 });
			await pb.goto(begunInA, { waitUntil: "commit" });
			await signInHere(pb, account);
			const ok = await landed(pb);
			record(
				"G13",
				ok && seen.callbacks[0] === 400 && seen.restarted() >= 1,
				`sign-in begun in another browser: callback ${seen.callbacks.join("→") || "none"}, then ${ok ? "restarted and landed signed in" : `STUCK at ${new URL(pb.url()).pathname}`}`,
			);
		} catch (e) {
			record("G13", false, `no answer: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			await a.close();
			await b.close();
		}
	}

	// G14 — a stale outpost cookie.
	{
		const c = await browser.newContext();
		try {
			const p = await c.newPage();
			const seen = watch(p);
			await p.goto(`${NOVU}/`, { waitUntil: "commit" });
			const name = (await c.cookies(NOVU)).find((k) => k.name.startsWith("authentik_proxy_"))?.name;
			if (!name) throw new Error("the gate set no outpost cookie");
			await c.addCookies([
				{
					name,
					value: "G14STALESESSIONIDTHEDIRECTORYHASNEVERHELDG14STALESESSIONA",
					domain: new URL(NOVU).hostname,
					path: "/",
					httpOnly: true,
					secure: true,
					sameSite: "Lax",
				},
			]);
			await p.goto(`${NOVU}/`, { waitUntil: "commit" });
			await signInHere(p, account);
			const ok = await landed(p);
			record(
				"G14",
				ok,
				`stale outpost cookie: callback ${seen.callbacks.join("→") || "none"}, ${ok ? "landed signed in" : `STUCK at ${new URL(p.url()).pathname}`}`,
			);
		} catch (e) {
			record("G14", false, `no answer: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			await c.close();
		}
	}

	// G15 — cookieless requests racing the page.
	{
		const c = await browser.newContext();
		try {
			const p = await c.newPage();
			const seen = watch(p);
			const call = (/** @type {string} */ path) =>
				c.request
					.get(`${NOVU}${path}`, { maxRedirects: 0 })
					.then((r) => r.status())
					.catch(() => 0);
			const race = Promise.all([1, 2, 3, 4, 5].map((i) => call(`/v1/users/me?race=${i}`)));
			await p.goto(`${NOVU}/`, { waitUntil: "commit" });
			const during = Promise.all([1, 2, 3].map((i) => call(`/v2/environments?poll=${i}`)));
			await signInHere(p, account);
			await race;
			await during;
			const ok = await landed(p);
			record(
				"G15",
				ok,
				`cookieless requests racing the sign-in: callback ${seen.callbacks.join("→") || "none"}, ${ok ? "landed signed in" : `STUCK at ${new URL(p.url()).pathname}`}`,
			);
		} catch (e) {
			record("G15", false, `no answer: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			await c.close();
		}
	}
}
