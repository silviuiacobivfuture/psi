/**
 * Test helpers for apps that render the compass: which destinations a typed query lists, read
 * from the rendered HTML and decided by the very Datastar expressions the browser runs.
 */

const ITEM = /<a id="pz-dest-[^"]*" class="pz-compass__item" href="([^"]*)" data-show="([^"]*)"/g;

function decodeAttribute(attr: string): string {
	return attr
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");
}

/** The hrefs of the destinations the compass in `html` lists while `query` is typed. */
export function compassDestinations(html: string, query: string): ReadonlyArray<string> {
	const listed: string[] = [];
	for (const [, href, show] of html.matchAll(ITEM)) {
		if (href === undefined || show === undefined) continue;
		const decide = new Function("$compassQuery", `return (${decodeAttribute(show)})`);
		if (decide(query) === true) listed.push(decodeAttribute(href));
	}
	return listed;
}

export interface Mp3Info {
	frames: number;
	sampleRate: number;
	kbps: number;
	/** Channel modes seen in every frame: 0 stereo, 1 joint stereo, 2 dual channel, 3 mono. */
	channelModes: ReadonlyArray<number>;
	seconds: number;
}

const MPEG1_LAYER3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG1_RATES = [44100, 48000, 32000];

/** Walks every MPEG-1 Layer III frame of an MP3 and reports its rate, bitrate, modes and length. */
export function mp3Info(data: Uint8Array): Mp3Info {
	let pos = 0;
	if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
		pos =
			10 +
			(((data[6] ?? 0) << 21) | ((data[7] ?? 0) << 14) | ((data[8] ?? 0) << 7) | (data[9] ?? 0));
	}
	const modes = new Set<number>();
	let frames = 0;
	let sampleRate = 0;
	let kbps = 0;
	while (pos + 4 <= data.length) {
		const h =
			(((data[pos] ?? 0) << 24) |
				((data[pos + 1] ?? 0) << 16) |
				((data[pos + 2] ?? 0) << 8) |
				(data[pos + 3] ?? 0)) >>>
			0;
		const rate = MPEG1_RATES[(h >>> 10) & 3];
		const rateKbps = MPEG1_LAYER3_KBPS[(h >>> 12) & 15];
		const valid = h >>> 21 === 0x7ff && ((h >>> 19) & 3) === 3 && ((h >>> 17) & 3) === 1;
		if (!valid || rate === undefined || !rateKbps) {
			pos += 1;
			continue;
		}
		modes.add((h >>> 6) & 3);
		frames += 1;
		sampleRate = rate;
		kbps = rateKbps;
		pos += Math.floor((144 * rateKbps * 1000) / rate) + ((h >>> 9) & 1);
	}
	return {
		frames,
		sampleRate,
		kbps,
		channelModes: [...modes].sort(),
		seconds: sampleRate === 0 ? 0 : (frames * 1152) / sampleRate,
	};
}
