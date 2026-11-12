import type { Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import type { Localised } from "./localised";

/** A portrait file from the old psizone.ro, converted to webp (public/images/old-site). */
export interface Portrait {
	file: string;
	width: number;
	height: number;
}

export interface Member {
	/** A proper noun, never translated. */
	name: string;
	role: (o: { locale: Locale }) => string;
	/** The member's own photo as the centre published it; none means the card keeps the initials. */
	portrait?: Portrait;
	/** What the centre published about their path: one paragraph. */
	bio?: Localised;
	/** The training listed on the old team page, one line each. */
	trainings?: ReadonlyArray<Localised>;
}

const text =
	(x: Localised) =>
	(o: { locale: Locale }): string =>
		x[o.locale];

/**
 * DRAFT — owner review pending. The team as published on psizone.ro/echipa-psizone (read
 * 2026-11-12): names, roles, portraits and, for the two founders, the training they list. Roles are
 * the ones each person states there; nothing is added. Personal e-mail addresses are left out (the
 * old page hides them behind an obfuscation; the centre's contact data lives on /contact).
 */
export const TEAM: ReadonlyArray<Member> = [
	{
		name: "Daniela Turcu",
		role: (o) => m.role_daniela({}, o),
		portrait: { file: "team-daniela-turcu-square", width: 320, height: 320 },
		bio: {
			ro: "Psiholog specialist, acreditat de Colegiul Psihologilor din România, cu drept de liberă practică și peste 20 de ani de experiență în evaluare psihologică și intervenție pentru copii și adulți. Este neuroterapeut certificat în Metoda ILF Othmer (acreditată de BeeMedic Germany) și folosește neurofeedbackul, susținut de evaluări QEEG, în tulburări de neurodezvoltare și de reglare neuropsihică. Face cercetare doctorală despre recuperarea copiilor cu tulburări de neurodezvoltare, coordonează proiectele „Race Me Up” și „Senior Activ – Fizic și Mental” și este administratorul centrului.",
			en: "A specialist psychologist accredited by the Romanian College of Psychologists, licensed to practise independently, with over 20 years of experience in psychological assessment and intervention for children and adults. She is a neurotherapist certified in the ILF Othmer Method (accredited by BeeMedic Germany) and uses neurofeedback, backed by QEEG evaluations, for neurodevelopmental and neuropsychic regulation difficulties. She does doctoral research on the recovery of children with neurodevelopmental disorders, coordinates the “Race Me Up” and “Senior Activ – Fizic și Mental” projects, and is the centre's administrator.",
		},
		trainings: [
			{ ro: "Terapii cognitiv-comportamentale (TCC)", en: "Cognitive-behavioural therapies (CBT)" },
			{ ro: "Hipnoză clinică", en: "Clinical hypnosis" },
			{ ro: "Terapii de integrare neurosenzorială", en: "Neurosensory integration therapies" },
			{
				ro: "Terapie ABA, intervenții specializate pentru TSA",
				en: "ABA therapy, specialised interventions for ASD",
			},
			{
				ro: "Neurofeedback, Metoda Othmer (ILF, Alpha-Theta, Synchrony), BeeMedic Germany",
				en: "Neurofeedback, the Othmer Method (ILF, Alpha-Theta, Synchrony), BeeMedic Germany",
			},
			{
				ro: "QEEG, evaluare neurofuncțională cantitativă",
				en: "QEEG, quantitative neurofunctional assessment",
			},
			{ ro: "Psihologie sportivă", en: "Sport psychology" },
			{ ro: "Psiho-oncologie", en: "Psycho-oncology" },
			{
				ro: "Terapii asistate de animale (câini și cai)",
				en: "Animal-assisted therapies (dogs and horses)",
			},
		],
	},
	{
		name: "Adrian Turcu",
		role: (o) => m.role_adrian({}, o),
		portrait: { file: "team-adrian-turcu-square", width: 320, height: 320 },
		bio: {
			ro: "Psiholog clinician și psihoterapeut, acreditat de Colegiul Psihologilor din România, cu drept de liberă practică. Se ocupă de diagnosticare și tratament psihoterapeutic la copii și adulți, are 20 de ani de activitate și este trainer. Face cercetare doctorală despre recuperarea copiilor cu autism și ADHD.",
			en: "A clinical psychologist and psychotherapist accredited by the Romanian College of Psychologists, licensed to practise independently. He handles diagnosis and psychotherapeutic treatment for children and adults, has 20 years of practice and is a trainer. He does doctoral research on the recovery of children with autism and ADHD.",
		},
		trainings: [
			{ ro: "Terapii cognitiv-comportamentale", en: "Cognitive-behavioural therapies" },
			{ ro: "Hipnoză clinică", en: "Clinical hypnosis" },
			{ ro: "Terapie sistemică de familie și cuplu", en: "Systemic family and couple therapy" },
			{ ro: "Terapii de integrare neurosenzorială", en: "Neurosensory integration therapies" },
			{
				ro: "Terapii cognitiv-comportamentale, metoda ABA (monitor și trainer)",
				en: "Cognitive-behavioural therapies, the ABA method (monitor and trainer)",
			},
			{
				ro: "Neurofeedback / EEG-biofeedback, Metoda Othmer (ILF, Alpha-Theta, Synchrony), acreditat BeeMedic Germany prin Neurofeedback Romania",
				en: "Neurofeedback / EEG-biofeedback, the Othmer Method (ILF, Alpha-Theta, Synchrony), accredited by BeeMedic Germany through Neurofeedback Romania",
			},
			{ ro: "Psiho-oncologie, formare continuă", en: "Psycho-oncology, continuing training" },
		],
	},
	{
		name: "Iuliana Mușat",
		role: text({ ro: "Asistent manager", en: "Assistant manager" }),
		portrait: { file: "team-iuliana-musat-square", width: 320, height: 320 },
		bio: {
			ro: "Se ocupă de organizarea programărilor și de buna desfășurare a activităților zilnice ale centrului și îi sprijină pe clienți și pe echipă.",
			en: "She organises appointments and keeps the centre's daily activities running well, supporting clients and the team.",
		},
	},
	{
		name: "Nicoleta Năfureanu",
		role: text({ ro: "Terapie recuperatorie", en: "Recovery therapy" }),
		portrait: { file: "team-nicoleta-nafureanu-square", width: 320, height: 320 },
		bio: {
			ro: "În terapia recuperatorie pune accent pe calm, răbdare și empatie, completate de organizare și perseverență, și susține progresul printr-o abordare clară, adaptată fiecărei persoane.",
			en: "In recovery therapy she puts the emphasis on calm, patience and empathy, backed by organisation and perseverance, and supports progress through a clear approach adapted to each person.",
		},
	},
	{
		name: "Marica Sîrbu",
		role: text({ ro: "Terapeut de recuperare", en: "Recovery therapist" }),
		portrait: { file: "team-marica-sirbu-square", width: 320, height: 320 },
		bio: {
			ro: "Aplică programele de intervenție stabilite, adaptându-le nevoilor fiecărei persoane și susținând recuperarea pas cu pas, într-un cadru sigur și echilibrat.",
			en: "She applies the intervention programmes that have been set, adapting them to each person's needs and supporting recovery step by step, in a safe and balanced setting.",
		},
	},
	{
		name: "Georgiana Gheorghiță",
		role: text({ ro: "Recuperare motrică și masaj", en: "Motor recovery and massage" }),
		portrait: { file: "team-georgiana-gheorghita-square", width: 320, height: 320 },
		bio: {
			ro: "Lucrează în zona recuperării motrice: susține echilibrul, postura și coordonarea prin intervenții de suport și tehnici de masaj.",
			en: "She works in motor recovery: supporting balance, posture and coordination through supportive interventions and massage techniques.",
		},
	},
	{
		name: "Ecaterina Drăgan",
		role: text({ ro: "Întreținerea spațiului", en: "Care of the space" }),
		portrait: { file: "team-ecaterina-dragan-square", width: 320, height: 320 },
		bio: {
			ro: "Susține zilnic funcționarea centrului, păstrând un spațiu care oferă siguranță, ordine și confort tuturor beneficiarilor și specialiștilor.",
			en: "She keeps the centre running every day, maintaining a space that offers safety, order and comfort to every client and specialist.",
		},
	},
];
