/**
 * DEV ONLY — the local identity provider's "who are you?" page: one link per demo person, each repeating the
 * authorize request with that person's `login_hint`. Plain HTML, no script; the people are fake and say so.
 */
import type { MockPerson } from "./mock-issuer";

const html = (text: string): string => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function chooserPage(authorize: URL, people: ReadonlyArray<MockPerson>): string {
	const rows = people
		.map((person) => {
			const href = new URL(authorize);
			href.searchParams.set("login_hint", person.email);
			const groups = (person.groups ?? []).join(", ") || "no groups";
			return `<li><a href="${html(href.pathname + href.search)}"><strong>${html(person.name)}</strong><span>${html(person.email)} · ${html(groups)}</span></a></li>`;
		})
		.join("");
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Local sign-in (dev only)</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1b1b1b;background:#f6f3ee}
h1{font-size:1.4rem}p{color:#555}ul{list-style:none;padding:0}li{margin:.5rem 0}
a{display:flex;flex-direction:column;padding:.75rem 1rem;border:1px solid #d8d2c8;border-radius:.75rem;background:#fff;color:inherit;text-decoration:none}
a:hover{border-color:#8a7b62}span{font-size:.85rem;color:#666}</style></head>
<body><h1>Local sign-in — development only</h1>
<p>This is psi's local stand-in for Authentik (auth.psizone.ro). Every person below is fake. Choose who to sign in as;
every local site then recognises you until you sign out.</p><ul>${rows}</ul></body></html>`;
}
