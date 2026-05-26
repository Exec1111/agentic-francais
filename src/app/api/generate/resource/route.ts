import { NextRequest } from 'next/server'
import { createLLMProvider } from '@/backend/llm-provider'
import { getCorpusById } from '@/backend/repositories/corpus-repo'
import { buildResourceMessages, ResourceWriterOptions } from '@/backend/prompts/resource-writer'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sequenceTitle,
      niveau,
      theme,
      seanceNumero,
      seanceTitle,
      activiteTitle,
      activiteType,
      ressourceTitle,
      ressourceType,
      formatExercice,
      corpus_ref,
      provider,
    } = body

    if (!ressourceType || !ressourceTitle) {
      return new Response(JSON.stringify({ error: 'Le type et le titre de la ressource sont requis.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // === Résolution du corpus ===
    let corpusItem = corpus_ref ? getCorpusById(corpus_ref) : null

    // Si le type demande un texte source et qu'on n'a pas de corpus_ref,
    // on retourne une erreur explicite plutôt que de laisser l'IA inventer.
    if ((ressourceType === 'extrait_oeuvre' || ressourceType === 'oeuvre_complete') && !corpusItem) {
      if (corpus_ref) {
        return new Response(
          JSON.stringify({ error: `Texte source introuvable dans le corpus (id: ${corpus_ref}). Ajoutez le texte au corpus avant de générer cette ressource.` }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        )
      }
      // Pas de corpus_ref du tout → l'IA génère (comportement legacy, à terme déprécié)
      corpusItem = null
    }

    const llm = createLLMProvider(provider)

    // === Construction du prompt selon le cas ===
    const messages = buildResourceMessages({
      sequenceTitle,
      niveau,
      theme,
      seanceNumero,
      seanceTitle,
      activiteTitle,
      activiteType,
      ressourceTitle,
      ressourceType,
      formatExercice,
      corpusItem,
    } as ResourceWriterOptions)

    const response = await llm.chat(messages, { temperature: 0.7 })

    let markdown = response.content.trim()
    const match = markdown.match(/^```(?:markdown)?\s*\n([\s\S]*?)\n```$/i)
    if (match) {
      markdown = match[1].trim()
    } else {
      markdown = markdown.replace(/^```(?:markdown)?\s*\n/i, '').replace(/\n```$/i, '')
    }

    return Response.json({ content: markdown })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur interne lors de la génération de la ressource'
    return Response.json({ error: errorMsg }, { status: 500 })
  }
}

