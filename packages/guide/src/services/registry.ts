import { isRetired } from "@psi/content";
import type { Brand } from "../contract";
import type { Need } from "./needs";

type Text = Readonly<{ ro: string; en: string }>;

/**
 * One service, programme or route the guides may recommend, written from the sites' own words
 * (never beyond them): the hubs' and methods' leads (apps/psizone-web/src/content), the first-visit
 * steps (visit.ts), the EQ-SYNC and Hemi-Sync pages (packages/knowledge/src/seed). A field the
 * sites do not document is left out (the price, how long a session lasts), never guessed. The
 * prices come from the CMS offerings at answer time (`match` pairs an offering to its service).
 */
export interface ServiceDef {
	id: string;
	brand: Brand;
	needs: ReadonlyArray<Need>;
	name: Text;
	forWhom: Text;
	whatHappens: Text;
	firstStep: Text;
	/** Other names a reply says it by (folded on match), per language. */
	aka: Readonly<{ ro: ReadonlyArray<string>; en: ReadonlyArray<string> }>;
	/** The Romanian path on the brand's site, served under `/en` for English. */
	path: string;
	/** Folded word beginnings of the offering titles that price this service. */
	match: ReadonlyArray<string>;
	/** The word a booking message uses for it ("evaluare"), when it can be booked in the chat. */
	bookingWord?: Text;
	/** How the first step is taken. */
	start: "booking" | "page";
	/** The button's words, when "See the page" is not what the step is. */
	cta?: Text;
}

const FIRST_VISIT: Text = {
	ro: "La telefon sau în chat ne spui ce te îngrijorează, iar noi îți spunem ce urmează și cât costă; prima discuție e despre voi, nu despre diagnostic.",
	en: "By phone or in the chat you tell us what worries you, and we tell you what comes next and what it costs; the first conversation is about you, not about a diagnosis.",
};

/** Every service ever declared, retired sites' included (revival re-lists them). */
export const DECLARED_SERVICES: ReadonlyArray<ServiceDef> = [
	{
		id: "psizone-speech",
		brand: "psizone",
		needs: ["child-development"],
		name: { ro: "Logopedia", en: "Speech therapy" },
		forWhom: {
			ro: "Părinți îngrijorați că cel mic nu vorbește încă sau vorbește mai puțin decât ceilalți copii.",
			en: "Parents worried that their little one is not talking yet or talks less than other children.",
		},
		whatHappens: {
			ro: "Terapia limbajului și a vorbirii, în planul unic al copilului. Pornim de la o evaluare, ca să vedem unde e copilul acum.",
			en: "Language and speech therapy, inside the child's one plan. We start from an evaluation, to see where the child is now.",
		},
		firstStep: FIRST_VISIT,
		aka: { ro: ["logopedie", "logoped"], en: ["speech therapy"] },
		path: "/copii/logopedie",
		match: ["logoped", "speech"],
		bookingWord: { ro: "logopedie", en: "speech" },
		start: "booking",
	},
	{
		id: "psizone-autism",
		brand: "psizone",
		needs: ["child-development"],
		name: { ro: "Evaluarea pentru autism și planul ABA", en: "The autism evaluation and ABA plan" },
		forWhom: {
			ro: "Părinți care observă primele semne ale unei dezvoltări diferite sau care au deja un diagnostic de TSA.",
			en: "Parents who notice early signs of different development, or who already have an ASD diagnosis.",
		},
		whatHappens: {
			ro: "Evaluarea, apoi un plan ABA (analiza aplicată a comportamentului) în care se explică pe înțeles ce urmează.",
			en: "The evaluation, then an ABA plan (applied behaviour analysis) that explains in plain words what comes next.",
		},
		firstStep: FIRST_VISIT,
		aka: { ro: ["ABA", "evaluarea pentru autism"], en: ["ABA", "autism evaluation"] },
		path: "/copii/autism",
		match: ["aba", "autism"],
		bookingWord: { ro: "evaluare", en: "evaluation" },
		start: "booking",
	},
	{
		id: "psizone-adhd",
		brand: "psizone",
		needs: ["child-development", "teen-support"],
		name: {
			ro: "Evaluarea și sprijinul pentru atenție (ADHD)",
			en: "Evaluation and support for attention (ADHD)",
		},
		forWhom: {
			ro: "Copii și adolescenți cu probleme de atenție, energie sau la școală, și părinții lor.",
			en: "Children and teens with trouble with attention, energy or school, and their parents.",
		},
		whatHappens: {
			ro: "Pornim de la evaluare și facem un plan; în planurile noastre intră, după caz, psihoterapia și neurofeedback-ul.",
			en: "We start from the evaluation and make a plan; our plans include, as needed, psychotherapy and neurofeedback.",
		},
		firstStep: FIRST_VISIT,
		aka: { ro: ["ADHD"], en: ["ADHD"] },
		path: "/copii/adhd",
		match: ["adhd", "neurofeedback"],
		bookingWord: { ro: "evaluare", en: "evaluation" },
		start: "booking",
	},
	{
		id: "psizone-sensory",
		brand: "psizone",
		needs: ["child-development"],
		name: { ro: "Integrarea senzorială", en: "Sensory integration" },
		forWhom: {
			ro: "Copii pentru care sunetele, atingerile sau mișcarea devin prea mult.",
			en: "Children for whom sounds, touch or movement become too much.",
		},
		whatHappens: {
			ro: "Terapie prin mișcare și stimulare senzorială, într-o sală amenajată pentru asta.",
			en: "Therapy through movement and sensory stimulation, in a room set up for it.",
		},
		firstStep: FIRST_VISIT,
		aka: { ro: ["integrare senzorială", "integrarea senzorială"], en: ["sensory integration"] },
		path: "/copii/integrare-senzoriala",
		match: ["senzori", "sensory"],
		bookingWord: { ro: "evaluare", en: "evaluation" },
		start: "booking",
	},
	{
		id: "psizone-teens",
		brand: "psizone",
		needs: ["teen-support"],
		name: { ro: "Psihoterapia pentru adolescenți", en: "Psychotherapy for teens" },
		forWhom: {
			ro: "Adolescenți și părinții lor: ecrane, anxietate școlară, un copil care nu mai vorbește cu tine.",
			en: "Teens and their parents: screens, school anxiety, a teen who has stopped talking to you.",
		},
		whatHappens: {
			ro: "Terapie prin dialog, în planul făcut după evaluare, cu specialistul potrivit.",
			en: "Therapy through conversation, in the plan made after the evaluation, with the right specialist.",
		},
		firstStep: FIRST_VISIT,
		aka: {
			ro: ["psihoterapie", "terapia pentru adolescenți"],
			en: ["psychotherapy", "therapy for teens"],
		},
		path: "/adolescenti",
		match: ["psihoterap", "psychotherap", "adolescen", "teen"],
		bookingWord: { ro: "psihoterapie", en: "psychotherapy" },
		start: "booking",
	},
	{
		id: "psizone-adults",
		brand: "psizone",
		needs: ["adult-mental-health"],
		name: { ro: "Psihoterapia pentru adulți", en: "Psychotherapy for adults" },
		forWhom: {
			ro: "Adulți cu anxietate, atacuri de panică, burnout sau stare proastă care durează.",
			en: "Adults with anxiety, panic attacks, burnout or a low mood that lasts.",
		},
		whatHappens: {
			ro: "Terapie prin dialog (cognitiv-comportamentală, hipnoză clinică), după o primă discuție și o evaluare.",
			en: "Therapy through conversation (cognitive-behavioural, clinical hypnosis), after a first conversation and an evaluation.",
		},
		firstStep: FIRST_VISIT,
		aka: {
			ro: ["psihoterapie", "terapia pentru adulți"],
			en: ["psychotherapy", "therapy for adults"],
		},
		path: "/adulti/anxietate-depresie",
		match: ["psihoterap", "psychotherap", "adult"],
		bookingWord: { ro: "psihoterapie", en: "psychotherapy" },
		start: "booking",
	},
	{
		id: "psizone-evaluation",
		brand: "psizone",
		needs: [
			"evaluation",
			"child-development",
			"teen-support",
			"adult-mental-health",
			"sleep-calm",
			"general",
		],
		name: { ro: "Evaluarea", en: "The evaluation" },
		forWhom: {
			ro: "Copii, adolescenți și adulți cu o îngrijorare legată de dezvoltare, atenție, comportament, emoții sau limbaj.",
			en: "Children, teens and adults with a worry about development, attention, behaviour, emotions or language.",
		},
		whatHappens: {
			ro: "Evaluarea pornește de la o discuție și de la observație; unde ajută, adăugăm o hartă cerebrală QEEG. Din ea facem un singur plan, cu specialiștii potriviți.",
			en: "The evaluation starts with a conversation and with observation; where it helps, we add a QEEG brain map. From it we make one plan, with the right specialists.",
		},
		firstStep: FIRST_VISIT,
		aka: { ro: ["evaluare", "evaluari", "evaluarea inițială"], en: ["evaluation", "assessment"] },
		path: "/metode/evaluare-qeeg",
		match: ["evaluar", "evaluation", "consult"],
		bookingWord: { ro: "evaluare", en: "evaluation" },
		start: "booking",
	},
	{
		id: "eqsync-free",
		brand: "eqsync",
		needs: ["sleep-calm", "meditation-exploration", "general"],
		name: { ro: "Programul gratuit de 21 de zile", en: "The free 21-day programme" },
		forWhom: {
			ro: "Oricine vrea liniște și un ritm de seară mai calm, ascultând singur, cu căști; nu există ședințe cu cineva.",
			en: "Anyone who wants quiet and a calmer evening rhythm, listening alone with headphones; there are no sessions with anyone.",
		},
		whatHappens: {
			ro: "4 exerciții ghidate, cu căștile, în ritmul tău, 21 de zile de la confirmarea adresei de email; în ziua 20 se deblochează exercițiul bonus „Relaxare profundă”, care rămâne al tău.",
			en: "4 guided exercises, with headphones, at your own pace, for 21 days from confirming your email; on day 20 the bonus exercise “Deep relaxation” unlocks and stays yours.",
		},
		firstStep: {
			ro: "Te înscrii cu adresa de email, o confirmi și pui căștile într-un loc liniștit.",
			en: "You sign up with your email address, confirm it and put on headphones in a quiet place.",
		},
		aka: {
			ro: ["programul gratuit", "programul EQ-SYNC"],
			en: ["free programme", "EQ-SYNC programme"],
		},
		path: "/inregistrare",
		match: ["gratuit", "free", "21"],
		start: "page",
		cta: { ro: "Începe programul gratuit", en: "Start the free programme" },
	},
	{
		id: "eqsync-protocols",
		brand: "eqsync",
		needs: ["sleep-calm", "meditation-exploration"],
		name: { ro: "Protocoalele EQ-SYNC", en: "EQ-SYNC protocols" },
		forWhom: {
			ro: "Cei care vor să continue după cele 21 de zile gratuite.",
			en: "Those who want to go on after the 21 free days.",
		},
		whatHappens: {
			ro: "Protocoale din exerciții ghidate, pe care le alegi tu, lună de lună: calmare și stres, somn și regenerare, claritate mentală.",
			en: "Protocols built from guided exercises that you choose month by month: calm and stress, sleep and recovery, mental clarity.",
		},
		firstStep: {
			ro: "Începi cu programul gratuit; înainte să se închidă, primești un email.",
			en: "You start with the free programme; you get an email before it closes.",
		},
		aka: { ro: ["protocoale", "protocoalele"], en: ["protocols"] },
		path: "/#protocoale",
		match: ["protocol"],
		start: "page",
	},
	{
		id: "hemisync-free",
		brand: "hemisync",
		needs: ["meditation-exploration", "sleep-calm", "general"],
		name: { ro: "Exercițiile gratuite Hemi-Sync®", en: "The free Hemi-Sync® exercises" },
		forWhom: {
			ro: "Cei care vor să încerce meditația și explorarea conștiinței, fără plată.",
			en: "Those who want to try meditation and exploring awareness, free of charge.",
		},
		whatHappens: {
			ro: "Exerciții audio Hemi-Sync®, ascultate direct de pe site, în căști, într-o poziție confortabilă și într-un loc liniștit.",
			en: "Hemi-Sync® audio exercises, listened to right on the site, with headphones, in a comfortable position and a quiet place.",
		},
		firstStep: {
			ro: "Alegi un exercițiu introductiv și îl asculți în căști.",
			en: "You pick an introductory exercise and listen with headphones.",
		},
		aka: { ro: ["exercițiile gratuite", "exerciții gratuite"], en: ["free exercises"] },
		path: "/#exercitii",
		match: ["gratuit", "free", "exercit"],
		start: "page",
		cta: { ro: "Încearcă un exercițiu gratuit", en: "Try a free exercise" },
	},
	{
		id: "hemisync-programmes",
		brand: "hemisync",
		needs: ["meditation-exploration", "general"],
		name: { ro: "Programele Monroe Institute®", en: "The Monroe Institute® programmes" },
		forWhom: {
			ro: "Cei care vor un drum ghidat în explorarea conștiinței, după ce au încercat exercițiile gratuite.",
			en: "Those who want a guided path into exploring awareness, after trying the free exercises.",
		},
		whatHappens: {
			ro: "Programe oficiale în română, facilitate de traineri acreditați: Gateway Voyage® (programul de bază), SyncCreation® și Lucid Dreaming®.",
			en: "Official programmes in Romanian, facilitated by accredited trainers: Gateway Voyage® (the foundation programme), SyncCreation® and Lucid Dreaming®.",
		},
		firstStep: {
			ro: "Începi cu exercițiile gratuite, apoi alegi programul.",
			en: "You begin with the free exercises, then choose the programme.",
		},
		aka: {
			ro: ["Gateway Voyage", "SyncCreation", "Lucid Dreaming"],
			en: ["Gateway Voyage", "SyncCreation", "Lucid Dreaming"],
		},
		path: "/#programe",
		match: ["gateway", "synccreation", "lucid", "program", "atelier", "workshop"],
		start: "page",
	},
	{
		id: "hemisync-club",
		brand: "hemisync",
		needs: ["meditation-exploration"],
		name: { ro: "Clubul Delfinului", en: "The Dolphin Energy Club" },
		forWhom: {
			ro: "Ascultători care vor să practice împreună exercițiul DEC, creat în cadrul Monroe Institute.",
			en: "Listeners who want to practise the DEC exercise together, created within the Monroe Institute.",
		},
		whatHappens: {
			ro: "Clubul reunește ascultătorii care practică împreună exercițiul DEC; e complementar și nu înlocuiește tratamentul medical sau psihologic.",
			en: "The club brings together listeners who practise the DEC exercise together; it is complementary and does not replace medical or psychological treatment.",
		},
		firstStep: {
			ro: "Începi cu exercițiul introductiv gratuit, Intro to DEC.",
			en: "You begin with the free introductory exercise, Intro to DEC.",
		},
		aka: { ro: ["Clubul Delfinului"], en: ["Dolphin Energy Club"] },
		path: "/#club",
		match: ["club", "delfin", "dolphin"],
		start: "page",
	},
];

/** The services the guides may recommend: the declared ones minus a retired site's. */
export const SERVICES: ReadonlyArray<ServiceDef> = DECLARED_SERVICES.filter(
	(d) => !isRetired(d.brand),
);
