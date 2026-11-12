import { appendFileSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { Hono } from "hono";

/**
 * Local debugging only: one JSON line per event in `.data/logs/dev.jsonl` at the repo root, so the
 * team can see what happened while someone clicked through the local sites. Off in production
 * (NODE_ENV or SITE_ENV = production) and whenever PSI_DEV_LOG=0. It may record questions typed
 * into the guide: it never runs where visitors are.
 */
const ENABLED =
	process.env.NODE_ENV !== "production" &&
	process.env.SITE_ENV !== "production" &&
	process.env.PSI_DEV_LOG !== "0";

const FILE = resolve(
	process.env.PSI_DEV_LOG_FILE ?? resolve(process.cwd(), "../../.data/logs/dev.jsonl"),
);
const APP = basename(process.cwd());
const MAX_FIELD = 2000;

function clip(value: unknown): unknown {
	return typeof value === "string" && value.length > MAX_FIELD
		? `${value.slice(0, MAX_FIELD)}…`
		: value;
}

/** Appends one event; never throws. */
export function devLog(kind: string, entry: Readonly<Record<string, unknown>> = {}): void {
	if (!ENABLED) return;
	try {
		mkdirSync(dirname(FILE), { recursive: true });
		const line: Record<string, unknown> = { ts: new Date().toISOString(), app: APP, kind };
		for (const [k, v] of Object.entries(entry)) line[k] = clip(v);
		appendFileSync(FILE, `${JSON.stringify(line)}\n`);
	} catch {
		// Logging must never break a page.
	}
}

/** Error to a short, loggable string. */
export function describeError(error: unknown): string {
	if (error instanceof Error) {
		const cause = error.cause instanceof Error ? ` (cause: ${error.cause.message})` : "";
		return `${error.name}: ${error.message}${cause}`;
	}
	return String(error);
}

/**
 * The browser half: reports clicks, form sends, JavaScript errors and Datastar request failures
 * back to `/__dev/log`. Injected into every HTML page in development only.
 */
const BROWSER_SCRIPT = `<script>(()=>{const s=(k,d)=>{try{navigator.sendBeacon("/__dev/log",new Blob([JSON.stringify({kind:k,page:location.pathname,...d})],{type:"application/json"}))}catch(e){}};const t=(el)=>((el&&(el.getAttribute("aria-label")||el.textContent||el.value||""))+"").replace(/\\s+/g," ").trim().slice(0,120);addEventListener("click",e=>{const el=e.target.closest("a,button,[role=button],input[type=submit]");if(el)s("browser.click",{target:el.tagName.toLowerCase(),text:t(el),href:el.getAttribute("href")||undefined})},true);addEventListener("submit",e=>{const f=e.target;s("browser.submit",{form:f.id||f.className||"form",action:f.getAttribute("action")||undefined})},true);addEventListener("error",e=>s("browser.error",{message:e.message,source:e.filename,line:e.lineno}));addEventListener("unhandledrejection",e=>s("browser.rejection",{message:String(e.reason&&e.reason.message||e.reason)}));document.addEventListener("datastar-fetch",e=>{const d=e.detail||{};if(["error","retries-failed","finished"].includes(d.type))s("browser.datastar",{type:d.type,url:d.argsRaw&&d.argsRaw.url||undefined})});s("browser.load",{title:document.title})})();</script>`;

/**
 * Wires the debug log into a Hono app: every request (path, status, ms), the browser reporter on
 * every HTML page, and `/__dev/log` to receive it. Does nothing in production.
 */
export function installDevLog(app: Hono): void {
	if (!ENABLED) return;
	app.post("/__dev/log", async (c) => {
		const text = (await c.req.text()).slice(0, 8000);
		try {
			const body: unknown = JSON.parse(text);
			if (body !== null && typeof body === "object") {
				const entry = Object.fromEntries(Object.entries(body));
				devLog(typeof entry.kind === "string" ? entry.kind : "browser", entry);
			}
		} catch {
			devLog("browser.unparsed", { text });
		}
		return c.body(null, 204);
	});
	app.use("*", async (c, next) => {
		const started = Date.now();
		await next();
		const path = new URL(c.req.url).pathname;
		if (path === "/__dev/log" || path.startsWith("/assets/")) return;
		devLog("request", {
			method: c.req.method,
			path,
			status: c.res.status,
			ms: Date.now() - started,
		});
		const type = c.res.headers.get("content-type") ?? "";
		if (c.res.status === 200 && type.includes("text/html")) {
			const html = await c.res.text();
			const headers = new Headers(c.res.headers);
			headers.delete("content-length");
			c.res = new Response(
				html.includes("</body>")
					? html.replace("</body>", `${BROWSER_SCRIPT}</body>`)
					: html + BROWSER_SCRIPT,
				{ status: c.res.status, headers },
			);
		}
	});
}
