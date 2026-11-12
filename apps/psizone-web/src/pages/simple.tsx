import { AmbientField, Button, Picture, Prose, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ROOM_PHOTOS, ROOMS } from "../content/rooms";
import { TEAM } from "../content/team";
import { at, base, type Locale } from "../i18n";
import { oldSitePicture, teamPicture } from "../imagery";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Closing, Footer } from "../sections/closing";
import { Header } from "../sections/header";
import { MemberCard } from "../sections/member-card";
import type { Theme } from "../theme";

interface PageProps {
	locale: Locale;
	theme: Theme;
	origin: string;
	path: string;
}

function Shell({
	locale,
	theme,
	origin,
	path,
	title,
	lead,
	seoTitle,
	description,
	children,
}: PageProps & {
	title: string;
	lead: string;
	/** `<title>` text when it should differ from the h1. */
	seoTitle?: string;
	/** Meta description when it should differ from the lead. */
	description?: string;
	children: Child;
}): JSX.Element {
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = `${base(other)}${path}`;
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${seoTitle ?? title} — Psizone`}
			description={description ?? lead}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} theme={theme} />
			<main id="continut">
				<AmbientField intensity="low" class="pz-arc -mt-20">
					<div class="mx-auto max-w-6xl px-5 pb-24 pt-44">
						<h1 class="display max-w-4xl text-display-xl text-ink">{title}</h1>
						<p class="mt-6 max-w-xl text-body-lg text-ink-muted">{lead}</p>
					</div>
				</AmbientField>
				{children}
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}

export function TeamPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const withBio = TEAM.filter((p) => p.bio !== undefined);
	return (
		<Shell
			{...props}
			title={m.team_title({}, o)}
			lead={m.team_page_lead({}, o)}
			seoTitle={m.team_seo_title({}, o)}
			description={m.team_seo_description({}, o)}
		>
			<section class="mx-auto max-w-6xl px-5 py-20">
				<figure class="pz-photo pz-rise mb-12 aspect-[3/2] sm:aspect-[2/1]">
					<Picture {...teamPicture(locale)} />
				</figure>
				<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{TEAM.map((p) => (
						<MemberCard member={p} locale={locale} />
					))}
				</div>
			</section>
			<section class="border-t border-line bg-surface-1" aria-labelledby="formare">
				<div class="mx-auto max-w-6xl px-5 py-20">
					<h2 id="formare" class="display text-display-md text-ink">
						{m.team_bios_title({}, o)}
					</h2>
					<div class="mt-10 grid gap-12 lg:grid-cols-2">
						{withBio.map((p) => (
							<article>
								<h3 class="text-title text-ink">{p.name}</h3>
								<p class="text-body-sm text-ink-muted">{p.role(o)}</p>
								<Prose class="mt-4">
									<p>{p.bio?.[locale]}</p>
									{p.trainings === undefined ? null : (
										<>
											<p class="text-body-sm text-ink-muted">{m.team_trainings({}, o)}</p>
											<ul>
												{p.trainings.map((t) => (
													<li>{t[locale]}</li>
												))}
											</ul>
										</>
									)}
								</Prose>
							</article>
						))}
					</div>
					<p class="mt-10 max-w-3xl text-body-sm text-ink-faint">{m.team_bios_note({}, o)}</p>
				</div>
			</section>
			<section class="mx-auto max-w-6xl px-5 py-20" aria-labelledby="spatii">
				<h2 id="spatii" class="display text-display-md text-ink">
					{m.team_spaces_title({}, o)}
				</h2>
				<p class="mt-4 max-w-2xl text-body-lg text-ink-muted">{m.team_spaces_lead({}, o)}</p>
				<div class="mt-10 grid gap-10 lg:grid-cols-2">
					<ul class="space-y-3 text-body-lg text-ink">
						{ROOMS.map((r) => (
							<li class="border-l-2 border-line-control pl-4">{r[locale]}</li>
						))}
					</ul>
					<div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
						{ROOM_PHOTOS.map((ph) => (
							<figure class="pz-photo">
								<Picture
									{...oldSitePicture(
										ph.file,
										ph.width,
										ph.height,
										ph.alt[locale],
										"(min-width: 1024px) 540px, 90vw",
									)}
								/>
							</figure>
						))}
					</div>
				</div>
			</section>
			<Closing locale={locale} />
		</Shell>
	);
}

/** A page whose text must come from the owner's specialists: said plainly, never invented. */
export function PreparingPage(props: PageProps & { title: string }): JSX.Element {
	const o = at(props.locale);
	return (
		<Shell {...props} title={props.title} lead={m.prep_text({}, o)}>
			<section class="mx-auto max-w-6xl space-y-8 px-5 pb-28">
				<StatusBadge tone="info">{m.prep_overline({}, o)}</StatusBadge>
				<div>
					<Button variant="glass" href={`${base(props.locale)}/`}>
						{m.prep_back({}, o)}
					</Button>
				</div>
			</section>
		</Shell>
	);
}
