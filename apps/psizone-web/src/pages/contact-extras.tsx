import type { OpeningHours, SocialLink } from "@psi/cms-client";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

type Network = SocialLink["network"];

/** Each network's name, from Psizone's messages. */
const NETWORK: Record<Network, (o: { locale: Locale }) => string> = {
	facebook: (o) => m.social_facebook({}, o),
	instagram: (o) => m.social_instagram({}, o),
	youtube: (o) => m.social_youtube({}, o),
	linkedin: (o) => m.social_linkedin({}, o),
	tiktok: (o) => m.social_tiktok({}, o),
};

/**
 * The contact page's opening hours and social profiles, once the owners set them in the CMS.
 * Neither was published before, so with nothing set this renders nothing (the page as it was).
 */
export function ContactExtras({
	locale,
	hours,
	social,
}: {
	locale: Locale;
	hours: ReadonlyArray<OpeningHours>;
	social: ReadonlyArray<SocialLink>;
}): JSX.Element {
	const o = at(locale);
	return (
		<>
			{hours.length === 0 ? null : (
				<>
					<p class="mt-12 text-overline uppercase tracking-[0.14em] text-ink-muted">
						{m.contact_hours({}, o)}
					</p>
					<dl class="mt-4 space-y-1 text-body text-ink">
						{hours.map((h) => (
							<div class="flex gap-3">
								<dt class="text-ink-muted">{h.days[locale]}</dt>
								<dd class="font-mono">{h.hours}</dd>
							</div>
						))}
					</dl>
				</>
			)}
			{social.length === 0 ? null : (
				<>
					<p class="mt-12 text-overline uppercase tracking-[0.14em] text-ink-muted">
						{m.contact_social({}, o)}
					</p>
					<ul class="mt-4 flex flex-wrap gap-4">
						{social.map((s) => (
							<li>
								<a
									class="text-body text-ink underline underline-offset-4 hover:text-glow-1"
									href={s.url}
									rel="me noopener"
								>
									{NETWORK[s.network](o)}
								</a>
							</li>
						))}
					</ul>
				</>
			)}
		</>
	);
}
