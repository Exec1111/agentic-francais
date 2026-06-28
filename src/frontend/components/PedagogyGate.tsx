'use client'

import { useState } from 'react'
import { GraduationCap, BookOpen, Sparkles, Check, Lightbulb } from 'lucide-react'
import { cn } from '@/shared/utils'
import type { ArchitectOutput, PedagogyAdvisorOutput, ModePedagogique } from '@/shared/schemas'

/** Décision pédagogique par séance renvoyée au backend (phase 2). */
export interface SeancePedagogieChoice {
  numero: number
  mode: ModePedagogique
  recommande: boolean
  justification: string
}

interface Props {
  architecture: ArchitectOutput
  recommendations: PedagogyAdvisorOutput
  onConfirm: (choices: SeancePedagogieChoice[]) => void
  onCancel: () => void
  loading?: boolean
}

/**
 * Écran de validation « enseignement explicite » (gate après l'architecte).
 *
 * L'IA a recommandé un mode pour chaque séance ; l'enseignant valide ou ajuste
 * avant que les activités ne soient générées. Par défaut, on suit la reco de l'IA.
 */
export function PedagogyGate({ architecture, recommendations, onConfirm, onCancel, loading }: Props) {
  const recoByNumero = new Map(recommendations.seances.map((s) => [s.numero, s]))

  // Mode initial = recommandation de l'IA (explicite si recommandé, sinon standard).
  const [modes, setModes] = useState<Record<number, ModePedagogique>>(() => {
    const init: Record<number, ModePedagogique> = {}
    for (const s of architecture.seances) {
      init[s.numero] = recoByNumero.get(s.numero)?.recommande ? 'explicite' : 'standard'
    }
    return init
  })

  const setMode = (numero: number, mode: ModePedagogique) =>
    setModes((prev) => ({ ...prev, [numero]: mode }))

  const nbExplicite = Object.values(modes).filter((m) => m === 'explicite').length

  const handleConfirm = () => {
    const choices: SeancePedagogieChoice[] = architecture.seances.map((s) => {
      const reco = recoByNumero.get(s.numero)
      return {
        numero: s.numero,
        mode: modes[s.numero] ?? 'standard',
        recommande: reco?.recommande ?? false,
        justification: reco?.justification ?? '',
      }
    })
    onConfirm(choices)
  }

  return (
    <div className="rounded-2xl border border-primary-800/40 bg-gray-900/40 overflow-hidden">
      {/* En-tête */}
      <div className="px-5 py-4 border-b border-gray-800 bg-primary-900/10">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-900/40 border border-primary-700/40">
            <GraduationCap className="h-5 w-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Enseignement explicite</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Choisis le mode de chaque séance. L'IA recommande l'enseignement explicite pour
              les séances qui introduisent une notion nouvelle. Tu peux ajuster librement.
            </p>
          </div>
        </div>
      </div>

      {/* Liste des séances */}
      <div className="divide-y divide-gray-800/70">
        {architecture.seances.map((s) => {
          const reco = recoByNumero.get(s.numero)
          const mode = modes[s.numero] ?? 'standard'
          return (
            <div key={s.numero} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 h-6 w-6 rounded-full bg-gray-800 text-gray-300 text-xs font-bold flex items-center justify-center">
                      {s.numero}
                    </span>
                    <h3 className="text-sm font-semibold text-gray-100 truncate">{s.titre}</h3>
                  </div>
                  {reco && (
                    <p className="flex items-start gap-1.5 text-xs text-gray-400 mt-1.5 ml-8">
                      <Lightbulb className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', reco.recommande ? 'text-amber-400' : 'text-gray-600')} />
                      <span>
                        <span className={cn('font-semibold', reco.recommande ? 'text-amber-300' : 'text-gray-500')}>
                          {reco.recommande ? 'Recommandé' : 'Non recommandé'} :
                        </span>{' '}
                        {reco.justification}
                      </span>
                    </p>
                  )}
                </div>

                {/* Toggle Explicite / Standard */}
                <div className="shrink-0 flex rounded-lg border border-gray-700 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setMode(s.numero, 'explicite')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 transition-colors',
                      mode === 'explicite'
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-900/40 text-gray-400 hover:text-gray-200',
                    )}
                  >
                    <GraduationCap className="h-3.5 w-3.5" />
                    Explicite
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode(s.numero, 'standard')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-gray-700',
                      mode === 'standard'
                        ? 'bg-gray-700 text-white'
                        : 'bg-gray-900/40 text-gray-400 hover:text-gray-200',
                    )}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Standard
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pied : actions */}
      <div className="px-5 py-4 border-t border-gray-800 bg-gray-950/40 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {nbExplicite} séance{nbExplicite > 1 ? 's' : ''} en enseignement explicite sur {architecture.seances.length}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-all disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-all disabled:opacity-50"
          >
            {loading ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Check className="h-4 w-4" />}
            Lancer la génération
          </button>
        </div>
      </div>
    </div>
  )
}
