import { Chip } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { articleHref } from "../cms";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { PAGE_IDS, PAGES, PROGRAMME_SLUGS, WORKSHOP_IDS, workshopHref } from "../routes";
import { programmeHref } from "../sections/programmes";

/**
 * Long-form copy lives in `messages/content/{ro,en}.json`, one key per block, so it goes through
 * Paraglide like every other string. The key shape is the whole contract:
 *
 *   `<page>_seo_title` `<page>_seo_desc` `<page>_ov` `<page>_h1` `<page>_lead`   the page head
 *   `<page>_sNN_h`                                                          a section's h2
 *   `<page>_sNN_o`                                                          its overline (optional)
 *   `<page>_sNN_bMMx`                                                       a block; x = p, l, k, h
 *   `<page>_gNN_h` `<page>_gNN_qMM` `<page>_gNN_aMM`                        FAQ groups
 *
 * `p` paragraph, `l` list item (consecutive ones form one list), `k` a key-fact callout, `h` an h3.
 * In text, `[label](kind:target)` is a link: page, prog, ws (internal), art (a blog article, shown
 * as plain text while it is not listed) and ext (an external site).
 */

type Message = (inputs: Record<string, never>, options: { locale: Locale }) => string;
const MESSAGES: Readonly<Record<string, unknown>> = m;
const KEYS: ReadonlyArray<string> = Object.keys(MESSAGES).sort();

function isMessage(value: unknown): value is Message {
	return typeof value === "function";
}

/** One message of the content bundle in one locale. */
export function text(key: string, locale: Locale): string {
	const fn = MESSAGES[key];
	if (!isMessage(fn)) throw new Error(`missing content message: ${key}`);
	return fn({}, at(locale));
}

export function hasText(key: string): boolean {
	return isMessage(MESSAGES[key]);
}

export type Block =
	| { kind: "p" | "k" | "h"; key: string }
	| { kind: "l"; keys: ReadonlyArray<string> };

export interface Section {
	id: string;
	heading: string;
	overline?: string;
	blocks: ReadonlyArray<Block>;
}

/** The sections of a page, in key order. */
export function sections(page: string): ReadonlyArray<Section> {
	const out: Section[] = [];
	const head = new RegExp(`^${page}_s(\\d\\d)_h$`);
	for (const key of KEYS) {
		const hm = head.exec(key);
		if (hm === null) continue;
		const n = hm[1] as string;
		const blockKey = new RegExp(`^${page}_s${n}_b(\\d\\d)([pklh])$`);
		const blocks: Block[] = [];
		for (const k of KEYS) {
			const bm = blockKey.exec(k);
			if (bm === null) continue;
			const kind = bm[2] as "p" | "k" | "l" | "h";
			const last = blocks[blocks.length - 1];
			if (kind === "l") {
				if (last?.kind === "l") blocks[blocks.length - 1] = { kind: "l", keys: [...last.keys, k] };
				else blocks.push({ kind: "l", keys: [k] });
			} else blocks.push({ kind, key: k });
		}
		out.push({
			id: `s${n}`,
			heading: key,
			overline: hasText(`${page}_s${n}_o`) ? `${page}_s${n}_o` : undefined,
			blocks,
		});
	}
	return out;
}

export interface FaqGroup {
	id: string;
	heading: string;
	items: ReadonlyArray<{ q: string; a: string }>;
}

/** The FAQ groups of a page (keys, not text). */
export function faqGroups(page: string): ReadonlyArray<FaqGroup> {
	const out: FaqGroup[] = [];
	const head = new RegExp(`^${page}_g(\\d\\d)_h$`);
	for (const key of KEYS) {
		const hm = head.exec(key);
		if (hm === null) continue;
		const n = hm[1] as string;
		const q = new RegExp(`^${page}_g${n}_q(\\d\\d)$`);
		const items = KEYS.flatMap((k) => {
			const qm = q.exec(k);
			return qm === null ? [] : [{ q: k, a: `${page}_g${n}_a${qm[1]}` }];
		});
		out.push({ id: `g${n}`, heading: key, items });
	}
	return out;
}

/** Every question and answer of a page, as plain text, for FAQPage structured data. */
export function faqPlain(
	page: string,
	locale: Locale,
): ReadonlyArray<{ question: string; answer: string }> {
	return faqGroups(page).flatMap((g) =>
		g.items.map((i) => ({
			question: plain(text(i.q, locale)),
			answer: plain(text(i.a, locale)),
		})),
	);
}

const LINK = /\[([^\]]+)\]\(([a-z]+):([^)]+)\)/g;

/** A link's target, or null when it should render as plain text. */
function target(locale: Locale, kind: string, id: string): string | null {
	switch (kind) {
		case "page": {
			const page = PAGE_IDS.find((p) => p === id);
			return page === undefined ? null : PAGES[page][locale];
		}
		case "prog": {
			const slug = PROGRAMME_SLUGS.find((s) => s === id);
			return slug === undefined ? null : programmeHref(locale, slug);
		}
		case "ws": {
			const ws = WORKSHOP_IDS.find((w) => w === id);
			return ws === undefined ? null : workshopHref(locale, ws);
		}
		case "art":
			return articleHref(locale, id);
		case "ext":
			return id;
		default:
			return null;
	}
}

/** Text with its links resolved; a link to nothing keeps its label. */
export function inline(value: string, locale: Locale): Child[] {
	const parts: Child[] = [];
	let last = 0;
	for (const match of value.matchAll(LINK)) {
		const [whole, label = "", kind = "", id = ""] = match;
		const at0 = match.index ?? 0;
		parts.push(value.slice(last, at0));
		const to = target(locale, kind, id);
		parts.push(
			to === null ? (
				label
			) : (
				<a
					class="text-link"
					href={to}
					{...(kind === "ext" || kind === "art" ? { rel: "noopener" } : {})}
				>
					{label}
				</a>
			),
		);
		last = at0 + whole.length;
	}
	parts.push(value.slice(last));
	return parts;
}

/** The same text as the page's words alone (for meta and structured data). */
export function plain(value: string): string {
	return value.replace(LINK, "$1");
}

function Blocks({ blocks, locale }: { blocks: ReadonlyArray<Block>; locale: Locale }): JSX.Element {
	return (
		<>
			{blocks.map((b) => {
				if (b.kind === "l")
					return (
						<ul class="max-w-2xl list-disc space-y-2 pl-6 text-body-lg text-ink-muted marker:text-glow-1">
							{b.keys.map((k) => (
								<li>{inline(text(k, locale), locale)}</li>
							))}
						</ul>
					);
				const value = inline(text(b.key, locale), locale);
				if (b.kind === "h") return <h3 class="display pt-4 text-display-sm text-ink">{value}</h3>;
				if (b.kind === "k")
					return <p class="max-w-2xl border-l-2 border-glow-2 pl-4 text-body text-ink">{value}</p>;
				return <p class="max-w-2xl text-pretty text-body-lg text-ink-muted">{value}</p>;
			})}
		</>
	);
}

/** The sections of a page: a question as the h2 on the left, the answer on the right. */
export function DocSections({
	page,
	locale,
	wash = true,
	first = 1,
}: {
	page: string;
	locale: Locale;
	/** Alternate sections on the wash. */
	wash?: boolean;
	/** The first section to show (1-based): a page shows some above its own blocks. */
	first?: number;
}): JSX.Element {
	return (
		<>
			{sections(page)
				.slice(first - 1)
				.map((s, i) => (
					<section id={s.id} class={wash && i % 2 === 0 ? "hs-wash scroll-mt-8" : "scroll-mt-8"}>
						<div class="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-16 md:px-14 md:py-24 lg:grid-cols-[5fr_7fr]">
							<div>
								{s.overline ? <p class="hs-overline">{text(s.overline, locale)}</p> : null}
								<h2 class="display mt-4 text-display-md text-ink">{text(s.heading, locale)}</h2>
							</div>
							<div class="space-y-6">
								<Blocks blocks={s.blocks} locale={locale} />
							</div>
						</div>
					</section>
				))}
		</>
	);
}

/** A page's question groups as `<details>`, the way the FAQ page shows them; `after` adds a node below a group. */
export function FaqBlock({
	page,
	locale,
	after = {},
}: {
	page: string;
	locale: Locale;
	after?: Readonly<Record<string, Child>>;
}): JSX.Element {
	return (
		<>
			{faqGroups(page).map((g) => (
				<section id={g.id} class="grid scroll-mt-8 gap-8 lg:grid-cols-[5fr_7fr]">
					<h2 class="display text-display-md text-ink">{text(g.heading, locale)}</h2>
					<div class="space-y-6">
						<div class="divide-y divide-line border-y border-line">
							{g.items.map((it) => (
								<details class="group py-2">
									<summary class="flex cursor-pointer list-none items-baseline justify-between gap-6 py-4 text-body-lg text-ink">
										<h3 class="font-[inherit] text-[length:inherit] font-normal">
											{text(it.q, locale)}
										</h3>
										<svg
											class="shrink-0 text-glow-1 transition-transform group-open:rotate-45"
											width="14"
											height="14"
											viewBox="0 0 14 14"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											aria-hidden="true"
										>
											<path d="M7 1v12M1 7h12" />
										</svg>
									</summary>
									<p class="max-w-2xl pb-5 text-body text-ink-muted">
										{inline(text(it.a, locale), locale)}
									</p>
								</details>
							))}
						</div>
						{after[g.id] ?? null}
					</div>
				</section>
			))}
		</>
	);
}

/** A row of chips linking to the page's sections (a table of contents that costs nothing). */
export function Toc({ page, locale }: { page: string; locale: Locale }): JSX.Element {
	return (
		<nav aria-label={m.doc_toc({}, at(locale))} class="mt-10 flex flex-wrap gap-2">
			{sections(page).map((s) => (
				<a href={`#${s.id}`} class="pz-tap">
					<Chip>{text(s.heading, locale)}</Chip>
				</a>
			))}
		</nav>
	);
}

/** A page's own title and description for search results. */
export function seo(page: string, locale: Locale): { seoTitle: string; description: string } {
	return {
		seoTitle: text(`${page}_seo_title`, locale),
		description: text(`${page}_seo_desc`, locale),
	};
}

/** The page's own head messages. */
export function head(page: string, locale: Locale) {
	return {
		seoTitle: text(`${page}_seo_title`, locale),
		description: text(`${page}_seo_desc`, locale),
		overline: text(`${page}_ov`, locale),
		h1: text(`${page}_h1`, locale),
		lead: text(`${page}_lead`, locale),
	};
}
