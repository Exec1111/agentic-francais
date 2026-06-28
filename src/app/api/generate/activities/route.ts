import { NextRequest } from 'next/server'
import { runGenerationPhase, SeancePedagogie } from '@/backend/workflow-engine'
import type { ArchitectOutput } from '@/shared/schemas'

/**
 * Phase 2 du flux « enseignement explicite » : reçoit l'architecture et le mode
 * pédagogique choisi par l'enseignant pour chaque séance, génère les activités
 * (générateur conscient du mode), assemble et révise la séquence.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { workflow_id, architecture, pedagogie, provider, corpus_refs } = body as {
    workflow_id: string
    architecture: ArchitectOutput
    pedagogie: SeancePedagogie[]
    provider?: string
    corpus_refs?: string[]
  }

  if (!workflow_id || !architecture || !Array.isArray(pedagogie)) {
    return new Response(JSON.stringify({ error: 'workflow_id, architecture et pedagogie sont requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runGenerationPhase(workflow_id, architecture, pedagogie, provider, corpus_refs)) {
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
