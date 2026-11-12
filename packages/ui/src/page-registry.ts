import { parsePagePath, type SitePage } from "@psi/guide";

/*
 * Every page of a site as the SERVER renders it, read back for the guide: its h1 (else its title),
 * its meta description, its h2 headings and, only where the site says the page is not clinical,
 * its text by section. The registry asks the site's own app for the page (an anonymous GET), so
 * what the guide knows of a page is what the server serves, never what the browser sends.
 */

const ENTITIES: Readonly<Record<string, string>> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};

function decode(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
		if (name.startsWith("#")) {
			const code =
				name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code < 0x110000
				? String.fromCodePoint(code)
				: whole;
		}
		return ENTITIES[name.toLowerCase()] ?? whole;
	});
}

const BLOCKS = /<\/(p|li|div|h[1-6]|tr|section|article|blockquote|dd|dt)>|<br\s*\/?>/gi;

/** Visible text of a piece of markup: blocks become lines, tags go, entities are decoded. */
function textOf(html: string): string {
	return decode(
		html
			.replace(/<(script|style|svg|template|noscript|form|nav|aside|button)\b[\s\S]*?<\/\1>/gi, " ")
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(BLOCKS, "\n")
			.replace(/<[^>]+>/g, " "),
	)
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter((line) => line !== "")
		.join("\n");
}

const oneLine = (html: string): string =>
	textOf(html)
		.replace(/\s*\n\s*/g, " ")
		.trim();

function meta(html: string, name: string): string | undefined {
	const tag = html.match(new RegExp(`<meta\\b[^>]*\\bname="${name}"[^>]*>`, "i"))?.[0];
	const content = tag?.match(/\bcontent="([^"]*)"/i)?.[1];
	return content === undefined ? undefined : decode(content).trim() || undefined;
}

/**
 * The page behind a rendered document, or undefined when it has no title at all. `withText`
 * keeps the page's text by section (for a page the site says is not clinical); without it only
 * the title, the lead and the headings are read.
 */
export function readRenderedPage(
	html: string,
	path: string,
	withText: boolean,
): SitePage | undefined {
	const main =
		html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ??
		html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ??
		html;
	const h1 = main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
	const docTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
	const title = oneLine(h1 ?? docTitle ?? "");
	if (title === "") return undefined;
	const parts = main.split(/<h2\b[^>]*>/i);
	const headings: string[] = [];
	const sections: { heading?: string; text: string }[] = [];
	parts.forEach((part, i) => {
		if (i === 0) {
			const opening = textOf(part.replace(/<h1\b[\s\S]*?<\/h1>/i, " "));
			if (opening !== "") sections.push({ text: opening });
			return;
		}
		const end = part.search(/<\/h2>/i);
		const heading = oneLine(end < 0 ? part : part.slice(0, end));
		const body = textOf(end < 0 ? "" : part.slice(end + 5));
		if (heading !== "") headings.push(heading);
		if (heading !== "" || body !== "")
			sections.push({ ...(heading === "" ? {} : { heading }), text: body });
	});
	const lead = meta(html, "description");
	return {
		kind: "page",
		title,
		path,
		...(lead === undefined ? {} : { lead }),
		headings,
		...(withText ? { sections: sections.filter((s) => s.text !== "") } : {}),
		// A page the site does not call clinical is described in the open; its text is sent only with `withText`.
		review: { kind: "operational", status: "published", reviewedBy: null, reviewedAt: null },
	};
}

export interface PageRegistryOptions {
	/** Whether this path's text may be given to the guide (a page that makes no clinical claim). */
	withText(path: string): boolean;
	/** How long a read page is kept, in milliseconds. */
	ttlMs?: number;
	/** The most pages kept. */
	max?: number;
}

export interface PageRegistry {
	/** Gives the registry the site's own app: a GET of a path, answered as an anonymous visitor. */
	connect(render: (path: string) => Promise<Response> | Response): void;
	/** Reads the page into the registry, once per `ttlMs`; never throws. */
	ensure(path: string): Promise<void>;
	/** The page last read for a path, if any. */
	lookup(path: string): SitePage | undefined;
}

/** Paths that are never a public page: the guide, the beacons, assets, staff and account areas. */
const NEVER = /^\/(en\/)?(__|(ghid|_a|assets|cont|account|api|preview)(\/|$))/;
const RENDER_MS = 4_000;

export function createPageRegistry(options: PageRegistryOptions): PageRegistry {
	const ttl = options.ttlMs ?? 300_000;
	const max = options.max ?? 300;
	const kept = new Map<string, { at: number; page: SitePage | undefined }>();
	const inflight = new Map<string, Promise<void>>();
	let render: ((path: string) => Promise<Response> | Response) | undefined;

	async function read(path: string): Promise<void> {
		let page: SitePage | undefined;
		try {
			const res = await Promise.race([
				Promise.resolve(render?.(path)),
				new Promise<undefined>((resolve) => setTimeout(resolve, RENDER_MS)),
			]);
			if (
				res !== undefined &&
				res.status === 200 &&
				(res.headers.get("content-type") ?? "").includes("text/html")
			) {
				page = readRenderedPage(await res.text(), path, options.withText(path));
			}
		} catch {
			page = undefined;
		}
		kept.delete(path);
		kept.set(path, { at: Date.now(), page });
		for (const old of kept.keys()) {
			if (kept.size <= max) break;
			kept.delete(old);
		}
	}

	return {
		connect(next) {
			render = next;
		},
		async ensure(raw) {
			const path = parsePagePath(raw);
			if (path === undefined || render === undefined || NEVER.test(path)) return;
			const hit = kept.get(path);
			if (hit !== undefined && Date.now() - hit.at < (hit.page === undefined ? 60_000 : ttl))
				return;
			const running = inflight.get(path) ?? read(path).finally(() => inflight.delete(path));
			inflight.set(path, running);
			await running;
		},
		lookup(path) {
			return kept.get(path)?.page;
		},
	};
}
