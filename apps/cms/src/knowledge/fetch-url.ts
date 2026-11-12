import type { Brand } from "../authz/types";
import { type Format, formatOf, MAX_BYTES } from "./extract/index";

/**
 * "URL to fetch" sources: https only, and only from the brand's own domains plus the owner's
 * psizone.ro (a subdomain of an allowed domain counts: www.hemi-sync.ro, blog.psizone.ro). Every
 * redirect hop is checked against the same list, the body is read with a size cap, and the
 * request has a deadline. Nothing is sent: no cookie, no credential, no referrer.
 */
const OWNER = "psizone.ro";
export const BRAND_DOMAINS: Readonly<Record<Brand, ReadonlyArray<string>>> = {
	psizone: ["psizone.ro"],
	eqsync: ["eq-sync.ro"],
	hemisync: ["hemi-sync.ro"],
	blog: ["psizone.ro"],
};

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

export type FetchProblem =
	| "not_https"
	| "not_allowed"
	| "too_large"
	| "unsupported"
	| "http"
	| "network";

export class FetchError extends Error {
	readonly problem: FetchProblem;
	constructor(problem: FetchProblem, message: string) {
		super(message);
		this.name = "FetchError";
		this.problem = problem;
	}
}

export function allowedHosts(brand: Brand): ReadonlyArray<string> {
	return [...new Set([...BRAND_DOMAINS[brand], OWNER])];
}

/** The URL, parsed, if it may be fetched for this brand; otherwise the reason. */
export function checkUrl(raw: string, brand: Brand): URL {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		throw new FetchError("not_https", "not a URL");
	}
	if (u.protocol !== "https:")
		throw new FetchError("not_https", "only https:// addresses are fetched");
	if (u.username !== "" || u.password !== "") {
		throw new FetchError("not_allowed", "an address with credentials is refused");
	}
	if (u.port !== "" && u.port !== "443")
		throw new FetchError("not_allowed", "only the standard https port");
	const host = u.hostname.toLowerCase().replace(/\.$/, "");
	const ok = allowedHosts(brand).some((d) => host === d || host.endsWith(`.${d}`));
	if (!ok) {
		throw new FetchError(
			"not_allowed",
			`${host} is not one of this brand's domains (${allowedHosts(brand).join(", ")})`,
		);
	}
	return u;
}

export interface Fetched {
	bytes: Uint8Array;
	format: Format;
	/** Where the content came from after redirects (always allowed). */
	finalUrl: string;
}

async function readCapped(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
	if (body === null) return new Uint8Array();
	const reader = body.getReader();
	const parts: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_BYTES) {
			await reader.cancel();
			throw new FetchError("too_large", `the page is over ${MAX_BYTES / 1048576} MB`);
		}
		parts.push(value);
	}
	const out = new Uint8Array(size);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.byteLength;
	}
	return out;
}

/** Fetches an allowed https URL as a source; `fetchImpl` is the network (tests pass their own). */
export async function fetchSource(
	raw: string,
	brand: Brand,
	fetchImpl: typeof fetch = fetch,
): Promise<Fetched> {
	let url = checkUrl(raw, brand);
	const signal = AbortSignal.timeout(TIMEOUT_MS);
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		let r: Response;
		try {
			r = await fetchImpl(url, {
				redirect: "manual",
				signal,
				credentials: "omit",
				referrerPolicy: "no-referrer",
				headers: { accept: "text/html,text/plain,text/markdown,text/csv,application/pdf;q=0.9" },
			});
		} catch (error) {
			throw new FetchError(
				"network",
				`the address did not answer (${error instanceof Error ? error.name : "error"})`,
			);
		}
		if (r.status >= 300 && r.status < 400) {
			const next = r.headers.get("location");
			if (next === null) throw new FetchError("http", `HTTP ${r.status} without a location`);
			url = checkUrl(new URL(next, url).toString(), brand);
			continue;
		}
		if (!r.ok) throw new FetchError("http", `HTTP ${r.status}`);
		const declared = Number(r.headers.get("content-length") ?? "0");
		if (declared > MAX_BYTES)
			throw new FetchError("too_large", `the page is over ${MAX_BYTES / 1048576} MB`);
		const format = formatOf(r.headers.get("content-type"), url.pathname);
		if (format === null) {
			throw new FetchError(
				"unsupported",
				`content type ${r.headers.get("content-type") ?? "unknown"} is not read`,
			);
		}
		return { bytes: await readCapped(r.body), format, finalUrl: url.toString() };
	}
	throw new FetchError("http", `more than ${MAX_REDIRECTS} redirects`);
}
