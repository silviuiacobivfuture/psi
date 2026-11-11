/** The liveness answer: the server process is up (it touches no database). */
export function GET(): Response {
	return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
export const dynamic = "force-static";
