import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ALLOWED, REASONS } from "./collects-allowed";

const CONVEX = join(import.meta.dirname, "../../convex");

/** The top-level declaration a node sits in: an `export const X = query(...)` or a helper function. */
function declarationOf(node: ts.Node): string {
	let at: ts.Node = node;
	while (at.parent !== undefined && !ts.isSourceFile(at.parent)) at = at.parent;
	if (ts.isFunctionDeclaration(at)) return at.name?.text ?? "(anonymous)";
	if (ts.isVariableStatement(at)) {
		const first = at.declarationList.declarations[0];
		if (first !== undefined && ts.isIdentifier(first.name)) return first.name.text;
	}
	return "(top level)";
}

/** Every `<expr>.collect()` call in the Convex functions, counted by `<file>#<declaration>`. */
function collectsInConvex(): Map<string, number> {
	const found = new Map<string, number>();
	const files = readdirSync(CONVEX).filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));
	for (const file of files) {
		const source = ts.createSourceFile(
			file,
			readFileSync(join(CONVEX, file), "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		const visit = (node: ts.Node): void => {
			if (
				ts.isCallExpression(node) &&
				node.arguments.length === 0 &&
				ts.isPropertyAccessExpression(node.expression) &&
				node.expression.name.text === "collect"
			) {
				const key = `${file}#${declarationOf(node)}`;
				found.set(key, (found.get(key) ?? 0) + 1);
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
	return found;
}

describe("every list the Convex functions read is bounded", () => {
	const found = collectsInConvex();

	it("finds the collects (the scan itself works)", () => {
		expect(found.size).toBeGreaterThan(10);
	});

	it("a collect that is not on the list, or more of them than listed, is refused: bound it or say why it is bounded", () => {
		const unlisted = [...found]
			.filter(([key, count]) => (ALLOWED[key]?.count ?? 0) < count)
			.map(([key, count]) => `${key} (${count})`);
		expect(unlisted).toEqual([]);
	});

	it("a listed collect that is gone (or fewer than listed) is taken off the list", () => {
		const stale = Object.entries(ALLOWED)
			.filter(([key, { count }]) => (found.get(key) ?? 0) < count)
			.map(([key, { count }]) => `${key} (${count} listed, ${found.get(key) ?? 0} found)`);
		expect(stale).toEqual([]);
	});

	it("every listed collect names a reason that exists", () => {
		for (const [key, { why }] of Object.entries(ALLOWED))
			expect(REASONS[why]?.length ?? 0, key).toBeGreaterThan(40);
	});
});
