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
import type { ResourceGenerationContext } from './registry'

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
