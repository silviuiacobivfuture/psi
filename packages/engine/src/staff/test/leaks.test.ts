import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { RequestContext } from "@mastra/core/request-context";
import { createPsiEngine } from "@psi/guide";
import { createKnowledge, createLexicalEmbedder, type KnowledgeStore } from "@psi/knowledge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../../engine";
import {
	chatBody,
	type FakeOpenRouter,
	MemorySchedulingStore,
	startFakeOpenRouter,
} from "../../testing";
import { createStaffEngine } from "../engine";
import { STAFF_TOOL_IDS } from "../tool-ids";

const ROOT = resolve(import.meta.dirname, "../../../../..");
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/;
const SKIP = new Set([
	"node_modules",
	"dist",
	".data",
	".credentials",
	".mastra",
	".git",
	".nx",
	"paraglide",
]);

/**
 * Anything that reaches the staff entry or the staff component: a package import, a subpath, a
 * relative path into the folders, a dynamic import or a require. Matched on the raw text, so a
 * string in a comment is flagged too: nothing of the visitor side may even mention them.
 */
/** The package paths: the only way code outside the engine and the UI library can reach the staff folders. */
const STAFF_PACKAGE_REACH = [
	/@psi\/engine\/staff/,
	/engine\/src\/staff/,
	/@psi\/ui\/staff-assistant/,
	/ui\/src\/staff-assistant/,
];
/** Inside the engine and the UI library, a relative path into the folders too. */
const STAFF_REACH = [
	...STAFF_PACKAGE_REACH,
	/["'`](?:\.{1,2}\/)+(?:[\w-]+\/)*staff(?:\/[\w./-]*)?["'`]/,
	/["'`](?:\.{1,2}\/)+(?:[\w-]+\/)*staff-assistant(?:\/[\w./-]*)?["'`]/,
];

function walk(dir: string, skip: (path: string) => boolean): Array<string> {
	const out: Array<string> = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (SKIP.has(name) || skip(path)) continue;
		if (statSync(path).isDirectory()) out.push(...walk(path, skip));
		else if (CODE.test(name)) out.push(path);
	}
	return out;
}

/** The files under `roots` that reach the staff code. */
function reaching(
	roots: ReadonlyArray<string>,
	skip: (path: string) => boolean = () => false,
	patterns: ReadonlyArray<RegExp> = STAFF_REACH,
): Array<string> {
	return roots
		.flatMap((root) => walk(root, skip))
		.filter((file) => {
			const text = readFileSync(file, "utf8");
			return patterns.some((pattern) => pattern.test(text));
		})
		.map((file) => relative(ROOT, file));
}

/**
 * An app of its own (not the engine, not the UI library): a relative `./staff` there is its own file (the service's
 * staff accounts), so only the package paths count.
 */
const appReaching = (roots: ReadonlyArray<string>): Array<string> =>
	reaching(roots, () => false, STAFF_PACKAGE_REACH);

describe("the scan itself (it must be able to fail)", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "leak-"));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it.each([
		['import { createStaffEngine } from "@psi/engine/staff";'],
		['export * from "@psi/engine/staff";'],
		['const staff = await import("@psi/engine/staff");'],
		['const staff = require("@psi/engine/staff");'],
		['import { x } from "../../../packages/engine/src/staff/index";'],
		['import { x } from "../../engine/src/staff";'],
		['import { StaffPanel } from "@psi/ui/staff-assistant";'],
		['import "@psi/ui/staff-assistant.css";'],
		['import x from "../staff-assistant/index";'],
		["const x = import(`../staff`);"],
	])("flags %s", (line) => {
		writeFileSync(join(dir, "leaky.ts"), `${line}\n`);
		expect(reaching([dir])).toHaveLength(1);
	});

	it("flags a package.json that depends on it, and leaves clean code alone", () => {
		writeFileSync(join(dir, "package.json"), '{"exports":{"./x":"@psi/engine/staff"}}');
		writeFileSync(
			join(dir, "clean.ts"),
			'import { createEngine } from "@psi/engine";\nconst staffing = "staff";\n',
		);
		mkdirSync(join(dir, "node_modules"));
		writeFileSync(join(dir, "node_modules", "ignored.ts"), 'import "@psi/engine/staff";');
		expect(reaching([dir]).map((f) => f.split("/").at(-1))).toEqual(["package.json"]);
	});

	it("in an app, its own ./staff is not the assistant, a path into the engine's staff folder is", () => {
		writeFileSync(join(dir, "own.ts"), 'import { staffHandlers } from "./staff";\n');
		expect(appReaching([dir])).toEqual([]);
		writeFileSync(join(dir, "leaky.ts"), 'import { x } from "../../packages/engine/src/staff";\n');
		writeFileSync(join(dir, "pkg.ts"), 'import { x } from "@psi/engine/staff";\n');
		expect(appReaching([dir]).map((f) => f.split("/").at(-1))).toEqual(["leaky.ts", "pkg.ts"]);
	});
});

describe("nothing on the visitor side reaches the staff assistant", () => {
	it("the public sites and the guide import neither the staff entry nor the staff component", () => {
		const roots = ["apps/psizone-web", "apps/hemisync-web", "apps/blog-web", "packages/guide"].map(
			(p) => join(ROOT, p),
		);
		expect(roots.every((r) => statSync(r).isDirectory())).toBe(true);
		expect(reaching(roots)).toEqual([]);
	});

	it("the engine's visitor code does not reach the staff folder, and its main entry exports none of it", () => {
		const engineSrc = join(ROOT, "packages/engine/src");
		expect(reaching([engineSrc], (p) => p.startsWith(join(engineSrc, "staff")))).toEqual([]);
		expect(readFileSync(join(engineSrc, "index.ts"), "utf8")).not.toMatch(/staff/i);
		const pkg: unknown = JSON.parse(
			readFileSync(join(ROOT, "packages/engine/package.json"), "utf8"),
		);
		const exportsField =
			typeof pkg === "object" && pkg !== null && "exports" in pkg ? pkg.exports : undefined;
		expect(exportsField).toMatchObject({
			".": "./src/index.ts",
			"./staff": "./src/staff/index.ts",
		});
	});

	it("the shared UI library's main entry and visitor components do not reach the staff component", () => {
		const uiSrc = join(ROOT, "packages/ui/src");
		expect(reaching([uiSrc], (p) => p.startsWith(join(uiSrc, "staff-assistant")))).toEqual([]);
	});

	it("the other apps (the CMS, the hub, the studio) do not either; only the console may", () => {
		const apps = readdirSync(join(ROOT, "apps")).filter(
			(a) => a !== "clinic" && a !== "eqsync-web" && statSync(join(ROOT, "apps", a)).isDirectory(),
		);
		const roots = apps.map((a) => join(ROOT, "apps", a));
		expect(appReaching(roots)).toEqual([]);
	});

	it("the staff folder never touches the visitor knowledge, grounding, ingest or memory code", () => {
		const staff = join(ROOT, "packages/engine/src/staff");
		const forbidden =
			/from\s+["'](?:\.\.\/(?:grounding|ingest|ingest-workflow|ask|ask-context|converse|catalog|workflow|studio-tool|engine|warm|settings|booking|scheduling)(?:\/[^"']*)?|@psi\/(?:knowledge|guide|content)|[^"']*chroma[^"']*)["']/i;
		const offenders = walk(
			staff,
			(p) => p.includes("/test/") || p.includes("/testing/") || p.includes("/evals/"),
		)
			.filter((f) => forbidden.test(readFileSync(f, "utf8")))
			.map((f) => relative(ROOT, f));
		expect(offenders).toEqual([]);
	});
});

describe("the visitor engine holds no staff tool", () => {
	let fake: FakeOpenRouter | undefined;
	let dir: string;
	let kb: KnowledgeStore;
	beforeEach(() => {
		vi.stubEnv("OPENROUTER_API_KEY", "");
		vi.stubEnv("CHROMA_URL", "");
		dir = mkdtempSync(join(tmpdir(), "leak-kb-"));
		kb = createKnowledge({ url: `file:${join(dir, "kb.db")}`, embedder: createLexicalEmbedder() });
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		await fake?.close();
		await kb.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it("neither the registered tools nor any site agent's tools, scheduling included", async () => {
		const { mastra } = createPsiEngine({ knowledge: kb, scheduling: new MemorySchedulingStore() });
		expect(
			Object.keys(mastra.listTools() ?? {}).filter((id) => STAFF_TOOL_IDS.includes(id)),
		).toEqual([]);
		const agents = mastra.listAgents();
		expect(Object.keys(agents).length).toBeGreaterThan(0);
		for (const [name, agent] of Object.entries(agents)) {
			const tools = await agent.listTools({ requestContext: new RequestContext() });
			const held = Object.keys(tools);
			expect(
				held.filter((id) => STAFF_TOOL_IDS.includes(id)),
				name,
			).toEqual([]);
			expect(
				held.some((id) => /^staff/i.test(id)),
				name,
			).toBe(false);
		}
		expect(Object.keys(agents).some((n) => /staff/i.test(n))).toBe(false);
	});

	it("and what a visitor's model is actually offered holds none", async () => {
		fake = await startFakeOpenRouter([{ kind: "text", chunks: ["Bună!"] }]);
		const engine = createEngine({
			profiles: [(await import("./visitor-profile")).VISITOR_PROFILE],
			knowledge: { search: async () => [] },
			model: { id: "fake/model", apiKey: "k", baseURL: fake.baseURL },
			screening: { model: false },
		});
		for await (const _ of engine
			.guide("visitor")
			.ask({ question: "ce servicii aveți?", locale: "ro" }))
			void _;
		const offered = [...fake.requests, ...fake.searches].flatMap(
			(r) => chatBody(r).tools?.map((t) => t.function.name) ?? [],
		);
		expect(offered.length).toBeGreaterThan(0);
		expect(offered.filter((id) => STAFF_TOOL_IDS.includes(id))).toEqual([]);
	});

	it("the staff engine's own Mastra holds the staff agent only, and the staff agent holds no visitor tool", async () => {
		const staff = createStaffEngine({ model: { id: "fake/model", apiKey: "k" } });
		expect(Object.keys(staff.mastra.listAgents())).toEqual(["staff-assistant"]);
		expect(Object.keys(staff.mastra.listTools() ?? {})).toEqual([]);
		expect(Object.keys(staff.mastra.listVectors() ?? {})).toEqual([]);
	});
});
