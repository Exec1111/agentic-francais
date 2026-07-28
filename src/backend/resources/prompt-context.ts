/**
 * Constructeur du bloc de contexte pédagogique injecté dans les prompts
 * de génération de ressources.
 *
 * Combine :
 *  - le contexte de la séquence (titre, problématique, objectifs, compétences)
 *  - la progression (position de la séance dans la séquence)
 *  - le contexte de la séance (titre, objectifs)
 *  - le contexte de l'activité (titre, type, durée, consigne, autres activités)
 *  - les repères du programme officiel pour le niveau (BO)
 *
 * Tous les champs enrichis sont optionnels : le bloc se dégrade proprement
 * si le frontend ne transmet que le contexte minimal.
 */

import { getProgrammeReperes } from '@/backend/pedagogie/programmes'
import { buildCorpusContextBlocks } from '@/backend/workflow-engine'
import type { ResourceGenerationContext } from './registry'
import type { Sequence, Seance, CorpusItem, RessourceStructuree } from '@/shared/schemas'

/** Plafond de caractères par ressource injectée dans le digest (maîtrise du contexte). */
const RESSOURCE_EXCERPT_CAP = 1200

function excerpt(md: string): string {
  const trimmed = (md ?? '').trim()
  if (trimmed.length <= RESSOURCE_EXCERPT_CAP) return trimmed
  return trimmed.slice(0, RESSOURCE_EXCERPT_CAP) + '\n…[contenu tronqué]'
}

export function buildContextePedagogique(ctx: ResourceGenerationContext): string {
  const lines: string[] = ['CONTEXTE PÉDAGOGIQUE :']

  lines.push(`- Séquence : "${ctx.sequenceTitle || 'Non spécifié'}" | Niveau : ${ctx.niveau || '5e'} | Thème : "${ctx.theme || 'Non spécifié'}"`)

  if (ctx.sequenceProblematique) {
    lines.push(`- Problématique de la séquence : ${ctx.sequenceProblematique}`)
  }
  if (ctx.sequenceObjectifs && ctx.sequenceObjectifs.length > 0) {
    lines.push(`- Objectifs de la séquence : ${ctx.sequenceObjectifs.join(' ; ')}`)
  }
  if (ctx.sequenceCompetences && ctx.sequenceCompetences.length > 0) {
    lines.push(`- Compétences travaillées : ${ctx.sequenceCompetences.join(' ; ')}`)
  }

  if (ctx.progression && ctx.progression.length > 0) {
    const prog = ctx.progression
      .map((s) =>
        s.numero === ctx.seanceNumero
          ? `[Séance ${s.numero} : "${s.titre}" ← SÉANCE ACTUELLE]`
          : `Séance ${s.numero} : "${s.titre}"`
      )
      .join(' → ')
    lines.push(`- Progression de la séquence : ${prog}`)
    lines.push(`  (Tiens compte de ce qui a déjà été vu dans les séances précédentes et de ce qui sera abordé ensuite.)`)
  }

  lines.push(`- Séance n°${ctx.seanceNumero || 1} : "${ctx.seanceTitle || 'Non spécifié'}"`)
  if (ctx.seanceObjectifs && ctx.seanceObjectifs.length > 0) {
    lines.push(`- Objectifs de la séance : ${ctx.seanceObjectifs.join(' ; ')}`)
  }

  const duree = ctx.activiteDuree ? `, durée prévue : ${ctx.activiteDuree} min` : ''
  lines.push(`- Activité : "${ctx.activiteTitre}" (type : ${ctx.activiteType}${duree})`)
  if (ctx.activiteConsigne) {
    lines.push(`- Objectif de l'activité : ${ctx.activiteConsigne}`)
  }
  if (ctx.autresActivites && ctx.autresActivites.length > 0) {
    const autres = ctx.autresActivites
      .map((a) => `"${a.titre}" (${a.type}${a.duree ? `, ${a.duree} min` : ''})`)
      .join(', ')
    lines.push(`- Autres activités de la même séance (ne pas dupliquer leur contenu) : ${autres}`)
  }

  const reperes = getProgrammeReperes(ctx.niveau)
  if (reperes) {
    lines.push('')
    lines.push(reperes)
    lines.push('')
    lines.push('→ Le contenu généré doit être conforme à ces repères : difficulté calibrée sur le niveau, notions de langue limitées aux attendus de l\'année, formulations adaptées à l\'âge des élèves.')
  }

  // Instructions libres du professeur — priorité maximale sur les règles générales.
  if (ctx.consignes && ctx.consignes.trim()) {
    lines.push('')
    lines.push('INSTRUCTIONS COMPLÉMENTAIRES DU PROFESSEUR — à respecter impérativement, elles priment sur les règles générales ci-dessus :')
    lines.push(`"${ctx.consignes.trim()}"`)
  }

  return lines.join('\n')
}

/**
 * Construit un digest texte de la séquence COMPLÈTE, destiné à la génération de
 * l'évaluation finale. Contrairement à buildContextePedagogique (centré activité),
 * ce digest décrit toute la séquence : objectifs, compétences, déroulé des séances
 * et activités, corpus étudié, repères du programme.
 *
 * C'est l'ancrage qui garantit que l'évaluation ne porte que sur ce qui a été
 * réellement enseigné dans la séquence.
 *
 * @param activiteResources  Ressources produites en classe, indexées par id d'activité
 *   (version professeur). Injectées sous chaque activité pour que l'évaluation puise
 *   ses notions dans les cours et imite le format des exercices réellement travaillés.
 *   Le contenu de chaque ressource est plafonné (RESSOURCE_EXCERPT_CAP).
 */
export function buildSequenceDigest(
  sequence: Sequence,
  corpusItems: CorpusItem[] = [],
  activiteResources: Record<string, RessourceStructuree[]> = {},
): string {
  const lines: string[] = ['SÉQUENCE À ÉVALUER (contenu complet) :']

  lines.push(`- Titre : "${sequence.titre}" | Niveau : ${sequence.niveau} | Thème : "${sequence.theme}"`)
  if (sequence.problematique) {
    lines.push(`- Problématique : ${sequence.problematique}`)
  }
  if (sequence.objectifs?.length) {
    lines.push(`- Objectifs de la séquence : ${sequence.objectifs.join(' ; ')}`)
  }
  if (sequence.competences?.length) {
    lines.push(`- Compétences travaillées (à évaluer) : ${sequence.competences.join(' ; ')}`)
  }
  if (sequence.evaluation_finale) {
    lines.push(`- Intention d'évaluation finale (note du professeur) : ${sequence.evaluation_finale}`)
  }

  // Déroulé des séances et activités — ce qui a été travaillé, avec le contenu
  // des ressources produites (cours, fiches, exercices) lorsqu'il est disponible.
  lines.push('')
  lines.push('DÉROULÉ DE LA SÉQUENCE :')
  let hasResources = false
  for (const seance of sequence.seances) {
    lines.push(`• Séance ${seance.numero} — "${seance.titre}"`)
    if (seance.objectifs?.length) {
      lines.push(`  Objectifs : ${seance.objectifs.join(' ; ')}`)
    }
    for (const a of seance.activites ?? []) {
      lines.push(`  - Activité "${a.titre}" (${a.type})`)
      const res = a.id ? activiteResources[a.id] : undefined
      for (const r of res ?? []) {
        hasResources = true
        lines.push(`    ▸ Ressource « ${r.type} » produite pour cette activité :`)
        lines.push(excerpt(r.contenu_markdown).split('\n').map((l) => `      ${l}`).join('\n'))
      }
    }
  }
  if (hasResources) {
    lines.push('')
    lines.push('→ APPUIE-TOI sur ces ressources : puise les notions dans les cours produits et')
    lines.push('  imite le FORMAT et le niveau de difficulté des exercices réellement faits en classe.')
  }

  // Corpus étudié
  const withContent = corpusItems.filter((item) => item.contenu)
  if (corpusItems.length > 0) {
    lines.push('')
    lines.push('CORPUS ÉTUDIÉ DANS LA SÉQUENCE :')
    for (const item of corpusItems) {
      lines.push(`- "${item.titre}" — ${item.auteur} (${item.oeuvre})`)
    }
    if (withContent.length > 0) {
      lines.push('')
      lines.push('Textes disponibles intégralement (utilisables comme support de l\'évaluation) :')
      lines.push(buildCorpusContextBlocks(withContent))
    }
  }

  // Repères du programme
  const reperes = getProgrammeReperes(sequence.niveau)
  if (reperes) {
    lines.push('')
    lines.push(reperes)
  }

  return lines.join('\n')
}

/**
 * Construit un digest texte d'UNE séance en profondeur, destiné à la génération
 * de la fiche de préparation (déroulé enseignant). Contrairement à
 * buildSequenceDigest (panorama de toute la séquence), ce digest détaille une
 * seule séance : activités dans l'ordre AVEC LEURS IDS (à recopier dans les
 * moments du déroulé), mode pédagogique, contenu des ressources produites
 * (le cours nourrit la trace écrite au tableau), corpus, repères du programme.
 *
 * @param activiteResources  Ressources produites pour les activités de la séance
 *   (version professeur), indexées par id d'activité. Plafonnées par
 *   RESSOURCE_EXCERPT_CAP.
 */
export function buildSeanceDigest(
  sequence: Sequence,
  seance: Seance,
  corpusItems: CorpusItem[] = [],
  activiteResources: Record<string, RessourceStructuree[]> = {},
): string {
  const lines: string[] = ['SÉANCE À PRÉPARER (contenu complet) :']

  // Contexte séquence + position dans la progression
  lines.push(`- Séquence : "${sequence.titre}" | Niveau : ${sequence.niveau} | Thème : "${sequence.theme}"`)
  if (sequence.problematique) {
    lines.push(`- Problématique de la séquence : ${sequence.problematique}`)
  }
  const idx = sequence.seances.findIndex((s) => s.numero === seance.numero)
  const precedente = idx > 0 ? sequence.seances[idx - 1] : null
  const suivante = idx >= 0 && idx < sequence.seances.length - 1 ? sequence.seances[idx + 1] : null
  lines.push(
    `- Progression : séance ${seance.numero}/${sequence.seances.length}` +
      (precedente ? ` | précédente : "${precedente.titre}"` : ' | première séance de la séquence') +
      (suivante ? ` | suivante : "${suivante.titre}"` : ' | dernière séance de la séquence')
  )

  // La séance
  lines.push('')
  lines.push(`SÉANCE ${seance.numero} — "${seance.titre}" (durée totale : ${seance.duree} min)`)
  if (seance.objectifs?.length) {
    lines.push(`- Objectifs : ${seance.objectifs.join(' ; ')}`)
  }
  if (seance.mode_pedagogique === 'explicite') {
    lines.push(`- Mode pédagogique : ENSEIGNEMENT EXPLICITE (canevas : ouverture → modelage → pratique guidée → pratique autonome → clôture)`)
  } else {
    lines.push(`- Mode pédagogique : standard`)
  }

  // Activités dans l'ordre, avec leurs ids (à recopier dans les moments)
  lines.push('')
  lines.push('ACTIVITÉS DE LA SÉANCE (dans l\'ordre — recopier les ids tels quels dans "activite_id") :')
  let hasResources = false
  for (const a of seance.activites ?? []) {
    const phase = a.phase ? ` | phase : ${a.phase}` : ''
    lines.push(`- [id: ${a.id ?? 'non persisté'}] "${a.titre}" (${a.type}, ${a.duree} min${phase})`)
    if (a.consigne) lines.push(`  Consigne : ${a.consigne}`)
    if (a.differenciation) lines.push(`  Différenciation prévue : ${a.differenciation}`)
    const res = a.id ? activiteResources[a.id] : undefined
    for (const r of res ?? []) {
      hasResources = true
      lines.push(`  ▸ Ressource « ${r.type} » produite pour cette activité :`)
      lines.push(excerpt(r.contenu_markdown).split('\n').map((l) => `    ${l}`).join('\n'))
    }
  }
  if ((seance.activites ?? []).length === 0) {
    lines.push('- (aucune activité définie : construis un déroulé de moments enseignant cohérent avec les objectifs)')
  }
  if (hasResources) {
    lines.push('')
    lines.push('→ APPUIE-TOI sur ces ressources : la trace écrite reprend les notions du cours')
    lines.push('  produit, les corrections anticipées s\'appuient sur les exercices réels.')
  }

  // Corpus lié aux activités de la séance
  const withContent = corpusItems.filter((item) => item.contenu)
  if (corpusItems.length > 0) {
    lines.push('')
    lines.push('TEXTES ÉTUDIÉS PENDANT LA SÉANCE :')
    for (const item of corpusItems) {
      lines.push(`- "${item.titre}" — ${item.auteur} (${item.oeuvre})`)
    }
    if (withContent.length > 0) {
      lines.push('')
      lines.push(buildCorpusContextBlocks(withContent))
    }
  }

  // Repères du programme
  const reperes = getProgrammeReperes(sequence.niveau)
  if (reperes) {
    lines.push('')
    lines.push(reperes)
  }

  return lines.join('\n')
}
