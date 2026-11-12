import type { RichPage } from "./types";

/**
 * DRAFT — written by an AI from the old psizone.ro pages /interventia-la-adolescenti/,
 * /interventie-in-adictia-de-ecrane-albastre/ and /workshop-dezvoltare-personala-pentru-adolescenti/
 * (read 2026-11-12) and the repo's brand docs; clinical review pending. Kept: the list of what
 * teenagers face, the evaluation, the individual plan, confidentiality with guided parent
 * involvement, the methods (CBT, mindfulness and self-regulation, supportive and identity work,
 * neurofeedback, group workshops, vocational counselling, parent guidance), the screen-use
 * programme's evaluation tools and its parent education, the workshop's format. Left out on
 * purpose: the three quotes (no written consent on file), "rezultate așteptate" and "beneficii",
 * the claim that screens are a disorder that causes the listed effects, EQ-SYNC, the Lorem ipsum
 * paragraph, the BrainBoost Hemi-Sync material (moves to hemi-sync.ro).
 */
export const TEENS: RichPage = {
	seoTitle: {
		ro: "Psihoterapie pentru adolescenți în Galați",
		en: "Therapy for teenagers in Galați",
	},
	seoDescription: {
		ro: "Psihoterapie și sprijin pentru adolescenți și părinți în Galați: anxietate, retragere, conflicte, timp pe ecrane. Evaluare, plan individual, confidențialitate.",
		en: "Therapy and support for teenagers and their parents in Galați: anxiety, withdrawal, conflict, screen time. Evaluation, an individual plan, confidentiality.",
	},
	lead: {
		ro: "Un adolescent care nu mai vorbește cu tine nu te respinge, e în plin proces de a deveni el însuși. Vezi când e doar vârsta și când merită un sprijin din afară.",
		en: "A teenager who has stopped talking to you is not rejecting you, they are in the middle of becoming themselves. See when it is just the age and when outside support is worth it.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: {
				ro: "De ce contează sprijinul la adolescență?",
				en: "Why does support matter in adolescence?",
			},
			paras: [
				{
					ro: "Adolescența este o perioadă de transformare rapidă: fizică, emoțională, cognitivă și socială. Se conturează identitatea, apar tensiuni între nevoia de autonomie și nevoia de siguranță, iar presiunea școlii, a colegilor și a lumii digitale e mare. Mulți adolescenți trec prin ea fără probleme majore, iar alții au nevoie de un adult din afara familiei, care să asculte fără să judece.",
					en: "Adolescence is a period of fast change: physical, emotional, cognitive and social. Identity takes shape, tension appears between the need for autonomy and the need for safety, and the pressure from school, peers and the digital world is high. Many teenagers get through it without major problems, and others need an adult from outside the family who listens without judging.",
				},
				{
					ro: "La Psizone intervenim personalizat, ca adolescentul să-și dezvolte echilibrul emoțional, autocontrolul, încrederea în sine și abilitățile de relaționare.",
					en: "At Psizone we work in a personalised way, so the teenager can build emotional balance, self-control, confidence and relationship skills.",
				},
			],
		},
		{
			kind: "for",
			id: "semne",
			h2: {
				ro: "Ce e normal și ce merită o discuție?",
				en: "What is normal, and what is worth a conversation?",
			},
			paras: [
				{
					ro: "Schimbările de dispoziție, nevoia de intimitate și certurile pentru program sunt normale. Linia se trece când ceva durează, se agravează sau îi blochează viața de zi cu zi. Mulți adolescenți ajung la noi cu:",
					en: "Mood swings, a need for privacy and arguments about schedules are normal. The line is crossed when something lasts, gets worse or blocks everyday life. Many teenagers come to us with:",
				},
			],
			list: [
				{
					ro: "anxietate de performanță sau socială, refuzul de a merge la școală;",
					en: "performance or social anxiety, refusing to go to school;",
				},
				{
					ro: "episoade de tristețe, retragere și izolare;",
					en: "episodes of sadness, withdrawal and isolation;",
				},
				{
					ro: "tulburări de somn sau de alimentație, stimă de sine scăzută;",
					en: "sleep or eating difficulties, low self-esteem;",
				},
				{
					ro: "dificultăți de comunicare cu părinții sau cu profesorii;",
					en: "difficulty communicating with parents or teachers;",
				},
				{
					ro: "crize de identitate, confuzie, opoziție;",
					en: "identity crises, confusion, opposition;",
				},
				{
					ro: "timp prea mare pe telefon, jocuri sau rețele sociale, cu furie când e întrerupt.",
					en: "too much time on the phone, games or social media, with anger when interrupted.",
				},
			],
		},
		{
			kind: "measured",
			id: "evaluare",
			h2: {
				ro: "Cum începem: evaluarea și planul",
				en: "How we begin: the evaluation and the plan",
			},
			paras: [
				{
					ro: "Începem cu o evaluare psihologică inițială, care privește felul în care gândește, simte și se comportă adolescentul. Apoi construim un plan individual, adaptat vârstei, nevoilor și nivelului de cooperare: nu forțăm un adolescent care nu vrea încă să vorbească.",
					en: "We begin with an initial psychological evaluation, looking at how the teenager thinks, feels and behaves. Then we build an individual plan, adapted to age, needs and willingness to cooperate: we do not push a teenager who is not yet ready to talk.",
				},
				{
					ro: "Relația cu terapeutul e sigură și confidențială. Părinții sunt implicați în mod ghidat: primesc direcție și sprijin, dar nu controlul conținutului ședințelor.",
					en: "The relationship with the therapist is safe and confidential. Parents are involved in a guided way: they receive direction and support, but not control over what is said in the sessions.",
				},
			],
		},
		{
			kind: "more",
			id: "metode",
			h2: { ro: "Ce metode folosim?", en: "Which methods do we use?" },
			paras: [],
			list: [
				{
					ro: "Terapie cognitiv-comportamentală: identificăm gândurile care pun presiune și învățăm să le reformulăm, ca emoțiile să fie mai ușor de gestionat.",
					en: "Cognitive-behavioural therapy: we spot the thoughts that add pressure and learn to reframe them, so emotions are easier to handle.",
				},
				{
					ro: "Mindfulness și tehnici de autoreglare, pentru anxietate, stres și impulsivitate.",
					en: "Mindfulness and self-regulation techniques, for anxiety, stress and impulsivity.",
				},
				{
					ro: "Terapie suportivă și de explorare a identității, pentru stima de sine.",
					en: "Supportive therapy and identity exploration, for self-esteem.",
				},
				{
					ro: "Neurofeedback, unde evaluarea îl recomandă, ca antrenament complementar pentru focus și echilibru.",
					en: "Neurofeedback, where the evaluation recommends it, as complementary training for focus and balance.",
				},
				{
					ro: "Ateliere de grup de dezvoltare personală: comunicare, leadership, autocunoaștere.",
					en: "Personal development group workshops: communication, leadership, self-knowledge.",
				},
				{
					ro: "Consiliere vocațională: orientare profesională și clarificarea motivației.",
					en: "Vocational counselling: career guidance and clarifying motivation.",
				},
				{
					ro: "Ghidaj parental: educație relațională și gestionarea conflictelor în familie.",
					en: "Parent guidance: relationship education and handling conflict in the family.",
				},
			],
		},
		{
			kind: "for",
			id: "ecrane",
			h2: {
				ro: "Ce facem când e vorba despre ecrane?",
				en: "What do we do when it is about screens?",
			},
			paras: [
				{
					ro: "Telefonul, tableta și jocurile fac parte din viața lor. Întrebarea nu e „cât timp”, ci „ce le ia în loc”: somnul, mișcarea, prietenii, temele, starea de spirit. Când ecranele iau prea mult sau când întreruperea lor duce la crize, lucrăm cu o evaluare mai largă: teste standardizate de atenție, testul Conners, testul QIK, teste motrice și vizuale și, unde ajută, o hartă cerebrală QEEG.",
					en: "Phones, tablets and games are part of their lives. The question is not “how long” but “what are they taking the place of”: sleep, movement, friends, homework, mood. When screens take too much, or interrupting them leads to meltdowns, we work with a wider evaluation: standardised attention tests, the Conners test, the QIK test, motor and visual tests and, where it helps, a QEEG brain map.",
				},
				{
					ro: "Intervenția se construiește pe mai multe direcții, după nevoie: activități motrice adaptate, neurofeedback, exerciții de atenție vizuală, organizarea sarcinilor școlare, consiliere vocațională și orientare către sportul potrivit. În paralel lucrăm cu familia: reguli digitale, limite calme, activități comune fără ecran. Reevaluăm la intervale stabilite, inclusiv cu QEEG, și adaptăm programul.",
					en: "The intervention is built along several lines, as needed: adapted motor activities, neurofeedback, visual attention exercises, organising schoolwork, vocational counselling and guidance towards the right sport. In parallel we work with the family: digital rules, calm limits, shared activities without screens. We reassess at agreed intervals, including with QEEG, and adapt the programme.",
				},
				{
					ro: "Poți să-i spui: „Nu vreau să-ți iau telefonul. Vreau să înțeleg ce îți dă și ce îți ia.”",
					en: "You can say: “I don't want to take your phone. I want to understand what it gives you and what it takes.”",
				},
			],
		},
		{
			kind: "more",
			id: "atelier",
			h2: {
				ro: "Există un atelier de grup pentru adolescenți?",
				en: "Is there a group workshop for teenagers?",
			},
			paras: [
				{
					ro: "Am gândit un workshop de dezvoltare personală pentru adolescenți între 13 și 18 ani, în grup restrâns de 8–12 participanți, pe 2 zile (weekend) sau în 4 ședințe, la Psizone sau într-o locație parteneră, cum ar fi o școală sau un liceu. Se lucrează cu ateliere interactive, jocuri de rol, discuții ghidate fără predici, tehnici de reglare emoțională (respirație, ancorare) și exerciții de autocunoaștere, cu un caiet de lucru și un jurnal personal. Obiective: încredere în sine, gestionarea emoțiilor, comunicare, conflicte cu părinții sau colegii, claritate asupra identității.",
					en: "We designed a personal development workshop for teenagers aged 13 to 18, in a small group of 8 to 12 participants, over 2 days (a weekend) or in 4 sessions, at Psizone or at a partner location such as a school. It runs on interactive workshops, role play, guided discussion without sermons, emotional regulation techniques (breathing, grounding) and self-knowledge exercises, with a workbook and a personal journal. Goals: confidence, handling emotions, communication, conflicts with parents or classmates, clarity about identity.",
				},
				{
					ro: "Întreabă-ne despre următoarea ediție.",
					en: "Ask us about the next edition.",
				},
			],
		},
		{
			kind: "for",
			id: "acasa",
			h2: {
				ro: "Cum vorbești cu un adolescent care tace?",
				en: "How do you talk to a teenager who has gone quiet?",
			},
			paras: [
				{
					ro: "Rar merge întrebarea „ce ai?”. Mai bine funcționează o ocazie fără față în față: o plimbare cu mașina, o masă făcută împreună, un mesaj scurt. Începe cu ce observi, fără acuzație: „Văd că ești obosit în ultimele zile. Dacă vrei să vorbim, sunt aici.” Apoi tacă și lasă-i spațiu. Dacă nu vorbește, ai arătat că ușa e deschisă, iar asta rămâne.",
					en: "“What's wrong?” rarely works. What works better is an occasion that is not face to face: a drive, a meal made together, a short message. Begin with what you notice, without accusation: “I see you have been tired these last few days. If you want to talk, I'm here.” Then stop talking and leave room. If they do not speak, you have shown the door is open, and that stays.",
				},
			],
		},
		{
			kind: "not-for",
			id: "limite",
			h2: {
				ro: "Ce nu putem face și ce nu promitem?",
				en: "What can we not do, and what do we not promise?",
			},
			paras: [
				{
					ro: "Nu promitem că un adolescent „va deveni” altfel și nu lucrăm cu cineva împotriva voinței lui: planul pornește de la cooperarea lui, oricât de mică. Nu recomandăm și nu oprim medicație; despre asta se discută cu medicul psihiatru. Terapia nu înlocuiește un consult medical când sunt semne fizice sau de risc.",
					en: "We do not promise that a teenager will “become” someone different, and we do not work with someone against their will: the plan starts from their cooperation, however small. We neither recommend nor stop medication; that is a matter for the psychiatrist. Therapy does not replace a medical consultation when there are physical or risk signs.",
				},
				{
					ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
					en: "If you or someone close to you is in immediate danger, call 112.",
				},
			],
		},
	],
	faq: [
		{
			q: {
				ro: "Adolescentul meu nu vrea să vină. Ce fac?",
				en: "My teenager does not want to come. What do I do?",
			},
			a: {
				ro: "Nu-l forța. Poți veni întâi tu, ca părinte, pentru ghidaj, și îl invitați împreună când e pregătit. Relația terapeutică merge doar dacă adolescentul participă de bunăvoie.",
				en: "Do not force them. You can come first, as a parent, for guidance, and invite them together when they are ready. The therapeutic relationship only works if the teenager takes part willingly.",
			},
		},
		{
			q: {
				ro: "Ce află părinții din ședințe?",
				en: "What do parents learn from the sessions?",
			},
			a: {
				ro: "Relația cu terapeutul e confidențială. Părinții primesc direcție și sprijin ghidat, nu un raport despre ce spune adolescentul.",
				en: "The relationship with the therapist is confidential. Parents receive direction and guided support, not a report on what the teenager says.",
			},
		},
		{
			q: {
				ro: "Cum știu dacă timpul pe ecrane e o problemă?",
				en: "How do I know whether screen time is a problem?",
			},
			a: {
				ro: "Uită-te la ce ia în loc: somn, mișcare, prieteni, teme, dispoziție, și la cum reacționează când e întrerupt. Dacă tiparul durează și îl afectează, o evaluare clarifică ce se întâmplă.",
				en: "Look at what it takes the place of: sleep, movement, friends, homework, mood, and how they react when interrupted. If the pattern lasts and affects them, an evaluation clarifies what is going on.",
			},
		},
		{
			q: {
				ro: "Ce conține evaluarea inițială?",
				en: "What does the first evaluation include?",
			},
			a: {
				ro: "O evaluare psihologică: comportamentală, cognitivă și emoțională. Unde e cazul adăugăm teste de atenție sau o hartă cerebrală QEEG.",
				en: "A psychological evaluation: behavioural, cognitive and emotional. Where relevant we add attention tests or a QEEG brain map.",
			},
		},
		{
			q: {
				ro: "Terapia de grup e potrivită pentru toți adolescenții?",
				en: "Is group work suitable for every teenager?",
			},
			a: {
				ro: "Nu neapărat. Pentru unii, grupul e locul unde descoperă că nu sunt singuri; pentru alții e mai bine să înceapă individual. Decidem după evaluare, împreună cu el.",
				en: "Not necessarily. For some, the group is where they find out they are not alone; for others it is better to start individually. We decide after the evaluation, together with them.",
			},
		},
		{
			q: {
				ro: "Cât durează terapia?",
				en: "How long does therapy last?",
			},
			a: {
				ro: "Depinde de adolescent, de obiective și de cât lucrăm și cu familia. O estimare responsabilă se poate face după evaluare.",
				en: "It depends on the teenager, the goals and how much we also work with the family. A responsible estimate is possible after the evaluation.",
			},
		},
		{
			q: {
				ro: "Se poate face terapia online?",
				en: "Can therapy be done online?",
			},
			a: {
				ro: "Da, psihoterapia online există și pentru adolescenți: se conectează prin imagine și sunet, iar familia poate fi implicată după caz. E nevoie de o aplicație, de căști și de un loc liniștit.",
				en: "Yes, online psychotherapy is available for teenagers too: they connect by video and audio, and the family can be involved as appropriate. You need an app, headphones and a quiet place.",
			},
		},
	],
	links: [
		{ label: { ro: "ADHD", en: "ADHD" }, href: "/copii/adhd" },
		{
			label: { ro: "Anxietate și depresie la adulți", en: "Anxiety and depression in adults" },
			href: "/adulti/anxietate-depresie",
		},
		{ label: { ro: "Cuplu și familie", en: "Couples and family" }, href: "/adulti/cuplu-familie" },
		{
			label: { ro: "Prima vizită, pas cu pas", en: "The first visit, step by step" },
			href: "/prima-vizita",
		},
	],
	nextStep: {
		ro: "Următorul pas: programează o evaluare. Prima discuție e despre voi, nu despre diagnostic.",
		en: "Next step: book an evaluation. The first conversation is about you, not about a diagnosis.",
	},
};
