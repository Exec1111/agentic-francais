import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createLLMProvider } from '@/backend/llm-provider'
import { validateLLMOutput } from '@/backend/validation'
import {
  CONSIGNE_SYSTEM_PROMPT,
  OBJECTIFS_SYSTEM_PROMPT,
  buildConsigneUserPrompt,
  buildObjectifsUserPrompt,
} from '@/backend/prompts/field-edit'

const ContextSchema = z.object({
  titre_sequence: z.string(),
  niveau: z.string(),
  theme: z.string(),
  seanceNumero: z.number(),
  seanceTitre: z.string(),
  seanceObjectifs: z.array(z.string()),
  activiteTitre: z.string().optional(),
  activiteType: z.string().optional(),
})

const RequestSchema = z.object({
  kind: z.enum(['consigne', 'objectifs']),
  context: ContextSchema,
  currentValue: z.union([z.string(), z.array(z.string())]),
  instruction: z.string(),
  provider: z.string().optional(),
})

// Schémas de sortie LLM (objet racine — exigé par les Structured Outputs)
const ConsigneOutSchema = z.object({ consigne: z.string() })
const ObjectifsOutSchema = z.object({ objectifs: z.array(z.string()).min(1) })

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

  const { kind, context, currentValue, instruction, provider } = parsed.data
  const llm = createLLMProvider(provider)

  try {
    if (kind === 'consigne') {
      const consigneActuelle = Array.isArray(currentValue) ? currentValue.join(' ') : currentValue
      const messages = [
        { role: 'system' as const, content: CONSIGNE_SYSTEM_PROMPT },
        { role: 'user' as const, content: buildConsigneUserPrompt(context, consigneActuelle, instruction) },
      ]
      const chatOptions = { temperature: 0.6, schema: ConsigneOutSchema, schemaName: 'field_consigne' }
      const response = await llm.chat(messages, chatOptions)
      const out = await validateLLMOutput({
        schema: ConsigneOutSchema, raw: response.content, context: 'field-consigne',
        llm, messages, options: chatOptions, maxRetries: 1,
      })
      return Response.json({ value: out.consigne })
    }

    // kind === 'objectifs'
    const objectifsActuels = Array.isArray(currentValue) ? currentValue : [currentValue]
    const messages = [
      { role: 'system' as const, content: OBJECTIFS_SYSTEM_PROMPT },
      { role: 'user' as const, content: buildObjectifsUserPrompt(context, objectifsActuels, instruction) },
    ]
    const chatOptions = { temperature: 0.6, schema: ObjectifsOutSchema, schemaName: 'field_objectifs' }
    const response = await llm.chat(messages, chatOptions)
    const out = await validateLLMOutput({
      schema: ObjectifsOutSchema, raw: response.content, context: 'field-objectifs',
      llm, messages, options: chatOptions, maxRetries: 1,
    })
    return Response.json({ value: out.objectifs })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Erreur inconnue'
    return Response.json({ error }, { status: 500 })
  }
}
