import { NextRequest, NextResponse } from 'next/server'
import { createLLMProvider } from '@/backend/llm-provider'
import { searchCorpus, expandNiveauxForSearch } from '@/backend/repositories/corpus-repo'
import { rankCorpusWithLLM } from '@/backend/corpus-ranker'
import { OrchestratorOutputSchema, CorpusSuggestionSchema, CorpusItem } from '@/shared/schemas'
import { buildExtractParamsMessages, buildCorpusSuggestionMessages } from '@/backend/prompts/corpus-suggest'
import { filterCorpusByExplicitWork } from '@/shared/corpus-match'

export type CorpusSuggestResponse = {
  niveau: string
  /** Niveaux normalisés correspondant au niveau extrait (ex. "Secondaire" → ["seconde","premiere","terminale"]) */
  niveaux_recherches: string[]
  theme: string
  corpus_found: Omit<CorpusItem, 'contenu'>[]
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
}

export async function POST(request: NextRequest) {
  try {
    const { demande, provider } = await request.json()

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

    // === Étape 2 : tout le corpus vérifié → LLM-juge de pertinence thématique ===
    // Pas de filtre par niveau : le prof fait son choix, l'UI signale les décalages.
    // Une œuvre citée explicitement est une contrainte forte. Le classement
    // LLM reste utile pour une demande thématique, mais ne doit pas annuler
    // cette contrainte en faisant remonter tout le corpus pertinent au sens
    // large (notamment tous les textes du même auteur).
    const allCandidates = searchCorpus({ limit: 10_000 })
    const explicitWorkCandidates = filterCorpusByExplicitWork(allCandidates, demande)
    const candidates = explicitWorkCandidates.length > 0 ? explicitWorkCandidates : allCandidates

    let found: CorpusItem[] = []
    if (candidates.length > 0) {
      const ranked = await rankCorpusWithLLM(llm, candidates, niveau, theme, demande)
      // Seuil : score >= 6 = "pertinent ou connexe"
      found = ranked.filter((r) => r.score >= 6).map((r) => r.item)
    }

    // Retirer le contenu pour alléger la réponse
    const corpus_found = found.map(({ contenu: _, ...meta }) => meta)

    // === Étape 3 : si < 2 textes trouvés, suggestions IA ===
    const suggestions: CorpusSuggestResponse['suggestions'] = []

    if (found.length < 2) {
      try {
        const suggMessages = buildCorpusSuggestionMessages(niveau, theme, found)
        const suggResp = await llm.chat(suggMessages, { temperature: 0.4 })
        const cleaned = suggResp.content.replace(/```json\n?|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            // Défauts pour tolérer un modèle libre (Ollama) qui omettrait
            // les clés nullable : le schéma les exige présentes (pas optional).
            const validated = CorpusSuggestionSchema.safeParse({
              genres: null, themes: null, annee_publication: null, ...item,
            })
            if (validated.success) suggestions.push(validated.data)
          }
        }
      } catch {
        // suggestions IA échouées → on continue sans
      }
    }

    const response: CorpusSuggestResponse = { niveau, niveaux_recherches, theme, corpus_found, suggestions }
    return NextResponse.json(response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
