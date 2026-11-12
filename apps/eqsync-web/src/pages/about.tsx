import { PractitionerCard } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { msg, ProsePage } from "./prose";
import { Band, type PageProps, Pending } from "./shell";

/**
 * /despre: the founder's documented credentials, the company behind the site, and how it writes.
 * The founder's story itself waits for the owner (docs/plans/eqsync-web.md §2).
 */
export function AboutPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const facts = [m.ap_fact_1({}, o), m.ap_fact_2({}, o), m.ap_fact_3({}, o)];
	return (
		<ProsePage
			{...props}
			page="about"
			k="ab"
			title={msg(locale, "ab_meta_title")}
			description={msg(locale, "ab_meta_desc")}
			overline={m.ap_overline({}, o)}
			h1={m.ap_title({}, o)}
			lead={m.ap_lead({}, o)}
			heroPhoto="moonHalo"
			toc={false}
			before={
				<Band overline={m.ap_person_overline({}, o)} title={m.ap_person_name({}, o)}>
					<div class="grid gap-8 md:grid-cols-2">
						<PractitionerCard name={m.ap_person_name({}, o)} role={m.ap_person_role({}, o)} />
						<dl class="space-y-4">
							{facts.map((f, i) => (
								<div class="flex gap-4 border-b border-line pb-4">
									<dt class="text-data text-ink-faint">{String(i + 1).padStart(2, "0")}</dt>
									<dd class="text-body text-ink">{f}</dd>
								</div>
							))}
						</dl>
					</div>
					<Pending locale={locale}>{m.ap_story_pending({}, o)}</Pending>
				</Band>
			}
			after={
				<div class="mx-auto max-w-6xl px-5 pb-16">
					<small class="block text-data text-ink-faint">{m.footer_trader({}, o)}</small>
				</div>
			}
			related={["method", "science", "safety", "faq"]}
		/>
	);
}
