import { Picture } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { storyPicture } from "../imagery";
import { m } from "../paraglide/messages.js";
import { CREDITS_PATH } from "./credits-path";

/**
 * The Danube at Galați, the city the story happens in. Its licence (CC BY 3.0) asks for credit:
 * given right under the photo, and in full on the credits page.
 */
export function StoryPhoto({ locale }: { locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<figure class="mx-auto max-w-6xl px-5">
			<div class="pz-photo aspect-[4/3] sm:aspect-[2/1]">
				<Picture {...storyPicture(locale)} />
			</div>
			<figcaption class="mt-3 text-body-sm text-ink-muted">
				{`${m.img_story_credit({}, o)} `}
				<a
					class="underline underline-offset-4 hover:text-ink"
					href={`${base(locale)}${CREDITS_PATH}`}
				>
					{m.img_credits_link({}, o)}
				</a>
			</figcaption>
		</figure>
	);
}
