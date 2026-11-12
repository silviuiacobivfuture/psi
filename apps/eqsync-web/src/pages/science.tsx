import { articleJsonLd } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ESTATE, SITE } from "../estate";
import { at } from "../i18n";
import { m } from "../paraglide/messages.js";
import { href } from "../routes";
import { msg, ProsePage } from "./prose";
import type { PageProps } from "./shell";

/** The three papers the page cites, in the order of its `sources` list. */
export const SCIENCE_SOURCES: ReadonlyArray<string> = [
	"https://pmc.ncbi.nlm.nih.gov/articles/PMC10198548/",
	"https://pmc.ncbi.nlm.nih.gov/articles/PMC4428073/",
	"https://pubmed.ncbi.nlm.nih.gov/30073406/",
];

/** The date the page's text was written; it moves only when the text does. */
const WRITTEN = "2026-11-12";

/** /stiinta: what research does and does not show about binaural beats, with sources. */
export function SciencePage(props: PageProps): JSX.Element {
	const { locale } = props;
	const o = at(locale);
	const title = msg(locale, "sc_meta_title");
	const description = msg(locale, "sc_meta_desc");
	return (
		<ProsePage
			{...props}
			page="science"
			k="sc"
			title={title}
			description={description}
			overline={msg(locale, "sc_overline")}
			h1={msg(locale, "sc_h1")}
			lead={msg(locale, "sc_lead")}
			photos={{ entrain: "pianistHands", notshow: "lakeStars" }}
			links={{ sources: SCIENCE_SOURCES }}
			related={["method", "listen", "glossary", "safety"]}
			articles={["eqsync-ce-este-si-ce-nu-este"]}
			jsonLd={[
				articleJsonLd({
					type: "Article",
					headline: msg(locale, "sc_h1"),
					description,
					url: `${props.origin}${href(locale, "science")}`,
					inLanguage: locale,
					datePublished: WRITTEN,
					dateModified: WRITTEN,
					publisher: { name: m.estate_eqsync({}, o), url: `${ESTATE[SITE]}/` },
					author: { name: m.estate_eqsync({}, o), type: "Organization" },
				}),
			]}
		/>
	);
}
