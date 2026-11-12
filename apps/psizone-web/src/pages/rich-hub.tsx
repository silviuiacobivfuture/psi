import { HubCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Hub } from "../content/hubs";
import { methodsForHub } from "../content/methods";
import type { RichPage } from "../content/rich/types";
import { at, base } from "../i18n";
import { m } from "../paraglide/messages.js";
import { richJsonLd } from "../rich-seo";
import { Closing } from "../sections/closing";
import { RichBody } from "../sections/rich-body";
import { PageShell, type ShellProps } from "./shell";

const METHODS_TITLE = { ro: "Metodele folosite aici", en: "The methods we use here" } as const;

/** A hub with a full page: its text and questions, then the methods used for it. */
export function RichHubPage(
	props: Omit<ShellProps, "path"> & { hub: Hub; page: RichPage },
): JSX.Element {
	const { locale, hub, page } = props;
	const o = at(locale);
	const b = base(locale);
	const title = hub.title(o);
	const methods = methodsForHub(hub.id);
	return (
		<PageShell
			{...props}
			path={hub.path}
			back={{ label: m.hub_back({}, o), href: `${b}/#pentru-cine` }}
			eyebrow={hub.eyebrow(o)}
			title={title}
			lead={page.lead[locale]}
			badge={m.hub_review_badge({}, o)}
			seoTitle={page.seoTitle[locale]}
			description={page.seoDescription[locale]}
			jsonLd={richJsonLd(
				locale,
				hub.path,
				page.seoTitle[locale],
				page.seoDescription[locale],
				page,
			)}
		>
			<RichBody locale={locale} page={page} />
			{methods.length > 0 ? (
				<section class="border-t border-line bg-surface-1">
					<div class="mx-auto max-w-6xl px-5 py-20">
						<h2 class="display text-display-md text-ink">{METHODS_TITLE[locale]}</h2>
						<div class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
							{methods.map((x, i) => (
								<HubCard
									class="pz-rise"
									hue={([1, 2, 3] as const)[i % 3] ?? 1}
									eyebrow={m.method_eyebrow({}, o)}
									title={x.name[locale]}
									text={x.lead[locale]}
									href={`${b}${x.path}`}
								/>
							))}
						</div>
					</div>
				</section>
			) : null}
			<Closing locale={locale} />
		</PageShell>
	);
}
