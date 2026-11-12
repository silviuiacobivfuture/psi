// A registry double for the gates: the OCI distribution API in memory, on 127.0.0.1, enough for
// cosign to sign and verify by digest (blobs: monolithic, chunked and mounted uploads; manifests by
// tag and digest). No podman, no image pull, no network beyond loopback, so a gate that needs a
// signed digest runs on the CI runner too.
//
//   node .github/scripts/tests/lib/oci-registry.mjs <port file>
//       listens on a free loopback port, writes "127.0.0.1:<port>" to <port file>, serves until killed.
//   node .github/scripts/tests/lib/oci-registry.mjs push <registry> <repository> <label>
//       pushes a one-layer image whose config names <label> (so each label is its own digest) and
//       prints its manifest digest.
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

const sha = (b) => `sha256:${createHash("sha256").update(b).digest("hex")}`;
const MANIFEST = "application/vnd.oci.image.manifest.v1+json";

const push = async (reg, repo, label) => {
	const base = `http://${reg}/v2/${repo}`;
	const put = async (b) => {
		const d = sha(b);
		const s = await fetch(`${base}/blobs/uploads/`, { method: "POST" });
		const loc = new URL(s.headers.get("location") ?? "", `http://${reg}`);
		loc.searchParams.set("digest", d);
		const r = await fetch(loc, { method: "PUT", body: b });
		if (r.status !== 201) throw new Error(`blob upload answered ${r.status}`);
		return { digest: d, size: b.length };
	};
	const layer = Buffer.from(`gate fixture ${label}\n`);
	const config = Buffer.from(
		JSON.stringify({
			architecture: "amd64",
			os: "linux",
			config: { Labels: { b: label } },
			rootfs: { type: "layers", diff_ids: [sha(layer)] },
		}),
	);
	const m = Buffer.from(
		JSON.stringify({
			schemaVersion: 2,
			mediaType: MANIFEST,
			config: { mediaType: "application/vnd.oci.image.config.v1+json", ...(await put(config)) },
			layers: [{ mediaType: "application/vnd.oci.image.layer.v1.tar", ...(await put(layer)) }],
		}),
	);
	const r = await fetch(`${base}/manifests/${label}`, {
		method: "PUT",
		body: m,
		headers: { "content-type": MANIFEST },
	});
	if (r.status !== 201) throw new Error(`manifest put answered ${r.status}`);
	return sha(m);
};

const serve = (portFile) => {
	const blobs = new Map(); // digest → Buffer
	const uploads = new Map(); // uuid → Buffer[]
	const manifests = new Map(); // `${repo}@${tag or digest}` → { type, body }
	const route = /^\/v2\/(.+)\/(blobs\/uploads|blobs|manifests|referrers|tags)\/?(.*)$/;
	const body = (req) =>
		new Promise((ok) => {
			const c = [];
			req.on("data", (d) => c.push(d));
			req.on("end", () => ok(Buffer.concat(c)));
		});
	const unknown = (res, code) => {
		res.writeHead(404, { "content-type": "application/json" });
		res.end(JSON.stringify({ errors: [{ code, message: code }] }));
	};
	createServer(async (req, res) => {
		const url = new URL(req.url ?? "/", "http://x");
		const data = await body(req);
		if (url.pathname === "/v2/" || url.pathname === "/v2") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end("{}");
			return;
		}
		const m = route.exec(url.pathname);
		if (!m) {
			unknown(res, "NAME_UNKNOWN");
			return;
		}
		const [, repo, kind, rest] = m;
		if (kind === "blobs/uploads") {
			const mount = url.searchParams.get("mount");
			if (req.method === "POST" && mount && blobs.has(mount)) {
				res.writeHead(201, {
					location: `/v2/${repo}/blobs/${mount}`,
					"docker-content-digest": mount,
				});
				res.end();
				return;
			}
			const id = req.method === "POST" ? randomUUID() : rest;
			if (!uploads.has(id) && req.method !== "POST") {
				unknown(res, "BLOB_UPLOAD_UNKNOWN");
				return;
			}
			if (req.method === "POST") uploads.set(id, []);
			const parts = uploads.get(id) ?? [];
			if (data.length) parts.push(data);
			const digest = url.searchParams.get("digest");
			if ((req.method === "PUT" || req.method === "POST") && digest) {
				const all = Buffer.concat(parts);
				if (sha(all) !== digest) {
					res.writeHead(400);
					res.end(JSON.stringify({ errors: [{ code: "DIGEST_INVALID" }] }));
					return;
				}
				blobs.set(digest, all);
				uploads.delete(id);
				res.writeHead(201, {
					location: `/v2/${repo}/blobs/${digest}`,
					"docker-content-digest": digest,
				});
				res.end();
				return;
			}
			const size = parts.reduce((n, p) => n + p.length, 0);
			res.writeHead(202, {
				location: `/v2/${repo}/blobs/uploads/${id}`,
				range: `0-${Math.max(size - 1, 0)}`,
				"docker-upload-uuid": id,
			});
			res.end();
			return;
		}
		if (kind === "blobs") {
			const b = blobs.get(rest);
			if (!b) {
				unknown(res, "BLOB_UNKNOWN");
				return;
			}
			res.writeHead(200, {
				"content-length": b.length,
				"docker-content-digest": rest,
				"content-type": "application/octet-stream",
			});
			res.end(req.method === "HEAD" ? undefined : b);
			return;
		}
		if (kind === "manifests") {
			if (req.method === "PUT") {
				const d = sha(data);
				const entry = { type: req.headers["content-type"] ?? MANIFEST, body: data };
				manifests.set(`${repo}@${d}`, entry);
				manifests.set(`${repo}@${rest}`, entry);
				res.writeHead(201, { location: `/v2/${repo}/manifests/${d}`, "docker-content-digest": d });
				res.end();
				return;
			}
			const e = manifests.get(`${repo}@${rest}`);
			if (!e) {
				unknown(res, "MANIFEST_UNKNOWN");
				return;
			}
			res.writeHead(200, {
				"content-type": e.type,
				"content-length": e.body.length,
				"docker-content-digest": sha(e.body),
			});
			res.end(req.method === "HEAD" ? undefined : e.body);
			return;
		}
		if (kind === "tags") {
			const tags = [...manifests.keys()]
				.filter((k) => k.startsWith(`${repo}@`) && !k.startsWith(`${repo}@sha256:`))
				.map((k) => k.slice(repo.length + 1));
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ name: repo, tags }));
			return;
		}
		unknown(res, "MANIFEST_UNKNOWN"); // referrers: this double holds none
	}).listen(0, "127.0.0.1", function () {
		const a = this.address();
		writeFileSync(portFile, `127.0.0.1:${typeof a === "object" && a ? a.port : 0}\n`);
	});
};

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "push") process.stdout.write(`${await push(args[0], args[1], args[2])}\n`);
else if (cmd) serve(cmd);
else {
	process.stderr.write(
		"usage: oci-registry.mjs <port file> | push <registry> <repository> <label>\n",
	);
	process.exit(2);
}
