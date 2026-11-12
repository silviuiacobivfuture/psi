import type { JSX } from "hono/jsx/jsx-runtime";
import { href } from "../routes";
import { definedTermSetJsonLd } from "../seo";
import { PROSE } from "./content-spec";
import { firstParagraph, msg, ProsePage } from "./prose";
import type { PageProps } from "./shell";

/** /glosar: the words around binaural sound, each a question and a plain definition. */
export function GlossaryPage(props: PageProps): JSX.Element {
	const { locale } = props;
	const terms = PROSE.gl.map((s) => ({
		name: msg(locale, `gl_${s.id}_n`),
		description: firstParagraph(locale, "gl", s.id),
	}));
	return (
		<ProsePage
			{...props}
			page="glossary"
			k="gl"
			title={msg(locale, "gl_meta_title")}
			description={msg(locale, "gl_meta_desc")}
			overline={msg(locale, "gl_overline")}
			h1={msg(locale, "gl_h1")}
			lead={msg(locale, "gl_lead")}
			heroPhoto="mountainNight"
			related={["science", "method", "listen", "faq"]}
			jsonLd={[
				definedTermSetJsonLd(
					msg(locale, "gl_h1"),
					`${props.origin}${href(locale, "glossary")}`,
					terms,
				),
			]}
		/>
	);
}
