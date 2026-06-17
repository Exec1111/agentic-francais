import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createLLMProvider } from '@/backend/llm-provider'
import { runReviewer } from '@/backend/agents/reviewer'
import { SequenceSchema, ReviewSchema } from '@/shared/schemas'

const RequestSchema = z.object({
  sequence: SequenceSchema,
  provider: z.string().optional(),
  // Review précédente (optionnelle) → relecture incrémentale avec score ancré.
  previousReview: ReviewSchema.nullish(),
})

/**
 * Relance le Reviewer Qualité sur une séquence existante (éventuellement éditée),
 * hors du pipeline de génération complet. Renvoie une review au format structuré
 * (suggestions actionnables), ce qui permet d'obtenir des correctifs au clic sur
 * des séquences créées avant l'introduction de ce système.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Paramètres invalides', details: parsed.error.issues }, { status: 400 })
  }

  const { sequence, provider, previousReview } = parsed.data
  const llm = createLLMProvider(provider)

  try {
    const review = await runReviewer(llm, sequence, () => {}, previousReview)
    return Response.json({ review })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erreur inconnue'
    return Response.json({ error }, { status: 500 })
  }
}
