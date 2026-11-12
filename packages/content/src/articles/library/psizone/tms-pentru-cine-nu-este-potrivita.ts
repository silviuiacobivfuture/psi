import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "tms-pentru-cine-nu-este-potrivita",
	brand: "psizone",
	topic: "neuromodulare",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "TMS: pentru cine nu este potrivită",
		en: "Who TMS is not for",
	},
	standfirst: {
		ro: "TMS nu se face dacă ai metal feromagnetic în apropierea capului sau un implant cohlear. Epilepsia, o leziune cerebrală, alcoolul în exces sau unele medicamente cer o decizie atentă a medicului. Lista completă se stabilește la un screening înainte de prima ședință.",
		en: "TMS is not done if you have ferromagnetic metal near your head or a cochlear implant. Epilepsy, a brain lesion, heavy alcohol use or certain medicines call for a careful decision by a doctor. The full list is settled at a screening before the first session.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Dacă te uiți la TMS pentru tine sau pentru cineva drag, probabil prima întrebare nu e „ce poate face”, ci „îi poate face rău?”. E o întrebare bună, iar răspunsul scurt este acesta: pentru majoritatea oamenilor, stimularea magnetică transcraniană este bine tolerată, dar există situații în care nu se face deloc și altele în care se face doar după ce un medic a cântărit riscurile. Te ajut să le deosebești.",
				en: "If you are looking at TMS for yourself or someone you love, the first question is probably not “what can it do?” but “could it hurt?”. That is a good question. The short answer is that for most people transcranial magnetic stimulation is well tolerated, but there are situations where it is not done at all, and others where it is done only after a doctor has weighed the risks. Let me help you tell them apart.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pe scurt, TMS folosește o bobină plasată pe cap, care trimite impulsuri magnetice scurte către o zonă a creierului. Tocmai pentru că e vorba de câmp magnetic și de activitate electrică în creier, regulile de siguranță se împart în două: ce are legătură cu metalul și cu aparatele din corp, și ce are legătură cu riscul de convulsie. Ghidurile internaționale pun accentul pe ambele.",
				en: "In short, TMS uses a coil placed on the head that sends brief magnetic pulses towards one area of the brain. Because it involves a magnetic field and electrical activity in the brain, the safety rules fall into two groups: those about metal and devices in the body, and those about the risk of a seizure. International guidelines stress both.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cine nu poate face TMS deloc?",
				en: "Who cannot have TMS at all?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Primul grup ține de fizică, nu de sănătatea ta. O analiză de consens susținută de societăți de specialitate, spune că o contraindicație absolută este orice material feromagnetic aflat la mai puțin de 10 cm de bobină. Ghidul de siguranță al Federației Internaționale de Neurofiziologie Clinică (Rossi și colegii, 2021) adaugă că TMS trebuie evitată la persoanele cu implant cohlear, pentru că un implant cu magnet se poate deplasa sau se poate demagnetiza sub un impuls.",
				en: "The first group is about physics, not about your health. A consensus review endorsed by professional societies says an absolute contraindication is any ferromagnetic material within 10 cm of the coil. The safety guidelines of the International Federation of Clinical Neurophysiology (Rossi and colleagues, 2021) add that TMS should be avoided in people with cochlear implants, because an implant containing a magnet could move or demagnetise under a pulse.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un exemplu concret vine din fișa unui serviciu public de psihiatrie din Marea Britanie, Oxford Health. Acolo nu se face TMS dacă ai orice fel de metal în sau lângă cap, cu excepția aparatelor dentare și a plombelor. Lista lor include:",
				en: "A concrete example comes from the patient leaflet of a public mental health service in the UK, Oxford Health. There, TMS is not given if you have any type of metal in or near your head, except dental braces and fillings. Their list includes:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "clipsuri sau spirale (coil-uri) pentru anevrism;",
					en: "aneurysm clips or coils;",
				},
				{
					ro: "stenturi în gât sau în creier;",
					en: "stents in the neck or brain;",
				},
				{
					ro: "stimulatoare cerebrale profunde și electrozi pentru monitorizarea activității creierului;",
					en: "deep brain stimulators and electrodes that monitor brain activity;",
				},
				{
					ro: "implanturi metalice în urechi sau în ochi;",
					en: "metallic implants in the ears or eyes;",
				},
				{
					ro: "schije, gloanțe sau alte fragmente metalice în apropierea capului;",
					en: "shrapnel, bullet fragments or other metal pieces near the head;",
				},
				{
					ro: "tatuaje faciale cu cerneală metalică sau sensibilă la magnet, de discutat dacă nu ești sigur.",
					en: "facial tattoos with metallic or magnet-sensitive ink, to be discussed if you are not sure.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Nu toate centrele au exact aceeași listă, iar un stimulator implantat poate fi deteriorat dacă bobina trece aproape de el. Ghidul din 2021 menționează distanțe de 2 cm sau mai puțin ca posibil periculoase pentru anumite aparate implantate. De aceea, singura listă care contează pentru tine este cea pe care o verifică specialistul cu documentele medicale în față.",
				en: "Not every centre has exactly the same list, and an implanted stimulator can be damaged if the coil passes close to it. The 2021 guideline mentions distances of 2 cm or less as potentially damaging for certain implanted devices. That is why the only list that counts for you is the one a specialist checks with your medical papers in front of them.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Epilepsie, leziuni și alte situații care cer precauție",
				en: "Epilepsy, lesions and other situations that call for caution",
			},
		},
		{
			type: "p",
			text: {
				ro: "Al doilea grup ține de convulsii. Riscul principal legat de doza de stimulare este tocmai o convulsie, spune ghidul din 2021, și tot ghidul notează că riscul este scăzut. Cu toate acestea, epilepsia sau o convulsie în trecut sunt printre cele mai importante lucruri pe care le spui înainte de început. Analiza de consens le numește contraindicații relative: nu o interdicție automată, ci o situație în care medicul cântărește beneficiul față de risc. Fișa Oxford Health este mai prudentă: acolo, de regulă, nu se tratează persoanele cu diagnostic de epilepsie.",
				en: "The second group is about seizures. The main dose-related risk is a seizure, says the 2021 guideline, and the same guideline notes that the risk is low. Even so, epilepsy or a past seizure is among the most important things you tell the team before starting. The consensus review calls them relative contraindications: not an automatic ban, but a situation where the doctor weighs benefit against risk. The Oxford Health leaflet is more cautious: there, people with a diagnosis of epilepsy are usually not treated.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Vezi diferența dintre cele două surse și nu te speria: ea arată că decizia aparține medicului și protocolului unui centru, nu unei reguli unice pentru toată lumea. Dacă tu sau copilul tău ați avut vreodată o convulsie, chiar și una singură, chiar și în copilărie, spune asta de la început.",
				en: "Notice the difference between the two sources, and do not be alarmed by it. It shows that the decision belongs to the doctor and the protocol of a centre, not to one rule for everybody. If you or your child have ever had a seizure, even a single one, even in childhood, say so from the start.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Alte situații pe care evaluarea dinainte le caută, conform analizei de consens: un accident vascular cerebral în trecut, o traumă craniană, lipsa de somn, dezechilibrele de electroliți, consumul mare de alcool sau de droguri. Ghidul din 2021 spune despre leziunile cerebrale structurale, cum este cea de după un AVC, că stimularea lângă o leziune a indus uneori convulsii și că situația trebuie luată în calcul. Asta nu înseamnă „nu”. Înseamnă că cineva cu experiență decide.",
				en: "Other situations that the pre-treatment evaluation looks for, according to the consensus review: a past stroke, a head injury, lack of sleep, electrolyte imbalance, heavy alcohol or drug use. The 2021 guideline says of structural brain lesions, such as one left by a stroke, that stimulation close to a lesion has sometimes induced seizures and that this has to be taken into account. That does not mean “no”. It means someone experienced decides.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Medicamente și risc de convulsii: de ce rămâne decizia medicului",
				en: "Medicines and seizure risk: why this stays with the doctor",
			},
		},
		{
			type: "p",
			text: {
				ro: "Unele medicamente scad pragul de convulsie, adică fac creierul puțin mai ușor de „declanșat”. Analiza de consens le include printre lucrurile pe care evaluarea dinainte trebuie să le caute. Ghidul din 2021 spune totuși, în rezumat, că riscul este redus chiar și la pacienții care iau medicamente cu acțiune asupra sistemului nervos central, atunci când se folosesc parametri obișnuiți și bobine focalizate.",
				en: "Some medicines lower the seizure threshold, which means the brain is a little easier to “set off”. The consensus review lists them among the things the pre-treatment evaluation has to look for. The 2021 guideline nonetheless says, in its abstract, that the risk is low even in patients taking drugs that act on the central nervous system, when usual parameters and focal coils are used.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce înseamnă asta pentru tine, practic? Două lucruri, și amândouă sunt simple. Prima: nu opri și nu schimba niciun medicament ca să „te pregătești” pentru TMS. Asta nu este decizia ta singur, nici a mea, ci a medicului care ți-l prescrie. A doua: ia cu tine lista tuturor medicamentelor, inclusiv a celor fără rețetă și a suplimentelor, și arat-o specialistului. Dacă apare o întrebare despre ele, o primește medicul psihiatru sau neurolog, nu un forum.",
				en: "What does that mean for you in practice? Two things, both simple. First: do not stop or change any medicine to “get ready” for TMS. That is not your decision alone, nor mine, but that of the doctor who prescribes it. Second: bring the list of everything you take, including over-the-counter medicines and supplements, and show it to the specialist. If a question about them comes up, it goes to your psychiatrist or neurologist, not to a forum.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată screeningul înainte de prima ședință?",
				en: "What does the screening before the first session look like?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un screening serios nu e o bifă rapidă. Analiza de consens spune că evaluarea dinainte ar trebui să se concentreze pe identificarea factorilor de risc pentru convulsie. În practică, asta înseamnă o discuție și un chestionar. În serviciul din Oxford, de exemplu, medicul stă de vorbă cu tine la prima ședință ca să confirme că tratamentul ți se potrivește, apoi semnezi acordul și completezi chestionare de monitorizare.",
				en: "A serious screening is not a quick tick-box. The consensus review says the pre-treatment evaluation should focus on identifying risk factors for seizure. In practice that means a conversation and a questionnaire. At the Oxford service, for example, a doctor talks with you at the first session to confirm that the treatment suits you, then you sign a consent form and complete monitoring questionnaires.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Te poți aștepta, în general, la întrebări de felul acesta: ai vreun implant sau aparat în corp? Ai avut vreodată o convulsie sau o leziune la cap? Ce medicamente iei? Ai dormit puțin în ultimele zile? Bei alcool? Poți să spui, pe un ton liniștit: „Am o fișă medicală veche, vreau să o verificăm împreună.” Nu ești o pacientă sau un pacient greoi dacă pui întrebări. Ești exact cine trebuie să fii.",
				en: "In general you can expect questions along these lines: do you have any implant or device in your body? Have you ever had a seizure or a head injury? What medicines do you take? Have you slept little in the last few days? Do you drink alcohol? You can say, calmly: “I have an old medical record, I would like us to check it together.” You are not a difficult patient for asking. You are exactly who you should be.",
			},
		},
		{
			type: "p",
			text: {
				ro: "În ziua ședinței, la Oxford ți se cere să scoți bijuteriile, piercingurile și agrafele, iar telefonul și cardurile sunt puse deoparte, departe de câmpul magnetic. Primești dopuri pentru urechi, pentru că în timpul tratamentului auzi o serie de clic-uri. Analiza de consens recomandă o protecție auditivă de cel puțin 30 dB pentru pacient și pentru personal.",
				en: "On the day of the session, at Oxford you are asked to remove jewellery, piercings and hair grips, and your phone and bank cards are kept aside, away from the magnetic field. You are given earplugs, because during treatment you hear a series of clicks. The consensus review recommends hearing protection of at least 30 dB for the patient and the staff.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Sarcina și vârsta: ce se știe și ce nu",
				en: "Pregnancy and age: what is known and what is not",
			},
		},
		{
			type: "p",
			text: {
				ro: "Despre sarcină, datele sunt limitate, dar liniștitoare. Analiza de consens spune că studiile de până acum nu susțin temerile legate de riscuri pentru făt sau pentru sugarul alăptat, și citează o analiză a 67 de nașteri la mame tratate cu TMS în sarcină, în care nicio mamă și niciun bebeluș nu a avut un eveniment advers grav. Autorii notează și că depresia netratată a mamei are propriile riscuri. Dacă ești însărcinată sau alăptezi, decizia o iei cu medicul care te urmărește, cântărind ambele părți.",
				en: "On pregnancy, the data are limited but reassuring. The consensus review says studies so far do not support concerns about risks to the fetus or to a breastfed baby, and it cites a record review of 67 births to mothers treated with TMS during pregnancy in which no mother or baby had a serious adverse event. The authors also note that untreated maternal depression carries its own risks. If you are pregnant or breastfeeding, you take the decision with the doctor who follows you, weighing both sides.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Despre vârstă, părinții întreabă cel mai des. Aceeași analiză spune că în Statele Unite TMS a fost autorizată ca tratament adăugat pentru adolescenți de la 15 ani, în depresie, iar pentru copii și adolescenți sub 15 ani folosirea este în afara indicației oficiale. Nu am găsit în sursele citite aici o vârstă minimă care să valoreze și pentru România. Dacă e vorba de un copil, discuția nu o ai direct cu un centru de neuromodulare: începe la medicul psihiatru sau neurolog al copilului.",
				en: "On age, parents ask most often. The same review says that in the United States TMS has been cleared as an add-on treatment for adolescents aged 15 and older, in depression, while for children and adolescents under 15 its use is off-label. I did not find, in the sources read here, a minimum age that applies in Romania. If it is a child, the conversation does not start at a neuromodulation centre: it starts with the child’s own psychiatrist or neurologist.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce efecte secundare pot apărea?",
				en: "What side effects can there be?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cele mai frecvente sunt cele mici și trecătoare. Analiza de consens spune că disconfortul sau durerea de scalp în zona stimulată este cea mai comună (incidență 39%), urmată de dureri de cap, greață, amețeală, oboseală și insomnie, toate acute și limitate în timp. Fișa din Oxford adaugă mișcările involuntare ale mușchilor scalpului în timpul ședinței, care la unii oameni duc la o durere de cap ce scade pe parcursul ședințelor, și oboseala de după.",
				en: "The most common ones are small and short-lived. The consensus review says scalp pain or discomfort at the stimulation site is the most common (incidence 39%), followed by headache, nausea, dizziness, fatigue and insomnia, all acute and time-limited. The Oxford leaflet adds muscle twitching in the scalp during the session, which in some people leads to a headache that tends to ease as sessions continue, and tiredness afterwards.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Convulsia este rară. Fișa din Oxford vorbește despre un risc mic, sub 1 la 10.000, care poate crește cu protocoalele accelerate și cu anumiți factori: o leziune cerebrală, alcoolul, lipsa de somn, unele medicamente. Analiza de consens dă cifre apropiate pentru tratamentul depresiei: aproximativ 1 la 12.500 de tratamente cu o bobină obișnuită în formă de 8 și aproximativ 1 la 2.000 cu un alt tip de bobină. Riscul de convulsie dispare când impulsurile încetează, deci nu te așteaptă acasă. Mai există un risc mic, sub 1 la 100, de simptome hipomaniacale: dispoziție exagerat de bună, gânduri în goană, iritabilitate, nevoie mai mică de somn. Spune-le specialistului dacă observi așa ceva.",
				en: "A seizure is rare. The Oxford leaflet speaks of a small risk, under 1 in 10,000, which may be higher with accelerated protocols and with certain factors: a brain lesion, alcohol, sleep deprivation, some medicines. The consensus review gives similar figures for depression treatment: about 1 in 12,500 treatments with a standard figure-of-eight coil and about 1 in 2,000 with another coil type. The increased risk ends when the pulses stop, so it does not follow you home. There is also a small risk, under 1 in 100, of hypomanic symptoms: unusually elevated mood, racing thoughts, irritability, less need for sleep. Tell the specialist if you notice anything like that.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Singura listă care contează este cea pe care o verifică un specialist cu documentele tale medicale în față.",
				en: "The only list that counts is the one a specialist checks with your medical papers in front of them.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce faci în continuare",
				en: "What to do next",
			},
		},
		{
			type: "p",
			text: {
				ro: "TMS apare printre serviciile Psizone, alături de QEEG și neurofeedback, iar centrul spune pe site că aceste metode pot fi recomandate ca metode complementare, după o evaluare individuală, și că nu înlocuiesc recomandările psihologice, educaționale, logopedice sau medicale. Detaliile despre TMS nu sunt descrise pe pagina centrului, așa că le afli la evaluare, nu din acest articol.",
				en: "TMS appears among Psizone’s services, alongside QEEG and neurofeedback, and the centre says on its site that these methods may be recommended as complementary after an individual evaluation, and that they do not replace psychological, educational, speech or medical recommendations. TMS details are not described on the centre’s page, so you find them at the evaluation, not in this article.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
				en: "If you or someone close to you is in immediate danger, call 112.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor: scrie pe o foaie ce implanturi, intervenții la cap, convulsii și medicamente are persoana în cauză, ia foaia cu tine și discut-o cu medicul curant înainte să programezi evaluarea la Psizone. Programarea o faci din butonul „Programează o evaluare” de pe psizone.ro.",
				en: "Next step: write on a sheet of paper which implants, head surgeries, seizures and medicines the person has, take the sheet with you and discuss it with the treating doctor before you book the evaluation at Psizone. You book from the “Programează o evaluare” button on psizone.ro.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Rossi și colab. (2021), ghid IFCN de siguranță pentru TMS (Clinical Neurophysiology, PMC)",
				en: "Rossi et al. (2021), IFCN safety guidelines for TMS (Clinical Neurophysiology, PMC)",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9094636/",
		},
		{
			label: {
				ro: "Analiză de consens despre TMS în depresie (PMC)",
				en: "Consensus review on TMS for depression (PMC)",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11825283",
		},
		{
			label: {
				ro: "Oxford Health NHS: fișa pentru pacient despre rTMS",
				en: "Oxford Health NHS: rTMS patient information leaflet",
			},
			href: "https://oxfordhealth.nhs.uk/wp-content/uploads/sites/36/2025/02/rTMS-PIL-leaflet-v-6.0.pdf",
		},
		{
			label: { ro: "Psizone: serviciile centrului", en: "Psizone: the centre’s services" },
			href: "https://psizone.ro",
		},
	],
	provenance: [
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC9094636/ (Rossi et al. 2021: abstract; 2.3 dose-related seizure risk; 2.6.5 lesions; 3.2.2 magnet implants; 3.2.4 devices within 2 cm, cochlear implants)",
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC11825283 (consensus review: ferromagnetic material within 10 cm; epilepsy and heavy alcohol or drugs as relative; pre-TMS evaluation; side effects 39%; seizure 1/12,500 and 1/2,000; pregnancy, 67 births; FDA 15+ adolescents; 30 dB ear protection)",
		"https://oxfordhealth.nhs.uk/wp-content/uploads/sites/36/2025/02/rTMS-PIL-leaflet-v-6.0.pdf (Who should not have rTMS; side effects; seizure under 1 in 10,000; hypomania under 1 in 100; appointment routine; read as extracted PDF text)",
		"https://psizone.ro (services list; QEEG, neurofeedback and TMS framed as complementary; TMS only a menu link, no details)",
		"packages/content/src/articles/library/psizone/afazie-dupa-avc-cum-comunici.ts (house shape reference)",
		"docs/brands/writing-voice.md; packages/design/brand-books/1-psizone.md",
	],
	seo: {
		title: {
			ro: "TMS contraindicații: pentru cine nu este potrivită",
			en: "TMS contraindications: who should not have TMS",
		},
		description: {
			ro: "Cine nu poate face TMS: metal în cap, implant cohlear, epilepsie și alte situații, plus cum arată screeningul și ce efecte secundare pot apărea.",
			en: "Who should not have TMS: metal near the head, cochlear implants, epilepsy and other cautions, plus what screening looks like and the side effects to expect.",
		},
		keywords: {
			ro: [
				"TMS contraindicații",
				"stimulare magnetică transcraniană cine nu poate",
				"TMS epilepsie",
				"TMS efecte secundare",
				"TMS sarcină",
				"screening înainte de TMS",
			],
			en: [
				"TMS contraindications who should not have TMS",
				"transcranial magnetic stimulation who cannot have it",
				"TMS and epilepsy",
				"TMS side effects",
				"TMS pregnancy",
				"TMS screening",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Pot face TMS dacă am implanturi metalice?",
				en: "Can I have TMS if I have metal implants?",
			},
			a: {
				ro: "Depinde de unde se află metalul. Orice material feromagnetic la mai puțin de 10 cm de bobină este contraindicație absolută, iar implantul cohlear trebuie evitat. Implanturile departe de cap, în alte părți ale corpului, se judecă separat. Nu te baza pe o regulă generală: specialistul îți verifică documentele medicale și decide.",
				en: "It depends on where the metal is. Any ferromagnetic material within 10 cm of the coil is an absolute contraindication, and a cochlear implant should be avoided. Implants far from the head, elsewhere in the body, are judged separately. Do not rely on a general rule: the specialist checks your medical records and decides.",
			},
		},
		{
			q: {
				ro: "TMS este interzisă în epilepsie?",
				en: "Is TMS forbidden in epilepsy?",
			},
			a: {
				ro: "Nu există o regulă identică peste tot. Analiza de consens consideră epilepsia o contraindicație relativă, deci cere o evaluare a riscului față de beneficiu, iar unele servicii, precum cel din Oxford, de regulă nu tratează persoanele cu epilepsie. Dacă ai avut vreodată o convulsie, spune asta de la început și discută cu neurologul.",
				en: "There is no identical rule everywhere. The consensus review treats epilepsy as a relative contraindication, so it asks for a risk-benefit assessment, while some services, such as the one in Oxford, usually do not treat people with epilepsy. If you have ever had a seizure, say so from the start and talk to your neurologist.",
			},
		},
		{
			q: {
				ro: "Ce medicamente contează înainte de TMS?",
				en: "Which medicines matter before TMS?",
			},
			a: {
				ro: "Cele care scad pragul de convulsie sunt printre lucrurile pe care evaluarea dinainte le caută. Nu opri și nu schimba nimic singur. Fă o listă cu tot ce iei, inclusiv fără rețetă și suplimente, și o discuți cu medicul psihiatru sau neurolog care ți le prescrie. El decide, nu articolul acesta și nu un forum.",
				en: "Those that lower the seizure threshold are among the things the pre-treatment evaluation looks for. Do not stop or change anything on your own. Make a list of everything you take, including over-the-counter medicines and supplements, and discuss it with the psychiatrist or neurologist who prescribes them. They decide, not this article and not a forum.",
			},
		},
		{
			q: {
				ro: "Se poate face TMS în sarcină?",
				en: "Can TMS be done during pregnancy?",
			},
			a: {
				ro: "Datele sunt limitate, dar liniștitoare: analiza de consens citează 67 de nașteri la mame tratate cu TMS în sarcină, fără evenimente adverse grave la mame sau bebeluși. Autorii notează că și depresia netratată are riscuri. Decizia se ia cu medicul care urmărește sarcina, nu singură și nu pe baza unui singur studiu.",
				en: "The data are limited but reassuring: the consensus review cites 67 births to mothers treated with TMS during pregnancy, with no serious adverse events in mothers or babies. The authors note that untreated depression carries its own risks. The decision is taken with the doctor following the pregnancy, not alone and not on the basis of one study.",
			},
		},
		{
			q: {
				ro: "De la ce vârstă se poate face TMS?",
				en: "From what age can TMS be done?",
			},
			a: {
				ro: "În Statele Unite, TMS este autorizată pentru adolescenți de la 15 ani, ca tratament adăugat în depresie; sub 15 ani folosirea este în afara indicației oficiale. Nu am găsit un prag valabil pentru România în sursele citite. Pentru un copil sau un adolescent, discuția începe la psihiatrul sau neurologul care îl cunoaște.",
				en: "In the United States, TMS is cleared for adolescents aged 15 and older as an add-on treatment in depression; under 15 its use is off-label. I did not find a threshold that applies to Romania in the sources read. For a child or teenager, the conversation begins with the psychiatrist or neurologist who knows them.",
			},
		},
		{
			q: {
				ro: "Doare TMS și ce efecte secundare are?",
				en: "Does TMS hurt, and what are the side effects?",
			},
			a: {
				ro: "Cele mai frecvente sunt disconfortul sau durerea scalpului în locul stimulat, durerea de cap, greața, amețeala și oboseala, trecătoare. Simți un ciocănit sub bobină și auzi clic-uri, de aceea se poartă dopuri pentru urechi. Convulsia este rară, iar un risc mic de simptome hipomaniacale există. Spune echipei orice te îngrijorează.",
				en: "The most common are scalp discomfort or pain at the stimulated spot, headache, nausea, dizziness and tiredness, all passing. You feel a tapping under the coil and hear clicks, which is why earplugs are worn. A seizure is rare, and there is a small risk of hypomanic symptoms. Tell the team anything that worries you.",
			},
		},
	],
	related: [
		"tms-pe-intelees-stimulare-magnetica",
		"ce-include-o-evaluare-la-psizone-galati",
		"cum-faci-o-programare-la-psizone-galati",
	],
};
