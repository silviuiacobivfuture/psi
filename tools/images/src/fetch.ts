import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { readCredits } from "./credits";
import { ORIGINALS } from "./paths";

const ATTEMPTS = 6;

/** One original, retried politely when the host asks us to slow down (429, 503). */
async function download(url: string, attempts = ATTEMPTS): Promise<{ data: Buffer; type: string }> {
	for (let attempt = 1; ; attempt++) {
		const res = await fetch(url, {
			headers: { "user-agent": "psi-images/0.1 (image pipeline)" },
			signal: AbortSignal.timeout(120_000),
		});
		const type = res.headers.get("content-type") ?? "";
		if (res.ok && type.startsWith("image/")) {
			return { data: Buffer.from(await res.arrayBuffer()), type };
		}
		if ((res.status === 429 || res.status === 503) && attempt < attempts) {
			const wait = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
			await sleep((Number.isFinite(wait) ? Math.min(wait, 60) : 10 * attempt) * 1000);
			continue;
		}
		throw new Error(`${res.status} ${type} from ${url}`);
	}
}

/**
 * Wikimedia rate-limits full-size originals for anonymous tools; its 1920px rendition of the same
 * file is enough for every width the pipeline writes (at most 1600px).
 */
function rendition(url: string): string | undefined {
	const m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(\w\/\w\w)\/([^/?]+)$/.exec(
		url,
	);
	if (!m) return undefined;
	const [, dir, file] = m;
	return `https://upload.wikimedia.org/wikipedia/commons/thumb/${dir}/${file}/1920px-${file}`;
}

async function original(url: string): Promise<{ data: Buffer; type: string }> {
	try {
		return await download(url, 2);
	} catch (err) {
		const alt = rendition(url);
		if (alt === undefined) throw err;
		return download(alt);
	}
}

/** Downloads each credited original into .data/ once; existing files are kept as they are. */
async function main(): Promise<void> {
	mkdirSync(ORIGINALS, { recursive: true });
	const have = new Set(readdirSync(ORIGINALS).map((f) => f.replace(/\.[^.]+$/, "")));
	for (const c of readCredits()) {
		if (have.has(c.name) || c.provider === "owner") continue;
		const { data, type } = await original(c.downloadUrl);
		const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
		writeFileSync(join(ORIGINALS, `${c.name}.${ext}`), data);
		console.log(`fetched ${c.name} (${(data.length / 1024).toFixed(0)} KB)`);
		await sleep(3000);
	}
}

await main();
