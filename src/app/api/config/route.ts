import { NextRequest } from 'next/server'

export async function GET() {
  return Response.json({
    provider: process.env.LLM_PROVIDER || 'ollama',
    ollama_model: process.env.OLLAMA_MODEL || 'llama3',
    openai_model: process.env.OPENAI_MODEL || 'gpt-4o',
    ollama_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  })
}

export async function POST(request: NextRequest) {
  // En mode local, on ne peut pas changer les env vars dynamiquement
  // mais cette route sert de point d'extension futur
  const body = await request.json()
  return Response.json({ status: 'ok', received: body })
}
