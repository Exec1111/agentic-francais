import type { ResourceTypeDefinition } from '../registry'
import {
  FicheQuestionsContenuSchema,
  type FicheQuestionsContenu,
  type Bloc,
  stripBlocProf,
  sanitizeFicheBlocs,
  EXERCISE_BLOC_TYPES,
  createBlankFicheContenu,
} from '@/shared/resource-blocks'
import { buildMessages } from '@/backend/prompts/fiche-questions'
import { buildCorpusContextBlocks } from '@/backend/workflow-engine'

/**
 * Type de ressource `fiche_questions` — fiche d'exercices structurée en BLOCS.
 *
 * Le contenu est une liste de blocs hétérogènes (consigne, QCM, texte à trous,
 * question ouverte, encadré). Voir doc/fiche-questions-blocs.md.
 *
 * Le `contenu_json` (blocs) est la source de vérité pour le rendu riche côté
 * frontend ET pour l'édition. Le `contenu_markdown` produit ici sert de
 * solution de repli (impression PDF, compatibilité).
 */
export const ficheQuestionsDefinition: ResourceTypeDefinition<FicheQuestionsContenu> = {
  type: 'fiche_questions',
  label: 'Fiche questions',
  category: 'TWO_VERSIONS',
  schema: FicheQuestionsContenuSchema,

  // ── Dérivation version élève : retire les champs PROF de chaque bloc ───────
  toStudentVersion: (full) => ({
    objectif: full.objectif,
    introduction: full.introduction,
    duree_estimee: full.duree_estimee,
    blocs: full.blocs.map(stripBlocProf),
  }),

  // ── Prompt de génération (prompts séparés dans src/backend/prompts/fiche-questions.ts) ──
  buildPrompt: (ctx) => {
    const items = ctx.corpusItems?.length
      ? ctx.corpusItems
      : (ctx.corpusItem ? [ctx.corpusItem] : [])

    let corpusBlock = ''
    if (items.length > 0) {
      corpusBlock = '\n' + buildCorpusContextBlocks(items.filter((item) => item.contenu))
      const protectedRefs = items.filter((item) => !item.contenu)
      if (protectedRefs.length > 0) {
        corpusBlock += protectedRefs.map((item) =>
          `\nRÉFÉRENCE BIBLIOGRAPHIQUE (texte protégé — non reproduit) :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auteur     : ${item.auteur}
Œuvre      : ${item.oeuvre}
Référence  : ${item.edition_reference}${item.pages ? ` — pages ${item.pages}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        ).join('\n')
        // Garde-fou anti-hallucination : sans le texte sous les yeux, le LLM ne
        // doit PAS inventer de citations. On l'oriente vers de l'analyse.
        corpusBlock += `

⚠️ Texte protégé par les droits d'auteur : il n'est pas reproduit ci-dessus. Conçois des exercices d'analyse sans citer le texte verbatim ni en reproduire de passage — les élèves auront le texte en main en classe. Appuie-toi sur la référence et les notions de la séquence ; n'invente jamais de citation.`
      }
    }
    return buildMessages(ctx, corpusBlock)
  },

  // ── Post-traitement : nettoie les blocs malformés par le LLM ───────────────
  postProcess: (full) => sanitizeFicheBlocs(full),

  // ── Renderers Markdown (fallback impression / compat) ──────────────────────
  toMarkdown: {
    professeur: (r) => renderFicheMarkdown(r as FicheQuestionsContenu, 'professeur'),
    eleve: (r) => renderFicheMarkdown(r as FicheQuestionsContenu, 'eleve'),
  },

  suggestedFor: ['exercice', 'evaluation'],

  // ── Création manuelle : squelette d'une fiche vierge ───────────────────────
  template: () => createBlankFicheContenu(),
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────

const DIFFICULTE_EMOJI: Record<string, string> = {
  facile: '🟢',
  moyen: '🟡',
  difficile: '🔴',
}

/** Étiquette alphabétique d'un index : 0 → A, 1 → B, … */
const LETTER = (i: number): string => String.fromCharCode(65 + i)

const ENCADRE_EMOJI: Record<string, string> = {
  rappel: '💡',
  astuce: '✨',
  attention: '⚠️',
  exemple: '📝',
}

function renderFicheMarkdown(r: FicheQuestionsContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# ${r.objectif}`)
  if (isPro) lines.push(`*— Version professeur — avec corrigé —*`)
  lines.push('')

  if (r.introduction) {
    lines.push(`> ${r.introduction}`)
    lines.push('')
  }

  let qNum = 1
  for (const bloc of r.blocs) {
    lines.push(...renderBlocMarkdown(bloc, isPro, qNum))
    if (EXERCISE_BLOC_TYPES.includes(bloc.type)) qNum++
    lines.push('')
  }

  if (r.duree_estimee) {
    lines.push('---')
    lines.push(`*Durée estimée : ${r.duree_estimee} min*`)
  }

  return lines.join('\n')
}

function renderBlocMarkdown(bloc: Bloc, isPro: boolean, qNum: number): string[] {
  const lines: string[] = []
  const diff = bloc.difficulte ? `${DIFFICULTE_EMOJI[bloc.difficulte]} ` : ''

  switch (bloc.type) {
    case 'consigne':
      lines.push(`**Consigne :** ${bloc.texte ?? ''}`)
      break

    case 'encadre': {
      const emoji = ENCADRE_EMOJI[bloc.encadre_variante ?? 'rappel'] ?? '💡'
      lines.push(`> ${emoji} **${bloc.encadre_titre ?? 'Rappel'}**`)
      lines.push(`> ${bloc.texte ?? ''}`)
      break
    }

    case 'qcm': {
      lines.push(`**${qNum}.** ${diff}${bloc.question ?? ''}`)
      lines.push('')
      const props = bloc.propositions ?? []
      const good = new Set(bloc.bonnes_reponses ?? [])
      props.forEach((p, i) => {
        const letter = String.fromCharCode(65 + i)
        const mark = isPro && good.has(i) ? ' ✅' : ''
        lines.push(`- [ ] **${letter}.** ${p}${mark}`)
      })
      if (isPro && bloc.explication) {
        lines.push('')
        lines.push(`> 📌 *${bloc.explication}*`)
      }
      break
    }

    case 'texte_a_trous': {
      lines.push(`**${qNum}.** ${diff}Complète le texte :`)
      lines.push('')
      if (bloc.banque_mots && bloc.banque_mots.length > 0) {
        lines.push(`📦 **Boîte à mots :** ${bloc.banque_mots.join(' — ')}`)
        lines.push('')
      }
      let texte = bloc.texte_lacunaire ?? ''
      if (isPro && bloc.reponses_trous) {
        bloc.reponses_trous.forEach((rep, i) => {
          texte = texte.replace(`[${i + 1}]`, `**[${rep}]**`)
        })
      } else {
        texte = texte.replace(/\[\d+\]/g, '__________')
      }
      lines.push(texte)
      break
    }

    case 'question_ouverte': {
      lines.push(`**${qNum}.** ${diff}${bloc.enonce ?? ''}`)
      lines.push('')
      if (isPro && bloc.reponse_attendue) {
        lines.push(`> ✅ **Réponse attendue :** ${bloc.reponse_attendue}`)
      } else {
        const n = bloc.lignes_reponse ?? 4
        for (let i = 0; i < n; i++) lines.push('________________________________________________________')
      }
      break
    }

    case 'appariement': {
      const gauche = bloc.appariement_gauche ?? []
      const droite = bloc.appariement_droite ?? []
      lines.push(`**${qNum}.** ${diff}${bloc.question ?? 'Relie chaque élément à sa bonne réponse :'}`)
      lines.push('')
      lines.push('| # | Colonne A | | Colonne B |')
      lines.push('|---|-----------|---|-----------|')
      const rows = Math.max(gauche.length, droite.length)
      for (let i = 0; i < rows; i++) {
        const g = gauche[i] ?? ''
        const d = droite[i] ?? ''
        lines.push(`| ${i + 1} | ${g} | ${LETTER(i)} | ${d} |`)
      }
      if (isPro && bloc.appariement_solution) {
        lines.push('')
        const sol = bloc.appariement_solution
          .map((d, i) => `${i + 1} → ${LETTER(d)}`)
          .join(', ')
        lines.push(`> ✅ **Solution :** ${sol}`)
      }
      break
    }

    case 'remise_en_ordre': {
      const elems = bloc.remise_elements ?? []
      lines.push(`**${qNum}.** ${diff}${bloc.question ?? 'Remets les éléments dans le bon ordre :'}`)
      lines.push('')
      elems.forEach((e, i) => lines.push(`- **${LETTER(i)}.** ${e}`))
      if (isPro && bloc.remise_ordre) {
        lines.push('')
        const ordre = bloc.remise_ordre.map((idx) => LETTER(idx)).join(' → ')
        lines.push(`> ✅ **Ordre correct :** ${ordre}`)
      } else {
        lines.push('')
        lines.push(`*Ordre : ${elems.map(() => '___').join(' · ')}*`)
      }
      break
    }

    case 'classement': {
      const cats = bloc.classement_categories ?? []
      const items = bloc.classement_items ?? []
      const sol = bloc.classement_solution ?? []
      lines.push(`**${qNum}.** ${diff}${bloc.question ?? 'Classe les éléments dans la bonne catégorie :'}`)
      lines.push('')
      if (items.length > 0) {
        lines.push(`📦 **Étiquettes :** ${items.join(' — ')}`)
        lines.push('')
      }
      lines.push(`| ${cats.join(' | ')} |`)
      lines.push(`|${cats.map(() => '---').join('|')}|`)
      if (isPro) {
        // Regroupe les items par catégorie, une colonne par catégorie.
        const parCat: string[][] = cats.map(() => [])
        items.forEach((item, i) => {
          const c = sol[i]
          if (c != null && c >= 0 && c < cats.length) parCat[c].push(item)
        })
        const nbRows = Math.max(1, ...parCat.map((c) => c.length))
        for (let r = 0; r < nbRows; r++) {
          lines.push(`| ${parCat.map((c) => c[r] ?? '').join(' | ')} |`)
        }
      } else {
        // Lignes vides pour que l'élève répartisse les étiquettes.
        const nbRows = Math.max(3, Math.ceil(items.length / Math.max(1, cats.length)) + 1)
        for (let r = 0; r < nbRows; r++) {
          lines.push(`| ${cats.map(() => ' ').join(' | ')} |`)
        }
      }
      break
    }
  }

  if (bloc.aide && !isPro) {
    lines.push('')
    lines.push(`> 🤔 *Besoin d'aide ? ${bloc.aide}*`)
  }

  return lines
}
