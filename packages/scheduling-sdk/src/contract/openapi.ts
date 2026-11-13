import { z } from "zod/v4";
import type { RouteSpec } from "./define";
import { ERROR_CODES, ErrorBody } from "./errors";

interface JsonSchema {
	properties?: Record<string, unknown>;
	required?: string[];
	[key: string]: unknown;
}

function schemaOf(schema: z.ZodType, io: "input" | "output"): JsonSchema {
	return z.toJSONSchema(schema, { io, unrepresentable: "any" });
}

function parameters(spec: RouteSpec): unknown[] {
	const out: unknown[] = [];
	const add = (schema: z.ZodObject | undefined, where: "path" | "query"): void => {
		if (schema === undefined) return;
		const json = schemaOf(schema, "input");
		for (const [name, value] of Object.entries(json.properties ?? {})) {
			out.push({
				name,
				in: where,
				required: where === "path" || (json.required ?? []).includes(name),
				schema: value,
			});
		}
	};
	add(spec.params, "path");
	add(spec.query, "query");
	return out;
}

/** The OpenAPI 3.1 document, generated from the route table: it cannot disagree with the server or the SDK. */
export function buildOpenApi(
	routes: ReadonlyArray<RouteSpec>,
	info: { title: string; version: string; serverUrl?: string },
): Record<string, unknown> {
	const paths: Record<string, Record<string, unknown>> = {};
	for (const spec of routes) {
		const path = spec.path.replace(/:(\w+)/g, "{$1}");
		const operation: Record<string, unknown> = {
			operationId: spec.id,
			summary: spec.summary,
			tags: [spec.id.split(".")[0]],
			parameters: parameters(spec),
			responses: {
				"200": spec.stream
					? {
							description: "A stream of events",
							content: { "text/event-stream": { schema: schemaOf(spec.response, "output") } },
						}
					: {
							description: "OK",
							content: { "application/json": { schema: schemaOf(spec.response, "output") } },
						},
				default: {
					description: `A refusal: ${ERROR_CODES.join(", ")}`,
					content: { "application/json": { schema: schemaOf(ErrorBody, "output") } },
				},
			},
			"x-side": spec.side,
		};
		if (spec.body !== undefined)
			operation.requestBody = {
				required: true,
				content: { "application/json": { schema: schemaOf(spec.body, "input") } },
			};
		if (spec.permission !== undefined) operation["x-permission"] = spec.permission.key;
		if (spec.side === "visitor") operation.security = [{ bearerAuth: [] }, { serviceKey: [] }];
		else if (spec.side === "team") operation.security = [{ bearerAuth: [] }];
		else operation.security = [];
		const entry = paths[path] ?? {};
		entry[spec.method.toLowerCase()] = operation;
		paths[path] = entry;
	}
	return {
		openapi: "3.1.0",
		info: { title: info.title, version: info.version },
		...(info.serverUrl === undefined ? {} : { servers: [{ url: info.serverUrl }] }),
		paths,
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
					description: "The estate's sign-in (Authentik OIDC).",
				},
				serviceKey: {
					type: "apiKey",
					in: "header",
					name: "x-service-key",
					description: "A service key, scoped to one app and the visitor routes.",
				},
			},
		},
	};
}
