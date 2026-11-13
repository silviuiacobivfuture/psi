// The instance's first account, made by us — never by a stranger. A fresh AFFiNE answers
// POST /api/setup/create-admin-user to ANYONE until one account exists (AFFiNE
// core/selfhost/controller.ts), and makes that account the instance's administrator. So the
// moment the server is up, this job claims it for the estate operator (OPERATOR_EMAIL) with a
// password nobody is given (OpenBao apps/affine/app admin_password). The operator then signs
// in through Authentik and AFFiNE lands them on this same account, by e-mail.
//
// Idempotent: "First user already created" (403) is success — the instance is claimed.
// Anything else fails the job loudly, by status and message.
const base = process.env.AFFINE_URL ?? "http://affine:3010";
const email = process.env.ADMIN_EMAIL ?? "";
const password = process.env.ADMIN_PASSWORD ?? "";
for (const [k, v] of [
	["ADMIN_EMAIL", email],
	["ADMIN_PASSWORD", password],
]) {
	if (!v) {
		process.stderr.write(`MISSING REQUIRED SECRET: ${k}\n`);
		process.exit(1);
	}
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 90 && !up; i++) {
	try {
		up = (await fetch(`${base}/info`)).ok;
	} catch {
		up = false;
	}
	if (!up) await sleep(5000);
}
if (!up) {
	process.stderr.write(`FATAL: ${base}/info did not answer within 7.5 minutes\n`);
	process.exit(1);
}
const res = await fetch(`${base}/api/setup/create-admin-user`, {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ email, password, name: "Administrator" }),
});
const text = await res.text();
if (res.ok) {
	process.stdout.write(`first account created for ${email}: the instance is claimed\n`);
} else if (res.status === 403 && text.includes("First user already created")) {
	process.stdout.write("the instance already has its first account: nothing to do\n");
} else {
	process.stderr.write(`FATAL: create-admin-user answered ${res.status}: ${text.slice(0, 300)}\n`);
	process.exit(1);
}
