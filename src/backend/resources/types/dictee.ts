import type { ResourceTypeDefinition } from '../registry'
import { DicteeContenuSchema, type DicteeContenu } from '@/shared/resource-schemas'
import { buildContextePedagogique } from '../prompt-context'

/**
 * Type de ressource `dictee` — TEACHER_ONLY.
 *
 * Document unique destiné au professeur (texte à dicter + préparation). L'élève
 * écrit sur sa feuille : pas de version élève. Famille « schéma dédié » (rendu
 * Markdown sur-mesure, comme extrait_oeuvre).
 */
export const dicteeDefinition: ResourceTypeDefinition<DicteeContenu> = {
  type: 'dictee',
  label: 'Dictée',
  category: 'TEACHER_ONLY',
  schema: DicteeContenuSchema,

  buildPrompt: (ctx) => {
    const contexte = buildContextePedagogique(ctx)
    return [
      {
        role: 'system',
        content: `Tu es un professeur de français agrégé. Tu conçois une DICTÉE adaptée au niveau, en JSON structuré.

RÈGLES :
- "texte_complet" : un texte ORIGINAL et cohérent à dicter (longueur adaptée au niveau : ~40-60 mots en 6e, jusqu'à ~120 mots en 3e/lycée), en lien avec le thème de la séquence. Ponctuation complète.
- "points_de_vigilance" : 4 à 8 difficultés ciblées présentes dans le texte (accords, homophones, temps verbaux, pluriels…).
- "consignes_passation" : instructions concrètes de lecture à voix haute pour le professeur (rythme, répétitions, ponctuation dictée ou non).
- "variante_allegee" : version simplifiée pour la différenciation (ou null).
- "variante_challenge" : version enrichie pour les élèves avancés (ou null).
- "correction_type" : erreurs typiques à anticiper + barème suggéré (ou null).

${contexte}`,
      },
      {
        role: 'user',
        content: `Génère la dictée "${ctx.ressourceTitre}" (niveau ${ctx.niveau}) en respectant exactement le schéma JSON.`,
      },
    ]
  },

  toMarkdown: {
    professeur: (r) => renderDicteeMarkdown(r as DicteeContenu),
  },

  suggestedFor: ['exercice', 'evaluation'],
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────

function renderDicteeMarkdown(r: DicteeContenu): string {
  const lines: string[] = []

  lines.push(`# Dictée — ${r.titre}`)
  lines.push(`*Niveau : ${r.niveau} — document professeur*`)
  lines.push('')

  lines.push('## Texte à dicter')
  lines.push('')
  lines.push(`> ${r.texte_complet.split('\n').join('\n> ')}`)
  lines.push('')

  lines.push('## Points de vigilance')
  lines.push('')
  for (const p of r.points_de_vigilance) lines.push(`- ${p}`)
  lines.push('')

  lines.push('## Consignes de passation')
  lines.push('')
  lines.push(r.consignes_passation)
  lines.push('')

  if (r.variante_allegee || r.variante_challenge) {
    lines.push('## Différenciation')
    lines.push('')
    if (r.variante_allegee) {
      lines.push(`**🟢 Version allégée :** ${r.variante_allegee}`)
      lines.push('')
    }
    if (r.variante_challenge) {
      lines.push(`**🔴 Version challenge :** ${r.variante_challenge}`)
      lines.push('')
    }
  }

  if (r.correction_type) {
    lines.push('---')
    lines.push('')
    lines.push(`> 📝 **Correction & barème :** ${r.correction_type}`)
  }

  return lines.join('\n')
}
