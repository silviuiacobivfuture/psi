import type { Palette } from "./palette";

const ESCAPES: Readonly<Record<string, string>> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/** HTML-escapes text for element content and attribute values. */
export function esc(text: string): string {
	return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

export interface Fact {
	readonly label: string;
	readonly value: string;
	readonly href?: string;
}

export interface EmailParts {
	readonly lang: "ro" | "en";
	readonly palette: Palette;
	readonly brand: string;
	readonly logoUrl: string | undefined;
	readonly preheader: string;
	readonly greeting: string;
	readonly title: string;
	readonly body: string;
	readonly facts: ReadonlyArray<Fact>;
	readonly action: { readonly label: string; readonly href: string } | undefined;
	/** Secondary, quieter links (map, calendar, "I cannot come"). */
	readonly links: ReadonlyArray<{ readonly label: string; readonly href: string }>;
	readonly note: string | undefined;
	readonly footer: string;
}

/** One e-mail: table layout and inline styles, because mail clients ignore the rest. */
export function renderEmailHtml(p: EmailParts): string {
	const c = p.palette;
	const facts = p.facts
		.map(
			(f) =>
				`<tr><td style="padding:6px 16px 6px 0;color:${c["ink-muted"]};font-size:14px;vertical-align:top">${esc(f.label)}</td><td style="padding:6px 0;color:${c.ink};font-size:15px">${
					f.href === undefined
						? esc(f.value)
						: `<a href="${esc(f.href)}" style="color:${c.accent}">${esc(f.value)}</a>`
				}</td></tr>`,
		)
		.join("");
	const action =
		p.action === undefined
			? ""
			: `<p style="margin:24px 0"><a href="${esc(p.action.href)}" style="display:inline-block;background:${c.accent};color:${c["on-accent"]};padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px">${esc(p.action.label)}</a></p>`;
	const links = p.links
		.map(
			(l) =>
				`<a href="${esc(l.href)}" style="color:${c.accent};font-size:14px">${esc(l.label)}</a>`,
		)
		.join(" &nbsp;·&nbsp; ");
	const logo =
		p.logoUrl === undefined
			? ""
			: `<img src="${esc(p.logoUrl)}" width="32" height="32" alt="" style="vertical-align:middle;margin-right:10px;border-radius:6px">`;
	return `<!doctype html><html lang="${p.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title></head><body style="margin:0;background:${c.bg};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"><span style="display:none;max-height:0;overflow:hidden">${esc(p.preheader)}</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg}"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${c["surface-1"]};border:1px solid ${c.line};border-radius:12px"><tr><td style="padding:20px 28px;border-bottom:3px solid ${c.accent};color:${c.ink};font-size:18px;font-weight:700">${logo}${esc(p.brand)}</td></tr><tr><td style="padding:28px;color:${c.ink};font-size:16px;line-height:1.55"><p style="margin:0 0 12px;color:${c["ink-muted"]}">${esc(p.greeting)}</p><h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${c.ink}">${esc(p.title)}</h1><p style="margin:0 0 16px">${esc(p.body)}</p>${p.facts.length > 0 ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px">${facts}</table>` : ""}${action}${links === "" ? "" : `<p style="margin:16px 0 0">${links}</p>`}${p.note === undefined ? "" : `<p style="margin:20px 0 0;color:${c["ink-muted"]};font-size:14px">${esc(p.note)}</p>`}</td></tr><tr><td style="padding:16px 28px;border-top:1px solid ${c.line};color:${c["ink-muted"]};font-size:13px">${esc(p.footer)}</td></tr></table></td></tr></table></body></html>`;
}

/** The plain-text twin every HTML mail carries. */
export function renderEmailText(p: EmailParts): string {
	const lines = [p.greeting, "", p.title, p.body, ""];
	for (const f of p.facts)
		lines.push(`${f.label}: ${f.value}${f.href === undefined ? "" : ` (${f.href})`}`);
	if (p.action !== undefined) lines.push("", `${p.action.label}: ${p.action.href}`);
	for (const l of p.links) lines.push(`${l.label}: ${l.href}`);
	if (p.note !== undefined) lines.push("", p.note);
	lines.push("", p.footer);
	return lines.join("\n");
}
