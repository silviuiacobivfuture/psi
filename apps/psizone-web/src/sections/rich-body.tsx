import { Prose } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { RichPage } from "../content/rich/types";
import { base, type Locale } from "../i18n";
import { FaqList } from "./faq-list";

const FAQ_TITLE = { ro: "Întrebări frecvente", en: "Frequently asked questions" } as const;
const MORE_TITLE = { ro: "Citește mai departe", en: "Read on" } as const;

/**
 * The reading column of a rich method or hub page: its sections in order, the questions, the
 * internal links and the one next step. Everything is plain text from `content/rich`.
 */
export function RichBody({ locale, page }: { locale: Locale; page: RichPage }): JSX.Element {
	const b = base(locale);
	return (
		<section class="mx-auto max-w-6xl space-y-16 px-5 py-20">
			{page.sections.map((s) => {
				const items = s.list?.map((x) => <li>{x[locale]}</li>);
				return (
					<div id={s.id} class="max-w-3xl scroll-mt-28">
						<h2 class="display text-display-md text-ink">{s.h2[locale]}</h2>
						<Prose class="mt-6">
							{s.paras.map((p) => (
								<p>{p[locale]}</p>
							))}
							{items === undefined ? null : s.ordered ? <ol>{items}</ol> : <ul>{items}</ul>}
						</Prose>
						{s.photo === undefined ? null : (
							<figure class="pz-photo mt-8 max-w-2xl">
								<img
									class="pz-picture__img"
									src={s.photo.src}
									width={s.photo.width}
									height={s.photo.height}
									alt={s.photo.alt[locale]}
									loading="lazy"
									decoding="async"
								/>
							</figure>
						)}
					</div>
				);
			})}
			<div id="intrebari" class="max-w-3xl scroll-mt-28">
				<h2 class="display text-display-md text-ink">{FAQ_TITLE[locale]}</h2>
				<div class="mt-8">
					<FaqList
						locale={locale}
						entries={page.faq.map((f, i) => ({ id: `r${i + 1}`, q: f.q, a: f.a }))}
					/>
				</div>
			</div>
			{page.links.length > 0 ? (
				<div class="max-w-3xl">
					<h2 class="display text-display-md text-ink">{MORE_TITLE[locale]}</h2>
					<ul class="mt-6 flex flex-wrap gap-3">
						{page.links.map((l) => (
							<li>
								<a
									class="inline-block rounded-pill border border-line-control px-5 py-2 text-body text-ink hover:border-accent hover:text-glow-1"
									href={l.href.startsWith("http") ? l.href : `${b}${l.href}`}
								>
									{l.label[locale]}
								</a>
							</li>
						))}
					</ul>
				</div>
			) : null}
			<p class="max-w-3xl text-body-lg text-ink">{page.nextStep[locale]}</p>
		</section>
	);
}
