/** One plan unit is 10 cm: every coordinate is an integer number of units, the plan in metres is units / 10. */
export const UNIT_CM = 10;
export const UNITS_PER_METRE = 100 / UNIT_CM;

export const MAX_FLOORS = 8;
export const MAX_SHAPES_PER_FLOOR = 400;
export const MAX_POLYGON_POINTS = 64;
export const MAX_LABEL = 60;

export const SPACE_TYPES = ["reception", "waiting", "corridor", "wc", "storage", "other"] as const;
export const DEVICE_TYPES = [
	"nfb-amplifier",
	"hemisync-headphones",
	"therapy-mat",
	"other",
] as const;
