import type { RichPage } from "./types";

/**
 * DRAFT — written by an AI from the old psizone.ro pages /add-adhd/ and
 * /evaluare-si-interventie-in-adhd/ (read 2026-11-12) and the repo's brand docs; clinical review
 * pending. Kept from the old site: the evaluation tools (standardised questionnaires such as
 * Conners and the QIK test, cognitive and attention tests, behavioural observation, QEEG), the
 * list of interventions (CBT, neurofeedback, organisation and self-regulation programmes, parent
 * counselling, adapted educational support). Left out on purpose: the claimed effects of
 * neurofeedback ("reducerea hiperactivității", "scăderea impulsivității"), "rezultate" language.
 * Signs and the home/school description are general knowledge, kept non-diagnostic.
 */
export const ADHD: RichPage = {
	seoTitle: {
		ro: "ADHD la copii și adolescenți: evaluare în Galați",
		en: "ADHD in children and teens: evaluation in Galați",
	},
	seoDescription: {
		ro: "ADHD la copii și adolescenți în Galați: cum arată o evaluare completă (chestionare, teste de atenție, observație, QEEG) și ce intervenții pot urma.",
		en: "ADHD in children and teenagers in Galați: what a full evaluation involves (questionnaires, attention tests, observation, QEEG) and which interventions can follow.",
	},
	lead: {
		ro: "Un copil care nu stă locului nu are neapărat ADHD, dar unul care se chinuie zilnic să se adune merită o evaluare, nu o etichetă. Aici vezi cum facem diferența și ce urmează.",
		en: "A child who cannot sit still does not necessarily have ADHD, but one who struggles every day to pull themselves together deserves an evaluation, not a label. Here is how we tell the difference and what comes next.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: { ro: "Ce este ADHD?", en: "What is ADHD?" },
			paras: [
				{
					ro: "ADHD (tulburarea de deficit de atenție și hiperactivitate) este un grup de simptome: dificultăți de atenție, hiperactivitate și impulsivitate. Persoanele cu ADHD au diferențe în felul în care funcționează zonele creierului care se ocupă de controlul impulsurilor și de orientarea atenției. Nu e o problemă de caracter și nu e un rezultat al educației greșite.",
					en: "ADHD (attention deficit hyperactivity disorder) is a group of symptoms: difficulty with attention, hyperactivity and impulsivity. People with ADHD differ in how the parts of the brain that handle impulse control and the direction of attention work. It is not a flaw of character and not the result of bad parenting.",
				},
				{
					ro: "Tabloul diferă de la un copil la altul. Unii sunt agitați și vorbesc peste ceilalți, alții par visători, uită, pierd lucruri și amână temele. Cei din a doua categorie trec mai ușor neobservați, mai ales fetele.",
					en: "The picture differs from child to child. Some are restless and talk over others, some seem dreamy, forget things, lose things and put off homework. The second group slips past more easily, girls especially.",
				},
			],
		},
		{
			kind: "for",
			id: "semne",
			h2: {
				ro: "ADHD sau doar energie? Unde e linia dintre normal și o discuție?",
				en: "ADHD or just energy? Where is the line between normal and worth a conversation?",
			},
			paras: [
				{
					ro: "E 21:40, temele nu sunt gata și el a aruncat caietul. O seară ca asta nu spune nimic. Ce contează e tiparul: semnele apar de luni de zile, în mai multe locuri (acasă și la școală), sunt mai intense decât la copiii de aceeași vârstă și îi strică notele, prieteniile sau liniștea familiei.",
					en: "It is 21:40, homework is not done and he has thrown the notebook. One evening like that tells you nothing. What matters is the pattern: the signs have been there for months, in more than one place (home and school), they are stronger than in other children of the same age, and they are costing him grades, friendships or the family's peace.",
				},
				{
					ro: "Merită o discuție dacă observi des:",
					en: "It is worth a conversation if you often notice:",
				},
			],
			list: [
				{
					ro: "greșeli din neatenție, sarcini lăsate neterminate, obiecte pierdute;",
					en: "careless mistakes, unfinished tasks, lost belongings;",
				},
				{
					ro: "dificultate de a asculta până la capăt sau de a urma instrucțiuni în mai mulți pași;",
					en: "trouble listening to the end or following multi-step instructions;",
				},
				{
					ro: "mișcare continuă, agitație în bancă, vorbit peste alții;",
					en: "constant movement, fidgeting at the desk, talking over others;",
				},
				{
					ro: "greutate de a-și aștepta rândul, reacții bruște, izbucniri emoționale;",
					en: "difficulty waiting a turn, sudden reactions, emotional outbursts;",
				},
				{
					ro: "temele care durează mult mai mult decât ar trebui, în ciuda efortului.",
					en: "homework that takes far longer than it should, despite the effort.",
				},
			],
		},
		{
			kind: "measured",
			id: "evaluare",
			h2: {
				ro: "Cum evaluăm?",
				en: "How do we evaluate?",
			},
			paras: [
				{
					ro: "Evaluarea e completă, pentru că atenția se poate încurca din motive diferite: anxietate, somn slab, dificultăți de învățare, o problemă senzorială. De aceea nu ne oprim la un singur instrument. Evaluarea include:",
					en: "The evaluation is thorough, because attention can come undone for different reasons: anxiety, poor sleep, learning difficulties, a sensory problem. That is why we do not stop at a single instrument. The evaluation includes:",
				},
			],
			list: [
				{
					ro: "chestionare standardizate, de exemplu Conners și testul QIK;",
					en: "standardised questionnaires, for example Conners and the QIK test;",
				},
				{
					ro: "teste cognitive și de atenție;",
					en: "cognitive and attention tests;",
				},
				{
					ro: "observații comportamentale;",
					en: "behavioural observation;",
				},
				{
					ro: "o hartă cerebrală QEEG, care arată cum se distribuie activitatea electrică a creierului și poate completa imaginea.",
					en: "a QEEG brain map, which shows how the brain's electrical activity is distributed and can complete the picture.",
				},
			],
			photo: {
				src: "/images/old-site/neurofeedback-room.webp",
				width: 1178,
				height: 872,
				alt: {
					ro: "Un copil cu căști stă în fața unui monitor într-un cabinet de la Psizone, în timp ce un specialist urmărește înregistrarea pe laptop.",
					en: "A child wearing headphones sits in front of a monitor in a Psizone practice room while a specialist follows the recording on a laptop.",
				},
			},
		},
		{
			kind: "more",
			id: "interventie",
			h2: { ro: "Ce intervenții pot urma?", en: "Which interventions can follow?" },
			paras: [
				{
					ro: "Planul se potrivește vârstei și nevoilor fiecărui copil. Poate include:",
					en: "The plan fits each child's age and needs. It can include:",
				},
			],
			list: [
				{
					ro: "terapie cognitiv-comportamentală, ca să lucrăm cu gândurile și cu reacțiile din momentele grele;",
					en: "cognitive-behavioural therapy, to work with thoughts and reactions in hard moments;",
				},
				{
					ro: "programe de organizare și autoreglare: planificare, rutine, pași mici;",
					en: "organisation and self-regulation programmes: planning, routines, small steps;",
				},
				{
					ro: "neurofeedback personalizat, unde evaluarea îl recomandă, ca antrenament de autoreglare a atenției;",
					en: "personalised neurofeedback, where the evaluation recommends it, as training in self-regulating attention;",
				},
				{
					ro: "consiliere pentru părinți: reguli clare, limite calme, ce să spui în loc de „de câte ori să-ți repet?”;",
					en: "counselling for parents: clear rules, calm limits, what to say instead of “how many times do I have to tell you?”;",
				},
				{
					ro: "sprijin educațional adaptat, în dialog cu școala, când ajută.",
					en: "adapted educational support, in dialogue with the school, when it helps.",
				},
			],
		},
		{
			kind: "session",
			id: "sedinta",
			h2: {
				ro: "Cum arată o ședință și cum vedem progresul?",
				en: "What does a session look like, and how do we see progress?",
			},
			paras: [
				{
					ro: "Ședința depinde de ce lucrăm: o discuție și exerciții de terapie, un antrenament de neurofeedback cu senzori, un program de organizare construit împreună cu copilul. Ce rămâne la fel este obiectivul clar, spus și copilului pe înțelesul lui.",
					en: "A session depends on what we are working on: a talk and therapy exercises, a neurofeedback training with sensors, an organisation programme built together with the child. What stays the same is a clear goal, explained to the child in words they understand.",
				},
				{
					ro: "Măsurăm din nou la intervale stabilite împreună și îți arătăm ce s-a schimbat, nu doar cum au mers ședințele. Dacă ceva nu funcționează, schimbăm abordarea.",
					en: "We measure again at intervals we agree on together and show you what has changed, not just how the sessions went. If something is not working, we change approach.",
				},
			],
		},
		{
			kind: "for",
			id: "acasa-scoala",
			h2: {
				ro: "Ce poți face tu acasă și la școală?",
				en: "What can you do at home and at school?",
			},
			paras: [
				{
					ro: "Câteva lucruri ajută aproape oricărui copil care se chinuie cu atenția: o singură instrucțiune odată, un orar vizibil, pauze de mișcare între sarcini, un loc de lucru fără ecrane și o laudă pentru efort, nu doar pentru notă. Poți să-i spui: „Hai să facem doar primul pas, apoi vedem.”",
					en: "A few things help almost any child who struggles with attention: one instruction at a time, a visible schedule, movement breaks between tasks, a workspace without screens, and praise for effort, not only for the grade. You can say: “Let's do just the first step, then we'll see.”",
				},
			],
		},
		{
			kind: "more",
			id: "scoala",
			h2: { ro: "Cum putem lucra cu școala?", en: "How can we work with the school?" },
			paras: [
				{
					ro: "Dificultățile de atenție se văd cel mai bine la școală, așa că învățătoarea sau dirigintele văd lucruri pe care tu nu le vezi, și invers. Când ești de acord, putem discuta cu ei adaptări simple: un loc în față, instrucțiuni date pe rând, sarcini împărțite în pași, mai mult timp la teste sau pauze scurte de mișcare. Scopul nu e să primească favoruri, ci să aibă condițiile în care poate arăta ce știe.",
					en: "Attention difficulties show most at school, so the teacher or form tutor sees things you do not see, and the other way round. When you agree, we can discuss simple adjustments with them: a seat at the front, instructions given one at a time, tasks split into steps, more time on tests or short movement breaks. The aim is not favours, but conditions in which your child can show what they know.",
				},
				{
					ro: "Pentru un adolescent contează și ca el să fie parte din discuție: planul merge mai bine când îl simte al lui.",
					en: "For a teenager it also matters that they are part of the conversation: the plan works better when it feels like theirs.",
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
					ro: "Nu punem diagnosticul de ADHD pe baza unui chestionar completat în grabă. Un diagnostic medical îl stabilește medicul specialist, iar dacă e nevoie de medicație, decizia e a medicului psihiatru și a familiei: noi nu recomandăm și nu oprim tratamente. Neurofeedbackul este o metodă complementară și nu înlocuiește intervențiile psihologice, educaționale sau recomandările medicale.",
					en: "We do not diagnose ADHD from a questionnaire filled in in a hurry. A medical diagnosis is made by a specialist doctor, and if medication is needed, that decision belongs to the psychiatrist and the family: we neither recommend nor stop treatments. Neurofeedback is a complementary method and does not replace psychological or educational interventions or medical advice.",
				},
				{
					ro: "Nu promitem nici termene, nici rezultate. Promitem un plan clar și o măsurare cinstită.",
					en: "We promise no timelines and no results. We promise a clear plan and honest measurement.",
				},
			],
		},
	],
	faq: [
		{
			q: {
				ro: "Cum aflu dacă e ADHD sau doar energie?",
				en: "How do I know whether it is ADHD or just energy?",
			},
			a: {
				ro: "Contează tiparul: semnele durează de luni de zile, apar acasă și la școală și îi afectează notele, prieteniile sau starea de bine. Evaluarea completă separă ADHD de alte cauze, precum anxietatea sau somnul slab.",
				en: "The pattern is what matters: the signs have lasted for months, show up at home and at school, and affect grades, friendships or well-being. A full evaluation separates ADHD from other causes such as anxiety or poor sleep.",
			},
		},
		{
			q: { ro: "Ce conține evaluarea?", en: "What does the evaluation include?" },
			a: {
				ro: "Chestionare standardizate (de exemplu Conners și testul QIK), teste cognitive și de atenție, observații comportamentale și, unde ajută, o hartă cerebrală QEEG.",
				en: "Standardised questionnaires (for example Conners and the QIK test), cognitive and attention tests, behavioural observation and, where it helps, a QEEG brain map.",
			},
		},
		{
			q: {
				ro: "Neurofeedbackul înlocuiește medicația sau terapia?",
				en: "Does neurofeedback replace medication or therapy?",
			},
			a: {
				ro: "Nu. E o metodă complementară, recomandată doar când evaluarea o justifică. Despre medicație discuți cu medicul psihiatru; noi nu o recomandăm și nu o oprim.",
				en: "No. It is a complementary method, recommended only when the evaluation justifies it. Medication is something to discuss with the psychiatrist; we neither recommend nor stop it.",
			},
		},
		{
			q: { ro: "Se lucrează și cu părinții?", en: "Do you work with parents too?" },
			a: {
				ro: "Da. Consilierea părinților face parte din plan: reguli clare, limite calme și strategii pe care le poți folosi acasă.",
				en: "Yes. Counselling for parents is part of the plan: clear rules, calm limits and strategies you can use at home.",
			},
		},
		{
			q: { ro: "Lucrați și cu adolescenți?", en: "Do you work with teenagers too?" },
			a: {
				ro: "Da, cu copii și adolescenți. Pentru adolescenți ținem cont de școală, de ecrane și de nevoia lor de autonomie; vezi și pagina despre adolescență.",
				en: "Yes, with children and teenagers. For teenagers we take into account school, screens and their need for autonomy; see also the teenagers page.",
			},
		},
		{
			q: { ro: "Cât durează intervenția?", en: "How long does the intervention last?" },
			a: {
				ro: "Depinde de copil și de obiective. O estimare cinstită putem face abia după evaluare și o revizuim împreună pe parcurs.",
				en: "It depends on the child and the goals. We can only give an honest estimate after the evaluation, and we review it together along the way.",
			},
		},
	],
	links: [
		{ label: { ro: "Adolescență", en: "Teenagers" }, href: "/adolescenti" },
		{
			label: { ro: "Integrare senzorială", en: "Sensory integration" },
			href: "/copii/integrare-senzoriala",
		},
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
