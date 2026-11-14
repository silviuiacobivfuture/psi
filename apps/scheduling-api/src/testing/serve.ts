import { createServer } from "node:http";
import type { Socket } from "node:net";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createWorld, type Populated } from "./populate";

export interface RunningApi {
	/** `http://127.0.0.1:<port>`: a real listening socket, so a client under test makes real HTTP calls. */
	url: string;
	world: Populated;
	/** A bearer token for a person of the populated world (what the local run's `/dev/token` hands out). */
	tokenFor(subject: string): Promise<string>;
	close(): Promise<void>;
}

/**
 * The service itself on a real port, in-process, on its in-memory adapters and the populated synthetic world, with the
 * local run's development routes (`/dev/token`, `/dev/people`). For tests of a client of the service; never started in
 * production (nothing in the server entry imports it). `grow` adds to the world before it listens (the load test grows
 * it to ten times the clinic).
 */
export async function startApi(
	options: { grow?: (world: Populated) => Promise<unknown> } = {},
): Promise<RunningApi> {
	const world = await createWorld();
	await options.grow?.(world);
	const outer = new Hono();
	outer.get("/dev/people", (c) =>
		c.json({
			root: "estate administrator",
			hugo: "owner of hemisync",
			olga: "owner",
			rita: "reception",
		}),
	);
	outer.post("/dev/token", async (c) => {
		const body: unknown = await c.req.json().catch(() => undefined);
		const subject =
			typeof body === "object" && body !== null
				? Object.getOwnPropertyDescriptor(body, "subject")?.value
				: undefined;
		if (typeof subject !== "string" || subject === "")
			return c.json({ error: "send {subject}" }, 400);
		return c.json({ token: await world.issuer.mint(subject, { expiresIn: 3600 }), subject });
	});
	const server = serve({ fetch: outer.fetch, port: 0, hostname: "127.0.0.1", createServer });
	outer.route("/", world.app);
	const sockets = new Set<Socket>();
	server.on("connection", (socket: Socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.once("listening", () => resolve()));
	const address = server.address();
	if (address === null || typeof address === "string")
		throw new Error("the test service has no address");
	return {
		url: `http://127.0.0.1:${address.port}`,
		world,
		tokenFor: (subject) => world.issuer.mint(subject, { expiresIn: 3600 }),
		close: () =>
			new Promise((resolve) => {
				for (const socket of sockets) socket.destroy();
				server.close(() => resolve());
			}),
	};
}
