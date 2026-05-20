import { getLLMCallLogs, clearLLMCallLogs } from '@/backend/llm-provider'

export async function GET() {
  return Response.json(getLLMCallLogs())
}

export async function DELETE() {
  clearLLMCallLogs()
  return Response.json({ status: 'cleared' })
}
