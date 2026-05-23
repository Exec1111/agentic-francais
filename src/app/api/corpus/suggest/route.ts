import { NextRequest, NextResponse } from 'next/server'
import { createLLMProvider, LLMMessage } from '@/backend/llm-provider'
import { searchCorpus, expandNiveauxForSearch } from '@/backend/repositories/corpus-repo'
import { rankCorpusWithLLM } from '@/backend/corpus-ranker'
import { OrchestratorOutputSchema, CorpusSuggestionSchema, CorpusItem } from '@/shared/schemas'

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
    mots_approximatifs?: number
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
    const extractMessages: LLMMessage[] = [
      {
        role: 'system',
        content: `Extrais le niveau scolaire et le thème principal d'une demande pédagogique.
Réponds UNIQUEMENT avec un objet JSON valide contenant : niveau, theme, nombre_seances (défaut 5), contraintes (tableau vide si aucune), evaluation_finale (true par défaut), problematique_suggeree (chaîne vide si non précisée).`,
      },
      { role: 'user', content: demande },
    ]
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
    const candidates = searchCorpus({ limit: 30 })

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
        const suggMessages: LLMMessage[] = [
          {
            role: 'system',
            content: `Tu es un expert en littérature française scolaire. Suggère des textes littéraires pertinents pour une séquence pédagogique. Réponds UNIQUEMENT avec un tableau JSON.`,
          },
          {
            role: 'user',
            content: `Séquence pour des élèves de ${niveau}, sur le thème "${theme}".
${found.length > 0 ? `Textes déjà disponibles : ${found.map((f) => `${f.auteur} — ${f.oeuvre}`).join(', ')}. Propose des textes COMPLÉMENTAIRES.` : 'Propose 2 textes essentiels pour cette séquence.'}

Réponds UNIQUEMENT avec ce tableau JSON (2 éléments max) :
[
  {
    "auteur": "Prénom Nom",
    "oeuvre": "Titre exact",
    "extrait_recommande": "Description précise de l'extrait recommandé",
    "pourquoi": "Justification pédagogique en 1 phrase",
    "niveau_difficulte": "accessible",
    "mots_approximatifs": 300
  }
]`,
          },
        ]
        const suggResp = await llm.chat(suggMessages, { temperature: 0.4 })
        const cleaned = suggResp.content.replace(/```json\n?|```/g, '').trim()
        const parsed = JSON.parse(cleaned)
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const validated = CorpusSuggestionSchema.safeParse(item)
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
