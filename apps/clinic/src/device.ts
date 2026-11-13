/** "Chrome pe Linux": a browser and a system said briefly, from a User-Agent; empty when it says neither. */
export function deviceLabel(userAgent: string | undefined, on: string): string {
	const ua = userAgent ?? "";
	const browser = /Edg\//.test(ua)
		? "Edge"
		: /OPR\/|Opera/.test(ua)
			? "Opera"
			: /Firefox\//.test(ua)
				? "Firefox"
				: /Chrome\/|CriOS\//.test(ua)
					? "Chrome"
					: /Safari\//.test(ua)
						? "Safari"
						: "";
	const system = /iPhone|iPad/.test(ua)
		? "iPhone"
		: /Android/.test(ua)
			? "Android"
			: /Windows/.test(ua)
				? "Windows"
				: /Mac OS X|Macintosh/.test(ua)
					? "macOS"
					: /Linux|X11/.test(ua)
						? "Linux"
						: "";
	if (browser !== "" && system !== "") return `${browser} ${on} ${system}`;
	return browser !== "" ? browser : system;
}
