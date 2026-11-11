/**
 * Chroma refused or could not be reached: a configuration problem (the URL or the token), not
 * missing content. The message names the setting to fix and never carries the token.
 */
export class ChromaAccessError extends Error {
	readonly status: 401 | 403 | undefined;

	constructor(message: string, status: 401 | 403 | undefined) {
		super(message);
		this.name = "ChromaAccessError";
		this.status = status;
	}
}

type Kind = "unauthorized" | "forbidden" | "unreachable";

/** What chromadb raises (its own classes, often wrapped in a MastraError's `cause`). */
const KINDS: ReadonlyArray<{ names: ReadonlyArray<string>; kind: Kind }> = [
	{ names: ["ChromaUnauthorizedError", "ChromaAuthError"], kind: "unauthorized" },
	{ names: ["ChromaForbiddenError"], kind: "forbidden" },
	{ names: ["ChromaConnectionError"], kind: "unreachable" },
];

function kindOf(error: unknown): Kind | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < 6 && current instanceof Error; depth += 1) {
		const names = [current.name, current.constructor.name];
		const found = KINDS.find((k) => k.names.some((name) => names.includes(name)));
		if (found !== undefined) return found.kind;
		current = current.cause;
	}
	return undefined;
}

/**
 * Turns chromadb's authentication and connection errors (wherever they sit in the cause chain)
 * into a `ChromaAccessError` that says which setting is wrong. Anything else is returned as is.
 */
export function explainChromaError(error: unknown, origin: string, hasKey: boolean): unknown {
	const kind = kindOf(error);
	if (kind === "unauthorized") {
		return new ChromaAccessError(
			hasKey
				? `Chroma at ${origin} refused the token (HTTP 401): CHROMA_API_KEY is not the server's token`
				: `Chroma at ${origin} requires a token (HTTP 401): set CHROMA_API_KEY`,
			401,
		);
	}
	if (kind === "forbidden") {
		return new ChromaAccessError(
			`Chroma at ${origin} refused access (HTTP 403): check CHROMA_API_KEY, CHROMA_TENANT and CHROMA_DATABASE`,
			403,
		);
	}
	if (kind === "unreachable") {
		return new ChromaAccessError(`Chroma at ${origin} is unreachable: check CHROMA_URL`, undefined);
	}
	return error;
}
