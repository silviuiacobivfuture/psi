/**
 * TEST FIXTURE — a tiny browser for round trips: one cookie jar per origin, manual redirects. Requests to a
 * registered site go to that Hono app's `fetch` in-process; everything else (the mock issuer) goes over HTTP.
 */
export type AppFetch = (req: Request) => Response | Promise<Response>;

export interface Browser {
	/** Requests `url` and follows redirects; returns the final response and the URLs walked. */
	go(url: string, init?: RequestInit): Promise<{ res: Response; trail: string[] }>;
	cookies(origin: string): Map<string, string>;
}

export function createBrowser(sites: Readonly<Record<string, AppFetch>>): Browser {
	const jars = new Map<string, Map<string, string>>();
	const jar = (origin: string): Map<string, string> => {
		let j = jars.get(origin);
		if (j === undefined) {
			j = new Map();
			jars.set(origin, j);
		}
		return j;
	};

	async function once(url: URL, init: RequestInit): Promise<Response> {
		const headers = new Headers(init.headers);
		const cookie = [...jar(url.origin)].map(([k, v]) => `${k}=${v}`).join("; ");
		if (cookie !== "") headers.set("cookie", cookie);
		const req = new Request(url, { ...init, headers, redirect: "manual" });
		const site = sites[url.origin];
		const res = site !== undefined ? await site(req) : await fetch(req);
		for (const line of res.headers.getSetCookie()) {
			const [pair, ...attrs] = line.split(";");
			const [name, ...value] = (pair ?? "").split("=");
			if (name === undefined || name.trim() === "") continue;
			const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
			if (expired || value.join("=") === "") jar(url.origin).delete(name.trim());
			else jar(url.origin).set(name.trim(), value.join("="));
		}
		return res;
	}

	return {
		async go(start, init = {}) {
			const trail: string[] = [start];
			let url = new URL(start);
			let res = await once(url, init);
			for (let hops = 0; hops < 10 && res.status >= 300 && res.status < 400; hops++) {
				const location = res.headers.get("location");
				if (location === null) break;
				url = new URL(location, url);
				trail.push(url.href);
				res = await once(url, { method: "GET" });
			}
			return { res, trail };
		},
		cookies: (origin) => jar(origin),
	};
}
