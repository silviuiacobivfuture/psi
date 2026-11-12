import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCredits } from "./credits";
import { type Encoded, encode, FORMATS } from "./encode";
import { allJobs, type Output } from "./jobs";
import { coversSource, type ManifestEntry, manifestSource } from "./manifest";
import { appImagesDir, appManifest, COVERS_MANIFEST, ORIGINALS, PUBLIC_PREFIX } from "./paths";
import { dominant, frame } from "./transform";

/** AVIF budgets at the 1200px width (or the largest width when it is smaller). */
const BUDGET = { hero: 120_000, other: 60_000 } as const;
const BUDGET_WIDTH = 1200;
/** WebP covers every browser without AVIF up to 1200px; JPEG is a last resort for very old ones. */
const FALLBACK_MAX = { webp: 1200, jpeg: 768 } as const;

function original(name: string): string {
	const file = readdirSync(ORIGINALS).find((f) => f.replace(/\.[^.]+$/, "") === name);
	if (file === undefined) throw new Error(`${name}: no original in .data/; run \`pnpm fetch\``);
	return join(ORIGINALS, file);
}

function camel(name: string): string {
	return name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

async function render(name: string, out: Output): Promise<ManifestEntry> {
	const f = await frame(original(name), out.crop, out.grade ?? "none", out.saturation);
	const widths = out.widths.filter((w) => w <= f.width);
	if (widths.length === 0) throw new Error(`${name}: source ${f.width}px is under every width`);
	if (out.shared && widths.length < out.widths.length) {
		throw new Error(`${name}: source ${f.width}px is too small for ${out.widths.join("/")}`);
	}
	const top = Math.max(...widths);
	const want = out.budgetWidth ?? BUDGET_WIDTH;
	const budgetWidth = widths.includes(want) ? want : top;
	const caps = { avif: Number.POSITIVE_INFINITY, ...(out.fallbackMax ?? FALLBACK_MAX) };
	const key = out.key ?? camel(name);
	const files: Array<Encoded & { src: string }> = [];
	for (const format of FORMATS) {
		// The budget width sets the quality; the other widths reuse it, so a set looks alike.
		const lead = await encode(f.image, format, budgetWidth, {
			budget: format === "avif" ? BUDGET[out.role] : undefined,
		});
		// WebP and JPEG are fallbacks for browsers without AVIF, so they stop sooner.
		const kept = widths.filter((x) => x <= caps[format]);
		for (const w of kept.length > 0 ? kept : [Math.min(...widths)]) {
			const e =
				w === budgetWidth ? lead : await encode(f.image, format, w, { quality: lead.quality });
			const ext = format === "jpeg" ? "jpg" : format;
			files.push({ ...e, src: `${PUBLIC_PREFIX}/${name}-${w}.${e.hash}.${ext}` });
		}
	}
	const largest = files.find((x) => x.format === "avif" && x.width === top);
	return {
		key,
		width: top,
		height: largest?.height ?? Math.round((top * f.height) / f.width),
		placeholder: await dominant(f.image),
		files,
	};
}

/** `--app <name>` renders one app only (its manifest and folder are rewritten whole). */
function onlyApp(): string | undefined {
	const i = process.argv.indexOf("--app");
	return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
	const only = onlyApp();
	const credits = readCredits();
	const credited = new Set(credits.map((c) => c.name));
	const namesByApp = new Map<string, Set<string>>();
	const byApp = new Map<string, ManifestEntry[]>();
	const shared: ManifestEntry[] = [];
	const sharedNames = new Set<string>();
	for (const job of allJobs(credits)) {
		if (!credited.has(job.name)) throw new Error(`${job.name}: missing from credits.json`);
		for (const out of job.outputs) {
			if (only !== undefined && out.app !== only) continue;
			const entry = await render(job.name, out).catch((err: unknown) => {
				throw new Error(
					`${job.name} → ${out.app}: ${err instanceof Error ? err.message : String(err)}`,
				);
			});
			if (out.shared) {
				shared.push(entry);
				sharedNames.add(job.name);
			} else {
				namesByApp.set(out.app, (namesByApp.get(out.app) ?? new Set()).add(job.name));
			}
			// Shared covers keep their files in the app's folder, so the app's sweep leaves them be.
			const list = byApp.get(out.app) ?? [];
			list.push(entry);
			byApp.set(out.app, list);
			const avif = entry.files.filter((x) => x.format === "avif");
			const sizes = avif.map((x) => `${x.width}:${(x.data.length / 1024).toFixed(1)}K`);
			console.log(
				`${out.app} ${entry.key} [${out.role}] q${avif[0]?.quality} avif ${sizes.join(" ")}`,
			);
		}
	}
	let total = 0;
	for (const [app, entries] of byApp) {
		const dir = appImagesDir(app);
		mkdirSync(dir, { recursive: true });
		const keep = new Set<string>();
		for (const e of entries) {
			for (const x of e.files) {
				const base = x.src.slice(PUBLIC_PREFIX.length + 1);
				keep.add(base);
				const path = join(dir, base);
				if (!existsSync(path)) writeFileSync(path, x.data);
			}
		}
		for (const f of readdirSync(dir)) if (!keep.has(f)) rmSync(join(dir, f));
		const bytes = [...keep].reduce((n, f) => n + statSync(join(dir, f)).size, 0);
		total += bytes;
		const names = namesByApp.get(app) ?? new Set<string>();
		const own = entries.filter((e) => !shared.includes(e));
		if (own.length > 0) {
			writeFileSync(
				appManifest(app),
				manifestSource(
					own,
					credits.filter((c) => names.has(c.name)),
				),
			);
		}
		console.log(`${app}: ${keep.size} files, ${(bytes / 1024).toFixed(0)} KB`);
	}
	if (shared.length > 0) {
		writeFileSync(
			COVERS_MANIFEST,
			coversSource(
				shared,
				credits.filter((c) => sharedNames.has(c.name)),
			),
		);
	}
	console.log(`total: ${(total / 1024).toFixed(0)} KB`);
}

await main();
