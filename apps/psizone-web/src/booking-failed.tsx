import { GlassCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { FormId } from "./booking";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";
import { phones } from "./site-settings";

/**
 * What replaces the form when the request reached nobody: the store and the e-mail both failed.
 * Never "thank you": it says so plainly and gives the clinic's phones.
 */
export function BookingFailed({
	locale,
	id = "booking",
}: {
	locale: Locale;
	id?: FormId;
}): JSX.Element {
	const o = at(locale);
	return (
		<div id={id} role="alert">
			<GlassCard class="pz-edge space-y-4">
				<h2 class="display text-headline text-ink">{m.callback_failed_title({}, o)}</h2>
				<p class="text-body text-ink-muted">{m.callback_failed_text({}, o)}</p>
				<p class="text-body text-ink">
					{`${m.callback_failed_phones({}, o)} `}
					{phones().map((phone, i) => (
						<>
							{i === 0 ? null : " · "}
							<a class="underline" href={`tel:${phone.tel}`}>
								{phone.display}
							</a>
						</>
					))}
				</p>
				<p class="text-body-sm">
					<a class="underline" href={`${base(locale)}/contact`}>
						{m.callback_failed_retry({}, o)}
					</a>
				</p>
			</GlassCard>
		</div>
	);
}
