import { NextRequest, NextResponse } from 'next/server'
import { createLLMProvider } from '@/backend/llm-provider'
import { searchCorpus, expandNiveauxForSearch } from '@/backend/repositories/corpus-repo'
import { rankCorpusWithLLM } from '@/backend/corpus-ranker'
import { OrchestratorOutputSchema, CorpusItem } from '@/shared/schemas'
import { buildExtractParamsMessages } from '@/backend/prompts/corpus-suggest'
import { filterCorpusByExplicitWork } from '@/shared/corpus-match'

export type CorpusSuggestResponse = {
  error?: string
  niveau: string
  /** Niveaux normalisés correspondant au niveau extrait (ex. "Secondaire" → ["seconde","premiere","terminale"]) */
  niveaux_recherches: string[]
  theme: string
  /** Supports correspondant à une œuvre explicitement citée et déjà disponibles. */
  corpus_found: (Omit<CorpusItem, 'contenu'> & { has_content: boolean })[]
  /** Résultats classés, utilisables uniquement après validation humaine. */
  recommendations: {
    item: Omit<CorpusItem, 'contenu'>
    score: number
    raison: string
  }[]
  /** Alias conservé pour les consommateurs historiques, désormais vide. */
  suggestions: {
    auteur: string
    oeuvre: string
    extrait_recommande: string
    pourquoi: string
    niveau_difficulte: 'accessible' | 'standard' | 'exigeant'
    mots_approximatifs: number | null
    genres: string[] | null
    themes: string[] | null
    annee_publication: number | null
  }[]
  intent: 'identified' | 'guided' | 'free' | null
}

export async function POST(request: NextRequest) {
  try {
    const { demande, provider, intent } = await request.json()

    if (!demande?.trim()) {
      return NextResponse.json({ error: 'La demande est requise' }, { status: 400 })
    }

    const llm = createLLMProvider(provider)

    // === Étape 1 : extraire niveau + thème depuis la demande ===
    const extractMessages = buildExtractParamsMessages(demande)
    const extractResp = await llm.chat(extractMessages, {
      temperature: 0.2,
      schema: OrchestratorOutputSchema,
      schemaName: 'extract_params',
    })

    const rawContent = extractResp.content.replace(/```json\n?|```/g, '').trim()
    const params = OrchestratorOutputSchema.safeParse(JSON.parse(rawContent))
    const niveau = params.success ? params.data.niveau : '5e'
    const theme = params.success ? params.data.theme : demande

    // Niveaux étendus : utilisés pour le badge "hors niveau" dans l'UI (pas pour filtrer)
    const niveaux_recherches = expandNiveauxForSearch(niveau)

    // === Étape 2 : corpus vérifié → LLM-juge uniquement en mode exploratoire ===
    // Pas de filtre par niveau : le prof fait son choix, l'UI signale les décalages.
    // Une œuvre citée explicitement est une contrainte forte. Le classement
    // LLM reste utile pour une demande thématique, mais ne doit pas annuler
    // cette contrainte en faisant remonter tout le corpus pertinent au sens
    // large (notamment tous les textes du même auteur).
    const allCandidates = searchCorpus({ limit: 10_000 }).filter((item) => item.contenu.trim())
    const explicitWorkCandidates = filterCorpusByExplicitWork(allCandidates, demande)
    const candidates = intent === 'identified'
      ? explicitWorkCandidates
      : allCandidates

    let found: CorpusItem[] = explicitWorkCandidates
    const recommendations: CorpusSuggestResponse['recommendations'] = []
    if (candidates.length > 0 && (intent === 'guided' || intent === 'free')) {
      const ranked = await rankCorpusWithLLM(llm, candidates, niveau, theme, demande)
      // Seuil : score >= 6 = "pertinent ou connexe"
      recommendations.push(...ranked
        .filter((r) => r.score >= 6)
        .slice(0, 8)
        .map((r) => {
          const { contenu: _, ...item } = r.item
          return { item, score: r.score, raison: r.raison }
        }))
    }

    // Retirer le contenu pour alléger la réponse
    const corpus_found = found.map(({ contenu, ...meta }) => ({ ...meta, has_content: Boolean(contenu.trim()) }))
    const response: CorpusSuggestResponse = {
      niveau, niveaux_recherches, theme, corpus_found, recommendations, suggestions: [],
      intent: intent === 'identified' || intent === 'guided' || intent === 'free' ? intent : null,
    }
    return NextResponse.json(response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
