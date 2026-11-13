import type { ClinicPort, PortSource } from "./port";

/** One port for everyone: the in-memory fake serves every person alike. */
export const fixedPort = (port: ClinicPort): PortSource => ({ forPerson: async () => port });
