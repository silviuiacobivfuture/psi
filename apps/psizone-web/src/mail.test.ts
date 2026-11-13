import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { readMailEnv } from "./mail-config";
import { createSmtpMailer, MailFailed } from "./mailer";

const base = {
	SMTP_HOST: "smtp.example.test",
	MAIL_FROM: "noreply@example.test",
	BOOKING_NOTIFY_TO: "a@example.test",
};

describe("the mail settings", () => {
	it("nothing set: not configured (not an error)", () => {
		expect(readMailEnv({})).toEqual({ ok: false, problem: "not_configured" });
		expect(readMailEnv({ SMTP_HOST: "", BOOKING_NOTIFY_TO: "" })).toEqual({
			ok: false,
			problem: "not_configured",
		});
	});

	it("the minimum: port 587, STARTTLS, no login, one recipient", () => {
		expect(readMailEnv(base)).toEqual({
			ok: true,
			config: {
				host: "smtp.example.test",
				port: 587,
				security: "starttls",
				auth: undefined,
				from: "noreply@example.test",
				notifyTo: ["a@example.test"],
			},
		});
	});

	it("a login, implicit TLS and several recipients, trimmed", () => {
		const read = readMailEnv({
			...base,
			SMTP_PORT: "465",
			SMTP_SECURITY: "tls",
			SMTP_USER: "plunk",
			SMTP_PASSWORD: "p",
			BOOKING_NOTIFY_TO: " a@example.test , b@example.test,",
		});
		expect(read).toMatchObject({
			ok: true,
			config: {
				port: 465,
				security: "tls",
				auth: { user: "plunk", pass: "p" },
				notifyTo: ["a@example.test", "b@example.test"],
			},
		});
	});

	it.each([
		["recipients missing", { BOOKING_NOTIFY_TO: undefined }, ["BOOKING_NOTIFY_TO"]],
		["host missing", { SMTP_HOST: undefined }, ["SMTP_HOST"]],
		[
			"a recipient that is not an address",
			{ BOOKING_NOTIFY_TO: "a@example.test, nope" },
			["BOOKING_NOTIFY_TO"],
		],
		[
			"more than ten recipients",
			{ BOOKING_NOTIFY_TO: Array.from({ length: 11 }, (_, i) => `u${i}@example.test`).join(",") },
			["BOOKING_NOTIFY_TO"],
		],
		["a sender that is not an address", { MAIL_FROM: "nope" }, ["MAIL_FROM"]],
		["sender missing", { MAIL_FROM: undefined }, ["MAIL_FROM"]],
		["a port out of range", { SMTP_PORT: "70000" }, ["SMTP_PORT"]],
		["a security mode that does not exist", { SMTP_SECURITY: "none" }, ["SMTP_SECURITY"]],
		["a user without a password", { SMTP_USER: "u" }, ["SMTP_PASSWORD"]],
		["a password without a user", { SMTP_PASSWORD: "p" }, ["SMTP_USER"]],
	])("%s is refused by key name, never by value", (_why, over, keys) => {
		const read = readMailEnv({ ...base, ...over });
		expect(read).toEqual({ ok: false, problem: "invalid", keys });
		expect(JSON.stringify(read)).not.toMatch(/nope|example\.test|70000/);
	});
});

describe("the SMTP mailer", () => {
	const servers: Server[] = [];
	afterEach(() => {
		for (const s of servers.splice(0)) s.close();
	});

	const mail = { to: ["a@example.test"], subject: "s", text: "t" };

	it("nothing listening: MailFailed with the transport's code, and no address in the message", async () => {
		const server = createServer();
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		const address = server.address();
		const port = typeof address === "object" && address !== null ? address.port : 0;
		await new Promise<void>((r) => server.close(() => r()));
		const mailer = createSmtpMailer({
			host: "127.0.0.1",
			port,
			security: "starttls",
			auth: undefined,
			from: "noreply@example.test",
			notifyTo: ["a@example.test"],
		});
		const error = await mailer.send(mail).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(MailFailed);
		expect((error as MailFailed).message).toMatch(/^mail could not be sent \([A-Z]+\)$/);
		expect((error as MailFailed).message).not.toContain("example.test");
	});

	it("a server without STARTTLS is refused and the password is never sent in clear", async () => {
		const received: string[] = [];
		const server = createServer((socket) => {
			socket.write("220 fake ESMTP\r\n");
			socket.on("data", (chunk) => {
				const text = chunk.toString();
				received.push(text);
				if (/^EHLO/i.test(text)) socket.write("250-fake\r\n250 AUTH PLAIN LOGIN\r\n");
				else socket.write("250 ok\r\n");
			});
		});
		servers.push(server);
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		const address = server.address();
		const port = typeof address === "object" && address !== null ? address.port : 0;
		const mailer = createSmtpMailer({
			host: "127.0.0.1",
			port,
			security: "starttls",
			auth: { user: "plunk", pass: "SECRET-PASSWORD" },
			from: "noreply@example.test",
			notifyTo: ["a@example.test"],
		});
		await expect(mailer.send(mail)).rejects.toBeInstanceOf(MailFailed);
		expect(received.join("")).not.toMatch(/AUTH|SECRET|DATA|MAIL FROM/i);
	});
});
