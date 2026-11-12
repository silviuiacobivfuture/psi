import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { EngineFailure, Passage } from "@psi/engine";
import { createPsiEngine } from "@psi/guide";
import type { Knowledge } from "@psi/knowledge";
import {
	chromaFromEnv,
	createKnowledge,
	createLexicalEmbedder,
	embedderFromEnv,
} from "@psi/knowledge";
import { z } from "zod";

/**
 * One question end to end against the LOCAL Chroma (`CHROMA_URL`, default http://localhost:8000),
 * searched as the sites search it: with `--key-from`, the OpenRouter embedder (`PSI_EMBED_MODEL`),
 * else the lexical one:
 *
 *   pnpm --filter @psi/engine ask --question "Cum vă pot suna?"
 *   pnpm --filter @psi/engine ask --key-from ../../apps/psizone-web/.env
 *
 * It prints what retrieval found, the events and the failures `onFailure` reported. With
 * `--key-from`, `OPENROUTER_API_KEY` is read from that env file; the key is never printed.
 */
const { values } = parseArgs({
	options: {
		question: { type: "string", default: "Cum vă pot suna?" },
		brand: { type: "string", default: "psizone" },
		locale: { type: "string", default: "ro" },
		"key-from": { type: "string" },
		"no-screening": { type: "boolean", default: false },
	},
});

const KeyLine = /^\s*OPENROUTER_API_KEY\s*=\s*"?([^"\n]*)"?\s*$/m;

/** The key from an env file, or undefined; it stays in memory and is never printed. */
function keyFrom(path: string | undefined): string | undefined {
	if (path === undefined) return undefined;
	const key = KeyLine.exec(readFileSync(path, "utf8"))?.[1]?.trim();
	return key === undefined || key === "" ? undefined : key;
}

const apiKey = keyFrom(values["key-from"]);
// Only the key read above counts: never one inherited from the shell.
process.env.OPENROUTER_API_KEY = "";

const store = createKnowledge({
	vector: chromaFromEnv() ?? { kind: "chroma", url: "http://localhost:8000" },
	embedder:
		apiKey === undefined
			? createLexicalEmbedder()
			: embedderFromEnv({ ...process.env, OPENROUTER_API_KEY: apiKey }),
});

/** Records what each search found, so the run can show retrieval happened. */
const found: Array<ReadonlyArray<Passage>> = [];
const knowledge: Knowledge = {
	async search(q) {
		const passages = await store.search(q);
		found.push(passages);
		return passages;
	},
};

const failures: Array<EngineFailure> = [];
const engine = createPsiEngine({
	knowledge,
	...(apiKey === undefined ? {} : { apiKey }),
	modelScreening: !values["no-screening"],
	onFailure: (failure) => failures.push(failure),
});

const brand = values.brand;
const locale = z.enum(["ro", "en"]).parse(values.locale);
console.log(`store: ${store.store.kind} ${store.store.location}, embedder ${store.embedder.model}`);
console.log(
	`key: ${engine.hasApiKey ? "set (from --key-from, not shown)" : "none"}, model ${engine.model}`,
);

if (!engine.hasApiKey) {
	// Without a key the answer stops before retrieval; the registered tool shows what it would find.
	const tool = engine.mastra.getTool("searchKnowledge");
	const out = await tool.execute?.({ profile: brand, locale, query: values.question }, {});
	const passages = z
		.object({
			passages: z.array(z.object({ score: z.number(), source: z.object({ id: z.string() }) })),
		})
		.parse(out).passages;
	console.log(`retrieval (searchKnowledge tool): ${passages.length} passages`);
	for (const p of passages) console.log(`  ${p.score.toFixed(3)} ${p.source.id}`);
}

found.length = 0;
const events: Array<string> = [];
for await (const event of engine.guide(brand).ask({ question: values.question, locale })) {
	events.push(event.type === "refusal" ? `refusal:${event.reason}` : event.type);
}
for (const [i, passages] of found.entries()) {
	console.log(`retrieval (in the ask) #${i + 1}: ${passages.length} passages`);
	for (const p of passages) console.log(`  ${p.score.toFixed(3)} ${p.source.id}`);
}
console.log(`events: ${events.join(" → ")}`);
console.log(`failures: ${failures.length === 0 ? "none" : ""}`);
for (const f of failures) console.log(`  ${f.profile} ${f.stage}: ${f.error}`);
