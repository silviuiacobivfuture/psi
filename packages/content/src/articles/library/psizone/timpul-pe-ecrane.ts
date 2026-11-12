import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "timpul-pe-ecrane",
	brand: "psizone",
	topic: "adolescenti",
	backlogNo: 6,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Timpul pe ecrane la copii și adolescenți: cât e prea mult",
		en: "Screen time for children and teenagers: how much is too much",
	},
	standfirst: {
		ro: "Nu există o cifră magică de ore. Ce contează este ce ocupă locul ecranului: somnul, școala, mișcarea, prietenii, masa de seară. Dacă ele se țin, ora în plus nu e o urgență. Dacă ele cedează și dispoziția se strică, merită o discuție calmă, iar uneori o evaluare.",
		en: "There is no magic number of hours. What matters is what the screen is taking the place of: sleep, school, movement, friends, the evening meal. If those hold, an extra hour is not an emergency. If they give way and mood suffers, it is worth a calm conversation, and sometimes an evaluation.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Nu există un număr de ore care să despartă „în regulă” de „prea mult”, valabil pentru orice copil. Întrebarea mai utilă este: ce a dispărut din ziua lui din cauza ecranului? Dacă somnul, școala, mișcarea și prietenii se țin, ecranul nu e, de regulă, problema. Dacă ele se clatină și dispoziția se strică, atunci merită o discuție, nu o ceartă.",
				en: "There is no number of hours that separates “fine” from “too much” for every child. A more useful question is: what has disappeared from his day because of the screen? If sleep, school, movement and friends are holding, the screen is not usually the problem. If they are wobbling and his mood is slipping, that is worth a conversation, not a row.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Probabil știi scena. E 21:40, temele nu sunt gata, telefonul e lipit de palmă, iar tu ai spus „încă cinci minute” de trei ori. Vocea ți se ridică, a lui se ridică și ea, iar seara se termină cu o ușă trântită. După aceea te întrebi dacă ai greșit tu undeva. Nu e vina ta. Aproape toți părinții de adolescenți au trecut prin seara asta.",
				en: "You probably know the scene. It is 21:40, the homework is not done, the phone is glued to his palm, and you have said “five more minutes” three times. Your voice rises, his rises too, and the evening ends with a slammed door. Afterwards you wonder whether you did something wrong. It is not your fault. Nearly every parent of a teenager has been through that evening.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce spun cercetările despre numărul de ore, și ce nu spun?",
				en: "What does research say about the number of hours, and what does it not say?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ghidul american al pediatrilor (AAP) pentru un plan media al familiei nu pune un plafon de ore pentru adolescenți. Îți cere să te uiți la rutinele voastre: ce loc au ecranele la masă, la teme, înainte de culcare, și ce rămâne în afara lor, adică lectura, joaca afară, jocurile de familie, hobby-urile. Pagina spune și că fiecare familie e diferită, deci planul trebuie să se potrivească rutinelor și valorilor voastre.",
				en: "The American Academy of Pediatrics (AAP) guidance on a family media plan does not set a ceiling of hours for teenagers. It asks you to look at your routines: where screens sit at the table, at homework, before bed, and what is left outside them, such as reading, playing outdoors, family games and hobbies. It also says every family is different, so the plan has to fit your own routines and values.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce nu poți afla dintr-o cifră: dacă două ore sunt mult pentru fiul tău. Două ore de mesaje cu cel mai bun prieten nu seamănă cu două ore de derulat clipuri la 1 noaptea. Același ceas poate însemna lucruri foarte diferite. De aceea nu îți dăm un tabel cu ore pe vârste. Nu am găsit în sursele pe care le-am citit o cifră la care să poți spune cinstit „aici se termină normalul”, și nu vrem s-o inventăm.",
				en: "What a single figure cannot tell you is whether two hours is a lot for your son. Two hours of messages with his best friend are not the same as two hours of scrolling clips at 1 a.m. The same clock can mean very different things. That is why we are not giving you a table of hours by age. In the sources we read there is no figure at which you could honestly say “normal ends here”, and we will not make one up.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată folosirea obișnuită și când merită o discuție?",
				en: "What does ordinary use look like, and when is it worth a conversation?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un adolescent obișnuit vrea telefonul mult, se supără când i-l iei și uneori minte puțin despre „ultimul episod”. Asta nu e o boală, e vârsta. Semnalul nu e cât de mult e ecranul în ziua lui, ci ce se întâmplă în jurul lui, vreme de săptămâni. Cele patru zone de urmărit sunt somnul, dispoziția, școala și prietenii.",
				en: "An ordinary teenager wants the phone a lot, gets cross when you take it, and sometimes fibs a little about “the last episode”. That is not an illness, it is the age. The signal is not how much of his day the screen takes, but what happens around it, over weeks. The four areas to watch are sleep, mood, school and friends.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Somn: adoarme târziu în mod repetat, e epuizat dimineața, sau se trezește noaptea să verifice telefonul. CDC indică pentru adolescenții de 13–17 ani 8–10 ore de somn pe zi.",
					en: "Sleep: he repeatedly falls asleep late, is exhausted in the morning, or wakes at night to check the phone. The CDC gives 8–10 hours of sleep a day for teenagers aged 13–17.",
				},
				{
					ro: "Dispoziție: e mai iritabil sau mai trist decât de obicei, are izbucniri de furie când nu are ecranul, sau pare gol după ce îl lasă din mână.",
					en: "Mood: he is more irritable or sadder than usual, flares up when he has no screen, or seems flat after he puts it down.",
				},
				{
					ro: "Școală: notele scad, temele nu se mai fac, apar absențe sau întârzieri, iar profesorii observă că e obosit sau distrat.",
					en: "School: grades slip, homework is no longer done, absences or lateness appear, and teachers notice he is tired or distracted.",
				},
				{
					ro: "Prieteni și viață reală: renunță la activități care îi plăceau, nu mai iese, evită familia, iar singurele relații rămân cele de pe ecran.",
					en: "Friends and real life: he drops activities he used to enjoy, stops going out, avoids the family, and the only relationships left are on the screen.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Un singur semn, o singură săptămână grea la școală, nu spune mare lucru. Dacă vezi două sau trei împreună și durează, e momentul să vorbești cu el. Și, dacă tot nu ți se pare clar, poți vorbi cu noi.",
				en: "A single sign, one hard week at school, does not say much. If you see two or three together and they last, it is time to talk to him. And if it still does not feel clear, you can talk to us.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce poți spune la 21:40, când începe cearta pentru telefon?",
				en: "What can you say at 21:40, when the fight over the phone starts?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cele mai multe certuri încep cu un ordin dat din ușă: „Lasă telefonul!”. Pentru el sună ca un atac, iar răspunsul vine pe măsură. Ajută dacă intri în cameră, te așezi, aștepți să termine ce face și abia apoi vorbești. Nu pentru că trebuie să cedezi, ci pentru că un om prins în mijlocul unui joc sau al unei conversații aude mult mai greu.",
				en: "Most rows begin with an order from the doorway: “Put the phone down!”. To him it sounds like an attack, and the answer matches. It helps if you go into the room, sit down, wait for him to finish what he is doing, and only then speak. Not because you have to give in, but because a person caught in the middle of a game or a conversation hears far less.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Poți să-i spui: „Văd că ești în mijlocul unui lucru. Peste zece minute ne oprim și telefonul stă la încărcat în hol. Vrei să-mi spui când ajungi la un loc bun să-l lași?” Vorbești despre limită, dar îi lași un cuvânt de spus. Dacă a doua zi vrei să deschizi subiectul mai larg, încearcă: „Aseară s-a ridicat tonul și nu-mi place cum a ieșit. Aș vrea să stabilim împreună ce facem seara cu telefoanele. Ce ți se pare corect?”",
				en: "You can say: “I can see you are in the middle of something. In ten minutes we stop, and the phone charges in the hall. Will you tell me when you reach a good place to leave it?” You speak about the limit but leave him a say. If the next day you want to open the wider subject, try: “Last night voices got raised and I did not like how it went. I would like us to decide together what we do with phones in the evening. What seems fair to you?”",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă totuși se aprinde scandalul, nu continua. Poți să spui: „Amândoi suntem nervoși. Ne oprim și reluăm mâine.” NHS notează despre certurile cu adolescenții că propriul tău comportament poate îmblânzi sau înrăutăți situația, și că ajută să te retragi și să revii după aproximativ 30 de minute. Limita rămâne. Doar tonul se schimbă.",
				en: "If a blow-up starts anyway, do not push on. You can say: “We are both upset. We stop here and pick it up tomorrow.” The NHS notes about arguments with teenagers that your own behaviour can ease or worsen the situation, and that it helps to step away and return after about 30 minutes. The limit stays. Only the tone changes.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce reguli de familie ajung să țină?",
				en: "Which family rules actually hold?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Regulile care țin sunt cele discutate cu el într-un moment liniștit, nu anunțate după o ceartă. AAP recomandă zone fără ecrane la masă, în timpul temelor și înainte de culcare, tocmai pentru conversație, învățare și somn. Mai recomandă oprirea redării automate și a notificărilor, gândite să-i țină pe copii mai mult în aplicație, și reluarea planului când se schimbă anul școlar sau vacanțele.",
				en: "The rules that hold are the ones talked through with him at a calm moment, not announced after a row. The AAP recommends screen-free zones at meals, during homework and before bed, precisely for conversation, learning and sleep. It also suggests turning off autoplay and notifications, which are designed to keep children in an app for longer, and revisiting the plan when the school year or the holidays change.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru un adolescent, o regulă primită are puține șanse. Una negociată are mai multe. Așază-vă la masă și întrebați-l: ce seri e important pentru el să fie online cu prietenii? Ce oră ar putea fi „ora telefoanelor în hol”? Ce se întâmplă dacă regula e încălcată, și cine decide asta? Scrieți trei sau patru rânduri și puneți-le pe frigider. La câteva săptămâni, uitați-vă din nou la ele. Dacă una nu merge, nu e un eșec, e o regulă de reglat.",
				en: "For a teenager, a rule handed down has little chance. A negotiated one has more. Sit at the table and ask him: which evenings matter to him to be online with friends? What time could be “phones in the hall time”? What happens if the rule is broken, and who decides? Write three or four lines and put them on the fridge. After a few weeks, look at them again. If one does not work, that is not a failure, it is a rule to adjust.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce face de fapt pe ecran, și cum afli fără interogatoriu?",
				en: "What is he actually doing on the screen, and how do you find out without an interrogation?",
			},
		},
		{
			type: "p",
			text: {
				ro: "„Ecranul” nu e un singur lucru. Poate fi un joc cu prietenii, un serial, o temă făcută pe laptop, un grup de clasă, o oră de muzică, o oră de derulat fără țintă. Pentru fiecare, întrebarea e alta. Nu începe cu „Ce tot faci acolo?”, care sună a control. Încearcă „Ce ai de pe telefon care ți-a plăcut azi?” sau „Arată-mi ce urmărești, sunt curios.” Dacă te uiți cu adevărat și nu comentezi imediat, vei afla mai mult într-un sfert de oră decât într-o săptămână de reproșuri.",
				en: "“The screen” is not one thing. It can be a game with friends, a series, homework done on a laptop, a class group chat, an hour of music, an hour of aimless scrolling. For each one the question is different. Do not start with “What are you doing on that thing?”, which sounds like control. Try “What did you see on your phone today that you liked?” or “Show me what you are watching, I am curious.” If you really look and do not comment straight away, you will learn more in a quarter of an hour than in a week of reproaches.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ajută și să observi cum se simte el după. Dacă pune telefonul jos relaxat, poate chiar bine dispus, e un tip de folosire. Dacă îl lasă din mână iritat, gol sau mai agitat, e altul. Nu trebuie să tragi concluzii dintr-o seară. Dar dacă îți dai seama că același tipar se repetă, ai ceva concret de spus: „Am observat că după ce stai o vreme pe telefon pari obosit. Tu ce simți?” Nu e o acuzație, e o observație, și el o poate respinge sau o poate confirma.",
				en: "It also helps to notice how he feels afterwards. If he puts the phone down relaxed, maybe even in good spirits, that is one kind of use. If he puts it down irritated, flat or more wound up, that is another. You need not draw conclusions from one evening. But if you realise the same pattern keeps repeating, you have something concrete to say: “I have noticed that after a while on the phone you seem tired. What do you feel?” That is not an accusation, it is an observation, and he can reject it or confirm it.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Dar telefonul tău? Rolul părintelui",
				en: "And your own phone? The parent’s part",
			},
		},
		{
			type: "p",
			text: {
				ro: "AAP spune direct: includeți-vă și pe voi, părinții, în plan, pentru că sunteți modele de obiceiuri digitale. Nu e un reproș. E doar o realitate pe care adolescenții o văd foarte bine. Dacă la masă tu răspunzi la e-mailuri, regula „fără telefon la masă” sună ca o ipocrizie.",
				en: "The AAP says it directly: include yourselves, the parents, in the plan, because you are role models for digital habits. It is not a reproach. It is simply a fact teenagers see very clearly. If at dinner you answer emails, the rule “no phones at the table” sounds like hypocrisy.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un început simplu: spune-i ce regulă accepți și tu. „Și eu las telefonul în hol de la 21:30. Dacă uit, ai voie să mi-l aduci.” Râde de obicei. Și, odată ce regula e reciprocă, devine mult mai greu de contestat.",
				en: "A simple start: tell him which rule you accept too. “I leave my phone in the hall from 21:30 as well. If I forget, you are allowed to bring it to me.” He usually laughs. And once the rule runs both ways, it becomes much harder to contest.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Când merită o evaluare, și cui nu îi trebuie una?",
				en: "When is an evaluation worth it, and who does not need one?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu orice adolescent atașat de telefon are nevoie de un psiholog. Dacă dormi bine, ai note acceptabile, ai prieteni și ești uneori ironic cu cei de acasă, probabil că ai nevoie de reguli bune, nu de o evaluare. Merită să programezi una când semnele din listă țin de săptămâni, când ecranul pare să acopere altceva (anxietate, tristețe, singurătate), când certurile au devenit violente sau când tu însuți simți că nu mai găsești calea.",
				en: "Not every teenager attached to a phone needs a psychologist. If he sleeps well, has acceptable grades, has friends and is only sometimes sarcastic with the family, he probably needs good rules, not an evaluation. It is worth booking one when the signs in the list have lasted weeks, when the screen seems to cover something else (anxiety, sadness, loneliness), when the rows have turned violent, or when you yourself feel you can no longer find the way.",
			},
		},
		{
			type: "p",
			text: {
				ro: "WHO arată că anxietatea și depresia pot perturba prezența și rezultatele la școală și pot duce la retragere socială, deci un ecran „lipit” poate fi uneori un efect, nu o cauză. La Psizone, evaluarea începe cu o discuție despre nevoile voastre și stabilește apoi obiectivele și etapele. Nu începe cu o etichetă. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
				en: "The WHO notes that anxiety and depression can disrupt school attendance and performance and lead to social withdrawal, so a screen that seems “glued” may sometimes be an effect, not a cause. At Psizone, an evaluation starts with a conversation about your needs and then sets goals and stages. It does not start with a label. If you or someone close to you is in immediate danger, call 112.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cum arată concret o vizită? Un adolescent are nevoie de un loc al lui, iar dorința de a vorbi singur cu un specialist nu e un semn rău. Într-o evaluare se vorbește de obicei despre somn, școală, prieteni, despre cum arată o zi obișnuită și despre ce vă doriți voi de la întâlnire. Cine e de față și când, în cazul vostru, întreabă-ne la programare.",
				en: "What does a visit look like in practice? A teenager needs a place of his own, and wanting to speak alone with a specialist is not a bad sign. An evaluation usually talks about sleep, school, friends, what an ordinary day looks like and what you hope to get from the meeting. Who is present and when, in your case, ask us when you book.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor, unul singur: scrie-ne ce te îngrijorează la ecranele din casa voastră și programează o evaluare pe psizone.ro. Prima discuție e despre voi, nu despre diagnostic.",
				en: "One next step: write to us about what worries you about the screens in your home and book an evaluation at psizone.ro. The first conversation is about you, not about a diagnosis.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "AAP (HealthyChildren.org): Cum faci un plan media pentru familie",
				en: "AAP (HealthyChildren.org): How to make a family media use plan",
			},
			href: "https://www.healthychildren.org/English/family-life/Media/Pages/How-to-Make-a-Family-Media-Use-Plan.aspx",
		},
		{
			label: {
				ro: "NHS: Ajută-ți copilul să depășească stresul din examene (somn, ecrane, ajutor)",
				en: "NHS: Help your child beat exam stress (sleep, screens, getting help)",
			},
			href: "https://www.nhs.uk/mental-health/children-and-young-adults/advice-for-parents/help-your-child-beat-exam-stress/",
		},
		{
			label: {
				ro: "NHS: Agresivitatea și certurile la adolescenți",
				en: "NHS: Teen aggression and arguments",
			},
			href: "https://www.nhs.uk/mental-health/children-and-young-adults/advice-for-parents/teen-aggression-and-arguments/",
		},
		{
			label: {
				ro: "CDC: Despre somn (ore recomandate pe vârstă)",
				en: "CDC: About sleep (recommended hours by age)",
			},
			href: "https://www.cdc.gov/sleep/about/index.html",
		},
		{
			label: {
				ro: "OMS: Sănătatea mintală a adolescenților",
				en: "WHO: Adolescent mental health",
			},
			href: "https://www.who.int/news-room/fact-sheets/detail/adolescent-mental-health",
		},
		{
			label: { ro: "Psizone: servicii pentru adolescenți", en: "Psizone: services for teenagers" },
			href: "https://psizone.ro",
		},
	],
	provenance: [
		"https://www.healthychildren.org/English/family-life/Media/Pages/How-to-Make-a-Family-Media-Use-Plan.aspx",
		"https://www.nhs.uk/mental-health/children-and-young-adults/advice-for-parents/help-your-child-beat-exam-stress/",
		"https://www.nhs.uk/mental-health/children-and-young-adults/advice-for-parents/teen-aggression-and-arguments/",
		"https://www.cdc.gov/sleep/about/index.html",
		"https://www.who.int/news-room/fact-sheets/detail/adolescent-mental-health",
		"https://psizone.ro",
		"docs/brands/writing-voice.md",
		"packages/design/brand-books/1-psizone.md",
	],
	seo: {
		title: {
			ro: "Timp pe ecrane copii adolescenți: cât e prea mult",
			en: "Teenage screen time: how much is too much?",
		},
		description: {
			ro: "Nu există o cifră magică de ore. Vezi ce contează, cum recunoști folosirea care merită o discuție și ce poți spune când începe cearta pentru telefon.",
			en: "There is no magic number of hours. See what matters, how to spot use worth a conversation, and what to say when the fight over the phone begins.",
		},
		keywords: {
			ro: [
				"timp pe ecrane copii adolescenți",
				"cât timp pe telefon e prea mult",
				"adolescent dependent de telefon",
				"reguli telefon adolescent",
				"ecrane și somn adolescent",
				"cearta pentru telefon",
			],
			en: [
				"teenage screen time",
				"how much screen time is too much",
				"teenager phone addiction",
				"phone rules for teenagers",
				"screens and teen sleep",
				"argument over phone teenager",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Câte ore pe zi la telefon sunt prea multe pentru un adolescent?",
				en: "How many hours a day on the phone is too many for a teenager?",
			},
			a: {
				ro: "Nu există o cifră care să se potrivească fiecărui copil. Ghidul AAP pentru planul media nu fixează un număr de ore, ci cere să te uiți la ce înlocuiește ecranul. Dacă somnul, școala, mișcarea și prietenii se mențin și dispoziția e stabilă, orele nu sunt, de regulă, o urgență. Dacă acestea cedează săptămâni la rând, merită o discuție.",
				en: "There is no figure that fits every child. The AAP family-media guidance does not fix a number of hours, but asks you to look at what the screen replaces. If sleep, school, movement and friends hold and mood is steady, the hours are not usually an emergency. If those give way for weeks on end, it is worth a conversation.",
			},
		},
		{
			q: {
				ro: "Cum îi iau telefonul fără scandal?",
				en: "How do I take the phone away without a row?",
			},
			a: {
				ro: "Cel mai bine e să nu-l iei din mână, ci să stabiliți dinainte o oră și un loc pentru telefon, de exemplu încărcat în hol. Anunță cu zece minute înainte, lasă-i să termine ce face și spune limita calm. Dacă tonul urcă, oprește discuția și reia-o mai târziu. O regulă negociată împreună se respectă mai ușor decât una impusă.",
				en: "It is best not to pull it out of his hand, but to agree beforehand on a time and a place for the phone, for instance charging in the hall. Warn him ten minutes ahead, let him finish what he is doing and state the limit calmly. If voices rise, stop and pick it up later. A rule negotiated together is easier to keep than one imposed.",
			},
		},
		{
			q: {
				ro: "Telefonul în dormitor noaptea: da sau nu?",
				en: "Phone in the bedroom at night: yes or no?",
			},
			a: {
				ro: "AAP recomandă zone fără ecrane înainte de culcare, iar NHS sugerează aproximativ o jumătate de oră de relaxare fără ecrane înaintea somnului. CDC indică 8–10 ore de somn pentru adolescenții de 13–17 ani. În practică, mulți părinți aleg încărcarea telefoanelor în afara dormitorului, regulă valabilă și pentru adulți.",
				en: "The AAP recommends screen-free zones before bed, and the NHS suggests about half an hour of winding down away from screens before sleep. The CDC gives 8–10 hours of sleep for teenagers aged 13–17. In practice many parents choose to charge phones outside the bedroom, a rule that applies to the adults as well.",
			},
		},
		{
			q: {
				ro: "Telefonul meu contează chiar dacă el e cel cu problema?",
				en: "Does my own phone matter if he is the one with the problem?",
			},
			a: {
				ro: "Da. AAP spune explicit că părinții sunt modele pentru obiceiurile digitale și că ar trebui incluși în plan. Nu înseamnă că ești vinovat, ci că o regulă pe care o respectă toți e mai credibilă. Un gest mic, ca telefonul lăsat în hol la masă, schimbă mult tonul discuției.",
				en: "Yes. The AAP says explicitly that parents are role models for digital habits and should be included in the plan. That does not mean you are to blame, only that a rule everyone follows is more credible. A small gesture, such as leaving your phone in the hall at dinner, changes the tone of the whole conversation.",
			},
		},
		{
			q: {
				ro: "Când trebuie să merg la psiholog din cauza ecranelor?",
				en: "When should I see a psychologist because of screens?",
			},
			a: {
				ro: "Când semnele durează de săptămâni: somn dat peste cap, dispoziție mai joasă sau iritabilitate, note în scădere, retragere din activități și de la prieteni. Mai ales dacă ecranul pare să acopere anxietate, tristețe sau singurătate. La Psizone, prima discuție e despre voi, nu despre diagnostic, iar evaluarea stabilește apoi obiectivele.",
				en: "When the signs have lasted weeks: disrupted sleep, lower mood or irritability, falling grades, withdrawal from activities and friends. Especially if the screen seems to cover anxiety, sadness or loneliness. At Psizone the first conversation is about you, not about a diagnosis, and the evaluation then sets the goals.",
			},
		},
	],
	related: [
		"primul-telefon-la-ce-varsta",
		"adolescent-dependent-de-jocuri-video",
		"somnul-adolescentului-si-telefonul-seara",
		"retele-sociale-si-stima-de-sine-adolescenti",
	],
};
