import { brandListingUrl } from "@psi/content";
import { type JsonLdNode, Picture } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { articleSummary } from "../cms";
import { at, type Locale } from "../i18n";
import { type SectionPhoto, sectionPicture } from "../imagery";
import { m } from "../paraglide/messages.js";
import { href, type PageId } from "../routes";
import { PROSE, type ProseKey, type SectionSpec } from "./content-spec";
import { NextSteps, PageHero, type PageProps, PageShell } from "./shell";

type Message = (inputs: Record<string, never>, options: { locale: Locale }) => string;

/**
 * One long-form message by its key (`sc_short_p1`). The keys are listed in `content-spec.ts` and
 * a test fails when one is missing in a language, so a typo cannot reach a visitor.
 */
export function msg(locale: Locale, key: string): string {
	const fn = (m as unknown as Record<string, Message | undefined>)[key];
	if (fn === undefined) throw new Error(`missing message: ${key}`);
	return fn({}, at(locale));
}

/** Every message key one page's sections use, for the test that checks both languages. */
export function sectionKeys(k: ProseKey): ReadonlyArray<string> {
	return PROSE[k].flatMap((s) => [
		`${k}_${s.id}_h`,
		...(s.named ? [`${k}_${s.id}_n`] : []),
		...Array.from({ length: s.p }, (_, i) => `${k}_${s.id}_p${i + 1}`),
		...Array.from({ length: s.l }, (_, i) => `${k}_${s.id}_l${i + 1}`),
	]);
}

/** The plain text of a section: its first paragraph (a glossary term's definition). */
export function firstParagraph(locale: Locale, k: ProseKey, id: string): string {
	return msg(locale, `${k}_${id}_p1`);
}

function Section({
	locale,
	k,
	s,
	links,
	photo,
}: {
	locale: Locale;
	k: ProseKey;
	s: SectionSpec;
	links: ReadonlyArray<string> | undefined;
	photo: SectionPhoto | undefined;
}): JSX.Element {
	const body = (
		<>
			<h2 class="display text-headline text-ink">{msg(locale, `${k}_${s.id}_h`)}</h2>
			{Array.from({ length: s.p }, (_, i) => (
				<p class="max-w-2xl text-body text-ink-muted">{msg(locale, `${k}_${s.id}_p${i + 1}`)}</p>
			))}
			{s.l > 0 ? (
				<ul class="max-w-2xl list-disc space-y-3 pl-5 text-body text-ink-muted marker:text-ink-faint">
					{Array.from({ length: s.l }, (_, i) => {
						const item = msg(locale, `${k}_${s.id}_l${i + 1}`);
						const url = links?.[i];
						return (
							<li>
								{url !== undefined ? (
									<a class="underline underline-offset-4" href={url} rel="noopener" target="_blank">
										{item}
									</a>
								) : (
									item
								)}
							</li>
						);
					})}
				</ul>
			) : null}
		</>
	);
	if (photo === undefined) {
		return (
			<section id={s.id} class="scroll-mt-28 space-y-5">
				{body}
			</section>
		);
	}
	return (
		<section id={s.id} class="scroll-mt-28">
			<div class="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
				<div class="space-y-5 lg:col-span-7">{body}</div>
				<figure class="pz-photo eq-photo pz-rise aspect-[4/3] w-full max-w-sm sm:aspect-[4/5] lg:sticky lg:top-28 lg:col-span-5 lg:max-w-none">
					<Picture {...sectionPicture(locale, photo)} />
				</figure>
			</div>
		</section>
	);
}

/** A page's sections as a table of contents (anchors) so a reader and a crawler see the questions at once. */
function Toc({ locale, k }: { locale: Locale; k: ProseKey }): JSX.Element {
	return (
		<nav aria-label={m.c_on_page({}, at(locale))} class="max-w-2xl border-l-2 border-line pl-5">
			<p class="eq-overline">{m.c_on_page({}, at(locale))}</p>
			<ol class="mt-4 space-y-2 text-body-sm text-ink-muted">
				{PROSE[k].map((s) => (
					<li>
						<a class="underline underline-offset-4" href={`#${s.id}`}>
							{msg(locale, `${k}_${s.id}_h`)}
						</a>
					</li>
				))}
			</ol>
		</nav>
	);
}

const RELATED_LABEL: Readonly<Partial<Record<PageId, (o: { locale: Locale }) => string>>> = {
	method: (o) => m.c_related_method({}, o),
	science: (o) => m.c_related_science({}, o),
	listen: (o) => m.c_related_listen({}, o),
	glossary: (o) => m.c_related_glossary({}, o),
	who: (o) => m.c_related_who({}, o),
	safety: (o) => m.c_related_safety({}, o),
	faq: (o) => m.c_related_faq({}, o),
};

/**
 * "Read next": links to sibling pages, then the blog. A blog article shows only when the catalogue
 * has it visible (a draft never reaches production), so nothing here can point at a missing page.
 */
export function Related({
	locale,
	pages,
	articles = [],
}: {
	locale: Locale;
	pages: ReadonlyArray<PageId>;
	articles?: ReadonlyArray<string>;
}): JSX.Element {
	const o = at(locale);
	const posts = articles.flatMap((slug) => articleSummary(locale, slug) ?? []);
	return (
		<section class="mx-auto max-w-6xl px-5 pb-16" aria-labelledby="mai-departe">
			<div class="border-t border-line pt-10">
				<h2 id="mai-departe" class="eq-overline">
					{m.c_read_next({}, o)}
				</h2>
				<ul class="mt-6 space-y-3 text-body text-ink">
					{pages.map((p) => (
						<li>
							<a class="underline underline-offset-4" href={href(locale, p)}>
								{RELATED_LABEL[p]?.(o)}
							</a>
						</li>
					))}
					{posts.map((a) => (
						<li>
							<a class="underline underline-offset-4" href={a.url}>
								{m.c_from_blog({}, o)}: {a.title}
							</a>
						</li>
					))}
					<li>
						<a class="underline underline-offset-4" href={brandListingUrl(locale, "eqsync")}>
							{m.blog_all({}, o)}
						</a>
					</li>
				</ul>
			</div>
		</section>
	);
}

export interface ProsePageProps extends PageProps {
	page: PageId;
	k: ProseKey;
	title: string;
	description: string;
	overline: string;
	h1: string;
	lead?: string;
	/** The `links` list items of a section, by section id (see `SectionSpec.links`). */
	links?: Readonly<Record<string, ReadonlyArray<string>>>;
	/** A photograph beside a section, by section id. */
	photos?: Readonly<Record<string, SectionPhoto>>;
	/** A photograph in the hero's right column. */
	heroPhoto?: SectionPhoto;
	related: ReadonlyArray<PageId>;
	articles?: ReadonlyArray<string>;
	jsonLd?: ReadonlyArray<JsonLdNode>;
	toc?: boolean;
	/** Between the hero and the sections. */
	before?: Child;
	/** After the sections, before "read next". */
	after?: Child;
}

/** An inner page made of a hero, a table of contents, question sections, and "read next". */
export function ProsePage(props: ProsePageProps): JSX.Element {
	const { locale, k, related, articles, links, photos, before, after, toc = true } = props;
	return (
		<PageShell
			locale={locale}
			theme={props.theme}
			origin={props.origin}
			page={props.page}
			title={props.title}
			description={props.description}
			jsonLd={props.jsonLd}
		>
			<PageHero
				locale={locale}
				overline={props.overline}
				title={props.h1}
				lead={props.lead}
				photo={props.heroPhoto}
			/>
			{before}
			<article class="mx-auto max-w-6xl space-y-16 px-5 py-16 md:py-24">
				{toc ? <Toc locale={locale} k={k} /> : null}
				{PROSE[k].map((s) => (
					<Section locale={locale} k={k} s={s} links={links?.[s.id]} photo={photos?.[s.id]} />
				))}
			</article>
			{after}
			<Related locale={locale} pages={related} articles={articles} />
			<NextSteps locale={locale} links={[]} />
		</PageShell>
	);
}
