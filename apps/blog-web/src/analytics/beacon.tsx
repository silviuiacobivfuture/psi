import type { JSX } from "hono/jsx/jsx-runtime";

/**
 * The reading beacon on an article: one POST when the page opens (a view) and one each time the
 * reader's scroll passes 25, 50, 75 or 100 per cent of the ARTICLE (not the page). Datastar,
 * no cookie, no storage, no signal sent: the request names only the article and the threshold.
 * It is not rendered at all for a visitor with Do-Not-Track or GPC (the server also drops it).
 */
const NO_SIGNALS = "{filterSignals: {include: /^$/}}";

function depthExpression(base: string): string {
	return [
		"const a = document.querySelector('main article');",
		"if (a) {",
		"const r = a.getBoundingClientRect();",
		"const p = ((window.innerHeight - r.top) / Math.max(1, r.height)) * 100;",
		"const t = p >= 98 ? 100 : p >= 75 ? 75 : p >= 50 ? 50 : p >= 25 ? 25 : 0;",
		`if (t > $_depth) { $_depth = t; @post('${base}&e=depth&d=' + t, ${NO_SIGNALS}) }`,
		"}",
	].join(" ");
}

export function ReadingBeacon({ slug, locale }: { slug: string; locale: string }): JSX.Element {
	const base = `/_a?s=${encodeURIComponent(slug)}&l=${locale}`;
	const depth = depthExpression(base);
	return (
		<>
			<div hidden data-init={`@post('${base}&e=view', ${NO_SIGNALS})`} />
			<div
				hidden
				data-signals:_depth="0"
				data-init={depth}
				{...{ "data-on:scroll__window__throttle.750ms": depth }}
			/>
		</>
	);
}

/** In the preview only: reload when the CMS saves the draft (Payload's document event). */
export function PreviewReload({ cmsOrigin }: { cmsOrigin: string }): JSX.Element {
	return (
		<div
			hidden
			{...{
				"data-on:message__window": `evt.origin === '${cmsOrigin}' && evt.data && evt.data.type === 'payload-document-event' && window.location.reload()`,
			}}
		/>
	);
}
