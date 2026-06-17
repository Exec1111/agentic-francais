import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createLLMProvider } from '@/backend/llm-provider'
import { validateLLMOutput } from '@/backend/validation'
import { getCorpusById } from '@/backend/repositories/corpus-repo'
import { SYSTEM_PROMPT, buildUserPrompt } from '@/backend/prompts/activity-regen'

const RequestSchema = z.object({
  seanceContext: z.object({
    titre_sequence: z.string(),
    niveau: z.string(),
    theme: z.string(),
    objectifs_sequence: z.array(z.string()),
    seanceNumero: z.number(),
    seanceTitre: z.string(),
    seanceObjectifs: z.array(z.string()),
    seanceDuree: z.number(),
    autresActivites: z.array(z.object({
      titre: z.string(),
      type: z.string(),
      duree: z.number(),
    })),
  }),
  activiteActuelle: z.object({
    titre: z.string(),
    type: z.string(),
    duree: z.number(),
    consigne: z.string().optional(),
  }).optional(),
  motif: z.string().optional(),
  provider: z.string().optional(),
  corpus_refs: z.array(z.string()).optional(),
  // 'remplacer' (défaut) régénère activiteActuelle ; 'ajouter' crée une activité.
  mode: z.enum(['remplacer', 'ajouter']).optional(),
})

// Tous les champs sont required (OpenAI structured outputs interdit les champs optional)
// Les champs "optionnels" utilisent nullable() ou un tableau vide comme valeur par défaut
const SingleActiviteSchema = z.object({
  titre: z.string(),
  type: z.enum(['exercice', 'production_ecrite', 'debat', 'lecture', 'oral', 'evaluation', 'collaboration', 'recherche']),
  duree: z.number().min(5).max(55),
  consigne: z.string(),
  supports: z.array(z.string()),
  differenciation: z.string().nullable(),
})

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

  const { seanceContext, activiteActuelle, motif, provider, corpus_refs, mode } = parsed.data

  if (mode !== 'ajouter' && !activiteActuelle) {
    return Response.json({ error: 'activiteActuelle requis en mode remplacer' }, { status: 400 })
  }

  const llm = createLLMProvider(provider)

  const corpusBlock = (corpus_refs ?? [])
    .map((id) => getCorpusById(id))
    .filter(Boolean)
    .map((item) =>
      `━━━ TEXTE : ${item!.auteur}, « ${item!.oeuvre} » ━━━\n${item!.contenu.slice(0, 600)}\n━━━ FIN ━━━`
    )
    .join('\n\n')

  const userPrompt = buildUserPrompt(seanceContext, activiteActuelle, motif, corpusBlock, mode ?? 'remplacer')

  try {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: userPrompt },
    ]

    const chatOptions = {
      temperature: 0.75,
      schema: SingleActiviteSchema,
      schemaName: 'single_activite',
    }

    const response = await llm.chat(messages, chatOptions)
    const activite = await validateLLMOutput({
      schema: SingleActiviteSchema,
      raw: response.content,
      context: 'regen-activite',
      llm,
      messages,
      options: chatOptions,
      maxRetries: 1,
    })

    return Response.json({
      activite: {
        ...activite,
        differenciation: activite.differenciation ?? undefined,
        ressources: [],
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erreur inconnue'
    return Response.json({ error }, { status: 500 })
  }
}
