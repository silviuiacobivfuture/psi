import type { Localised } from "./localised";

/**
 * DRAFT — owner review pending. The rooms of the centre as listed on the old psizone.ro concept
 * page (read 2026-11-12). Counts are left out on purpose: the owners' own accounts of how many
 * rooms there are differ (see content/trust.ts).
 */
export const ROOMS: ReadonlyArray<Localised> = [
	{ ro: "Cabinete de psihoterapie", en: "Psychotherapy rooms" },
	{ ro: "Cabinete de neurofeedback", en: "Neurofeedback rooms" },
	{ ro: "Cabinet de mapping cerebral (QEEG)", en: "A brain-mapping (QEEG) room" },
	{
		ro: "Cabinet de TMS (stimulare magnetică transcraniană)",
		en: "A TMS (transcranial magnetic stimulation) room",
	},
	{ ro: "Cabinete pentru terapia ABA", en: "Rooms for ABA therapy" },
	{ ro: "Cabinete de logopedie", en: "Speech therapy rooms" },
	{
		ro: "O sală pentru terapie de grup și workshopuri",
		en: "A room for group therapy and workshops",
	},
	{ ro: "Un cabinet de integrare polisenzorială", en: "A multisensory integration room" },
	{ ro: "Un cabinet de reeducare fizică și masaj", en: "A physical re-education and massage room" },
];

/** The two photographs of the rooms, from the old site, with their words. */
export const ROOM_PHOTOS: ReadonlyArray<{
	file: string;
	width: number;
	height: number;
	alt: Localised;
}> = [
	{
		file: "sensory-immersive-room",
		width: 1600,
		height: 1200,
		alt: {
			ro: "Camera de stimulare polisenzorială: pe pereți se proiectează un apus pe mare, iar în fața lor cineva stă cu brațele ridicate.",
			en: "The multisensory stimulation room: a sunset over the sea is projected on the walls, and in front of it someone stands with their arms raised.",
		},
	},
	{
		file: "neurofeedback-room",
		width: 1178,
		height: 872,
		alt: {
			ro: "Un cabinet de neurofeedback: un copil cu căști în fața unui monitor, iar un specialist urmărește înregistrarea pe laptop.",
			en: "A neurofeedback room: a child with headphones in front of a monitor while a specialist follows the recording on a laptop.",
		},
	},
];
