import { FocusScale, StatusBadge } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { FromTheBlog } from "../sections/blog";
import { programmeHref } from "../sections/programmes";
import { DocSections, head, Toc } from "./doc";
import { Band, NextSteps, PageHero, type PageProps, PageShell, Pending } from "./shell";

/**
 * The four documented levels, worded exactly as on the home. Focus 21's name and text are
 * pending the owner's sign-off, and the badge says so wherever the scale appears.
 */
export function FocusLevels({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	const word = m.focus_word({}, o);
	return (
		<div>
			<FocusScale
				label={m.focus_list_label({}, o)}
				active={10}
				levels={[
					{ level: 10, label: word, name: m.focus_10_name({}, o), text: m.focus_10_text({}, o) },
					{ level: 12, label: word, name: m.focus_12_name({}, o), text: m.focus_12_text({}, o) },
					{ level: 15, label: word, name: m.focus_15_name({}, o), text: m.focus_15_text({}, o) },
					{ level: 21, label: word, name: m.focus_21_name({}, o), text: m.focus_21_text({}, o) },
				]}
			/>
			<div class="mt-10 flex flex-wrap items-center gap-4">
				<StatusBadge tone="warning">{m.fo_21_badge({}, o)}</StatusBadge>
				<p class="text-body text-ink-faint">{m.focus_note({}, o)}</p>
			</div>
		</div>
	);
}

/** /nivelurile-focus: named states, not steps (the live FAQ), and which programme explores them. */
export function FocusPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const h = head("focus", locale);
	return (
		<PageShell
			{...props}
			otherHref={href(locale === "ro" ? "en" : "ro", "focus")}
			title={h.h1}
			seoTitle={h.seoTitle}
			description={h.description}
		>
			<PageHero locale={locale} overline={h.overline} title={h.h1} lead={h.lead}>
				<Toc page="focus" locale={locale} />
			</PageHero>
			<section class="mx-auto max-w-7xl px-6 py-20 md:px-14 md:py-28">
				<FocusLevels locale={locale} />
			</section>
			<DocSections page="focus" locale={locale} photos={{ s02: "mistHill", s06: "whiteMist" }} />
			<Band overline={m.nav_programmes({}, o)} title={m.fo_map_title({}, o)} wash>
				<a class="pz-tap text-link text-body" href={programmeHref(locale, "gateway-voyage")}>
					{m.gateway_title({}, o)}
				</a>
				<Pending locale={locale}>{m.fo_map_pending({}, o)}</Pending>
			</Band>
			<Band overline={m.focus_word({}, o)} title={m.fo_beyond_title({}, o)}>
				<Pending locale={locale}>{m.fo_beyond_pending({}, o)}</Pending>
			</Band>
			<FromTheBlog locale={locale} />
			<NextSteps
				links={[
					{ label: m.next_exercises({}, o), href: href(locale, "exercises"), primary: true },
					{ label: m.next_start({}, o), href: href(locale, "start") },
					{ label: m.next_glossary({}, o), href: href(locale, "glossary") },
					{ label: m.nav_technology({}, o), href: href(locale, "technology") },
				]}
			/>
		</PageShell>
	);
}
