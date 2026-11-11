// Romanian for the English upstream ships under /ro/ — every tool's name and
// description, the category descriptions, and the catalogue messages its ro.json
// lacks. Read from ONE map, base/ro-overrides.json ("texts", "messages"), and
// applied as the front proxies upstream's pages and JS chunks. Upstream's files
// are never edited.
//
// WHY njs AND NOT sub_filter: nginx refuses more than 255 sub_filter patterns in
// one location ("number of search patterns exceeds 255", measured on the pinned
// image), and these strings need thousands — each one in every spelling a page,
// a route payload and a minified chunk give it. Here a string is matched WHOLE,
// as a string value, and looked up in the map: no spelling list to keep, and a
// string that merely contains a mapped one is never touched.
//
// WHERE (each a real seam, each covered by selftest/routing.sh):
//   html   — the React Server Component payload pushed inline
//            (self.__next_f.push([1,"…"])), decoded, rewritten, re-encoded the
//            way Next encodes it; then the markup React will hydrate against
//            it: text between tags and the content/title/alt/aria-label/
//            placeholder attributes. Markup and payload MUST agree, or React
//            discards the server markup — so a message (matched by key in the
//            payload) is rewritten in the markup only where the payload of the
//            same page rewrote that English, and never kept it elsewhere.
//   flight — the .txt route payloads the router fetches on a client navigation;
//   js     — `key:"value"` string literals in the chunks (the tool catalogue the
//            Studio and the workflow editor list, the category descriptions).
//
// NEVER TOUCHED: a payload's TEXT ROWS (`<id>:T<hex length>,<bytes>`). Their
// length is declared in bytes, so a translation inside one would desynchronise
// everything after it; they hold schema.org JSON-LD that nobody reads. If the
// payload's shape cannot be followed (a row cut where its kind is unknown, an
// inline push of a shape not recognised) translation STOPS for the rest of that
// document rather than guess. Any exception leaves the response as upstream sent it.
//
// GRACEFUL ON UPGRADE: a string upstream rewords no longer matches and stays
// English; nothing breaks. selftest/routing.sh reports how much still matches.
//
// njs 0.8.4 (the image's): no Map, no for…of — plain objects and indexes.
// biome-ignore lint/style/useNodejsImportProtocol: njs names its module "fs"; "node:fs" does not exist there.
import fs from "fs";

const MAP_FILE = process.env.RO_OVERRIDES || "/etc/nginx/${ESTATE_SLUG}/ro-overrides.json";
const MAP = JSON.parse(fs.readFileSync(MAP_FILE));
const TEXTS = MAP.texts;
const MESSAGES = MAP.messages;
const SUFFIX = " | PDFCraft";
const BRAND_SUFFIX = " | PDF Studio";
const LONGEST = 700; // no mapped string is longer, in any spelling (tools/ro-overrides.py)
const ATTRS = { content: 1, title: 1, alt: 1, "aria-label": 1, placeholder: 1 };
const own = Object.prototype.hasOwnProperty;
// Every English a message translates, whatever its key.
const MESSAGE_ENGLISH = {};
Object.keys(MESSAGES).forEach((k) => {
	Object.keys(MESSAGES[k]).forEach((en) => {
		MESSAGE_ENGLISH[en] = 1;
	});
});
const NON_ASCII = new RegExp(`[${String.fromCharCode(0x80)}-${String.fromCharCode(0xffff)}]`, "g");
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

// The Romanian for one string, or null. A message is matched by its own key AND
// its English, so "Odd" is translated where it is tools.extractPages.selectOdd
// and nowhere else; a tool text by its English alone. "<title> | PDFCraft" is a
// title with upstream's suffix: the estate calls the tool PDF Studio, so the
// suffix is renamed on EVERY such title (the stem translated when the map has
// it) — a tab reads "… | PDF Studio" whether or not its stem is mapped.
function translate(key, plain) {
	if (key !== null && own.call(MESSAGES, key) && own.call(MESSAGES[key], plain)) {
		return MESSAGES[key][plain];
	}
	if (own.call(TEXTS, plain)) return TEXTS[plain];
	if (plain.length > SUFFIX.length && plain.slice(-SUFFIX.length) === SUFFIX) {
		const stem = plain.slice(0, -SUFFIX.length);
		return (own.call(TEXTS, stem) ? TEXTS[stem] : stem) + BRAND_SUFFIX;
	}
	return null;
}

// Index of the quote closing the literal opened at s[i], or -1 (none within `limit`).
function closing(s, i, limit) {
	const q = s[i];
	let j = i + 1;
	for (;;) {
		j = s.indexOf(q, j);
		if (j < 0 || j - i > limit) return -1;
		let n = 0;
		while (s[j - 1 - n] === "\\") n++;
		if (n % 2 === 0) return j;
		j++;
	}
}

function decodeLiteral(lit) {
	try {
		if (lit[0] === '"') return JSON.parse(lit);
		const inner = lit.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"');
		return JSON.parse(`"${inner}"`);
	} catch (_) {
		return null;
	}
}

function asciiOnly(s) {
	return s.replace(NON_ASCII, (c) => `\\u${`000${c.charCodeAt(0).toString(16)}`.slice(-4)}`);
}

// A chunk: every `key:"value"` / `key:'value'` literal whose value is a mapped
// text, rewritten ASCII-only, so the script stays valid whatever charset it is
// read in. Minified JS cannot be tokenised safely without parsing it; a `:`
// right before a quote is where the catalogue's literals start.
function chunkLiterals(s) {
	const out = [];
	let last = 0;
	let p = 0;
	// The next ':"' and ":'" at or after p, each searched again only once passed
	// (searching the rarer one afresh every time would scan to the end each time).
	let dq = -2;
	let sq = -2;
	for (;;) {
		if (dq !== -1 && dq < p) dq = s.indexOf(':"', p);
		if (sq !== -1 && sq < p) sq = s.indexOf(":'", p);
		const at = dq < 0 ? sq : sq < 0 ? dq : Math.min(dq, sq);
		if (at < 0) break;
		const start = at + 1;
		const end = closing(s, start, LONGEST);
		const plain = end < 0 ? null : decodeLiteral(s.slice(start, end + 1));
		const ro = plain === null ? null : translate(null, plain);
		if (ro === null) {
			// Maybe not a literal at all (a ':"' inside some string): look again
			// just past it, so a real literal right after is not skipped.
			p = start + 1;
			continue;
		}
		out.push(s.slice(last, start), asciiOnly(JSON.stringify(ro)));
		last = end + 1;
		p = end + 1;
	}
	if (last === 0) return s;
	out.push(s.slice(last));
	return out.join("");
}

// One JSON row of a payload: every string value, looked up under the key it
// belongs to. `seen` records what this document rewrote and what English it
// kept, for the markup.
function jsonRow(s, seen) {
	const out = [];
	let last = 0;
	let p = 0;
	let key = null;
	for (;;) {
		const i = s.indexOf('"', p);
		if (i < 0) break;
		const end = closing(s, i, s.length);
		if (end < 0) break;
		if (s[end + 1] === ":") {
			key = s.slice(i + 1, end);
		} else if (end - i <= LONGEST) {
			const plain = decodeLiteral(s.slice(i, end + 1));
			const ro = plain === null ? null : translate(key, plain);
			if (ro !== null) {
				out.push(s.slice(last, i), JSON.stringify(ro));
				last = end + 1;
				seen.applied[plain] = ro;
			} else if (plain !== null && own.call(MESSAGE_ENGLISH, plain)) {
				seen.kept[plain] = 1;
			}
		}
		p = end + 1;
	}
	if (last === 0) return s;
	out.push(s.slice(last));
	return out.join("");
}

// ---- RSC payloads --------------------------------------------------------
// A payload is rows: `<id>:<json>\n`, or a text row `<id>:T<hex bytes>,<bytes>`
// with no newline. Followed byte by byte, across the pieces an HTML page splits
// it into; only whole JSON rows inside one piece are rewritten.
function newFlight() {
	return { atRow: true, skip: 0, lost: false, seen: { applied: {}, kept: {} } };
}

function flight(st, buf) {
	if (st.lost) return buf;
	const out = [];
	let pos = 0;
	let changed = false;
	while (pos < buf.length) {
		if (st.skip > 0) {
			const n = Math.min(st.skip, buf.length - pos);
			out.push(buf.slice(pos, pos + n));
			st.skip -= n;
			pos += n;
			if (st.skip === 0) st.atRow = true;
			continue;
		}
		const nl = buf.indexOf(10, pos);
		if (!st.atRow) {
			// Inside a JSON row that began in an earlier piece: pass it through.
			const end = nl < 0 ? buf.length : nl + 1;
			out.push(buf.slice(pos, end));
			pos = end;
			st.atRow = nl >= 0;
			continue;
		}
		const head = buf.slice(pos, Math.min(buf.length, pos + 24)).toString();
		const t = /^[0-9a-f]*:T([0-9a-f]+),/.exec(head);
		if (t) {
			out.push(buf.slice(pos, pos + t[0].length));
			pos += t[0].length;
			st.skip = parseInt(t[1], 16);
			st.atRow = st.skip === 0;
			continue;
		}
		if (nl < 0) {
			// A row cut by the piece's end. Unless its header proves it is not a
			// text row, the stream cannot be followed: stop translating.
			out.push(buf.slice(pos));
			pos = buf.length;
			st.atRow = false;
			if (!/^[0-9a-f]*:[^T]/.test(head)) st.lost = true;
			continue;
		}
		const row = buf.slice(pos, nl).toString();
		const ro = jsonRow(row, st.seen);
		if (ro !== row) {
			out.push(Buffer.from(ro));
			changed = true;
		} else {
			out.push(buf.slice(pos, nl));
		}
		out.push(buf.slice(nl, nl + 1));
		pos = nl + 1;
	}
	return changed ? Buffer.concat(out) : buf;
}

// ---- HTML ------------------------------------------------------------------
const ENTITIES = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#x27;": "'",
	"&#39;": "'",
};
function unescapeHtml(s) {
	return s.indexOf("&") < 0 ? s : s.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (e) => ENTITIES[e]);
}
// As React writes text and attribute values.
function escapeHtml(s) {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#x27;");
}
// As Next writes an inline payload piece (htmlEscapeJsonString).
function escapeScriptJson(s) {
	return s
		.replace(/&/g, "\\u0026")
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.split(LS)
		.join("\\u2028")
		.split(PS)
		.join("\\u2029");
}

// The markup's Romanian for one string: a tool text always (the chunks and the
// payload carry it the same way); a message only as this page's payload did.
function markupText(plain, seen) {
	const ro = translate(null, plain);
	if (ro !== null) return ro;
	if (own.call(seen.applied, plain) && !own.call(seen.kept, plain)) return seen.applied[plain];
	return null;
}

function markup(seg, seen) {
	const out = [];
	let last = 0;
	let p = 0;
	for (;;) {
		const gt = seg.indexOf(">", p);
		if (gt < 0) break;
		const lt = seg.indexOf("<", gt + 1);
		if (lt < 0) break;
		if (lt - gt > 1 && lt - gt <= LONGEST) {
			const ro = markupText(unescapeHtml(seg.slice(gt + 1, lt)), seen);
			if (ro !== null) {
				out.push(seg.slice(last, gt + 1), escapeHtml(ro));
				last = lt;
			}
		}
		p = lt;
	}
	out.push(seg.slice(last));
	const text = out.join("");
	// Attributes.
	const res = [];
	let at = 0;
	let q = 0;
	for (;;) {
		const eq = text.indexOf('="', q);
		if (eq < 0) break;
		const end = text.indexOf('"', eq + 2);
		if (end < 0) break;
		const sp = text.lastIndexOf(" ", eq);
		const name = sp < 0 ? "" : text.slice(sp + 1, eq);
		if (own.call(ATTRS, name) && end - eq <= LONGEST) {
			const ro = markupText(unescapeHtml(text.slice(eq + 2, end)), seen);
			if (ro !== null) {
				res.push(text.slice(at, eq + 2), escapeHtml(ro));
				at = end;
			}
		}
		q = end + 1;
	}
	res.push(text.slice(at));
	return res.join("");
}

const PUSH_OPEN = "self.__next_f.push([1,";
const PUSH_CLOSE = "])";

// The inline payload first (it decides what the markup may say), then the markup.
function html(doc) {
	const st = newFlight();
	const parts = []; // [markup, scriptOpenTag, body, ...]
	let pos = 0;
	for (;;) {
		const open = doc.indexOf("<script", pos);
		const bodyStart = open < 0 ? 0 : doc.indexOf(">", open) + 1;
		const close = bodyStart === 0 ? -1 : doc.indexOf("</script>", bodyStart);
		if (close < 0) break;
		const body = doc.slice(bodyStart, close);
		let rewritten = body;
		if (body.indexOf("self.__next_f") >= 0 && body.indexOf(PUSH_OPEN) >= 0) {
			let piece = null;
			if (body.indexOf(PUSH_OPEN) === 0 && body.slice(-PUSH_CLOSE.length) === PUSH_CLOSE) {
				try {
					piece = JSON.parse(body.slice(PUSH_OPEN.length, body.length - PUSH_CLOSE.length));
				} catch (_) {
					piece = null;
				}
			}
			if (typeof piece !== "string") {
				st.lost = true; // a push we cannot read: the stream is no longer followed
			} else {
				const before = Buffer.from(piece);
				const after = flight(st, before);
				if (after !== before) {
					rewritten = PUSH_OPEN + escapeScriptJson(JSON.stringify(after.toString())) + PUSH_CLOSE;
				}
			}
		}
		parts.push(doc.slice(pos, open), doc.slice(open, bodyStart), rewritten);
		pos = close;
	}
	const out = [];
	for (let i = 0; i < parts.length; i += 3) {
		out.push(markup(parts[i], st.seen), parts[i + 1], parts[i + 2]);
	}
	out.push(markup(doc.slice(pos), st.seen));
	return out.join("");
}

// ---- the filters -------------------------------------------------------------
// One VM per request, so these are per-request state.
let mode = null;
const received = [];

function kindOf(contentType) {
	const ct = (contentType || "").toLowerCase();
	if (ct.indexOf("text/html") === 0) return "html";
	if (ct.indexOf("text/plain") === 0 || ct.indexOf("text/x-component") === 0) return "flight";
	if (ct.indexOf("javascript") >= 0) return "js";
	return null;
}

function transform(kind, buf) {
	if (kind === "flight") return flight(newFlight(), buf);
	const s = buf.toString();
	const ro = kind === "html" ? html(s) : chunkLiterals(s);
	return ro === s ? buf : ro;
}

// js_header_filter: decide, and drop what a rewritten body would contradict.
function headers(r) {
	mode = r.status === 200 ? kindOf(r.headersOut["Content-Type"]) : null;
	if (mode !== null) {
		delete r.headersOut["Content-Length"];
		delete r.headersOut.ETag;
		delete r.headersOut["Last-Modified"];
	}
}

// js_body_filter (buffer_type=buffer): the whole response, then once.
function body(r, data, flags) {
	if (mode === null) {
		r.sendBuffer(data, flags);
		return;
	}
	received.push(Buffer.from(data));
	if (!flags.last) return;
	const buf = Buffer.concat(received);
	let out = buf;
	try {
		out = transform(mode, buf);
	} catch (e) {
		r.error(`ro: left untranslated, ${e}`);
	}
	r.sendBuffer(out, flags);
}

export default { headers, body, transform, translate };
