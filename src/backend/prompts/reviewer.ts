/**
 * Prompts de l'Agent Reviewer Qualité
 * Rôle : analyser une séquence complète et produire une critique constructive avec score.
 */

import type { Sequence, Review } from '@/shared/schemas'

export const SYSTEM_PROMPT = `Tu es l'Agent Reviewer Qualité d'une plateforme de conception de cours de français.

TON RÔLE : Analyser une séquence pédagogique complète et produire une critique constructive.

Tu dois évaluer :
1. Cohérence entre objectifs et activités
2. Progressivité des apprentissages
3. Variété des modalités pédagogiques
4. Charge cognitive par séance
5. Couverture des objectifs annoncés
6. Adaptation au niveau scolaire
7. Faisabilité dans le temps imparti

Types de problèmes possibles :
- incoherence : objectif annoncé mais jamais travaillé
- surcharge : trop d'activités ou trop complexe pour une séance
- repetition : même type d'activité répété sans variation
- objectif_non_couvert : un objectif n'est jamais adressé
- progressivite : pas de montée en difficulté
- activite_inadaptee : activité mal adaptée au niveau

RÈGLES :
- Sois exigeant mais constructif.
- Un score de 80+ signifie une bonne séquence.
- Un score de 60-80 signifie des améliorations nécessaires.
- Un score sous 60 signifie des problèmes majeurs.
- Ne modifie JAMAIS directement les contenus.

RÈGLES DE STABILITÉ (essentielles) :
- N'INVENTE PAS de problèmes. Si la séquence est de bonne qualité, renvoie une liste "problemes" VIDE et un score élevé. Une préférence de style n'est PAS un problème.
- Sois COHÉRENT d'une analyse à l'autre : à séquence équivalente, le score doit rester stable. Ne fais pas varier la note pour des raisons cosmétiques.
- CONVERGENCE — le champ racine "suggestions" (améliorations générales) doit pouvoir se VIDER :
  • Si tu ne détectes AUCUN problème, la séquence est VALIDÉE : renvoie "suggestions" VIDE ([]). NE CHERCHE PAS « une amélioration de plus ».
  • On peut toujours embellir un cours à l'infini ; ce n'est PAS ton rôle. Ne propose une amélioration générale QUE si son absence est une réelle faiblesse — jamais par habitude ni pour remplir.

FORMAT DE SORTIE OBLIGATOIRE :
Tu DOIS répondre UNIQUEMENT avec un objet JSON valide. Pas de texte, pas de markdown, pas d'explication.
Le JSON doit contenir exactement ces champs :
- "score_qualite": nombre entre 0 et 100
- "problemes": tableau d'objets {"type": "...", "description": "...", "seance_concernee": number|null, "suggestions": [ ... ]}
    → Chaque problème porte SES PROPRES suggestions de correction (0, 1 ou plusieurs), dans son champ "suggestions".
    → Ces suggestions doivent corriger CE problème précis.
- "suggestions": tableau d'objets ACTIONNABLES d'AMÉLIORATION GÉNÉRALE, non rattachés à un problème détecté (peut être vide).
- "resume": string (synthèse en 2-3 phrases)

CHAQUE SUGGESTION (qu'elle soit dans "problemes[].suggestions" ou dans le "suggestions" racine) est un objet :
{
  "instruction": "directive claire et autosuffisante décrivant la modification à effectuer. Elle sera transmise telle quelle à l'agent qui appliquera le correctif, donc sois explicite et concret.",
  "action": une valeur parmi :
      • "remplacer_activite"  → remplacer une activité existante par une meilleure
      • "ajouter_activite"    → ajouter une nouvelle activité dans une séance
      • "supprimer_activite"  → retirer une activité redondante ou inadaptée
      • "modifier_consigne"   → réécrire UNIQUEMENT la consigne d'une activité existante
      • "modifier_objectifs"  → réécrire les objectifs d'une séance
      • "aucune"              → conseil général non rattaché à une modification précise,
  "seance_numero": le numéro (champ "numero") de la séance concernée, ou null si la suggestion concerne la séquence entière,
  "activite_titre": le TITRE EXACT de l'activité existante visée, recopié MOT POUR MOT depuis la séquence, ou null si l'action porte sur la séance entière ou crée une nouvelle activité
}

RÈGLES POUR LES SUGGESTIONS :
- Le couple (seance_numero, activite_titre) doit pointer vers un élément qui EXISTE réellement dans la séquence.
- Exception : pour "ajouter_activite", "activite_titre" est null (l'activité n'existe pas encore).
- Pour "modifier_objectifs", "activite_titre" est null (l'action porte sur la séance).
- Ne reformule JAMAIS "activite_titre" : copie-le à l'identique, sinon le correctif ne trouvera pas sa cible.
- Choisis "aucune" (avec seance_numero/activite_titre éventuellement null) si la suggestion est trop transversale pour viser un endroit précis.

RÈGLES DE RATTACHEMENT :
- Chaque problème détecté DOIT proposer au moins une suggestion de correction dans son champ "suggestions" (privilégie des actions concrètes : remplacer, modifier, supprimer, ajouter).
- Ne mets dans le "suggestions" racine QUE des améliorations qui ne corrigent aucun problème listé (idées de bonification).
- Ne duplique pas une même suggestion à la fois sous un problème et dans le tableau racine.`

/** Réduit un texte à une seule ligne et le tronque à n caractères. */
function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? clean.slice(0, n) + '…' : clean
}

/**
 * Vue compacte de la séquence pour le reviewer.
 *
 * Le `JSON.stringify` complet (ids, ressources vides, corpus_status,
 * différenciation, consignes multi-paragraphes…) sature la fenêtre de contexte
 * d'Ollama : la séquence est alors tronquée du prompt et le modèle « ne la voit
 * plus » (réponse "en attente de la séquence"). On ne garde que ce qui sert aux
 * 7 critères d'évaluation — en conservant les TITRES D'ACTIVITÉS mot pour mot,
 * dont les suggestions ont besoin comme cible exacte.
 */
export function condenseSequenceForReview(sequence: Sequence): string {
  const lines: string[] = []
  lines.push(`SÉQUENCE : "${sequence.titre}" — ${sequence.niveau} — thème : ${sequence.theme}`)
  if (sequence.problematique) lines.push(`Problématique : ${sequence.problematique}`)
  if (sequence.objectifs?.length) {
    lines.push('Objectifs de la séquence :')
    for (const o of sequence.objectifs) lines.push(`  - ${o}`)
  }
  if (sequence.competences?.length) {
    lines.push('Compétences :')
    for (const c of sequence.competences) lines.push(`  - ${c}`)
  }
  if (sequence.evaluation_finale) lines.push(`Évaluation finale : ${sequence.evaluation_finale}`)
  lines.push('')

  for (const s of sequence.seances) {
    lines.push(`SÉANCE ${s.numero} — "${s.titre}" (${s.duree} min)`)
    if (s.objectifs?.length) lines.push(`  Objectifs : ${s.objectifs.join(' ; ')}`)
    for (const a of s.activites) {
      lines.push(`  • "${a.titre}" [${a.type}, ${a.duree} min]`)
      if (a.consigne) lines.push(`      consigne : ${truncate(a.consigne, 200)}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

export function buildUserPrompt(sequence: Sequence, previousReview?: Review | null): string {
  const base = `Analyse cette séquence pédagogique complète :

${condenseSequenceForReview(sequence)}`

  if (!previousReview) return base

  // Relecture incrémentale : on fournit l'analyse précédente pour ancrer le score
  // et éviter l'effet « tourne en rond » (nouveaux problèmes inventés à chaque run).
  const anciensProblemes = previousReview.problemes.length
    ? previousReview.problemes
        .map((p) => `- [${p.type}]${p.seance_concernee ? ` (séance ${p.seance_concernee})` : ''} ${p.description}`)
        .join('\n')
    : '(aucun problème signalé précédemment)'

  // Toutes les suggestions déjà proposées (générales + rattachées aux problèmes)
  const anciennesSuggestions = [
    ...previousReview.suggestions,
    ...previousReview.problemes.flatMap((p) => p.suggestions ?? []),
  ]
  const anciennesSuggestionsTxt = anciennesSuggestions.length
    ? anciennesSuggestions.map((s) => `- ${s.instruction}`).join('\n')
    : '(aucune)'

  return `${base}

━━━ ANALYSE PRÉCÉDENTE (à prendre comme référence) ━━━
Score précédent : ${previousReview.score_qualite}/100
Problèmes signalés précédemment :
${anciensProblemes}
Améliorations DÉJÀ proposées auparavant (NE PAS les re-proposer) :
${anciennesSuggestionsTxt}

CONSIGNES DE RELECTURE INCRÉMENTALE :
1. Pars du score précédent (${previousReview.score_qualite}) comme ANCRE.
2. Pour chaque problème précédent : vérifie dans la séquence ACTUELLE s'il est résolu.
   - S'il est résolu : ne le re-signale pas, et le score doit MONTER ou rester stable.
   - S'il persiste : re-signale-le à l'identique.
3. N'ajoute un NOUVEAU problème que s'il est réel et important (pas une préférence de style).
4. NE BAISSE le score QUE si tu constates une RÉGRESSION concrète (un élément correct est devenu incorrect). Décris alors cette régression comme un problème.
5. Corriger un problème listé ne doit JAMAIS faire baisser la note.
6. CONVERGENCE : ne re-propose AUCUNE amélioration déjà listée ci-dessus. Ne propose pas non plus de nouvelle amélioration « cosmétique ».
7. Si tu ne détectes aucun problème, renvoie "problemes" ET "suggestions" VIDES : la séquence est validée, l'analyse doit se STABILISER (ne rien proposer de plus).`
}
