'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, X, Lock, Loader2, Wand2, AlertTriangle } from 'lucide-react'
import { cn } from '@/shared/utils'
import { IA_AUTEUR, type CorpusItem } from '@/shared/schemas'

const NIVEAU_LABELS: Record<string, string> = {
  sixieme: '6e', cinquieme: '5e', quatrieme: '4e', troisieme: '3e',
  seconde: '2nde', premiere: '1re', terminale: 'Tle',
}

interface CorpusViewerProps {
  /** Id du texte à afficher — null ferme le panneau */
  corpusId: string | null
  onClose: () => void
}

/**
 * Panneau de lecture d'un texte du corpus.
 * Drawer latéral droit, au-dessus des modales (z > GenerateModal)
 * pour être utilisable depuis la modale de création comme depuis l'éditeur.
 */
export function CorpusViewer({ corpusId, onClose }: CorpusViewerProps) {
  const [item, setItem] = useState<CorpusItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!corpusId) return
    let cancelled = false
    setItem(null)
    setError(null)
    setLoading(true)
    fetch(`/api/corpus/${encodeURIComponent(corpusId)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
        return data.item as CorpusItem
      })
      .then((it) => { if (!cancelled) setItem(it) })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [corpusId])

  // Échap pour fermer
  useEffect(() => {
    if (!corpusId) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [corpusId, onClose])

  const isIA = item?.auteur === IA_AUTEUR
  const hasContent = (item?.contenu ?? '') !== ''
  const wordCount = hasContent ? item!.contenu.trim().split(/\s+/).filter(Boolean).length : 0

  return (
    <AnimatePresence>
      {corpusId && (
        <>
          {/* Backdrop — au-dessus des modales (GenerateModal: z-95) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black backdrop-blur-sm z-[110]"
            onClick={onClose}
          />

          {/* Panneau */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-full max-w-2xl bg-gray-950/97 backdrop-blur-xl border-l border-gray-800 shadow-2xl z-[111] flex flex-col text-gray-200"
          >
            {/* En-tête */}
            <div className="px-6 py-4 border-b border-gray-800 flex items-start gap-3 shrink-0">
              <div className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg border shrink-0 mt-0.5',
                isIA
                  ? 'bg-purple-900/40 border-purple-700/50 text-purple-400'
                  : 'bg-blue-900/40 border-blue-700/50 text-blue-400',
              )}>
                {isIA ? <Wand2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                {item ? (
                  <>
                    <h2 className="text-base font-semibold text-white leading-snug">
                      <em>« {item.oeuvre} »</em>
                    </h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {item.auteur}
                      {item.annee_publication ? ` · ${item.annee_publication}` : ''}
                      {item.titre !== item.oeuvre ? ` — ${item.titre}` : ''}
                    </p>
                  </>
                ) : (
                  <h2 className="text-base font-semibold text-gray-500">Texte du corpus</h2>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-all shrink-0"
                title="Fermer (Échap)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Métadonnées */}
            {item && (
              <div className="px-6 py-3 border-b border-gray-800/60 flex flex-wrap items-center gap-1.5 shrink-0">
                {item.niveaux.map((n) => (
                  <span key={n} className="text-[11px] px-2 py-0.5 rounded-full bg-primary-900/40 text-primary-300 border border-primary-700/40">
                    {NIVEAU_LABELS[n] ?? n}
                  </span>
                ))}
                {item.genres.map((g) => (
                  <span key={g} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800/80 text-gray-400 border border-gray-700/60">
                    {g}
                  </span>
                ))}
                {item.themes.map((t) => (
                  <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-900/80 text-gray-500 border border-gray-800">
                    {t}
                  </span>
                ))}
                {isIA && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-950/50 text-purple-400 border border-purple-800/40 inline-flex items-center gap-1">
                    <Wand2 className="h-2.5 w-2.5" />
                    {item.verified_by === 'professeur' ? 'Texte IA · relu' : 'Texte IA'}
                  </span>
                )}
                {hasContent && (
                  <span className="text-[11px] text-gray-600 ml-auto">~{wordCount} mots</span>
                )}
              </div>
            )}

            {/* Corps */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Chargement du texte…</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/20 border border-red-900/40 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {item && !hasContent && (
                <div className="flex items-start gap-3 text-sm text-amber-300/90 bg-amber-950/20 border border-amber-800/40 rounded-lg p-4">
                  <Lock className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <p className="font-medium">Œuvre protégée par droits d'auteur</p>
                    <p className="text-amber-400/70 mt-1">
                      Le texte intégral n'est pas stocké dans le corpus. Seule la référence
                      bibliographique est utilisée pour la génération — l'enseignant distribue
                      le texte séparément.
                    </p>
                  </div>
                </div>
              )}

              {item && hasContent && (
                <div className="max-w-prose">
                  <p className="text-[15px] text-gray-200 leading-7 whitespace-pre-wrap font-serif">
                    {item.contenu}
                  </p>
                </div>
              )}
            </div>

            {/* Pied : référence bibliographique */}
            {item && (
              <div className="px-6 py-3 border-t border-gray-800 shrink-0">
                <p className="text-xs text-gray-600 italic">
                  {item.auteur}, <em>{item.oeuvre}</em>
                  {item.pages ? `, ${item.pages}` : ''} — {item.edition_reference}
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
