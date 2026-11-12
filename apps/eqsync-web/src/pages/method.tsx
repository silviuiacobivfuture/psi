import type { JSX } from "hono/jsx/jsx-runtime";
import { Method } from "../sections/method";
import { Path } from "../sections/path";
import { msg, ProsePage } from "./prose";
import type { PageProps } from "./shell";

/**
 * /metoda: the mechanism in one line, the figure, what a session is like and the 21 days session
 * by session. The programme facts are the documented ones (4 exercises, day 20 bonus, a reminder
 * email); the sources for the research claims are on /stiinta.
 */
export function MethodPage(props: PageProps): JSX.Element {
	const { locale } = props;
	return (
		<ProsePage
			{...props}
			page="method"
			k="mx"
			title={msg(locale, "mx_meta_title")}
			description={msg(locale, "mx_meta_desc")}
			overline={msg(locale, "mx_overline")}
			h1={msg(locale, "mx_h1")}
			lead={msg(locale, "mx_lead")}
			before={<Method locale={locale} more={false} />}
			after={<Path locale={locale} />}
			related={["science", "listen", "glossary", "who", "protocols", "faq"]}
			articles={["programul-gratuit-de-21-de-zile"]}
		/>
	);
}
