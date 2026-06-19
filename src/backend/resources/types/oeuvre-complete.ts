import type { ResourceTypeDefinition } from '../registry'
import {
  OeuvreCompleteContenuSchema,
  type OeuvreCompleteContenu,
} from '@/shared/resource-schemas'
import { buildContextePedagogique } from '../prompt-context'
import { numberTextLines, buildTexteProtegePlaceholder } from '../text-utils'

/**
 * Type de ressource `oeuvre_complete` — texte court INTÉGRAL + appareil pédagogique
 * approfondi (questions de compréhension/analyse + questions d'ouverture).
 *
 * Famille « schéma dédié » (comme extrait_oeuvre). Le texte exact et les
 * métadonnées sont injectés par CODE dans postProcess — fidélité garantie.
 */
export const oeuvreCompleteDefinition: ResourceTypeDefinition<OeuvreCompleteContenu> = {
  type: 'oeuvre_complete',
  label: 'Texte complet',
  category: 'TWO_VERSIONS',
  schema: OeuvreCompleteContenuSchema,

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
      reponse_attendue: null,  // PROF ONLY
      elements_analyse: null,  // PROF ONLY
    })),
    questions_approfondissement: full.questions_approfondissement
      ? full.questions_approfondissement.map((q) => ({ enonce: q.enonce, pistes: null }))
      : null,
    note_prof: null, // PROF ONLY
  }),

  buildPrompt: (ctx) => {
    if (!ctx.corpusItem) {
      throw new Error(
        "oeuvre_complete nécessite un texte corpus (l'œuvre intégrale). Associez un texte au programme avant de générer cette ressource."
      )
    }

    const hasContent = ctx.corpusItem.contenu !== ''
    const contexte = buildContextePedagogique(ctx)

    if (hasContent) {
      return [
        {
          role: 'system',
          content: `Tu es un professeur de français agrégé spécialiste de la littérature.
Tu produis l'appareil pédagogique (introduction, lexique, questions, questions d'approfondissement) autour d'un texte littéraire officiel INTÉGRAL, en JSON structuré.

TEXTE SOURCE OFFICIEL (fourni pour ton analyse — il sera inséré automatiquement par le système dans le document final) :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${ctx.corpusItem.auteur}
Œuvre      : ${ctx.corpusItem.oeuvre}
Référence  : ${ctx.corpusItem.edition_reference}${ctx.corpusItem.pages ? ` — ${ctx.corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ctx.corpusItem.contenu}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RÈGLES ABSOLUES :
1. Le champ "texte" doit contenir une chaîne vide "" — NE recopie PAS le texte : le système l'insère automatiquement, à l'identique, avec la numérotation des lignes.
2. "auteur", "oeuvre", "edition_reference", "pages" : recopie exactement les métadonnées ci-dessus.
3. Toute citation dans les questions/réponses/analyses doit être extraite MOT POUR MOT du texte, entre guillemets.
4. "questions" : compréhension → analyse, "enonce" sans la réponse ; "reponse_attendue" et "elements_analyse" pour le professeur.
5. "questions_approfondissement" : 2-3 questions d'ouverture/interprétation (mise en réseau, enjeux), avec "pistes" pour le professeur.
6. "introduction" : présentation de l'œuvre (auteur, contexte, enjeux).
7. "notes_bas_de_page" : 4-8 termes difficiles présents dans le texte.

${contexte}`,
        },
        {
          role: 'user',
          content: `Génère l'appareil pédagogique "${ctx.ressourceTitre}" pour le texte intégral de ${ctx.corpusItem.auteur} en respectant exactement le schéma JSON (champ "texte" = chaîne vide).`,
        },
      ]
    }

    return [
      {
        role: 'system',
        content: `Tu es un professeur de français agrégé spécialiste de la littérature.
Tu prépares une fiche d'étude pour une œuvre protégée par droits d'auteur.
Le texte intégral ne peut pas être reproduit ici — l'enseignant le distribuera séparément.

RÉFÉRENCE BIBLIOGRAPHIQUE :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${ctx.corpusItem.auteur}
Œuvre      : ${ctx.corpusItem.oeuvre}
Référence  : ${ctx.corpusItem.edition_reference}${ctx.corpusItem.pages ? ` — pages ${ctx.corpusItem.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RÈGLES ABSOLUES :
1. Le champ "texte" doit contenir une chaîne vide "" — le système insérera un encart « Texte à insérer par l'enseignant ».
2. Les questions ("enonce") doivent être formulées sans citer le texte mot pour mot.
3. "reponse_attendue", "elements_analyse", "pistes" : réponses complètes pour le professeur.
4. "notes_bas_de_page" peut rester null.

${contexte}`,
      },
      {
        role: 'user',
        content: `Génère la fiche d'étude "${ctx.ressourceTitre}" pour l'œuvre protégée de ${ctx.corpusItem.auteur} en respectant exactement le schéma JSON (champ "texte" = chaîne vide).`,
      },
    ]
  },

  postProcess: (full, ctx) => {
    if (!ctx.corpusItem) return full
    const texte = ctx.corpusItem.contenu
      ? numberTextLines(ctx.corpusItem.contenu)
      : buildTexteProtegePlaceholder(ctx.corpusItem)
    return {
      ...full,
      auteur: ctx.corpusItem.auteur,
      oeuvre: ctx.corpusItem.oeuvre,
      edition_reference: ctx.corpusItem.edition_reference,
      pages: ctx.corpusItem.pages ?? null,
      texte,
    }
  },

  toMarkdown: {
    professeur: (r) => renderOeuvreMarkdown(r as OeuvreCompleteContenu, 'professeur'),
    eleve: (r) => renderOeuvreMarkdown(r as OeuvreCompleteContenu, 'eleve'),
  },

  suggestedFor: ['lecture'],
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────

function renderOeuvreMarkdown(r: OeuvreCompleteContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# ${r.oeuvre}`)
  lines.push(`*${r.auteur}*`)
  if (isPro) lines.push(`*— Version professeur — avec corrigé —*`)
  lines.push('')

  lines.push(`*${r.introduction}*`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const line of r.texte.split('\n')) lines.push(line.trim() ? `> ${line}` : '>')
  lines.push('')

  const ref = [r.auteur, `*${r.oeuvre}*`, r.pages ?? null, r.edition_reference].filter(Boolean).join(', ')
  lines.push(`*${ref}*`)
  lines.push('')

  if (r.notes_bas_de_page && r.notes_bas_de_page.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Lexique')
    lines.push('')
    for (const note of r.notes_bas_de_page) lines.push(`- **${note.mot}** : ${note.definition}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('## Questions de lecture')
  lines.push('')
  r.questions.forEach((q, i) => {
    lines.push(`**${i + 1}.** ${q.enonce}`)
    lines.push('')
    if (isPro) {
      if (q.reponse_attendue) lines.push(`> ✅ **Réponse attendue :** ${q.reponse_attendue}`)
      if (q.elements_analyse) lines.push(`> 📚 **Analyse :** ${q.elements_analyse}`)
      lines.push('')
    } else {
      lines.push('_'.repeat(70))
      lines.push('')
      lines.push('_'.repeat(70))
      lines.push('')
    }
  })

  if (r.questions_approfondissement && r.questions_approfondissement.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## Pour aller plus loin')
    lines.push('')
    r.questions_approfondissement.forEach((q, i) => {
      lines.push(`**${i + 1}.** ${q.enonce}`)
      if (isPro && q.pistes) {
        lines.push('')
        lines.push(`> 💡 **Pistes :** ${q.pistes}`)
      }
      lines.push('')
    })
  }

  if (isPro && r.note_prof) {
    lines.push('---')
    lines.push('')
    lines.push(`> 📝 **Note pédagogique :** ${r.note_prof}`)
  }

  return lines.join('\n')
}
