import * as migration_20261111_211933_initial from "./20261111_211933_initial";

export const migrations = [
	{
		up: migration_20261111_211933_initial.up,
		down: migration_20261111_211933_initial.down,
		name: "20261111_211933_initial",
	},
];
