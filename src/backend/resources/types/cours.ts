import type { ResourceTypeDefinition } from '../registry'
import {
  CoursContenuSchema,
  type CoursContenu,
  type CoursBloc,
  stripCoursBlocProf,
  sanitizeCoursBlocs,
  createBlankCoursContenu,
} from '@/shared/resource-blocks-cours'
import { buildMessages } from '@/backend/prompts/cours'
import { buildCorpusContextBlocks } from '@/backend/workflow-engine'

/**
 * Type de ressource `cours` — cours structuré en BLOCS DE CONTENU.
 *
 * Même famille « document par blocs » que `fiche_questions` (framework de rendu/
 * édition partagé) mais vocabulaire de blocs différent (titre, paragraphe,
 * définition, exemple, citation, encadré, liste). Voir doc/fiche-questions-blocs.md.
 *
 * Le `contenu_json` (blocs) est la source de vérité ; le `contenu_markdown` produit
 * ici sert de repli (impression PDF, compatibilité).
 */
export const coursDefinition: ResourceTypeDefinition<CoursContenu> = {
  type: 'cours',
  label: 'Cours',
  category: 'TWO_VERSIONS',
  schema: CoursContenuSchema,

  // ── Dérivation version élève : retire les notes prof ───────────────────────
  toStudentVersion: (full) => ({
    titre: full.titre,
    introduction: full.introduction,
    note_prof_globale: null,
    blocs: full.blocs.map(stripCoursBlocProf),
  }),

  // ── Prompt de génération ───────────────────────────────────────────────────
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
      }
    }
    return buildMessages(ctx, corpusBlock)
  },

  // ── Post-traitement : nettoie les blocs malformés par le LLM ───────────────
  postProcess: (full) => sanitizeCoursBlocs(full),

  // ── Renderers Markdown (fallback impression / compat) ──────────────────────
  toMarkdown: {
    professeur: (r) => renderCoursMarkdown(r as CoursContenu, 'professeur'),
    eleve: (r) => renderCoursMarkdown(r as CoursContenu, 'eleve'),
  },

  suggestedFor: ['lecture', 'oral'],

  // ── Création manuelle : squelette d'un cours vierge ────────────────────────
  template: () => createBlankCoursContenu(),
}

// ── Rendu Markdown ───────────────────────────────────────────────────────────────

const ENCADRE_EMOJI: Record<string, string> = {
  rappel: '💡',
  astuce: '✨',
  attention: '⚠️',
  exemple: '📝',
}

function renderCoursMarkdown(r: CoursContenu, audience: 'professeur' | 'eleve'): string {
  const isPro = audience === 'professeur'
  const lines: string[] = []

  lines.push(`# ${r.titre}`)
  if (isPro) lines.push(`*— Version professeur — avec notes pédagogiques —*`)
  lines.push('')

  if (r.introduction) {
    lines.push(`*${r.introduction}*`)
    lines.push('')
  }

  for (const bloc of r.blocs) {
    lines.push(...renderCoursBlocMarkdown(bloc, isPro))
    lines.push('')
  }

  if (isPro && r.note_prof_globale) {
    lines.push('---')
    lines.push(`> 📝 **Note pédagogique :** ${r.note_prof_globale}`)
  }

  return lines.join('\n')
}

function renderCoursBlocMarkdown(bloc: CoursBloc, isPro: boolean): string[] {
  const lines: string[] = []

  switch (bloc.type) {
    case 'titre_section':
      lines.push(`## ${bloc.texte ?? ''}`)
      break

    case 'paragraphe':
      lines.push(bloc.texte ?? '')
      break

    case 'definition':
      lines.push(`**${bloc.terme ?? ''}** : ${bloc.texte ?? ''}`)
      break

    case 'exemple':
      lines.push(`> 📌 *Exemple :* ${bloc.texte ?? ''}`)
      break

    case 'citation': {
      const auteur = bloc.auteur ? ` — *${bloc.auteur}*` : ''
      lines.push(`> « ${bloc.texte ?? ''} »${auteur}`)
      break
    }

    case 'encadre': {
      const emoji = ENCADRE_EMOJI[bloc.encadre_variante ?? 'rappel'] ?? '💡'
      lines.push(`> ${emoji} **${bloc.encadre_titre ?? 'À retenir'}**`)
      lines.push(`> ${bloc.texte ?? ''}`)
      break
    }

    case 'liste':
      if (bloc.texte) {
        lines.push(bloc.texte)
        lines.push('')
      }
      for (const item of bloc.items ?? []) lines.push(`- ${item}`)
      break
  }

  if (isPro && bloc.note_prof) {
    lines.push('')
    lines.push(`> 📝 *Note prof : ${bloc.note_prof}*`)
  }

  return lines
}
