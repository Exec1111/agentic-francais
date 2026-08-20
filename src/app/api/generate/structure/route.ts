import { NextRequest } from 'next/server'
import { runStructurePhase } from '@/backend/workflow-engine'
import { CorpusWorkflowSelectionSchema } from '@/shared/schemas'
import { getCorpusById } from '@/backend/repositories/corpus-repo'
import { validateCorpusWorkflow } from '@/shared/corpus-workflow'

/**
 * Phase 1 du flux « enseignement explicite » : structure la séquence (orchestrateur →
 * architecte → conseiller pédagogique) et s'arrête sur l'événement `awaiting_pedagogy`.
 * Le client présente alors le gate de validation, puis appelle /api/generate/activities.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { demande, provider, corpus_refs, corpus_selection } = body as {
    demande: string
    provider?: string
    corpus_refs?: string[]
    corpus_selection?: unknown
  }

  if (!demande || demande.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'La demande est requise' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const selection = CorpusWorkflowSelectionSchema.safeParse(corpus_selection)
  if (corpus_selection !== undefined && !selection.success) {
    return new Response(JSON.stringify({ error: 'Sélection de corpus invalide', details: selection.error.issues }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  if (selection.success) {
    const items = selection.data.work_refs.map((id) => getCorpusById(id)).filter((item): item is NonNullable<typeof item> => item !== null)
    const validation = validateCorpusWorkflow(selection.data, items)
    if (!validation.valid) return new Response(JSON.stringify({ error: validation.message }), { status: 422, headers: { 'Content-Type': 'application/json' } })
  }
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runStructurePhase(demande, provider, corpus_refs, selection.success ? selection.data : undefined)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'workflow_error', error: errorMsg })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
