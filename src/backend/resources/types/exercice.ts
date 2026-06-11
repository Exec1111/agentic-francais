import type { ResourceTypeDefinition } from '../registry'
import {
  ExerciceContenuSchema,
  type ExerciceContenu,
} from '@/shared/resource-schemas'
import { buildContextePedagogique } from '../prompt-context'

export const exerciceDefinition: ResourceTypeDefinition<ExerciceContenu> = {
  type: 'exercice',
  label: 'Exercice',
  category: 'TWO_VERSIONS',
  schema: ExerciceContenuSchema,

  // ── Dérivation version élève ───────────────────────────────────────────────
  // Retire : correction, justification (par item) + conseil_correction (global)

  toStudentVersion: (full) => ({
    format: full.format,
    objectif: full.objectif,
    consigne_generale: full.consigne_generale,
    introduction: full.introduction,
    items: full.items.map((item) => ({
      enonce: item.enonce,
      contenu_eleve: item.contenu_eleve,
      correction: null,    // PROF ONLY — retiré
      justification: null, // PROF ONLY — retiré
      difficulte: item.difficulte,
    })),
    mot_banque: full.mot_banque,
    conseil_correction: null, // PROF ONLY — retiré
    duree_estimee: full.duree_estimee,
  }),

  // ── Prompt de génération ───────────────────────────────────────────────────

  buildPrompt: (ctx) => {
    let corpusBlock = ''
    if (ctx.corpusItem) {
      if (ctx.corpusItem.contenu) {
        // Texte disponible intégralement → injection directe
        corpusBlock = `\nTEXTE SOURCE OFFICIEL — les exercices doivent s'appuyer EXCLUSIVEMENT sur ce texte :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${ctx.corpusItem.auteur}
Œuvre      : ${ctx.corpusItem.oeuvre}
Référence  : ${ctx.corpusItem.edition_reference}${ctx.corpusItem.pages ? ` — ${ctx.corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ctx.corpusItem.contenu}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Toute citation dans les exercices doit être extraite MOT POUR MOT de ce texte.`
      } else {
        // Texte protégé / non disponible → référence bibliographique uniquement
        corpusBlock = `\nRÉFÉRENCE BIBLIOGRAPHIQUE (texte protégé — non reproduit ici) :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${ctx.corpusItem.auteur}
Œuvre      : ${ctx.corpusItem.oeuvre}
Référence  : ${ctx.corpusItem.edition_reference}${ctx.corpusItem.pages ? ` — pages ${ctx.corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ Le texte intégral n'est pas disponible (droits d'auteur). Les élèves auront le texte en main.
   Formule des exercices EN RÉFÉRENCE à cette œuvre sans citer d'extraits mot pour mot.
   Rédige des questions d'analyse, de compréhension, de style ou de grammaire adaptées au thème.`
      }
    }

    return [
      {
        role: 'system',
        content: `Tu es un professeur de français agrégé spécialiste de la création d'exercices pédagogiques.
Tu génères une fiche d'exercices structurée en JSON avec des items progressifs (facile → moyen → difficile).

Pour chaque item, tu fournis :
- consigne_generale : instruction claire pour l'élève
- contenu_eleve : ce que voit l'élève (avec [__________] pour les trous, ou les propositions à choix)
- correction : la réponse correcte complète (sera masquée dans la version élève)
- justification : explication pédagogique de la règle ou du raisonnement (pour le professeur)
${corpusBlock}

${buildContextePedagogique(ctx)}`,
      },
      {
        role: 'user',
        content: `Génère la fiche d'exercices "${ctx.ressourceTitre}" en respectant exactement le schéma JSON.`,
      },
    ]
  },

  // ── Renderers Markdown ─────────────────────────────────────────────────────

  toMarkdown: {
    professeur: (r) => renderExerciceMarkdown(r as ExerciceContenu, 'professeur'),
    eleve: (r) => renderExerciceMarkdown(r as ExerciceContenu, 'eleve'),
  },

  suggestedFor: ['exercice', 'evaluation'],
}

// ── Rendu Markdown ─────────────────────────────────────────────────────────────

const DIFFICULTE_EMOJI: Record<string, string> = {
  facile: '🟢 Facile',
  moyen: '🟡 Moyen',
  difficile: '🔴 Difficile',
}

function renderExerciceMarkdown(r: ExerciceContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  // En-tête
  lines.push(`# ${r.objectif}`)
  if (isPro) lines.push(`*— Version professeur — avec corrigé —*`)
  lines.push('')

  if (r.introduction) {
    lines.push(`> ${r.introduction}`)
    lines.push('')
  }

  lines.push(`**Consigne :** ${r.consigne_generale}`)
  lines.push('')

  if (r.mot_banque && r.mot_banque.length > 0) {
    lines.push(`📦 **Boîte à mots :** ${r.mot_banque.join(' — ')}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('')

  // Regrouper les items par difficulté (dans l'ordre)
  const grouped: Record<string, ExerciceContenu['items']> = {}
  for (const item of r.items) {
    if (!grouped[item.difficulte]) grouped[item.difficulte] = []
    grouped[item.difficulte].push(item)
  }

  let idx = 1
  for (const diff of ['facile', 'moyen', 'difficile'] as const) {
    const items = grouped[diff]
    if (!items || items.length === 0) continue

    lines.push(`### ${DIFFICULTE_EMOJI[diff]}`)
    lines.push('')

    for (const item of items) {
      lines.push(`**${idx}.** ${item.enonce}`)
      lines.push('')
      lines.push(item.contenu_eleve)
      lines.push('')

      if (isPro) {
        if (item.correction) {
          lines.push(`> ✅ **Correction :** ${item.correction}`)
        }
        if (item.justification) {
          lines.push(`> 📌 *${item.justification}*`)
        }
        if (item.correction || item.justification) lines.push('')
      }

      idx++
    }

    lines.push('---')
    lines.push('')
  }

  // Note pédagogique (prof uniquement)
  if (isPro && r.conseil_correction) {
    lines.push(`> 📝 **Note pour la correction :** ${r.conseil_correction}`)
    lines.push('')
  }

  if (r.duree_estimee) {
    lines.push(`*Durée estimée : ${r.duree_estimee} min*`)
  }

  return lines.join('\n')
}
