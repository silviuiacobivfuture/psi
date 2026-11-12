import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "atacul-de-panica",
	brand: "psizone",
	topic: "anxietate-depresie",
	backlogNo: 10,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Atacul de panică: ce este, ce faci în timpul lui și după",
		en: "Panic attacks: what they are and what to do",
	},
	standfirst: {
		ro: "Un atac de panică este un val brusc de frică, cu inimă care bate tare, respirație scurtă și senzația că se întâmplă ceva grav. Se termină, de obicei în 5–20 de minute, și în sine nu e periculos. Dacă e prima dată sau ai durere în piept, mergi la medic, ca să excludă o cauză fizică.",
		en: "A panic attack is a sudden wave of fear, with a pounding heart, short breath and the feeling that something terrible is happening. It ends, usually within 5 to 20 minutes, and is not dangerous in itself. If it is your first, or you have chest pain, see a doctor to rule out a physical cause.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Lake_Blanche_Reflection_(31122974596).jpg/1280px-Lake_Blanche_Reflection_(31122974596).jpg",
		alt: {
			ro: "Un lac de munte nemișcat în lumina albastră a înserării, cu crestele cu zăpadă oglindite în apă.",
			en: "A still mountain lake in the blue light of dusk, with snowy ridges mirrored in the water.",
		},
		width: 1280,
		height: 853,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "E 3 noaptea. Te trezești cu inima în gât, cu palmele ude, cu aerul parcă prea puțin pentru plămâni. Ți se pare că mori, că înnebunești sau că pierzi controlul. Acesta este, foarte probabil, un atac de panică, și primul lucru pe care vrem să-l știi este că trece. Cele mai multe durează între 5 și 20 de minute, spune NHS, și sunt înspăimântătoare, dar nu periculoase.",
				en: "It is 3 a.m. You wake with your heart in your throat, your palms wet, and the air suddenly too thin for your lungs. It feels as if you are dying, going mad or losing control. This is very likely a panic attack, and the first thing we want you to know is that it passes. Most last between 5 and 20 minutes, says the NHS, and they are frightening but not dangerous.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai jos găsești cum se simte un atac, cum îl deosebești de o problemă de inimă, ce poți face în timp ce se desfășoară, de ce frica de următorul devine uneori mai grea decât atacul însuși și cum arată tratamentul. Nu e un diagnostic și nu poate ține locul unui consult. E ce am vrea să-ți spună cineva calm, chiar în noaptea aceea.",
				en: "Below you will find how an attack feels, how to tell it from a heart problem, what you can do while it is happening, why the fear of the next one can weigh more than the attack itself, and what treatment looks like. It is not a diagnosis and it cannot replace a consultation. It is what we would like someone calm to tell you on that very night.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum se simte un atac de panică?",
				en: "What does a panic attack feel like?",
			},
		},
		{
			type: "p",
			text: {
				ro: "NIMH îl descrie ca pe un val brusc de frică sau disconfort, cu bătăi puternice ale inimii, transpirație, tremur, probleme de respirație, amețeală sau durere în piept ori în stomac. NHS adaugă greața, senzația de groază iminentă și, la unii oameni, impresia că se desprind de propriul corp. Nu toți au aceleași semne, iar două atacuri ale aceleiași persoane pot arăta diferit.",
				en: "NIMH describes it as a sudden wave of fear or discomfort, with a pounding heart, sweating, trembling, trouble breathing, dizziness, or pain in the chest or stomach. The NHS adds nausea, a sense of dread and, for some people, the feeling of being detached from their own body. Not everyone has the same signs, and two attacks in the same person can look different.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Partea cea mai greu de explicat celor din jur este viteza. Ești bine la masă, în autobuz sau la coadă, iar în câteva minute corpul îți dă toate semnalele unui pericol de moarte, fără ca în jur să se fi schimbat ceva. Poate de aceea mulți oameni spun după aceea că s-au rușinat: „Nu aveam de ce să mă sperii.” Aveai, din punctul de vedere al corpului. Alarma a sunat. Doar că nu era foc.",
				en: "The hardest part to explain to the people around you is the speed. You are fine at the table, on the bus or in a queue, and within minutes your body is giving every signal of mortal danger, with nothing around you having changed. Perhaps that is why so many people say afterwards that they felt ashamed: “I had no reason to be scared.” From your body’s point of view you did. The alarm went off. It just was not a fire.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Atac de panică sau problemă de inimă: când mergi la medic?",
				en: "Panic attack or heart problem: when do you see a doctor?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aceasta este întrebarea cinstită și merită un răspuns cinstit: simptomele se pot asemăna. NHS enumeră pentru infarct durerea în piept, care poate fi strivitoare sau ca o presiune și se poate întinde spre braț, gât sau maxilar, apoi respirația scurtă, greața și transpirația. NHS notează și că multe dintre simptomele panicii pot veni din alte afecțiuni. De aceea nu te poți „diagnostica” singur în mijlocul nopții și nu ești obligat să încerci.",
				en: "This is the honest question and it deserves an honest answer: the symptoms can look alike. For a heart attack, the NHS lists chest pain that may feel crushing or like a squeeze and may spread to the arm, neck or jaw, along with shortness of breath, nausea and sweating. The NHS also notes that many symptoms of panic can come from other conditions. That is why you cannot “diagnose” yourself in the middle of the night, and you are not obliged to try.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Regula practică este aceasta. Dacă durerea din piept e strivitoare sau se întinde spre braț, gât ori maxilar, dacă respiri foarte greu sau ai buzele ori pielea palide sau vineții, sună la urgență, nu te duce singur la spital: NHS spune explicit să nu conduci tu. Dacă ai o boală de inimă cunoscută sau factori de risc, discută cu medicul tău din timp ce simptome trebuie să te trimită direct la urgență. Iar dacă nu ești sigur, tratează situația ca pe o urgență.",
				en: "The practical rule is this. If the chest pain is crushing or spreads to the arm, neck or jaw, if you are struggling badly to breathe, or if your lips or skin look pale or blue, call the emergency services; do not drive yourself, as the NHS says plainly. If you have a known heart condition or risk factors, talk to your doctor in advance about which symptoms should send you straight to emergency care. And if you are not sure, treat it as an emergency.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă ai trecut prin primul tău atac, programează-te la medic și după ce s-a liniștit totul. NIMH spune că, tocmai pentru că panica „poate semăna cu un infarct”, un medic poate face un examen fizic ca să se asigure că simptomele nu au altă cauză. Cu rezultatul în mână, următoarea discuție e mult mai ușoară: știi că ai exclus ce trebuia exclus și poți vorbi despre panică fără ghicitul de fundal.",
				en: "If you have just had your first attack, book a doctor’s appointment after everything has calmed down, too. NIMH says that, precisely because panic “might feel like a heart attack”, a provider may carry out a physical exam to make sure there is no unrelated physical cause. With the result in hand the next conversation is much easier: you know what needed ruling out has been ruled out, and you can talk about panic without the guesswork humming in the background.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce te ajută în timpul unui atac de panică?",
				en: "What helps during a panic attack?",
			},
		},
		{
			type: "p",
			text: {
				ro: "NHS dă sfaturi simple și puține: rămâi unde ești, dacă poți, respiră lent și adânc și amintește-ți că episodul va trece. Atât. Nu trebuie să „lupți” cu atacul, iar lupta cu el îl poate întreține. Un atac e ca un val: cu cât te zbați în el, cu atât te învârte mai tare. Dacă te lași purtat, urcă, atinge un vârf și coboară.",
				en: "The NHS gives simple, few pieces of advice: stay where you are if you can, breathe slowly and deeply, and remind yourself that the episode will pass. That is all. You do not have to “fight” the attack, and fighting it can keep it going. An attack is like a wave: the more you thrash in it, the harder it turns you over. If you let it carry you, it rises, peaks and falls.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Rămâi unde ești, dacă e sigur. Dacă ești la volan, oprește când poți face asta în siguranță.",
					en: "Stay where you are, if it is safe. If you are driving, stop when you can do so safely.",
				},
				{
					ro: "Pune o mână pe burtă și respiră lent, lăsând aerul să coboare. Nu forța, nu număra în grabă. Expirația mai lungă decât inspirația e de obicei mai blândă pentru corp.",
					en: "Put a hand on your belly and breathe slowly, letting the air sink low. Do not force it, do not count in a rush. An out-breath longer than the in-breath is usually gentler on the body.",
				},
				{
					ro: "Spune-ți în gând o propoziție scurtă și adevărată: „Este un atac de panică. Trece. Nu e periculos în sine.”",
					en: "Say a short, true sentence to yourself: “This is a panic attack. It will pass. It is not dangerous in itself.”",
				},
				{
					ro: "Ancorează-te în ce e în jur: numește în gând trei lucruri pe care le vezi și două sunete pe care le auzi.",
					en: "Anchor yourself in what is around you: name three things you can see and two sounds you can hear.",
				},
				{
					ro: "Dacă ești cu cineva, spune-i simplu ce ai nevoie: „Stai lângă mine câteva minute. Nu trebuie să faci nimic.”",
					en: "If someone is with you, tell them simply what you need: “Stay with me for a few minutes. You do not have to do anything.”",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Ce nu e de ajutor: să te uiți la ceas la fiecare treizeci de secunde, să cauți pe telefon simptomele sau să te rogi ca „să nu se mai întâmple niciodată”. Ultimul gând pare nevinovat, dar îți spune creierului că ai ceva de care trebuie să te temi.",
				en: "What does not help: checking the clock every thirty seconds, searching your symptoms on your phone, or praying that “it never happens again”. That last thought sounds harmless, but it tells your brain that you have something to be afraid of.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Cele mai multe atacuri de panică durează între 5 și 20 de minute. Sunt înspăimântătoare, dar nu sunt periculoase. (NHS)",
				en: "Most panic attacks last between 5 and 20 minutes. They are frightening, but they are not dangerous. (NHS)",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce ți-e frică de următorul atac?",
				en: "Why are you afraid of the next attack?",
			},
		},
		{
			type: "p",
			text: {
				ro: "După primul atac, mulți oameni descoperă că ce îi chinuie nu mai este atacul, ci așteptarea lui. Începi să te asculți: inima a sărit o bătaie? Respir prea repede? Evit liftul, metroul, cafeaua, sala de sport. Fiecare evitare te liniștește pe moment și îți confirmă pe termen lung că locul sau senzația sunt periculoase. Atenția la corp face senzațiile normale să pară mai tari, iar senzațiile mai tari declanșează alt val de frică. Asta este bucla fricii de frică.",
				en: "After the first attack, many people find that what torments them is no longer the attack but the waiting for it. You begin to listen to yourself: did my heart skip a beat? Am I breathing too fast? You avoid the lift, the metro, the coffee, the gym. Each avoidance calms you in the moment and confirms in the long run that the place or the sensation is dangerous. Watching your body makes ordinary sensations seem louder, and louder sensations set off another wave of fear. That is the loop of fear of fear.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu e o slăbiciune de caracter. E felul în care un creier care vrea să te protejeze învață o regulă greșită. NIMH spune că fricile legate de atacurile viitoare pot duce la anxietate continuă. Vestea bună este că ceea ce s-a învățat poate fi și reînvățat, și exact pe asta lucrează terapia.",
				en: "It is not a weakness of character. It is the way a brain that wants to protect you learns a wrong rule. NIMH says that fear of future attacks can lead to ongoing anxiety. The good news is that what has been learned can be relearned, and that is exactly what therapy works on.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Un episod izolat sau tulburare de panică?",
				en: "A single episode or panic disorder?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un singur atac, sau două în perioade foarte grele, nu înseamnă tulburare de panică. NIMH spune că un singur atac nu este el însuși o tulburare mintală. Despre tulburare de panică se vorbește când atacurile sunt frecvente și neașteptate și sunt urmate de îngrijorare constantă că vor reveni sau de schimbări de comportament făcute ca să le eviți, care îți încurcă viața. NHS precizează că diagnosticul se ia în calcul în cazul unor atacuri regulate, neașteptate, urmate de cel puțin o lună de îngrijorare că vor mai veni.",
				en: "A single attack, or two in a very hard period, does not mean panic disorder. NIMH says a single attack is not in itself a mental disorder. We speak of panic disorder when attacks are frequent and unexpected and are followed by constant worry that they will return, or by changes in behaviour made to avoid them, which get in the way of life. The NHS adds that the diagnosis is considered when someone has regular, unexpected attacks followed by at least a month of worry about having more.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu trebuie să aștepți o lună sau un număr de atacuri ca să ceri ajutor. Dacă te temi de următorul, dacă începi să eviți locuri și dacă viața ți se strânge în jurul fricii, ai deja un motiv suficient pentru o discuție. NIMH notează că tulburarea apare adesea la sfârșitul adolescenței sau la începutul vârstei adulte și poate fi moștenită în familie, deci nu ești singurul din familie căruia i s-a întâmplat. Diagnosticul îl pune un specialist, după o evaluare, nu un articol.",
				en: "You do not have to wait a month, or a set number of attacks, to ask for help. If you dread the next one, if you start avoiding places, if life is narrowing around the fear, that is reason enough for a conversation. NIMH notes that the disorder often begins in the late teens or early adulthood and can run in families, so you may not be the only one in the family it has happened to. A diagnosis is made by a specialist, after an evaluation, not by an article.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată tratamentul: terapia cognitiv-comportamentală și alte ajutoare",
				en: "What treatment looks like: CBT and other help",
			},
		},
		{
			type: "p",
			text: {
				ro: "NHS spune că terapiile prin vorbire și medicamentele sunt tratamentele principale ale tulburării de panică, iar terapia cognitiv-comportamentală (TCC) este terapia principală. NIMH o numește „standardul de aur” al psihoterapiei pentru panică. OMS arată că dovezile cele mai solide pentru tulburările de anxietate susțin intervențiile bazate pe TCC, inclusiv expunerea, adică confruntarea treptată cu ce te sperie.",
				en: "The NHS says talking therapies and medicine are the main treatments for panic disorder, and cognitive behavioural therapy (CBT) is the main talking therapy. NIMH calls it the “gold standard” psychotherapy for panic. The WHO notes that the strongest evidence for anxiety disorders supports CBT-based interventions, including exposure, which means facing what frightens you gradually.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cum arată asta într-o sesiune? Nu ți se cere să te „calmezi”. Psihologul te ajută să vezi ce gânduri vin în primele secunde („Mi se oprește inima”), să le verifici față de ce știi, și să înveți ce fac de fapt senzațiile corpului. Apoi, încet și cu acordul tău, te apropii de situațiile evitate, în pași pe care îi alegi împreună. Între sesiuni ai sarcini mici și un jurnal scurt. Nu promitem un număr de ședințe sau un rezultat. Spunem doar că se lucrează concret și că vedem împreună ce se schimbă.",
				en: "What does that look like in a session? You are not asked to “calm down”. The psychologist helps you notice the thoughts that arrive in the first seconds (“My heart is stopping”), check them against what you know, and learn what bodily sensations actually do. Then, slowly and with your agreement, you move towards the situations you have been avoiding, in steps you choose together. Between sessions you have small tasks and a short diary. We do not promise a number of sessions or an outcome. We say only that the work is concrete and that we look together at what changes.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Despre medicamente: există, iar decizia de a le începe, de a le ajusta sau de a le opri aparține medicului psihiatru sau medicului tău. OMS vorbește despre prudență în privința unor clase și despre ce cântărește un clinician. Noi, ca psihologi, nu recomandăm și nu oprim nimic. Dacă te întrebi dacă ai nevoie de ele, pune întrebarea medicului. Ajutorul se mai poate completa cu somn regulat, mișcare, mai puțin alcool, relaxare și atenție conștientă. OMS le include ca sprijin pentru tratament, iar NIMH spune că obiceiurile sănătoase singure nu țin locul tratamentului.",
				en: "About medicines: they exist, and the decision to start, adjust or stop them belongs to a psychiatrist or your own doctor. The WHO speaks of caution with some classes and of what a clinician weighs. We, as psychologists, neither recommend nor stop anything. If you wonder whether you need them, ask your doctor. Help can be rounded out with regular sleep, movement, less alcohol, relaxation and mindfulness. The WHO includes these as support for treatment, and NIMH says healthy habits alone cannot replace treatment.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Metoda nu e pentru toată lumea în același moment. Dacă simptomele fizice sunt noi sau neexplicate, începi cu medicul. Dacă ești în pericol imediat, terapia nu e primul pas. La Psizone, pentru anxietate lucrăm cu psihologi, cu terapie individuală (inclusiv TCC) și, atunci când e potrivit după evaluare, cu neurofeedback. Pe pagina centrului nu am găsit un număr de ședințe sau un preț promis, așa că nu le spunem aici.",
				en: "No method is for everyone at the same moment. If physical symptoms are new or unexplained, start with the doctor. If you are in immediate danger, therapy is not the first step. At Psizone, for anxiety we work with psychologists, with individual therapy (including CBT) and, when it fits after an evaluation, with neurofeedback. We have not found a number of sessions or a promised price on the centre’s page, so we do not state one here.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce faci după un atac de panică?",
				en: "What do you do after a panic attack?",
			},
		},
		{
			type: "p",
			text: {
				ro: "După atac, corpul e obosit ca după o alergare, iar mintea tinde să deruleze filmul. Bea un pahar cu apă, stai jos, nu te certa. Poți scrie, într-un caiet sau în telefon, trei lucruri: unde erai, ce simțeai în corp, ce gândeai chiar înainte. Peste câteva atacuri vei vedea un tipar, iar tiparul e exact ce îi trebuie psihologului ca să te ajute. Dacă mâine ți-e frică să mergi în același loc, du-te, chiar dacă doar pentru cinci minute. Evitarea hrănește frica.",
				en: "After an attack the body is tired as if from a run, and the mind tends to replay the film. Drink a glass of water, sit down, do not scold yourself. You can write down, in a notebook or on your phone, three things: where you were, what you felt in your body, what you were thinking just before. After a few attacks you will see a pattern, and that pattern is exactly what a psychologist needs in order to help you. If tomorrow you are afraid to go to the same place, go, even for five minutes. Avoidance feeds the fear.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112. În restul cazurilor, cel mai bun pas este unul mic și concret.",
				en: "If you or someone close to you is in immediate danger, call 112. In all other cases, the best step is a small, concrete one.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Primul pas, cât de mic",
				en: "The first step, however small",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă ai avut un atac și mai ai și frica de următorul, nu trebuie să stai singur cu ea. Începe cu medicul, dacă simptomele sunt noi, și apoi cu o evaluare psihologică, în care povestești ce simți și ce eviți. La Psizone, prima discuție e despre tine, nu despre diagnostic. Programează evaluarea și spune-ne, în cuvintele tale, cum arată o noapte ca aceea.",
				en: "If you have had an attack and you now fear the next one, you do not have to sit alone with it. Start with the doctor if the symptoms are new, and then with a psychological evaluation, in which you tell us what you feel and what you avoid. At Psizone, the first conversation is about you, not a diagnosis. Book the evaluation and tell us, in your own words, what a night like that looks like.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "NHS: Tulburarea de panică",
				en: "NHS: Panic disorder",
			},
			href: "https://www.nhs.uk/mental-health/conditions/panic-disorder/",
		},
		{
			label: {
				ro: "NIMH: Tulburarea de panică, când frica copleșește",
				en: "NIMH: Panic disorder, when fear overwhelms",
			},
			href: "https://www.nimh.nih.gov/health/publications/panic-disorder-when-fear-overwhelms",
		},
		{
			label: {
				ro: "OMS: Tulburările de anxietate",
				en: "WHO: Anxiety disorders",
			},
			href: "https://www.who.int/news-room/fact-sheets/detail/anxiety-disorders",
		},
		{
			label: {
				ro: "NHS: Infarctul (simptome și când suni la urgență)",
				en: "NHS: Heart attack (symptoms and when to call emergency services)",
			},
			href: "https://www.nhs.uk/conditions/heart-attack/",
		},
		{
			label: {
				ro: "Psizone: Terapie individuală în anxietate și depresie",
				en: "Psizone: Individual therapy for anxiety and depression",
			},
			href: "https://psizone.ro/terapie-individuala-interventie-in-anxietate-si-depresie/",
		},
	],
	provenance: [
		"https://www.nhs.uk/mental-health/conditions/panic-disorder/ (5–20 minutes, some up to an hour; frightening not dangerous; stay, breathe slowly, remind yourself it will pass; talking therapies and medicine main treatments, CBT main talking therapy; diagnosis considered with regular unexpected attacks and at least a month of worry)",
		"https://www.nimh.nih.gov/health/publications/panic-disorder-when-fear-overwhelms (symptoms; a single attack is not a disorder; panic disorder = frequent unexpected attacks plus worry/behaviour change; CBT “gold standard”; onset late teens/early adulthood, can run in families; physical exam because it might feel like a heart attack; healthy habits cannot replace treatment)",
		"https://www.who.int/news-room/fact-sheets/detail/anxiety-disorders (panic disorder description; CBT-based interventions strongest evidence incl. exposure; self-care alongside treatment; caution on some medicines)",
		"https://www.nhs.uk/conditions/heart-attack/ (heart attack symptoms; pain may spread to arm, neck, jaw; do not drive yourself)",
		"https://psizone.ro/terapie-individuala-interventie-in-anxietate-si-depresie/ (initial assessment, CBT/ACT/mindfulness, psychologists, neurofeedback where needed); https://psizone.ro/anxietate-si-atac-de-panica/ (neurofeedback only; no session count or price given)",
		"docs/brands/writing-voice.md (voice, crisis sentence); apps/psizone-web/src/content/visit.ts via other articles (“Prima discuție e despre voi, nu despre diagnostic.”)",
		"Cover: Wikimedia Commons “Lake Blanche Reflection”, reused from existing library covers.",
	],
	seo: {
		title: {
			ro: "Atac de panică: ce faci în timpul lui și după",
			en: "Panic attack: what to do during and after one",
		},
		description: {
			ro: "Cum se simte un atac de panică, cum îl deosebești de o problemă de inimă, ce te ajută pe loc și cum arată tratamentul cu terapie cognitiv-comportamentală.",
			en: "How a panic attack feels, how to tell it from a heart problem, what helps in the moment, and what treatment with cognitive behavioural therapy looks like.",
		},
		keywords: {
			ro: [
				"atac de panică ce faci",
				"atac de panică simptome",
				"atac de panică sau infarct",
				"tulburare de panică",
				"cât durează un atac de panică",
				"tratament atac de panică",
			],
			en: [
				"panic attack what to do",
				"panic attack symptoms",
				"panic attack or heart attack",
				"panic disorder",
				"how long does a panic attack last",
				"panic attack treatment",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Cât durează un atac de panică?",
				en: "How long does a panic attack last?",
			},
			a: {
				ro: "NHS spune că cele mai multe durează între 5 și 20 de minute, iar unele până la o oră. NIMH vorbește despre câteva minute până la o oră. Sunt înspăimântătoare, dar nu periculoase în sine. Dacă simptomele durează mult sau seamănă cu durerea strivitoare din piept, tratează situația ca pe o urgență și sună la serviciul de urgență.",
				en: "The NHS says most last between 5 and 20 minutes, and some up to an hour. NIMH speaks of a few minutes up to an hour. They are frightening but not dangerous in themselves. If symptoms go on for a long time or resemble crushing chest pain, treat it as an emergency and call the emergency services.",
			},
		},
		{
			q: {
				ro: "Cum îmi dau seama dacă e atac de panică sau infarct?",
				en: "How do I know whether it is a panic attack or a heart attack?",
			},
			a: {
				ro: "Nu poți fi sigur singur, pentru că simptomele se pot asemăna. Durerea strivitoare în piept, care se întinde spre braț, gât sau maxilar, respirația foarte grea sau pielea palidă ori vineție cer ajutor de urgență. Dacă nu ești sigur, tratează situația ca pe o urgență. La primul atac, un consult medical exclude o cauză fizică.",
				en: "You cannot be sure on your own, because the symptoms can look alike. Crushing chest pain that spreads to the arm, neck or jaw, very difficult breathing, or pale or blue skin call for emergency help. If you are not sure, treat it as an emergency. After a first attack, a medical check rules out a physical cause.",
			},
		},
		{
			q: {
				ro: "Ce fac când simt că vine un atac de panică?",
				en: "What do I do when I feel a panic attack coming?",
			},
			a: {
				ro: "Rămâi unde ești, dacă e sigur, respiră lent și adânc și amintește-ți că va trece. Pune o mână pe burtă, ancorează-te în ce vezi și auzi și, dacă ești cu cineva, spune-i de ce ai nevoie. Nu lupta cu atacul, pentru că lupta îl poate întreține. Dacă ești la volan, oprește când poți face asta în siguranță.",
				en: "Stay where you are, if it is safe, breathe slowly and deeply, and remind yourself that it will pass. Put a hand on your belly, anchor yourself in what you see and hear, and if you are with someone, tell them what you need. Do not fight the attack, because fighting can keep it going. If you are driving, stop when you can do so safely.",
			},
		},
		{
			q: {
				ro: "Un singur atac de panică înseamnă tulburare de panică?",
				en: "Does a single panic attack mean panic disorder?",
			},
			a: {
				ro: "Nu. NIMH spune că un singur atac nu este el însuși o tulburare mintală. Se vorbește despre tulburare de panică atunci când atacurile sunt frecvente și neașteptate și sunt urmate de îngrijorare continuă că vor reveni sau de evitări care îți încurcă viața. Diagnosticul îl pune un specialist, după evaluare.",
				en: "No. NIMH says a single attack is not in itself a mental disorder. We speak of panic disorder when attacks are frequent and unexpected and are followed by ongoing worry that they will return, or by avoidance that gets in the way of life. A diagnosis is made by a specialist, after an evaluation.",
			},
		},
		{
			q: {
				ro: "Ce tratament există pentru atacurile de panică?",
				en: "What treatment is there for panic attacks?",
			},
			a: {
				ro: "NHS arată că terapiile prin vorbire și medicamentele sunt tratamentele principale, iar terapia cognitiv-comportamentală este terapia principală. NIMH o numește standardul de aur al psihoterapiei pentru panică. Decizia privind medicamentele aparține medicului. Un psiholog te poate ajuta cu terapia, după o evaluare.",
				en: "The NHS says talking therapies and medicine are the main treatments, and cognitive behavioural therapy is the main talking therapy. NIMH calls it the gold-standard psychotherapy for panic. Decisions about medicines belong to the doctor. A psychologist can help with therapy, after an evaluation.",
			},
		},
		{
			q: {
				ro: "Merg la psiholog, la psihiatru sau la medicul de familie?",
				en: "Do I see a psychologist, a psychiatrist or my family doctor?",
			},
			a: {
				ro: "Dacă simptomele fizice sunt noi sau puternice, începe cu medicul, ca să excluzi o cauză fizică. Apoi psihologul te poate evalua și poate lucra cu tine prin terapie. Dacă se pune problema medicamentelor, ele se discută cu medicul sau cu psihiatrul. Poți începe cu o discuție și să afli de acolo pașii următori.",
				en: "If physical symptoms are new or strong, start with the doctor to rule out a physical cause. Then a psychologist can evaluate you and work with you through therapy. If medicines come up, they are discussed with a doctor or psychiatrist. You can start with one conversation and learn the next steps from there.",
			},
		},
	],
	related: [
		"palpitatii-din-anxietate-ce-sunt",
		"exercitii-de-respiratie-pentru-anxietate",
		"anxietate-generalizata-simptome-si-ajutor",
		"terapia-cognitiv-comportamentala-explicata",
	],
};
