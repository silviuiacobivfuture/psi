import type { ReactElement } from "react";
import { Svg } from "../studio/icons";

/** The setup page's line icons (same grid and stroke as the studio's). */
export const IconPerson = (): ReactElement => (
	<Svg d={["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6"]} />
);
export const IconService = (): ReactElement => (
	<Svg d={["M5 4h14v16H5z", "M9 9h6", "M9 13h6", "M9 17h3"]} />
);
export const IconClock = (): ReactElement => (
	<Svg d={["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"]} />
);
export const IconCalendar = (): ReactElement => (
	<Svg d={["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4", "M9 15l2 2 4-4"]} />
);
export const IconEye = (): ReactElement => (
	<Svg
		d={["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"]}
	/>
);
export const IconRoom = (): ReactElement => (
	<Svg d={["M4 20V6l8-3 8 3v14", "M4 20h16", "M9 20v-6h6v6", "M9 10h6"]} />
);
export const IconGrid = (): ReactElement => (
	<Svg d={["M3 4h18v16H3z", "M3 9h18", "M9 4v16", "M15 4v16"]} />
);
