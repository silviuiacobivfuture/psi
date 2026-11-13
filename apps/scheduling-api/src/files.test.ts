import {
	FILE_MAX_BYTES,
	FILE_TYPES,
	FileInitResult,
	FileRemoveQuery,
} from "@psi/scheduling-sdk/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ok, type Populated } from "./testing/populate";
import type { Reply } from "./testing/world";
import { worldFactories } from "./testing/worlds";

const A = "/v1/apps/psizone";
const factories = await worldFactories();
const err = (r: Reply): { code: string; detail?: Record<string, unknown> } =>
	r.json.error as { code: string; detail?: Record<string, unknown> };

describe.each(factories)("client files, on the $name store", (factory) => {
	let w: Populated;
	const as = (who: string | null, method: string, path: string, body?: unknown) =>
		w.call(who, method, `${A}${path}`, body);
	const tuplesOf = (file: string): string[] =>
		w.authz
			.tuples()
			.filter((t) => t.object === `sched_file:${file}`)
			.map((t) => `${t.relation}|${t.user}`);

	/** A call that must be refused: the status, optionally the code, and NOTHING moved anywhere (rows, audit, tuples, objects). */
	async function refused(run: () => Promise<Reply>, status: number, code?: string): Promise<Reply> {
		const before = await w.fingerprint();
		const reply = await run();
		expect(reply.status, JSON.stringify(reply.json)).toBe(status);
		if (code !== undefined) expect(err(reply).code).toBe(code);
		expect(await w.fingerprint(), "a refusal wrote something").toBe(before);
		return reply;
	}
	const announce = async (
		over: Record<string, unknown> = {},
		who: string | null = "olga",
		client = w.ids.c1,
	) =>
		as(who, "POST", `/clients/${client}/files`, {
			name: "scan.pdf",
			contentType: "application/pdf",
			size: 40,
			...over,
		});
	const started = async (over: Record<string, unknown> = {}) =>
		FileInitResult.parse(ok(await announce(over), "announce"));
	/** An announced file whose bytes have arrived, as announced. */
	async function uploaded(over: { size?: number; type?: string } = {}) {
		const made = await started({
			...(over.size === undefined ? {} : { size: over.size }),
			...(over.type === undefined ? {} : { contentType: over.type }),
		});
		await w.objects.upload(made.upload.url, made.file.size, made.file.contentType);
		return made;
	}
	const stored = (made: Awaited<ReturnType<typeof started>>): boolean =>
		[...w.objects.stored.keys()].some((k) => made.upload.url.includes(k));

	beforeAll(async () => {
		w = await factory.create();
	});
	afterAll(async () => {
		await factory.cleanup();
	});

	describe("announcing an upload", () => {
		it("accepts every type of the list, and answers a pending file with a signed PUT for its own key", async () => {
			for (const contentType of FILE_TYPES) {
				const made = await started({ contentType });
				expect(made.file).toMatchObject({
					status: "pending",
					contentType,
					clientId: w.ids.c1,
					uploadedBy: "olga",
				});
				expect(made.upload.method).toBe("PUT");
				expect(made.upload.url).toContain(`psizone/${w.ids.c1}/`);
				expect(tuplesOf(made.file.id)).toHaveLength(2);
			}
		});

		it("accepts the largest size and refuses one byte more, a zero, a fraction and a negative: nothing is written", async () => {
			expect((await announce({ size: FILE_MAX_BYTES })).status).toBe(200);
			for (const size of [FILE_MAX_BYTES + 1, 0, -1, 1.5, Number.NaN, "40"])
				await refused(() => announce({ size }), 400, "invalid");
		});

		it.each([
			"application/x-msdownload",
			"text/html",
			"image/svg+xml",
			"application/javascript",
			"APPLICATION/PDF",
			"application/pdf; charset=binary",
			"",
			"pdf",
		])("refuses the type %j: nothing is written", async (contentType) => {
			await refused(() => announce({ contentType }), 400, "invalid");
		});

		it("refuses a missing or blank name, a missing size and an unknown field is dropped", async () => {
			await refused(() => announce({ name: "   " }), 400, "invalid");
			await refused(() => announce({ name: undefined }), 400, "invalid");
			await refused(() => announce({ size: undefined }), 400, "invalid");
			await refused(() => announce({ name: "x".repeat(201) }), 400, "invalid");
			expect((await announce({ name: "ünïcode — nume.pdf", ignored: true })).status).toBe(200);
		});

		it("refuses a client that is not there, and a caller who may not upload, each leaving nothing", async () => {
			await refused(() => announce({}, "olga", "nope-client"), 404, "not_found");
			// Reception holds no file permission at all; a therapist may upload for their own clients only. The service
			// does not say whether the client exists to someone with no reach into it.
			await refused(() => announce({}, "rita"), 404, "not_found");
			await refused(() => announce({}, "dora", w.ids.c2), 404, "not_found");
			await refused(() => announce({}, null), 401);
		});

		it("is a 503 without object storage, writing nothing", async () => {
			const held = w.deps.objects;
			w.deps.objects = undefined;
			try {
				await refused(() => announce(), 503, "unavailable");
			} finally {
				w.deps.objects = held;
			}
		});
	});

	describe("completing", () => {
		it("verifies the stored object, makes the file ready, and the file can then be downloaded", async () => {
			const made = await uploaded();
			const done = await as("olga", "POST", `/files/${made.file.id}/complete`);
			expect(done.status, JSON.stringify(done.json)).toBe(200);
			expect(done.json).toMatchObject({ id: made.file.id, status: "ready" });
			const listed = (await as("olga", "GET", `/clients/${w.ids.c1}/files`)).json.items as {
				id: string;
				status: string;
			}[];
			expect(listed.find((f) => f.id === made.file.id)?.status).toBe("ready");
			expect((await as("olga", "GET", `/files/${made.file.id}/download`)).status).toBe(200);
		});

		it("completing twice is the same as once: the file is left exactly as the first time made it", async () => {
			const made = await uploaded();
			const held = async () =>
				(
					(await as("olga", "GET", `/clients/${w.ids.c1}/files`)).json.items as { id: string }[]
				).find((f) => f.id === made.file.id);
			expect((await as("olga", "POST", `/files/${made.file.id}/complete`)).status).toBe(200);
			const once = await held();
			const again = await as("olga", "POST", `/files/${made.file.id}/complete`);
			expect(again.status).toBe(200);
			expect(again.json).toMatchObject({ id: made.file.id, status: "ready" });
			expect(await held()).toEqual(once);
		});

		it("refuses when no bytes have arrived, leaves the file pending, and works once they have", async () => {
			const made = await started();
			const r = await refused(() => as("olga", "POST", `/files/${made.file.id}/complete`), 409);
			expect(err(r)).toMatchObject({ code: "conflict", detail: { reason: "missing" } });
			expect((await as("olga", "GET", `/files/${made.file.id}/download`)).status).toBe(409);
			await w.objects.upload(made.upload.url, made.file.size, made.file.contentType);
			expect((await as("olga", "POST", `/files/${made.file.id}/complete`)).status).toBe(200);
		});

		it.each([
			["more bytes than announced", { size: 41, type: "application/pdf" }, "size_mismatch"],
			["fewer bytes than announced", { size: 39, type: "application/pdf" }, "size_mismatch"],
			["another type than announced", { size: 40, type: "image/png" }, "type_mismatch"],
		] as const)("rejects an upload with %s: the object and the file are discarded, with their tuples", async (_what, put, reason) => {
			const made = await started();
			await w.objects.upload(made.upload.url, put.size, put.type);
			expect(stored(made)).toBe(true);
			const r = await as("olga", "POST", `/files/${made.file.id}/complete`);
			expect(r.status).toBe(409);
			expect(err(r)).toMatchObject({ code: "conflict", detail: { reason } });
			expect(stored(made)).toBe(false);
			expect(
				(
					(await as("olga", "GET", `/clients/${w.ids.c1}/files`)).json.items as { id: string }[]
				).map((f) => f.id),
			).not.toContain(made.file.id);
			expect(tuplesOf(made.file.id)).toEqual([]);
			expect((await as("olga", "GET", `/files/${made.file.id}/download`)).status).toBe(404);
			const trail = (await as("olga", "GET", "/audit?action=file.delete")).json.items as {
				target: { id: string };
				detail?: { reason?: string };
			}[];
			expect(trail.some((e) => e.target.id === made.file.id)).toBe(true);
		});

		it("refuses a caller who may not upload, a file that is not there and no sign-in, writing nothing", async () => {
			const made = await uploaded();
			await refused(() => as("rita", "POST", `/files/${made.file.id}/complete`), 404, "not_found");
			await refused(() => as("olga", "POST", "/files/nope-file/complete"), 404, "not_found");
			await refused(() => as(null, "POST", `/files/${made.file.id}/complete`), 401);
			expect(stored(made)).toBe(true);
		});

		it("is a 503 without object storage, leaving the file pending", async () => {
			const made = await uploaded();
			const held = w.deps.objects;
			w.deps.objects = undefined;
			try {
				await refused(() => as("olga", "POST", `/files/${made.file.id}/complete`), 503);
			} finally {
				w.deps.objects = held;
			}
		});
	});

	describe("deleting", () => {
		it("needs confirm=true: without it, or with anything else, the file, its bytes and its tuples stay", async () => {
			const made = await uploaded();
			await as("olga", "POST", `/files/${made.file.id}/complete`);
			for (const q of [
				"",
				"?confirm=false",
				"?confirm=yes",
				"?confirm=",
				"?confirm=TRUE",
				"?confirm=1",
			])
				await refused(() => as("olga", "DELETE", `/files/${made.file.id}${q}`), 400, "invalid");
			expect(stored(made)).toBe(true);
			expect(tuplesOf(made.file.id)).toHaveLength(2);
		});

		it("with confirm=true removes the bytes, the row and the tuples, and says so in the audit log", async () => {
			const made = await uploaded();
			await as("olga", "POST", `/files/${made.file.id}/complete`);
			const gone = await as("olga", "DELETE", `/files/${made.file.id}?confirm=true`);
			expect(gone.status, JSON.stringify(gone.json)).toBe(200);
			expect(gone.json).toEqual({ ok: true });
			expect(stored(made)).toBe(false);
			expect(tuplesOf(made.file.id)).toEqual([]);
			expect((await as("olga", "GET", `/files/${made.file.id}/download`)).status).toBe(404);
			expect(
				(
					(await as("olga", "GET", `/clients/${w.ids.c1}/files`)).json.items as { id: string }[]
				).map((f) => f.id),
			).not.toContain(made.file.id);
			const trail = (await as("olga", "GET", "/audit?action=file.delete")).json.items as {
				target: { id: string };
				actor: { subject: string };
			}[];
			expect(trail.find((e) => e.target.id === made.file.id)?.actor.subject).toBe("olga");
		});

		it("a pending file can be deleted too, and deleting twice is a 404 that writes nothing", async () => {
			const made = await started();
			expect((await as("olga", "DELETE", `/files/${made.file.id}?confirm=true`)).status).toBe(200);
			await refused(
				() => as("olga", "DELETE", `/files/${made.file.id}?confirm=true`),
				404,
				"not_found",
			);
		});

		it("refuses a caller who may not delete, however they confirm: the file stays", async () => {
			const made = await uploaded();
			await as("olga", "POST", `/files/${made.file.id}/complete`);
			// A therapist may view and upload, never delete; reception holds nothing; nobody signed in is refused first.
			await refused(
				() => as("dora", "DELETE", `/files/${made.file.id}?confirm=true`),
				404,
				"not_found",
			);
			await refused(
				() => as("rita", "DELETE", `/files/${made.file.id}?confirm=true`),
				404,
				"not_found",
			);
			await refused(() => as(null, "DELETE", `/files/${made.file.id}?confirm=true`), 401);
			expect(stored(made)).toBe(true);
			expect((await as("olga", "GET", `/files/${made.file.id}/download`)).status).toBe(200);
		});
	});

	it("the contract's confirm parameter accepts only the word true", () => {
		expect(FileRemoveQuery.safeParse({ confirm: "true" }).success).toBe(true);
		for (const confirm of ["false", "", "True", "1", true, undefined])
			expect(FileRemoveQuery.safeParse({ confirm }).success, String(confirm)).toBe(false);
	});
});
