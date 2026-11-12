import type { JSX } from "hono/jsx/jsx-runtime";
import { msg, ProsePage } from "./prose";
import type { PageProps } from "./shell";

/** /pentru-cine: use cases (evening, focus, stress) and who it is not for; never as treatment. */
export function WhoPage(props: PageProps): JSX.Element {
	const { locale } = props;
	return (
		<ProsePage
			{...props}
			page="who"
			k="wh"
			title={msg(locale, "wh_meta_title")}
			description={msg(locale, "wh_meta_desc")}
			overline={msg(locale, "wh_overline")}
			h1={msg(locale, "wh_h1")}
			lead={msg(locale, "wh_lead")}
			related={["method", "listen", "science", "safety", "faq"]}
			articles={["programul-gratuit-de-21-de-zile"]}
		/>
	);
}
