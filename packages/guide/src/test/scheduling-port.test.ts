import { encodeSlot, type HoldInput, type SchedulingClient } from "@psi/scheduling";
import { describe, expect, it } from "vitest";
import { schedulingPort } from "../scheduling";

const PRACTITIONER = "k17abcdefghij";
const START = 1_794_000_000_000;

/** A client that records what the port asks of it. */
function recording(hold: Awaited<ReturnType<SchedulingClient["hold"]>>) {
	const held: HoldInput[] = [];
	const submitted: unknown[] = [];
	const released: unknown[] = [];
	const never = async (): Promise<never> => {
		throw new Error("not under test");
	};
	const client: SchedulingClient = {
		services: never,
		findSlots: never,
		cancel: never,
		requestCallback: never,
		async hold(input) {
			held.push(input);
			return hold;
		},
		async submit(input) {
			submitted.push(input);
			return {
				ok: true,
				reference: input.reference,
				cancelCode: "c".repeat(16),
				start: START,
				end: START + 3_600_000,
				mode: "onsite",
				timeZone: "Europe/Bucharest",
			};
		},
		async release(input) {
			released.push(input);
			return { ok: true };
		},
	};
	return { client, held, submitted, released };
}

const OK = {
	ok: true,
	reference: "ABCD2345",
	holdToken: "t".repeat(32),
	start: START,
	end: START + 3_600_000,
	mode: "onsite",
	expiresAt: START,
	practitionerName: "Dr. Test",
	timeZone: "Europe/Bucharest",
} as const;

describe("the engine's port for booking", () => {
	it("holds the slot an id names, as the guide's channel, in the visitor's language", async () => {
		const { client, held } = recording(OK);
		const port = schedulingPort(client);
		const slotId = encodeSlot({ practitioner: PRACTITIONER, start: START, mode: "onsite" });
		const result = await port.hold?.({
			tenant: "psizone",
			service: "evaluation",
			slotId,
			locale: "en",
		});
		expect(result).toEqual({
			ok: true,
			reference: "ABCD2345",
			holdToken: "t".repeat(32),
			start: START,
			practitionerName: "Dr. Test",
			timeZone: "Europe/Bucharest",
		});
		expect(held).toEqual([
			{
				tenant: "psizone",
				service: "evaluation",
				practitioner: PRACTITIONER,
				start: START,
				mode: "onsite",
				locale: "en",
				channel: "guide",
			},
		]);
	});

	it("a slot id that is not one is refused before the store is asked", async () => {
		const { client, held } = recording(OK);
		const port = schedulingPort(client);
		for (const slotId of ["", "tue10", "a.b.c", `${PRACTITIONER}.1.onsite`]) {
			const result = await port.hold?.({
				tenant: "psizone",
				service: "evaluation",
				slotId,
				locale: "ro",
			});
			expect(result, slotId).toEqual({ ok: false, reason: "not_offered" });
		}
		expect(held).toEqual([]);
	});

	it("the store's refusal is passed on as its reason", async () => {
		const { client } = recording({ ok: false, reason: "slot_taken" });
		const port = schedulingPort(client);
		const slotId = encodeSlot({ practitioner: PRACTITIONER, start: START, mode: "online" });
		expect(
			await port.hold?.({ tenant: "psizone", service: "evaluation", slotId, locale: "ro" }),
		).toEqual({
			ok: false,
			reason: "slot_taken",
		});
	});

	it("submits and releases through the client", async () => {
		const { client, submitted, released } = recording(OK);
		const port = schedulingPort(client);
		const contact = {
			name: "Ana Pop",
			email: "a@b.ro",
			phone: "+40722123456",
			age: 34,
			details: "ten characters",
		};
		const sent = await port.submit?.({
			reference: "ABCD2345",
			holdToken: "t".repeat(32),
			contact,
			audience: "adult",
		});
		expect(sent).toMatchObject({ ok: true, reference: "ABCD2345", cancelCode: "c".repeat(16) });
		expect(submitted).toEqual([
			{ reference: "ABCD2345", holdToken: "t".repeat(32), contact, audience: "adult" },
		]);
		await port.release?.({ reference: "ABCD2345", holdToken: "t".repeat(32) });
		expect(released).toEqual([{ reference: "ABCD2345", holdToken: "t".repeat(32) }]);
	});
});
