// AFFiNE's config.json, written at every start from the estate's settings (ConfigMap
// affine-settings) and its secrets (Secret affine-app), into $HOME/.affine/config/ — the
// path the server and its migration read (AFFiNE base/config/register.ts, CONFIG_JSON_PATHS).
// Run by the server's own image (node), so it needs nothing of ours.
//
// Why a file and not env: the sign-in provider, the storage and the sign-up switches have NO
// environment variable in AFFiNE (0.27.4: only the host, the URL, Redis, the key and the
// mailer do). And AFFiNE IGNORES a config.json it cannot parse ("Invalid json config file",
// then the defaults: open sign-up, files on the pod's disk). So this file is written by
// JSON.stringify — never by a template — and read back before the server starts.
//
// What it decides, and why:
//   auth.allowSignup false           no account is made with an e-mail and a password
//   auth.allowSignupForOauth true    an account is made by the first Authentik sign-in —
//                                    Authentik decides who may (app-affine-user, -admin)
//   oauth.providers.oidc             the estate's Authentik, client `affine-oidc`
//   storages blob + avatar           the estate's bucket; usePresignedURL OFF, so every file
//                                    passes through the server (and its gate) and no
//                                    browser is ever sent to the bucket (no CORS needed)
//   flags.allowGuestDemoWorkspace    false: nothing is made by someone who is not signed in
//   copilot.enabled true             AFFiNE's AI plugin, for ONE part of it: its MCP server
//                                    (/api/workspaces/<id>/mcp and the credentials screen,
//                                    Integrations → MCP Server), which 0.27.4 serves only
//                                    with the plugin on (CopilotEnabled on both). The MCP
//                                    server needs no AI provider: it reads documents.
//   copilot byok.* off, no provider  nothing that calls (and bills) an AI service: no
//                                    provider profile, and workspace owners may NOT add their
//                                    own keys (BYOK is on by default in 0.27.4). The AI
//                                    buttons show and answer that no model is available.
//   indexer on, manticoresearch      search (the web app's and the MCP server's doc_search)
//                                    in the piece's own Manticore (manticore.yaml), at its
//                                    ClusterIP Service. No credential: Manticore 10 has no
//                                    authentication; its NetworkPolicy admits this server only
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const need = [
	"OIDC_ISSUER",
	"OIDC_CLIENT_ID",
	"OIDC_CLIENT_SECRET",
	"S3_ENDPOINT",
	"S3_REGION",
	"S3_BUCKET",
	"S3_ACCESS_KEY_ID",
	"S3_SECRET_ACCESS_KEY",
];
const missing = need.filter((k) => !process.env[k]);
if (missing.length > 0) {
	for (const k of missing) process.stderr.write(`MISSING REQUIRED SECRET: ${k}\n`);
	process.exit(1);
}
const env = (k) => process.env[k] ?? "";
// The Service in manticore.yaml (name and port), in this namespace.
const SEARCH_ENDPOINT = "http://affine-manticore:9308";

const s3 = {
	provider: "aws-s3",
	bucket: env("S3_BUCKET"),
	config: {
		endpoint: env("S3_ENDPOINT"),
		region: env("S3_REGION"),
		forcePathStyle: true,
		credentials: {
			accessKeyId: env("S3_ACCESS_KEY_ID"),
			secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
		},
		usePresignedURL: { enabled: false },
	},
};
const config = {
	$schema: "https://github.com/toeverything/affine/releases/latest/download/config.schema.json",
	auth: {
		allowSignup: false,
		allowSignupForOauth: true,
	},
	oauth: {
		"providers.oidc": {
			clientId: env("OIDC_CLIENT_ID"),
			clientSecret: env("OIDC_CLIENT_SECRET"),
			issuer: env("OIDC_ISSUER"),
			allowPrivateNetwork: false,
			args: { scope: "openid profile email" },
		},
	},
	storages: {
		"blob.storage": s3,
		"avatar.storage": s3,
	},
	flags: { allowGuestDemoWorkspace: false },
	copilot: {
		enabled: true,
		"byok.enabled": false,
		"byok.allowedProviders": [],
		"byok.allowCustomEndpoint": false,
		"byok.allowPrivateEndpoint": false,
	},
	indexer: {
		enabled: true,
		"provider.type": "manticoresearch",
		"provider.endpoint": SEARCH_ENDPOINT,
	},
};

const dir = join(homedir(), ".affine", "config");
mkdirSync(dir, { recursive: true });
const file = join(dir, "config.json");
writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
// Read back: what AFFiNE will parse is exactly what was meant.
const back = JSON.parse(readFileSync(file, "utf8"));
if (
	back.oauth["providers.oidc"].issuer !== env("OIDC_ISSUER") ||
	back.auth.allowSignup !== false ||
	back.copilot["byok.enabled"] !== false ||
	back.indexer["provider.endpoint"] !== SEARCH_ENDPOINT
) {
	process.stderr.write(`FATAL: ${file} does not read back as written\n`);
	process.exit(1);
}
process.stdout.write(
	`wrote ${file}: sign-in ${env("OIDC_ISSUER")}, files in ${env("S3_BUCKET")} at ${env("S3_ENDPOINT")}, search at ${SEARCH_ENDPOINT}\n`,
);
