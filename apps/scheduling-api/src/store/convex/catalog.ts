import { caller } from "./call";
import { clientsCollection } from "./clients";
import type { PartialCollections } from "./collections";
import { peopleCollection } from "./people";
import { devicesCollection, groupsCollection, roomsCollection } from "./resources";
import type { Rpc } from "./rpc";
import { servicesCollection } from "./services";

/**
 * The catalogue of an app: people, rooms, devices, group activities, services and clients, on the server-keyed
 * wrappers (`apiClients`, `apiResources`, `staffSetup`, `staffRooms`, `staffCatalog`) and `apiCatalogExtra`.
 * `clock` stamps what the service creates (the store keeps its own creation times).
 */
export function catalogCollections(rpc: Rpc, clock: () => number = Date.now): PartialCollections {
	const call = caller(rpc);
	return {
		people: peopleCollection(call),
		rooms: roomsCollection(call),
		devices: devicesCollection(call),
		groups: groupsCollection(call),
		services: servicesCollection(call),
		clients: clientsCollection(call, clock),
	};
}
