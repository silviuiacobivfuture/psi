import { cx, Picture } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { HubGroup } from "../content/hubs";
import type { Locale } from "../i18n";
import { groupPicture } from "../imagery";

/** How the photo tile sits in each group's card grid, so every row ends full at sm and lg. */
const TILE: Readonly<Record<HubGroup, { span: string; sizes: string }>> = {
	// Four cards: the photo takes the last two cells.
	children: {
		span: "sm:col-span-2",
		sizes: "(min-width: 1152px) 740px, (min-width: 1024px) 64vw, calc(100vw - 40px)",
	},
	// Five cards: the photo takes the sixth cell.
	"teens-adults": {
		span: "",
		sizes:
			"(min-width: 1152px) 360px, (min-width: 1024px) 31vw, (min-width: 640px) 48vw, calc(100vw - 40px)",
	},
	programmes: { span: "", sizes: "100vw" },
};

/** The photograph that stands for a hub group, as one more tile in the group's grid. */
export function GroupPhotoTile({
	group,
	locale,
}: {
	group: HubGroup;
	locale: Locale;
}): JSX.Element | null {
	const tile = TILE[group];
	const picture = groupPicture(group, locale, tile.sizes);
	if (picture === undefined) return null;
	return (
		<figure
			class={cx(
				"pz-photo pz-photo--fill pz-rise aspect-[3/2] sm:aspect-auto sm:min-h-56",
				tile.span,
			)}
		>
			<Picture {...picture} />
		</figure>
	);
}

/** The same photograph beside a hub page's heading. */
export function GroupPhoto({
	group,
	locale,
}: {
	group: HubGroup;
	locale: Locale;
}): JSX.Element | null {
	const picture = groupPicture(group, locale, "(min-width: 1024px) 440px, calc(100vw - 40px)");
	if (picture === undefined) return null;
	return (
		<figure class="pz-photo pz-rise aspect-[3/2]">
			<Picture {...picture} />
		</figure>
	);
}
