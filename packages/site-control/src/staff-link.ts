import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

/** Where the Compass asks, once open, whether to show the staff group (a Datastar `@get`). */
export const STAFF_LINK_PATH = "/__admin/compass";
/** The placeholder's id: the answer replaces it (Datastar patches elements by id). */
export const STAFF_LINK_ID = "pz-compass-staff";

export interface StaffLinkWords {
	group: string;
	label: string;
	hint: string;
}

/** The Compass group with the one "Administrare" link, in the Compass's own markup. */
export function staffLinkHtml(
	w: StaffLinkWords,
	href: string,
): HtmlEscapedString | Promise<HtmlEscapedString> {
	return html`<section id="${STAFF_LINK_ID}" class="pz-compass__group">
	<h2 class="pz-compass__group-label">${w.group}</h2>
	<ul>
		<li>
			<a class="pz-compass__item" href="${href}"><span>${w.label}</span><small>${w.hint}</small></a>
		</li>
	</ul>
</section>`;
}
