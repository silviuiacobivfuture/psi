import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { expect } from "vitest";

/** What the flow tests drive: the site's Hono app, through its own routes. */
export type App = { request: (u: string, i?: RequestInit) => Response | Promise<Response> };

export const decode = (s: string): string =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");

/** A form POST as Datastar sends it; the answer's HTML, decoded. */
export async function post(app: App, path: string, body: Record<string, string>): Promise<string> {
	const res = await app.request(path, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded", "datastar-request": "true" },
		body: new URLSearchParams(body).toString(),
	});
	expect(res.status).toBe(200);
	return decode(await res.text());
}

export function inputs(html: string, name: string): ReadonlyArray<string> {
	return (html.match(/<input[^>]*>/g) ?? []).filter((tag) => tag.includes(`name="${name}"`));
}

export const value = (tag: string | undefined): string =>
	/value="([^"]*)"/.exec(tag ?? "")?.[1] ?? "";
export const checked = (tag: string): boolean => /\bchecked\b/.test(tag);

/**
 * The real scheduling service (apps/scheduling-api in-process on a real port, its synthetic clinic), on the
 * site's clock (`now`), and the site's environment pointing at it with psizone-web's own service key. Call before the
 * site is imported.
 */
export async function siteOnService(now: number = Date.now()): Promise<RunningApi> {
	const api = await startApi();
	api.world.clock.now = now;
	process.env.SCHEDULING_API_URL = api.url;
	process.env.SCHEDULING_SERVICE_KEY = api.serviceKey("psizone-web");
	return api;
}
