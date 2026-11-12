import type { JSX } from "hono/jsx/jsx-runtime";
import { msg, ProsePage } from "./prose";
import type { PageProps } from "./shell";

/** /cum-asculti: headphones, volume, time of day, posture, routine and when to stop. */
export function ListenPage(props: PageProps): JSX.Element {
	const { locale } = props;
	return (
		<ProsePage
			{...props}
			page="listen"
			k="ls"
			title={msg(locale, "ls_meta_title")}
			description={msg(locale, "ls_meta_desc")}
			overline={msg(locale, "ls_overline")}
			h1={msg(locale, "ls_h1")}
			lead={msg(locale, "ls_lead")}
			related={["method", "safety", "faq", "who"]}
			articles={["de-ce-ai-nevoie-de-casti"]}
		/>
	);
}
