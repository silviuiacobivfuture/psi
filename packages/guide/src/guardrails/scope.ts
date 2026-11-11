import { fold, matchesAny } from "./normalize";

/**
 * Requests the guide never answers: a diagnosis, medication, or advice on one person's treatment.
 * The patterns key on the shape of the request, not on topic words, so "Ce tratamente oferiți
 * pentru ADHD?" or "What are the signs of autism?" pass while "Copilul meu are ADHD?" or "Should I
 * stop the sertraline?" do not.
 */
const CONDITION =
	"(adhd|autis|tsa|asperger|depresi|depress|bipolar|schizofren|schizophren|dislexi|dyslexi|discalculi|dispraxi|tulburare|disorder|ocd)";

/** Someone the visitor speaks about: "copilul meu", "fiica mea", "el". */
const PERSON_RO =
	"(eu|el|ea|copilul( meu| nostru)?|fiul( meu| nostru)?|fiica( mea| noastra)?|baiatul( meu)?|fata( mea)?|fetita( mea)?|baietelul( meu)?|sotul( meu)?|sotia( mea)?)";

const DIAGNOSIS: ReadonlyArray<RegExp> = [
	/\b(pune|puneti|pui|poti pune|puteti pune) (mi |ne |i )?(un |o )?diagnostic/,
	/\b(ma|il|o|ne) (puteti |poti )?diagnostica/,
	/\bdiagnosticheaza (ma|l|o)\b/,
	/\bce (diagnostic|boala|tulburare|afectiune) (am|are|avem|ar putea avea)\b/,
	/\bce are (copilul|fiul|fiica|baiatul|fata) meu\b|\bce are (fiica|fata) mea\b/,
	/\bce (e|este) in neregula cu (mine|el|ea|copilul|fiul|fiica)\b/,
	// "Am ADHD?", "Sunt autist?": a first-person question, verb first (Romanian drops the pronoun).
	new RegExp(
		`(^|[.!?]) (oare |eu )?(am|sunt|as putea avea)\\b[^.!?,]{0,15}\\b${CONDITION}[^.!?,]{0,25}\\?`,
	),
	// "Copilul meu are ADHD?", "Fiul meu e autist?": a named person, then the condition, close by.
	new RegExp(
		`\\b${PERSON_RO} (e|este|are|ar putea avea|ar putea fi|sufera de)\\b[^.!?,]{0,15}\\b${CONDITION}[^.!?,]{0,25}\\?`,
	),
	new RegExp(`(^|[.!?]) (oare )?(are|e|este) ${PERSON_RO}\\b[^.!?,]{0,15}\\b${CONDITION}`),
	/\bdiagnos(e|is)\b[^.!?]{0,15}\b(me|my|him|her|us)\b/,
	/\b(give|tell) (me|us) (a|the|my|his|her) diagnosis\b/,
	/\bwhat (s|is) wrong with (me|my \w+|him|her)\b/,
	/\bwhat (disorder|condition|illness) (do i|does (my \w+|he|she)) have\b/,
	new RegExp(
		`\\b(do|does|could|might) (i|my \\w+|he|she) (have|has|be|suffer from)\\b[^.!?,]{0,12}\\b${CONDITION}`,
	),
	/\b(am i|is (my \w+|he|she)) [^.!?,]{0,12}\b(autistic|adhd|depressed|bipolar|dyslexic|schizophrenic|on the spectrum)\b/,
];

/** "How do I know if…", "the signs of…": general information, answerable from reviewed content. */
const DIAGNOSIS_EXEMPT: ReadonlyArray<RegExp> = [
	/\b(cum|de unde) (stiu|imi dau seama|pot sti|pot sa stiu|recunosc|ne dam seama)\b/,
	/\b(semne|semnele|simptome|simptomele)\b/,
	/\bhow (do|can|would) (i|we|you) (know|tell|recogni[sz]e)\b/,
	/\b(signs|symptoms|warning signs)\b/,
];

const MEDICATION: ReadonlyArray<RegExp> = [
	/\bmedicament/,
	/\bpastil/,
	/\bpilul/,
	/\b(doza|dozaj|dozajul|dozele|dozei)\b/,
	/\b\d+ ?mg\b/,
	/\breteta\b/,
	/\bprescri/,
	/\b(antidepresiv|anxiolitic|neuroleptic|antipsihotic|antidepressant|antipsychotic)/,
	/\b(medication|meds|pills?|dosage|doses?)\b/,
	/\b(ritalin|concerta|strattera|atomoxetin|metilfenidat|methylphenidat|adderall|risperid|aripiprazol|sertralin|fluoxetin|escitalopram|paroxetin|xanax|alprazolam|diazepam|lorazepam|clonazepam|melatonin|valproat|lamotrigin|litiu|lithium|ssri)/,
];

const TREATMENT_ADVICE: ReadonlyArray<RegExp> = [
	/\btratez\b/,
	/\bce (tratament|terapie) (sa|ar trebui sa) (iau|ia|urmez|urmeze|fac|faca|dau|dam)\b/,
	/\b(sa|ar trebui sa|pot sa) (opresc|intrerup|schimb|cresc|scad)\b[^.!?]{0,30}\b(tratament|terapi|medica|pastil|doza)/,
	/\b(sa|ar trebui sa|pot sa) renunt la (tratament|terapi|medica|pastil)/,
	/\bhow (do|should|can) i (treat|cure)\b/,
	/\b(should|can) (i|we|my \w+|he|she) (stop|quit|change|increase|reduce|lower|double|skip|come off)\b[^.!?]{0,30}\b(treatment|therapy|medication|meds|pills?|dose)/,
	/\bwhat (treatment|therapy|medication|dose) should (i|we|he|she|my \w+)\b/,
	/\bwhat should i (take|give (him|her|my \w+))\b/,
];

/** True when the question asks for a diagnosis, medication or individual treatment advice. */
export function isOutOfScope(text: string): boolean {
	const folded = fold(text);
	if (matchesAny(folded, MEDICATION) || matchesAny(folded, TREATMENT_ADVICE)) return true;
	return matchesAny(folded, DIAGNOSIS) && !matchesAny(folded, DIAGNOSIS_EXEMPT);
}

const CLINICAL: ReadonlyArray<RegExp> = [
	new RegExp(`\\b${CONDITION}`),
	/\b(anxiet|panic|insomni|somn|sleep|stres|stress|burnout|trauma|tic\b|ticuri|epilep|convuls|seizure)/,
	/\b(terapi|therap|tratament|treatment|simptom|symptom|diagnos|evaluare|evaluation|assessment)/,
	/\b(psiholog|psycholog|psihiatr|psychiatr|psihoterap|psychotherap|neurolog|logoped|speech)/,
	/\b(aba|qeeg|neurofeedback|tms|integrare senzoriala|sensory integration)\b/,
	/\b(copil|copilul|copii|child|children|kid|son|daughter|fiul|fiica|bebe|baby|adolescent|teen)/,
];

/** True when the question is about health, development or therapy: the clinic's ground. */
export function isClinical(text: string): boolean {
	return matchesAny(fold(text), CLINICAL);
}

const SISTER_BRANDS: ReadonlyArray<RegExp> = [
	/\bhemi ?sync/,
	/\beq ?sync/,
	/\bmonroe\b/,
	/\bgateway voyage/,
	/\bbinaura/,
];

/** True when text names Hemi-Sync, EQ-SYNC or their methods (folded match, any spelling). */
export function mentionsSisterBrand(text: string): boolean {
	return matchesAny(fold(text), SISTER_BRANDS);
}
