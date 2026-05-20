'use client'

import { cn } from '@/shared/utils'
import { Cpu, Cloud } from 'lucide-react'

interface ProviderSwitchProps {
  provider: 'ollama' | 'openai'
  onSwitch: (provider: 'ollama' | 'openai') => void
  disabled?: boolean
}

export function ProviderSwitch({ provider, onSwitch, disabled }: ProviderSwitchProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-900 rounded-lg border border-gray-800 p-1">
      <button
        onClick={() => onSwitch('ollama')}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
          provider === 'ollama'
            ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50'
            : 'text-gray-500 hover:text-gray-300',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <Cpu className="h-3.5 w-3.5" />
        Ollama (local)
      </button>
      <button
        onClick={() => onSwitch('openai')}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
          provider === 'openai'
            ? 'bg-blue-900/50 text-blue-400 border border-blue-700/50'
            : 'text-gray-500 hover:text-gray-300',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <Cloud className="h-3.5 w-3.5" />
        OpenAI
      </button>
    </div>
  )
}
