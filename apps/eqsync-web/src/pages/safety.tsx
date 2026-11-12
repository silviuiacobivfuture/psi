import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { msg, ProsePage } from "./prose";
import { type PageProps, Pending } from "./shell";

/**
 * /disclaimer: safety and contraindications. The epilepsy line is a precaution, not a research
 * finding, and the page says so. The clinical review is still pending, said plainly below.
 */
export function SafetyPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	return (
		<ProsePage
			{...props}
			page="safety"
			k="sf"
			title={msg(locale, "sf_meta_title")}
			description={msg(locale, "sf_meta_desc")}
			overline={msg(locale, "sf_overline")}
			h1={msg(locale, "sf_h1")}
			lead={msg(locale, "sf_lead")}
			after={
				<div class="mx-auto max-w-6xl px-5 pb-16">
					<Pending locale={locale}>{m.sp_pending({}, o)}</Pending>
				</div>
			}
			related={["listen", "science", "who", "faq"]}
			articles={["eqsync-ce-este-si-ce-nu-este"]}
		/>
	);
}
