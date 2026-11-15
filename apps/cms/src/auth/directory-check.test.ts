import { describe, expect, it } from "vitest";
import {
	clientAccepted,
	type DirectoryAnswer,
	type DirectoryPerson,
	type DirectoryUsers,
	type Fetch,
	introspect,
	introspectionUrl,
	sweep,
} from "./directory-check";

const client = {
	issuer: "https://auth.psizone.ro/application/o/cms/",
	clientId: "cms-id",
	clientSecret: "s3cr:et",
};

type Call = { url: string; init: RequestInit };

function answering(status: number, body: string): { fetchFn: Fetch; calls: Call[] } {
	const calls: Call[] = [];
	const fetchFn: Fetch = async (url, init) => {
		calls.push({ url, init });
		return new Response(body, {
			status,
			headers: { "content-type": "application/json" },
		});
	};
	return { fetchFn, calls };
}

describe("introspect — asks the directory whether the person's token is still active", () => {
	it("posts the token to Authentik's introspection endpoint with the cms client's credentials", async () => {
		const { fetchFn, calls } = answering(200, '{"active":true}');
		expect(await introspect(client, "rt-1", fetchFn)).toBe("active");
		expect(calls).toHaveLength(1);
		const [call] = calls;
		expect(call?.url).toBe("https://auth.psizone.ro/application/o/introspect/");
		expect(call?.init.method).toBe("POST");
		const headers = new Headers(call?.init.headers);
		expect(headers.get("authorization")).toBe(
			`Basic ${Buffer.from("cms-id:s3cr%3Aet").toString("base64")}`,
		);
		const body = new URLSearchParams(String(call?.init.body));
		expect(body.get("token")).toBe("rt-1");
		expect(body.get("token_type_hint")).toBe("refresh_token");
	});

	it("an inactive token (deleted when the person was disabled) is inactive", async () => {
		expect(await introspect(client, "rt", answering(200, '{"active":false}').fetchFn)).toBe(
			"inactive",
		);
	});

	it.each([
		["the directory refuses the client", 401, '{"active":false}'],
		["the directory fails", 500, "oops"],
		["a gateway answers", 502, "<html>"],
		["the reply is not JSON", 200, "not json"],
		["the reply has no verdict", 200, '{"sub":"x"}'],
		["the verdict is not a boolean", 200, '{"active":"false"}'],
	])("unknown when %s — never a sign-out on an answer not given", async (_l, status, body) => {
		expect(await introspect(client, "rt", answering(status, body).fetchFn)).toBe("unknown");
	});

	it("unknown when the directory cannot be reached", async () => {
		const down: Fetch = async () => {
			throw new TypeError("fetch failed");
		};
		expect(await introspect(client, "rt", down)).toBe("unknown");
	});

	it("derives the endpoint from any issuer on the directory's host", () => {
		expect(introspectionUrl("https://sso.example.ro/application/o/x/")).toBe(
			"https://sso.example.ro/application/o/introspect/",
		);
	});
});

function store(people: DirectoryPerson[]): DirectoryUsers & { ended: DirectoryPerson["id"][] } {
	const ended: DirectoryPerson["id"][] = [];
	return {
		ended,
		signedIn: async () => people,
		endSessions: async (id) => {
			ended.push(id);
		},
	};
}

const ana: DirectoryPerson = {
	id: 1,
	email: "ana@psizone.ro",
	directoryToken: "t-ana",
};
const ion: DirectoryPerson = {
	id: 2,
	email: "ion@psizone.ro",
	directoryToken: "t-ion",
};
const eva: DirectoryPerson = {
	id: 3,
	email: "eva@psizone.ro",
	directoryToken: "t-eva",
};

describe("sweep — ends the sessions of people the directory disabled, and only theirs", () => {
	it("no one signed in: nothing asked, nothing ended", async () => {
		const users = store([]);
		const asked: string[] = [];
		let probed = 0;
		const r = await sweep(
			users,
			async (t) => {
				asked.push(t);
				return "active";
			},
			async () => {
				probed += 1;
				return true;
			},
		);
		expect(r).toEqual({ asked: 0, ended: [], unknown: 0, trusted: true });
		expect(probed).toBe(0);
		expect(asked).toEqual([]);
		expect(users.ended).toEqual([]);
	});

	it("asks once per person, with that person's token", async () => {
		const asked: string[] = [];
		await sweep(
			store([ana, ion]),
			async (t) => {
				asked.push(t);
				return "active";
			},
			accepted,
		);
		expect(asked).toEqual(["t-ana", "t-ion"]);
	});

	it("active, inactive and unknown side by side: only the inactive one is signed out", async () => {
		const verdict: Record<string, DirectoryAnswer> = {
			"t-ana": "active",
			"t-ion": "inactive",
			"t-eva": "unknown",
		};
		const users = store([ana, ion, eva]);
		const r = await sweep(users, async (t) => verdict[t] ?? "unknown", accepted);
		expect(r).toEqual({ asked: 3, ended: ["ion@psizone.ro"], unknown: 1, trusted: true });
		expect(users.ended).toEqual([2]);
	});

	it("the directory down for everyone: nobody is signed out", async () => {
		const users = store([ana, ion]);
		const r = await sweep(users, async () => "unknown", accepted);
		expect(r.unknown).toBe(2);
		expect(users.ended).toEqual([]);
	});

	it("the directory refuses the cms client: nobody is asked, nobody is signed out", async () => {
		const users = store([ana, ion]);
		const asked: string[] = [];
		const r = await sweep(
			users,
			async (t) => {
				asked.push(t);
				return "inactive";
			},
			async () => false,
		);
		expect(r).toEqual({ asked: 0, ended: [], unknown: 2, trusted: false });
		expect(asked).toEqual([]);
		expect(users.ended).toEqual([]);
	});
});

const accepted = async (): Promise<boolean> => true;

describe("clientAccepted — the directory knows the cms client (so an inactive answer is about the token)", () => {
	it("400 invalid_grant for a token nobody holds: accepted; the probe is a refresh with the client's own credentials", async () => {
		const { fetchFn, calls } = answering(400, '{"error":"invalid_grant","error_description":"x"}');
		expect(await clientAccepted(client, fetchFn, "probe-1")).toBe(true);
		expect(calls[0]?.url).toBe("https://auth.psizone.ro/application/o/token/");
		const body = new URLSearchParams(String(calls[0]?.init.body));
		expect(body.get("grant_type")).toBe("refresh_token");
		expect(body.get("refresh_token")).toBe("probe-1");
		expect(new Headers(calls[0]?.init.headers).get("authorization")).toMatch(/^Basic /);
	});

	it.each([
		["the client is refused", 400, '{"error":"invalid_client"}'],
		["the client is refused with 401", 401, '{"error":"invalid_client"}'],
		["the directory fails", 500, "oops"],
		["an unexpected success", 200, '{"access_token":"x"}'],
		["an unreadable refusal", 400, "<html>"],
		["a refusal without an error", 400, "{}"],
	])("not accepted when %s", async (_l, status, body) => {
		expect(await clientAccepted(client, answering(status, body).fetchFn, "p")).toBe(false);
	});

	it("not accepted when the directory cannot be reached", async () => {
		const down: Fetch = async () => {
			throw new TypeError("fetch failed");
		};
		expect(await clientAccepted(client, down, "p")).toBe(false);
	});
});
