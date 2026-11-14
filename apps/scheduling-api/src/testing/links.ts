import { accountHashOf } from "@psi/scheduling";
import { bookAs } from "./booking";
import type { Populated } from "./populate";

const A = "/v1/apps/psizone";
let made = 0;

export interface Made {
	/** The suggestion's id: the account's hash. */
	id: string;
	clientId: string;
	email: string;
	phone: string;
}

/** A client of their own, with an e-mail and a phone no other client has. */
export async function linkableClient(
	w: Populated,
	name = "Link Client",
): Promise<{ clientId: string; email: string; phone: string }> {
	made += 1;
	const email = `link-${made}@example.test`;
	const phone = `0733 ${String(100_000 + made).slice(-6, -3)} ${String(100_000 + made).slice(-3)}`;
	const reply = await w.call("olga", "POST", `${A}/clients`, {
		name: `${name} ${made}`,
		contact: { email, phone },
	});
	if (reply.status !== 200) throw new Error(`client ${reply.status} ${JSON.stringify(reply.json)}`);
	return { clientId: String(reply.json.id), email, phone };
}

/**
 * A signed-in visitor books with a client's e-mail, which their sign-in does not vouch for (the site names them, nothing
 * more): the team is asked which client the account is.
 */
export async function suggestionFor(w: Populated, subject: string): Promise<Made> {
	const client = await linkableClient(w);
	await bookAs(w, subject, 0, { email: client.email, phone: "0799 000 001" });
	return { id: accountHashOf(subject), ...client };
}
