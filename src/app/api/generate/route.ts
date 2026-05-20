import { NextRequest } from 'next/server'
import { runWorkflow } from '@/backend/workflow-engine'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { demande, provider } = body as { demande: string; provider?: string }

  if (!demande || demande.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'La demande est requise' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runWorkflow(demande, provider)) {
          const data = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(data))
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
        const data = `data: ${JSON.stringify({ type: 'workflow_error', error: errorMsg })}\n\n`
        controller.enqueue(encoder.encode(data))
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
