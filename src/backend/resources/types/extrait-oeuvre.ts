import type { ResourceTypeDefinition } from '../registry'
import {
  ExtraitOeuvreContenuSchema,
  type ExtraitOeuvreContenu,
} from '@/shared/resource-schemas'

export const extraitOeuvreDefinition: ResourceTypeDefinition<ExtraitOeuvreContenu> = {
  type: 'extrait_oeuvre',
  label: "Extrait d'œuvre",
  category: 'TWO_VERSIONS',
  schema: ExtraitOeuvreContenuSchema,

  // ── Dérivation version élève ───────────────────────────────────────────────
  // Retire : reponse_attendue, elements_analyse (par question) + note_prof (global)

  toStudentVersion: (full) => ({
    auteur: full.auteur,
    oeuvre: full.oeuvre,
    edition_reference: full.edition_reference,
    pages: full.pages,
    introduction: full.introduction,
    texte: full.texte,
    notes_bas_de_page: full.notes_bas_de_page,
    questions: full.questions.map((q) => ({
      enonce: q.enonce,
      reponse_attendue: null,  // PROF ONLY — retiré
      elements_analyse: null, // PROF ONLY — retiré
    })),
    note_prof: null, // PROF ONLY — retiré
  }),

  // ── Prompt de génération ───────────────────────────────────────────────────

  buildPrompt: (ctx) => {
    if (!ctx.corpusItem) {
      throw new Error(
        "extrait_oeuvre nécessite un texte corpus. Associez un texte au programme avant de générer cette ressource."
      )
    }

    return [
      {
        role: 'system',
        content: `Tu es un professeur de français agrégé spécialiste de la littérature.
Tu reçois un texte littéraire OFFICIEL issu d'une base vérifiée.
Tu dois produire une présentation pédagogique structurée en JSON.

TEXTE SOURCE OFFICIEL — À REPRODUIRE MOT POUR MOT :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${ctx.corpusItem.auteur}
Œuvre      : ${ctx.corpusItem.oeuvre}
Référence  : ${ctx.corpusItem.edition_reference}${ctx.corpusItem.pages ? ` — ${ctx.corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ctx.corpusItem.contenu}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RÈGLES ABSOLUES :
1. Le champ "texte" doit reproduire le texte ci-dessus MOT POUR MOT, sans aucune modification.
2. Numéroter les lignes/vers tous les 5 en insérant [5], [10], [15], etc. dans le texte.
3. Les questions (champ "enonce") ne contiennent PAS les réponses.
   → Les réponses vont dans "reponse_attendue" (pour le professeur).
   → "elements_analyse" : relever les figures de style, procédés narratifs, champs lexicaux clés.
4. "introduction" : 2-3 phrases de mise en contexte (auteur, œuvre, enjeux de cet extrait).

Contexte pédagogique :
- Séquence : "${ctx.sequenceTitle}" | Niveau : ${ctx.niveau} | Thème : ${ctx.theme}
- Séance n°${ctx.seanceNumero} : "${ctx.seanceTitle}"
- Activité : "${ctx.activiteTitre}" (type : ${ctx.activiteType})
- Objectif : ${ctx.activiteConsigne}`,
      },
      {
        role: 'user',
        content: `Génère la présentation pédagogique "${ctx.ressourceTitre}" pour le texte de ${ctx.corpusItem.auteur} en respectant exactement le schéma JSON.`,
      },
    ]
  },

  // ── Renderers Markdown ─────────────────────────────────────────────────────

  toMarkdown: {
    professeur: (r) => renderExtraitMarkdown(r as ExtraitOeuvreContenu, 'professeur'),
    eleve: (r) => renderExtraitMarkdown(r as ExtraitOeuvreContenu, 'eleve'),
  },

  suggestedFor: ['lecture', 'debat'],
}

// ── Rendu Markdown ─────────────────────────────────────────────────────────────

function renderExtraitMarkdown(r: ExtraitOeuvreContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  // En-tête
  lines.push(`# ${r.oeuvre}`)
  lines.push(`*${r.auteur}*`)
  if (isPro) lines.push(`*— Version professeur — avec corrigé —*`)
  lines.push('')

  // Introduction contextuelle (italique)
  lines.push(`*${r.introduction}*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Texte (dans un bloc de citation pour le distinguer visuellement)
  const textLines = r.texte.split('\n')
  for (const line of textLines) {
    lines.push(line.trim() ? `> ${line}` : '>')
  }
  lines.push('')

  // Référence bibliographique
  const ref = [
    r.auteur,
    `*${r.oeuvre}*`,
    r.pages ?? null,
    r.edition_reference,
  ].filter(Boolean).join(', ')
  lines.push(`*${ref}*`)
  lines.push('')

  // Lexique (si présent)
  if (r.notes_bas_de_page && r.notes_bas_de_page.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Lexique')
    lines.push('')
    for (const note of r.notes_bas_de_page) {
      lines.push(`- **${note.mot}** : ${note.definition}`)
    }
    lines.push('')
  }

  // Questions
  lines.push('---')
  lines.push('')
  lines.push('## Questions de lecture')
  lines.push('')

  r.questions.forEach((q, i) => {
    lines.push(`**${i + 1}.** ${q.enonce}`)
    lines.push('')

    if (isPro) {
      if (q.reponse_attendue) {
        lines.push(`> ✅ **Réponse attendue :** ${q.reponse_attendue}`)
      }
      if (q.elements_analyse) {
        lines.push(`> 📚 **Analyse :** ${q.elements_analyse}`)
      }
      lines.push('')
    } else {
      // Version élève : lignes vides pour écrire la réponse
      lines.push('_'.repeat(70))
      lines.push('')
      lines.push('_'.repeat(70))
      lines.push('')
    }
  })

  // Note pédagogique prof
  if (isPro && r.note_prof) {
    lines.push('---')
    lines.push('')
    lines.push(`> 📝 **Note pédagogique :** ${r.note_prof}`)
  }

  return lines.join('\n')
}
