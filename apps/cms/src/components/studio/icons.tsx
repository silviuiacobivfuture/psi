import type { ReactElement } from "react";

/** The studio's line icons (24 px grid, currentColor), decorative: every one sits beside text. */
export function Svg({ d, size = 20 }: { d: ReadonlyArray<string>; size?: number }): ReactElement {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.6}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			{d.map((p) => (
				<path key={p} d={p} />
			))}
		</svg>
	);
}

export const IconVoice = (): ReactElement => (
	<Svg d={["M4 10v4", "M8 7v10", "M12 4v16", "M16 8v8", "M20 11v2"]} />
);
export const IconChat = (): ReactElement => (
	<Svg d={["M4 5h16v11H9l-5 4z", "M8 9.5h8", "M8 12.5h5"]} />
);
export const IconTopics = (): ReactElement => <Svg d={["M3 12l9-9h8v8l-9 9z", "M15.5 8.5h.01"]} />;
export const IconShield = (): ReactElement => (
	<Svg d={["M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z", "M9 12l2 2 4-4"]} />
);
export const IconHistory = (): ReactElement => (
	<Svg d={["M4 12a8 8 0 1 0 2.3-5.7", "M4 4v4h4", "M12 8v4l3 2"]} />
);
export const IconLock = ({ size = 16 }: { size?: number }): ReactElement => (
	<Svg size={size} d={["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"]} />
);
export const IconSpark = (): ReactElement => (
	<Svg
		d={[
			"M12 3v4",
			"M12 17v4",
			"M3 12h4",
			"M17 12h4",
			"M6 6l2.5 2.5",
			"M15.5 15.5L18 18",
			"M18 6l-2.5 2.5",
			"M8.5 15.5L6 18",
		]}
	/>
);
export const IconSend = ({ size = 18 }: { size?: number }): ReactElement => (
	<Svg size={size} d={["M4 12l16-8-6 16-2.5-6.5z", "M11.5 13.5L20 4"]} />
);
export const IconReset = ({ size = 16 }: { size?: number }): ReactElement => (
	<Svg size={size} d={["M4 12a8 8 0 1 1 2.3 5.7", "M4 20v-4h4"]} />
);
