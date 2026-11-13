/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import type { DeviceType } from "./schema";

/** A device's icon, drawn in a box of 8 × 8 plan units centred on the origin. */
export function DeviceGlyph({ type }: { type: DeviceType }): JSX.Element {
	switch (type) {
		case "nfb-amplifier":
			return (
				<g class="pz-fp__glyph">
					<rect x="-2.6" y="-1.8" width="5.2" height="3.6" rx="0.6" />
					<path d="M-1.8 0 l0.9 -1 l0.9 2 l0.9 -2 l0.9 1" />
				</g>
			);
		case "hemisync-headphones":
			return (
				<g class="pz-fp__glyph">
					<path d="M-2.8 0.8 A2.8 2.8 0 0 1 2.8 0.8" />
					<rect x="-3.5" y="0.4" width="1.3" height="2.4" rx="0.5" />
					<rect x="2.2" y="0.4" width="1.3" height="2.4" rx="0.5" />
				</g>
			);
		case "therapy-mat":
			return (
				<g class="pz-fp__glyph">
					<rect x="-3.4" y="-2.2" width="6.8" height="4.4" rx="0.8" />
					<path d="M-3.4 0 H3.4" />
				</g>
			);
		case "other":
			return (
				<g class="pz-fp__glyph">
					<circle r="1.3" />
				</g>
			);
		default: {
			const never: never = type;
			return never;
		}
	}
}

/** The four room states as marks that do not rely on colour: a ring, a dot, a cross and a triangle. */
export function StateGlyph({
	state,
}: {
	state: "free" | "booked" | "closed" | "conflict";
}): JSX.Element {
	switch (state) {
		case "free":
			return <circle r="1.7" class="pz-fp__mark" />;
		case "booked":
			return <circle r="1.7" class="pz-fp__mark pz-fp__mark--solid" />;
		case "closed":
			return <path d="M-1.6 -1.6 L1.6 1.6 M1.6 -1.6 L-1.6 1.6" class="pz-fp__mark" />;
		case "conflict":
			return <path d="M0 -2 L2 1.6 H-2 Z" class="pz-fp__mark pz-fp__mark--solid" />;
		default: {
			const never: never = state;
			return never;
		}
	}
}
