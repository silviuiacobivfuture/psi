/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { describe, expect, it } from "vitest";
import { type ImageAsset, Picture } from "./picture";

const variants = (ext: string) => [
	{ width: 480, src: `/assets/images/x-480.0123456789.${ext}` },
	{ width: 768, src: `/assets/images/x-768.0123456789.${ext}` },
];
const FULL: ImageAsset = {
	width: 1600,
	height: 900,
	placeholder: "#101010",
	avif: variants("avif"),
	webp: variants("webp"),
	jpeg: variants("jpg"),
};
const render = (el: JSX.Element): string => String(el);

describe("Picture", () => {
	it("offers AVIF, then WebP, then JPEG, with the box's size, lazy and async by default", () => {
		const html = render(<Picture image={FULL} alt="A" />);
		expect(html.indexOf('type="image/avif"')).toBeLessThan(html.indexOf('type="image/webp"'));
		expect(html).toContain('width="1600"');
		expect(html).toContain('height="900"');
		expect(html).toContain('loading="lazy"');
		expect(html).toContain('decoding="async"');
		expect(html).not.toContain("fetchpriority");
	});

	it("the LCP image loads eagerly at high priority; an eager one at the browser's own", () => {
		const lcp = render(<Picture image={FULL} alt="A" priority />);
		expect(lcp).toContain('loading="eager"');
		expect(lcp).toContain('fetchpriority="high"');
		const eager = render(<Picture image={FULL} alt="A" eager />);
		expect(eager).toContain('loading="eager"');
		expect(eager).not.toContain("fetchpriority");
	});

	it("a format with no variants gets no <source> (never an empty srcset)", () => {
		const html = render(<Picture image={{ ...FULL, avif: [] }} alt="A" />);
		expect(html).not.toContain('type="image/avif"');
		expect(html).toContain('type="image/webp"');
		expect(html).not.toContain('srcset=""');
		const bare = render(<Picture image={{ ...FULL, avif: [], webp: [] }} alt="A" />);
		expect(bare).not.toContain("<source");
		expect(bare).toContain("<img");
	});
});
