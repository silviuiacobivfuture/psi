import { z } from "zod";

/**
 * agent-studio's configuration, parsed once from the environment. In production the auth is not
 * optional: a production process without a gate or bearer issuer refuses to start, naming what is
 * missing. Values that are secrets (OPENROUTER_API_KEY, CHROMA_API_KEY, OPENFGA_TOKEN) come from
 * OpenBao through the `agent-studio-env` ExternalSecret and are read where they are used.
 */
const list = (fallback: ReadonlyArray<string>) =>
	z
		.string()
		.optional()
		.transform((v) =>
			v === undefined || v.trim() === ""
				? [...fallback]
				: v
						.split(",")
						.map((s) => s.trim())
						.filter((s) => s !== ""),
		);

const optionalUrl = z
	.string()
	.optional()
	.transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()))
	.pipe(z.string().url().optional());

/** An issuer as Authentik writes it: https, ending in `/application/o/<slug>/`. */
const issuer = optionalUrl.refine(
	(v) => v === undefined || /^https?:\/\/[^/]+\/application\/o\/[a-z0-9-]+\/$/.test(v),
	"expected https://<authentik>/application/o/<slug>/",
);

const EnvSchema = z.object({
	NODE_ENV: z.string().optional(),
	PORT: z.coerce.number().int().min(1).max(65535).default(4360),
	/** The address people open: Studio's page tells the browser to call `<this>/api`. */
	AGENT_STUDIO_PUBLIC_URL: optionalUrl,
	AGENT_STUDIO_MODE: z.enum(["read-only", "operate"]).default("read-only"),
	/** `off` only outside production: a local Studio with no sign-in. */
	AGENT_STUDIO_AUTH: z.enum(["on", "off"]).default("on"),
	/**
	 * Where the check runs. `edge-guard` (default): Mastra server middleware, Studio's page works
	 * unlicensed. `server-auth`: Mastra's `server.auth`; Studio's page then needs MASTRA_LICENSE_KEY
	 * in production (edge-guard.ts says why).
	 */
	AGENT_STUDIO_AUTH_SURFACE: z.enum(["edge-guard", "server-auth"]).default("edge-guard"),
	AGENT_STUDIO_DATA_DIR: z.string().default(".data"),
	/** `on` wires the scheduling tools (they create real appointment holds). Off by default. */
	AGENT_STUDIO_SCHEDULING: z.enum(["on", "off"]).default("off"),
	AUTHENTIK_GATE_ISSUER: issuer,
	AUTHENTIK_GATE_AUDIENCE: z.string().optional(),
	AUTHENTIK_USERINFO_URL: optionalUrl,
	AUTHENTIK_BEARER_ISSUER: issuer,
	AUTHENTIK_BEARER_AUDIENCE: z.string().optional(),
	AGENT_STUDIO_VIEW_GROUPS: list(["app-agent-studio-viewer"]),
	AGENT_STUDIO_OPERATE_GROUPS: list(["app-agent-studio-operator"]),
	OPENFGA_ENDPOINT: optionalUrl,
	OPENFGA_STORE_ID: z.string().optional(),
	OPENFGA_MODEL_ID: z.string().optional(),
	OPENFGA_TOKEN: z.string().optional(),
});

export interface StudioConfig {
	production: boolean;
	port: number;
	publicUrl: URL | null;
	mode: "read-only" | "operate";
	dataDir: string;
	scheduling: boolean;
	auth:
		| { kind: "off" }
		| {
				kind: "on";
				surface: "edge-guard" | "server-auth";
				gate: { issuer: string; audience?: string; userinfoUrl: URL } | null;
				bearer: { issuer: string; audience: string; jwksUrl: URL } | null;
		  };
	groups: { view: string[]; operate: string[] };
	openfga: { endpoint: string; storeId: string; modelId: string; token: string } | null;
}

/** Parses the environment; throws naming every problem at once. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): StudioConfig {
	const parsed = EnvSchema.safeParse(env);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
		throw new Error(`agent-studio: invalid environment — ${issues.join("; ")}`);
	}
	const e = parsed.data;
	const production = e.NODE_ENV === "production";
	const problems: string[] = [];

	const gate =
		e.AUTHENTIK_GATE_ISSUER === undefined
			? null
			: {
					issuer: e.AUTHENTIK_GATE_ISSUER,
					...(e.AUTHENTIK_GATE_AUDIENCE?.trim()
						? { audience: e.AUTHENTIK_GATE_AUDIENCE.trim() }
						: {}),
					userinfoUrl: new URL(
						e.AUTHENTIK_USERINFO_URL ??
							new URL("/application/o/userinfo/", e.AUTHENTIK_GATE_ISSUER).href,
					),
				};
	let bearer: { issuer: string; audience: string; jwksUrl: URL } | null = null;
	if (e.AUTHENTIK_BEARER_ISSUER !== undefined) {
		const audience = e.AUTHENTIK_BEARER_AUDIENCE?.trim() ?? "";
		if (audience === "")
			problems.push("AUTHENTIK_BEARER_AUDIENCE is required with AUTHENTIK_BEARER_ISSUER");
		bearer = {
			issuer: e.AUTHENTIK_BEARER_ISSUER,
			audience,
			jwksUrl: new URL("jwks/", e.AUTHENTIK_BEARER_ISSUER),
		};
	}

	if (e.AGENT_STUDIO_AUTH === "off" && production)
		problems.push("AGENT_STUDIO_AUTH=off is refused in production");
	if (e.AGENT_STUDIO_AUTH === "on" && gate === null && bearer === null) {
		problems.push(
			"set AUTHENTIK_GATE_ISSUER and/or AUTHENTIK_BEARER_ISSUER (or AGENT_STUDIO_AUTH=off outside production)",
		);
	}
	if (production && e.AGENT_STUDIO_PUBLIC_URL === undefined)
		problems.push("AGENT_STUDIO_PUBLIC_URL is required in production");

	const fgaKeys = [e.OPENFGA_ENDPOINT, e.OPENFGA_STORE_ID, e.OPENFGA_MODEL_ID, e.OPENFGA_TOKEN];
	const fgaSet = fgaKeys.filter((v) => v !== undefined && v.trim() !== "").length;
	if (fgaSet !== 0 && fgaSet !== fgaKeys.length) {
		problems.push(
			"OPENFGA_ENDPOINT, OPENFGA_STORE_ID, OPENFGA_MODEL_ID and OPENFGA_TOKEN go together",
		);
	}
	if (problems.length > 0) throw new Error(`agent-studio: ${problems.join("; ")}`);

	return {
		production,
		port: e.PORT,
		publicUrl: e.AGENT_STUDIO_PUBLIC_URL === undefined ? null : new URL(e.AGENT_STUDIO_PUBLIC_URL),
		mode: e.AGENT_STUDIO_MODE,
		dataDir: e.AGENT_STUDIO_DATA_DIR,
		scheduling: e.AGENT_STUDIO_SCHEDULING === "on",
		auth:
			e.AGENT_STUDIO_AUTH === "off"
				? { kind: "off" }
				: { kind: "on", surface: e.AGENT_STUDIO_AUTH_SURFACE, gate, bearer },
		groups: { view: e.AGENT_STUDIO_VIEW_GROUPS, operate: e.AGENT_STUDIO_OPERATE_GROUPS },
		openfga:
			fgaSet === fgaKeys.length
				? {
						endpoint: e.OPENFGA_ENDPOINT ?? "",
						storeId: e.OPENFGA_STORE_ID ?? "",
						modelId: e.OPENFGA_MODEL_ID ?? "",
						token: e.OPENFGA_TOKEN ?? "",
					}
				: null,
	};
}
