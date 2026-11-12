import type { RichPage } from "./types";

// Sources and review status: see methods-therapies.ts.

const EMERGENCY = {
	ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
	en: "If you or someone close to you is in immediate danger, call 112.",
} as const;

export const ABA: RichPage = {
	seoTitle: {
		ro: "Terapia ABA în Galați: ce este și cum decurge",
		en: "ABA therapy in Galați: what it is, how it runs",
	},
	seoDescription: {
		ro: "Terapia ABA la Psizone, Galați: ce înseamnă, cum începe cu o evaluare, cine o poate urma și pentru cine nu este potrivită. Pe înțelesul părinților.",
		en: "ABA therapy at Psizone in Galați: what it means, how it starts with an evaluation, who it can suit and who it is not for. Explained for parents.",
	},
	lead: {
		ro: "ABA învață abilități noi în pași mici, cu obiective clare. La noi nu începe cu o ședință, ci cu o evaluare, iar planul se alege împreună cu tine.",
		en: "ABA teaches new skills in small steps with clear goals. With us it does not start with a session but with an evaluation, and the plan is chosen together with you.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: {
				ro: "Ce este terapia ABA, pe înțelesul unui părinte?",
				en: "What is ABA therapy, in plain words?",
			},
			paras: [
				{
					ro: "ABA vine de la „Applied Behavior Analysis”, adică analiza aplicată a comportamentului. Ideea de bază este simplă: o abilitate (să ceri ceva, să aștepți, să te îmbraci, să te joci cu altcineva) se poate împărți în pași mici, iar fiecare pas se exersează, cu un sprijin care scade treptat.",
					en: "ABA stands for applied behaviour analysis. The basic idea is simple: a skill (asking for something, waiting, getting dressed, playing with someone else) can be broken into small steps, and each step is practised with support that is gradually reduced.",
				},
				{
					ro: "Terapeutul observă ce se întâmplă înainte și după un comportament și caută ce îl menține. Când copilul face un pas spre obiectiv, primește ceva ce contează pentru el, ca să aibă un motiv să încerce din nou. Obiectivele nu sunt ale terapeutului: se stabilesc după evaluare, cu părinții.",
					en: "The therapist watches what happens before and after a behaviour and looks for what keeps it going. When the child takes a step towards the goal, they receive something that matters to them, so they have a reason to try again. The goals are not the therapist's: they are set after the evaluation, with the parents.",
				},
				{
					ro: "Trebuie să fim sinceri într-un lucru. ABA este discutată și dezbătută, iar familiile o trăiesc diferit. De aceea nu o tratăm ca pe o soluție pentru toți. Este una dintre piesele unui plan, pe care îl alegem împreună cu tine și îl revedem pe parcurs.",
					en: "We should be honest about one thing. ABA is discussed and debated, and families experience it differently. That is why we do not treat it as the answer for everyone. It is one piece of a plan, which we choose together with you and review along the way.",
				},
				{
					ro: "La Psizone avem două cabinete pentru ABA, în același centru în care lucrează și psihologii, logopedul și terapeuții pentru integrare senzorială. Contează, pentru că un copil rar are o singură nevoie.",
					en: "At Psizone we have two rooms for ABA, in the same centre where the psychologists, the speech therapists and the sensory integration therapists work. That matters, because a child rarely has only one need.",
				},
			],
		},
		{
			kind: "session",
			id: "cum-decurge",
			h2: {
				ro: "Cum începe, pas cu pas, drumul spre ABA?",
				en: "How does the route to ABA begin, step by step?",
			},
			paras: [
				{
					ro: "Nu există prima ședință „de probă” fără evaluare. Pornim de la aceeași evaluare inițială pe care o facem pentru copiii cu autism sau aflați în proces de evaluare, în patru etape:",
					en: "There is no “trial” first session without an evaluation. We start from the same initial evaluation we use for children with autism or children going through assessment, in four stages:",
				},
			],
			list: [
				{
					ro: "Discuția cu părinții: clarificăm istoricul, ce vă preocupă și ce este prioritar pentru voi.",
					en: "A conversation with the parents: we clarify the history, what worries you and what matters most to you.",
				},
				{
					ro: "Analiza informațiilor existente: ținem cont de documentele și recomandările pe care le aveți deja.",
					en: "A review of what already exists: we take into account the documents and recommendations you already have.",
				},
				{
					ro: "Evaluarea copilului: observația și instrumentele se aleg după vârstă și nevoi.",
					en: "The child's evaluation: observation and instruments are chosen to suit age and needs.",
				},
				{
					ro: "Recomandări și obiective: îți explicăm direcțiile de intervenție și pașii următori.",
					en: "Recommendations and goals: we explain the directions for intervention and the next steps.",
				},
			],
			ordered: true,
		},
		{
			kind: "more",
			id: "in-sedinta",
			h2: {
				ro: "Cum arată, în general, o ședință ABA?",
				en: "What does an ABA session generally look like?",
			},
			paras: [
				{
					ro: "Detaliile unei ședințe depind de copil, deci nu le putem promite dinainte. În general, ABA înseamnă exerciții scurte, structurate, în care terapeutul propune o sarcină, îl ajută pe copil cât este nevoie și retrage ajutorul pe măsură ce abilitatea se așază. Jocul și lucrurile care îl motivează pe copil sunt materialul de lucru, nu o recompensă ținută la distanță.",
					en: "The details of a session depend on the child, so we cannot promise them in advance. In general, ABA means short, structured exercises in which the therapist proposes a task, helps the child as much as needed and withdraws the help as the skill settles. Play and the things that motivate the child are the working material, not a reward kept at a distance.",
				},
				{
					ro: "Un părinte poate fi implicat în ședințe sau poate primi, între ele, indicații pentru casă. Cât, cum și cu ce frecvență se stabilește în plan, nu în avans.",
					en: "A parent can be involved in sessions or can receive guidance for home between them. How much, how and how often is decided in the plan, not beforehand.",
				},
			],
		},
		{
			kind: "measured",
			id: "progres",
			h2: {
				ro: "Ce măsurăm și cum vezi progresul?",
				en: "What do we measure, and how do you see progress?",
			},
			paras: [
				{
					ro: "Obiectivele se scriu în așa fel încât să se poată vedea dacă s-au schimbat: nu „să comunice mai bine”, ci ce anume face copilul acum și ce ne dorim să facă. Evaluarea de la început este reperul. La reevaluare comparăm cu acel punct de pornire și îți arătăm ce s-a schimbat și ce nu.",
					en: "Goals are written so that you can see whether they have changed: not “to communicate better”, but what exactly the child does now and what we hope they will do. The starting evaluation is the reference. At re-evaluation we compare with that starting point and show you what has changed and what has not.",
				},
				{
					ro: "Dacă o abilitate nu avansează, nu insistăm orbește. Revenim la plan și îl ajustăm, de comun acord cu tine.",
					en: "If a skill is not moving, we do not simply push harder. We return to the plan and adjust it, in agreement with you.",
				},
			],
		},
		{
			kind: "for",
			id: "pentru-cine",
			h2: { ro: "Pentru cine poate fi potrivită?", en: "Who might it suit?" },
			paras: [
				{
					ro: "Serviciile noi pentru copii se adresează copiilor cu diagnostic de tulburare de spectru autist, copiilor aflați în proces de evaluare și celor la care familia observă dificultăți de comunicare, de interacțiune, de autonomie, de comportament sau de procesare senzorială. ABA poate face parte din planul unora dintre ei.",
					en: "Our services for children are for children with a diagnosis of autism spectrum disorder, children going through assessment, and children in whom the family notices difficulties with communication, interaction, independence, behaviour or sensory processing. ABA can be part of the plan for some of them.",
				},
				{
					ro: "Dacă te întrebi dacă al tău este unul dintre ei, răspunsul vine din evaluare, nu din această pagină.",
					en: "If you are wondering whether yours is one of them, the answer comes from the evaluation, not from this page.",
				},
			],
		},
		{
			kind: "not-for",
			id: "pentru-cine-nu",
			h2: {
				ro: "Pentru cine nu este potrivită sau nu este de ajuns?",
				en: "Who is it not for, or not enough for?",
			},
			paras: [
				{
					ro: "ABA nu înlocuiește evaluarea medicală, diagnosticul pus de medic și nici îngrijirea medicală. Nu este un tratament pentru urgențe și nu se oferă fără o evaluare prealabilă. Nu este nici o soluție unică: dificultățile de limbaj, cele senzoriale sau cele emoționale pot cere alte tipuri de terapie, pe care le discutăm în același plan.",
					en: "ABA does not replace a medical assessment, a diagnosis made by a doctor, or medical care. It is not a treatment for emergencies and it is not offered without a prior evaluation. Nor is it a one-size answer: language, sensory or emotional difficulties may call for other kinds of therapy, which we discuss in the same plan.",
				},
				{
					ro: "Dacă, după evaluare, ABA nu pare potrivită pentru copilul tău sau pentru familia ta, îți spunem asta și propunem altceva. Întrebările despre medicație rămân la medicul psihiatru.",
					en: "If, after the evaluation, ABA does not look right for your child or your family, we will tell you so and suggest something else. Questions about medication stay with the child psychiatrist.",
				},
				EMERGENCY,
			],
		},
		{
			kind: "duration",
			id: "cat-dureaza",
			h2: { ro: "Cât durează și cât de des?", en: "How long does it take, and how often?" },
			paras: [
				{
					ro: "Nu dăm cifre pe care nu le putem susține. Durata ședințelor, frecvența și durata programului se stabilesc după evaluarea inițială, în funcție de nevoile copilului. Le afli la evaluare, înainte să te hotărăști.",
					en: "We do not give figures we cannot stand behind. The length of sessions, their frequency and the length of the programme are set after the initial evaluation, according to the child's needs. You learn them at the evaluation, before you decide.",
				},
			],
		},
		{
			kind: "where",
			id: "unde",
			h2: { ro: "Unde se întâmplă la Psizone?", en: "Where does it happen at Psizone?" },
			paras: [
				{
					ro: "În Galați, în centrul nostru, care are două cabinete dedicate ABA. Pentru un copil cu autism, ABA se leagă de restul planului: evaluare, logopedie, integrare senzorială și, unde ajută, neurofeedback.",
					en: "In Galați, in our centre, which has two rooms dedicated to ABA. For a child with autism, ABA connects with the rest of the plan: evaluation, speech therapy, sensory integration and, where it helps, neurofeedback.",
				},
			],
		},
	],
	faq: [
		{
			q: { ro: "Ce înseamnă ABA?", en: "What does ABA mean?" },
			a: {
				ro: "Applied Behavior Analysis, adică analiza aplicată a comportamentului. Este o abordare care învață abilități în pași mici, cu obiective clare, observând ce se întâmplă înainte și după un comportament.",
				en: "Applied behaviour analysis. It is an approach that teaches skills in small steps with clear goals, by observing what happens before and after a behaviour.",
			},
		},
		{
			q: {
				ro: "Trebuie să am deja un diagnostic de autism?",
				en: "Do I need an autism diagnosis already?",
			},
			a: {
				ro: "Nu neapărat. Lucrăm și cu copii aflați în proces de evaluare sau la care familia observă dificultăți. Începem oricum cu o evaluare, în patru etape.",
				en: "Not necessarily. We also work with children going through assessment or in whom the family notices difficulties. Either way, we begin with an evaluation, in four stages.",
			},
		},
		{
			q: { ro: "Ce rol am eu ca părinte?", en: "What is my role as a parent?" },
			a: {
				ro: "Un rol activ. Obiectivele se stabilesc împreună cu tine și planul se revede cu tine. Cât participi la ședințe și ce exersezi acasă se hotărăște în plan.",
				en: "An active one. Goals are set together with you and the plan is reviewed with you. How much you take part in sessions and what you practise at home is decided in the plan.",
			},
		},
		{
			q: {
				ro: "Se poate combina ABA cu logopedia?",
				en: "Can ABA be combined with speech therapy?",
			},
			a: {
				ro: "Da, ele pot face parte din același plan, dacă evaluarea arată că ajută. Lucrăm în același centru, deci specialiștii se pot coordona.",
				en: "Yes, they can be part of the same plan if the evaluation shows it helps. We work in the same centre, so the specialists can coordinate.",
			},
		},
		{
			q: { ro: "Câte ședințe sunt necesare?", en: "How many sessions are needed?" },
			a: {
				ro: "Nu putem spune dinainte. Numărul, frecvența și durata se stabilesc după evaluarea inițială și se pot ajusta la reevaluare.",
				en: "We cannot say in advance. The number, frequency and length are set after the initial evaluation and can be adjusted at re-evaluation.",
			},
		},
		{
			q: {
				ro: "Este ABA singura variantă pentru autism?",
				en: "Is ABA the only option for autism?",
			},
			a: {
				ro: "Nu. Este una dintre piese. Planul poate include și logopedie, integrare senzorială, psihoterapie pentru familie sau neurofeedback, în funcție de ce arată evaluarea.",
				en: "No. It is one piece. The plan can also include speech therapy, sensory integration, family psychotherapy or neurofeedback, depending on what the evaluation shows.",
			},
		},
	],
	links: [
		{ label: { ro: "Autism la copii", en: "Autism in children" }, href: "/copii/autism" },
		{ label: { ro: "Logopedie", en: "Speech therapy" }, href: "/metode/logopedie" },
		{
			label: { ro: "Integrare neurosenzorială", en: "Neurosensory integration" },
			href: "/metode/integrare-neurosenzoriala",
		},
		{ label: { ro: "Evaluare și QEEG", en: "Evaluation and QEEG" }, href: "/metode/evaluare-qeeg" },
		{ label: { ro: "Prima vizită", en: "Your first visit" }, href: "/prima-vizita" },
	],
	nextStep: {
		ro: "Dacă vrei să afli dacă ABA ar avea loc în planul copilului tău, începe cu o evaluare: programeaz-o și o facem împreună.",
		en: "If you want to find out whether ABA would have a place in your child's plan, start with an evaluation: book one and we will do it together.",
	},
	procedure: { type: "TherapeuticProcedure" },
};

export const LOGOPEDIE: RichPage = {
	seoTitle: {
		ro: "Logopedie în Galați: terapia limbajului și vorbirii",
		en: "Speech therapy in Galați: language and speech",
	},
	seoDescription: {
		ro: "Logopedie la Psizone, Galați: cum decurge, ce evaluăm, pentru cine este și când nu este de ajuns. Obiectivele se stabilesc după evaluare, cu părinții.",
		en: "Speech therapy at Psizone in Galați: how it runs, what we assess, who it is for and when it is not enough. Goals are set after evaluation, with parents.",
	},
	lead: {
		ro: "Logopedia lucrează cu limbajul și cu vorbirea. Începe cu o evaluare, iar obiectivele se pun pe nevoile copilului tău, nu pe o listă generală.",
		en: "Speech therapy works on language and speech. It begins with an evaluation, and the goals are set around your child's needs, not a general list.",
	},
	sections: [
		{
			kind: "what",
			id: "ce-este",
			h2: {
				ro: "Ce este logopedia și cu ce ajută?",
				en: "What is speech therapy, and what does it help with?",
			},
			paras: [
				{
					ro: "Logopedia este terapia limbajului și a vorbirii. Limbajul înseamnă ce înțelege copilul și ce poate să spună. Vorbirea înseamnă cum pronunță, cum leagă sunetele și cum curge ce spune. Sunt lucruri diferite, iar un copil poate avea dificultăți la unul și nu la celălalt.",
					en: "Speech therapy is therapy for language and speech. Language is what the child understands and what they can say. Speech is how they pronounce, how they join sounds and how what they say flows. These are different things, and a child can have difficulty with one and not the other.",
				},
				{
					ro: "Ce părinții spun cel mai des este „nu vorbește încă” sau „nu se înțelege ce spune”. Amândouă sunt motive bune să ceri o evaluare, fără să aștepți să vezi dacă trece. Nu ne grăbim să punem etichete, dar nici nu amânăm o discuție.",
					en: "What parents say most often is “he is not talking yet” or “you cannot understand what she says”. Both are good reasons to ask for an evaluation, without waiting to see whether it passes. We do not rush to put labels on anything, but we do not put off the conversation either.",
				},
				{
					ro: "La Psizone avem două cabinete de logopedie. Sunt în același centru cu psihologii, cu terapia ABA și cu sala de integrare senzorială, deci specialiștii pot vorbi între ei despre același copil.",
					en: "At Psizone we have two speech therapy rooms. They are in the same centre as the psychologists, ABA therapy and the sensory integration room, so the specialists can talk to each other about the same child.",
				},
			],
		},
		{
			kind: "session",
			id: "cum-decurge",
			h2: {
				ro: "Cum decurge o evaluare logopedică, pas cu pas?",
				en: "How does a speech evaluation go, step by step?",
			},
			paras: [
				{
					ro: "Nu începem direct cu exerciții. Începem să înțelegem copilul, în patru etape, aceleași pe care le folosim la evaluarea inițială pentru copiii cu dificultăți de comunicare:",
					en: "We do not start straight away with exercises. We start by understanding the child, in four stages, the same we use in the initial evaluation for children with communication difficulties:",
				},
			],
			list: [
				{
					ro: "Discuția cu părinții: istoricul, ce vă îngrijorează, ce este important pentru voi.",
					en: "A conversation with the parents: the history, what worries you, what matters to you.",
				},
				{
					ro: "Documentele existente: ținem cont de ce aveți deja, de la medici sau din alte evaluări.",
					en: "Existing documents: we take into account what you already have, from doctors or from other assessments.",
				},
				{
					ro: "Evaluarea copilului: observație și instrumente alese după vârstă și nevoi.",
					en: "The child's evaluation: observation and instruments chosen to suit age and needs.",
				},
				{
					ro: "Recomandări și obiective: îți explicăm ce urmează și de ce.",
					en: "Recommendations and goals: we explain what comes next and why.",
				},
			],
			ordered: true,
		},
		{
			kind: "more",
			id: "in-sedinta",
			h2: {
				ro: "Și după evaluare, cum arată terapia?",
				en: "And after the evaluation, what does therapy look like?",
			},
			paras: [
				{
					ro: "Pe baza evaluării se pun obiective pentru copilul tău. Ședințele exersează acele obiective, de obicei prin joc și sarcini potrivite vârstei. Nu putem descrie dinainte o ședință-tip, pentru că depinde de copil, dar putem să-ți spunem de la început ce urmărim și de ce.",
					en: "On the basis of the evaluation, goals are set for your child. Sessions practise those goals, usually through play and age-appropriate tasks. We cannot describe a typical session in advance, because it depends on the child, but we can tell you from the start what we are aiming for and why.",
				},
				{
					ro: "Părintele contează mult. Primești indicații pentru ce poți face acasă, în rutina zilei, fără să transformi casa în cabinet.",
					en: "The parent matters a great deal. You get guidance on what you can do at home, within the day's routine, without turning your home into a clinic.",
				},
			],
		},
		{
			kind: "measured",
			id: "progres",
			h2: {
				ro: "Ce măsurăm și cum vezi progresul?",
				en: "What do we measure, and how do you see progress?",
			},
			paras: [
				{
					ro: "Evaluarea de la început este punctul de plecare. Obiectivele sunt formulate ca să poți observa ce s-a schimbat: ce înțelege copilul, ce cuvinte sau structuri folosește, cât de clar se face înțeles. La reevaluare comparăm cu acel punct de plecare și îți arătăm diferența, nu doar îți spunem că „merge bine”.",
					en: "The starting evaluation is the point of departure. Goals are phrased so you can see what has changed: what the child understands, what words or structures they use, how clearly they are understood. At re-evaluation we compare with that starting point and show you the difference, rather than just telling you it is “going well”.",
				},
				{
					ro: "Dacă ritmul nu e cel sperat, nu îți dăm explicații vagi. Ajustăm planul sau discutăm dacă mai este nevoie de o evaluare la alt specialist. Nu comparăm copilul tău cu al altcuiva: singurul termen de comparație este el însuși, la început.",
					en: "If the pace is not what was hoped for, we do not give you vague explanations. We adjust the plan or discuss whether another specialist's evaluation is needed. We do not compare your child with anyone else's: the only point of comparison is the child, at the start.",
				},
			],
		},
		{
			kind: "for",
			id: "pentru-cine",
			h2: { ro: "Pentru cine este logopedia?", en: "Who is speech therapy for?" },
			paras: [
				{
					ro: "Pentru copiii la care familia observă dificultăți de comunicare sau de limbaj, inclusiv copii cu tulburare de spectru autist sau aflați în proces de evaluare. Pentru copiii cu întârziere în dezvoltare, ADHD sau dificultăți de învățare, limbajul poate fi unul dintre domeniile din plan.",
					en: "For children in whom the family notices communication or language difficulties, including children with autism spectrum disorder or going through assessment. For children with developmental delay, ADHD or learning difficulties, language can be one of the areas in the plan.",
				},
				{
					ro: "Poate fi o primă întâlnire și pentru părintele care nu știe sigur. Spune-ne ce ai observat: că nu răspunde când e strigat, că repetă aceleași cuvinte, că se blochează când vrea să povestească. Nu trebuie să ai o explicație; observațiile tale sunt chiar materialul cu care începem. Din ele și din evaluare iese o imagine pe care o putem discuta pe îndelete.",
					en: "It can also be a first meeting for a parent who is not sure. Tell us what you have noticed: that he does not answer when called, that she repeats the same words, that he gets stuck when he wants to tell a story. You do not need an explanation; your observations are the very material we start from. From them and from the evaluation comes a picture we can discuss without hurry.",
				},
			],
		},
		{
			kind: "not-for",
			id: "pentru-cine-nu",
			h2: {
				ro: "Pentru cine nu este potrivită sau nu este de ajuns?",
				en: "Who is it not for, or not enough for?",
			},
			paras: [
				{
					ro: "Logopedia nu înlocuiește evaluarea medicală. Dacă ai nelămuriri despre auz, despre dezvoltarea generală sau despre o boală, medicul pediatru sau cel de specialitate este primul pas, iar noi lucrăm în completarea recomandărilor lui. Nu este un serviciu pentru urgențe.",
					en: "Speech therapy does not replace a medical assessment. If you have doubts about hearing, general development or an illness, your paediatrician or a specialist is the first step, and we work alongside their recommendations. It is not a service for emergencies.",
				},
				{
					ro: "Uneori limbajul nu este singura dificultate, iar logopedia singură nu ajunge. În acest caz propunem un plan în care intră și alte terapii. Dacă după evaluare logopedia nu pare potrivită acum, îți spunem asta direct.",
					en: "Sometimes language is not the only difficulty, and speech therapy alone is not enough. In that case we propose a plan that includes other therapies. If after the evaluation speech therapy does not seem right for now, we will tell you directly.",
				},
				EMERGENCY,
			],
		},
		{
			kind: "duration",
			id: "cat-dureaza",
			h2: { ro: "Cât durează și cât de des?", en: "How long does it take, and how often?" },
			paras: [
				{
					ro: "Durata unei ședințe, frecvența și durata programului se stabilesc după evaluarea inițială, în funcție de nevoile copilului. Nu dăm un număr general, pentru că ar fi o presupunere, nu o informație.",
					en: "The length of a session, its frequency and the length of the programme are set after the initial evaluation, according to the child's needs. We do not give a general number, because it would be a guess rather than information.",
				},
			],
		},
		{
			kind: "where",
			id: "unde",
			h2: {
				ro: "Unde și cum se leagă de restul planului?",
				en: "Where, and how does it connect to the rest of the plan?",
			},
			paras: [
				{
					ro: "În centrul nostru din Galați, în cele două cabinete de logopedie. Logopedia se poate combina cu ABA, cu integrarea senzorială sau cu psihoterapia, dacă evaluarea arată că ajută. Pe pagina de logopedie pentru copii găsești întrebările pe care ni le pun cel mai des părinții.",
					en: "In our centre in Galați, in the two speech therapy rooms. Speech therapy can be combined with ABA, sensory integration or psychotherapy if the evaluation shows it helps. On the speech therapy page for children you will find the questions parents ask us most often.",
				},
			],
		},
	],
	faq: [
		{
			q: { ro: "De la ce vârstă pot veni cu copilul?", en: "From what age can I bring my child?" },
			a: {
				ro: "Nu avem o vârstă minimă publicată. Dacă ești îngrijorat de felul în care comunică copilul tău, programează o evaluare și vedem împreună ce are sens.",
				en: "We have no published minimum age. If you are worried about how your child communicates, book an evaluation and we will see together what makes sense.",
			},
		},
		{
			q: { ro: "Trebuie să am un diagnostic înainte?", en: "Do I need a diagnosis first?" },
			a: {
				ro: "Nu. Putem începe cu o evaluare. Dacă ai deja documente sau recomandări, le luăm în considerare.",
				en: "No. We can begin with an evaluation. If you already have documents or recommendations, we take them into account.",
			},
		},
		{
			q: { ro: "Sunt prezent la ședințe?", en: "Will I be present at sessions?" },
			a: {
				ro: "Părintele este implicat. Cât stai în ședință și ce exersezi acasă hotărâm împreună, în plan.",
				en: "The parent is involved. How much you stay in the session and what you practise at home we decide together, in the plan.",
			},
		},
		{
			q: { ro: "Cât durează până apar schimbări?", en: "How long until things change?" },
			a: {
				ro: "Nu promitem termene. Fiecare copil are ritmul lui. La reevaluare comparăm cu punctul de plecare și îți arătăm ce s-a schimbat.",
				en: "We do not promise timelines. Every child has their own pace. At re-evaluation we compare with the starting point and show you what has changed.",
			},
		},
		{
			q: {
				ro: "Se poate combina logopedia cu alte terapii?",
				en: "Can speech therapy be combined with other therapies?",
			},
			a: {
				ro: "Da, dacă evaluarea arată că ajută: ABA, integrare senzorială, psihoterapie sau neurofeedback. Specialiștii lucrează în același centru.",
				en: "Yes, if the evaluation shows it helps: ABA, sensory integration, psychotherapy or neurofeedback. The specialists work in the same centre.",
			},
		},
		{
			q: {
				ro: "Logopedia este doar pentru copiii cu autism?",
				en: "Is speech therapy only for children with autism?",
			},
			a: {
				ro: "Nu. Se adresează oricărui copil la care familia observă dificultăți de limbaj sau de comunicare, cu sau fără diagnostic.",
				en: "No. It is for any child in whom the family notices language or communication difficulties, with or without a diagnosis.",
			},
		},
		{
			q: {
				ro: "Ce fac dacă nu sunt sigur că e nevoie de logoped?",
				en: "What if I am not sure a speech therapist is needed?",
			},
			a: {
				ro: "Vino la o evaluare. Dacă nu este nevoie de terapie acum, îți spunem asta și îți explicăm la ce să fii atent în continuare, fără să te trimitem la ședințe de care copilul nu are nevoie.",
				en: "Come for an evaluation. If therapy is not needed now, we will tell you so and explain what to keep an eye on, without sending you to sessions your child does not need.",
			},
		},
	],
	links: [
		{
			label: { ro: "Logopedie pentru copii", en: "Speech therapy for children" },
			href: "/copii/logopedie",
		},
		{ label: { ro: "ABA", en: "ABA" }, href: "/metode/aba" },
		{ label: { ro: "Autism la copii", en: "Autism in children" }, href: "/copii/autism" },
		{ label: { ro: "ADHD la copii", en: "ADHD in children" }, href: "/copii/adhd" },
		{ label: { ro: "Prima vizită", en: "Your first visit" }, href: "/prima-vizita" },
	],
	nextStep: {
		ro: "Dacă ceva din felul în care vorbește sau înțelege copilul tău te îngrijorează, programează o evaluare și pornim de la ce observi tu.",
		en: "If something about how your child speaks or understands worries you, book an evaluation and we will start from what you have noticed.",
	},
	procedure: { type: "TherapeuticProcedure" },
};
