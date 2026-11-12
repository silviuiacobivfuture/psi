import type { OpeningHours, SocialLink } from "@psi/cms-client";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

type Network = SocialLink["network"];

/** Each network's name, from EQ-SYNC's messages. */
const NETWORK: Record<Network, (o: { locale: Locale }) => string> = {
	facebook: (o) => m.social_facebook({}, o),
	instagram: (o) => m.social_instagram({}, o),
	youtube: (o) => m.social_youtube({}, o),
	linkedin: (o) => m.social_linkedin({}, o),
	tiktok: (o) => m.social_tiktok({}, o),
};

/**
 * The trader card's opening hours and social profiles (two more rows of its `<dl>`), once the
 * owners set them in the CMS. Neither was published before, so with nothing set this renders
 * nothing (the page as it was).
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
				<div>
					<dt class="text-data text-ink-faint">{m.cp_hours_label({}, o)}</dt>
					{hours.map((h) => (
						<dd class="mt-2 text-body text-ink">{`${h.days[locale]}: ${h.hours}`}</dd>
					))}
				</div>
			)}
			{social.length === 0 ? null : (
				<div>
					<dt class="text-data text-ink-faint">{m.cp_social_label({}, o)}</dt>
					{social.map((s) => (
						<dd class="mt-2 text-body text-ink">
							<a class="pz-tap underline underline-offset-4" href={s.url} rel="me noopener">
								{NETWORK[s.network](o)}
							</a>
						</dd>
					))}
				</div>
			)}
		</>
	);
}
