'use client'

import { useRef, useState } from 'react'
import { Upload, FileText, Loader2, X } from 'lucide-react'
import { cn } from '@/shared/utils'
import type { CorpusItem } from '@/shared/schemas'
import type { CorpusUploadResponse } from '@/app/api/corpus/upload/route'

interface TextDepositPanelProps {
  /** Niveau scolaire courant — transmis comme métadonnée du texte déposé. */
  niveau: string
  /** Pré-remplissage (ex. depuis une suggestion IA : auteur, œuvre, genres, thèmes, année). */
  defaultAuteur?: string
  defaultOeuvre?: string
  defaultGenres?: string[]
  defaultThemes?: string[]
  defaultAnnee?: number | null
  /** Appelé après un dépôt réussi avec l'item de corpus créé. */
  onDeposited: (item: CorpusItem) => void
}

const ACCEPT = '.txt,.md,.docx,.pdf'

/**
 * Dépôt d'un texte RÉEL par l'enseignant (paliers 1 & 2) :
 *  - coller le texte, ou
 *  - déposer un fichier .txt / .docx / PDF (couche texte).
 *
 * Le texte extrait est créé comme item de corpus sélectionnable. Aucun contenu
 * n'est inventé : seul ce que l'enseignant fournit est enregistré.
 */
export function TextDepositPanel({
  niveau,
  defaultAuteur = '',
  defaultOeuvre = '',
  defaultGenres = [],
  defaultThemes = [],
  defaultAnnee = null,
  onDeposited,
}: TextDepositPanelProps) {
  const [auteur, setAuteur] = useState(defaultAuteur)
  const [oeuvre, setOeuvre] = useState(defaultOeuvre)
  const [genres, setGenres] = useState(defaultGenres.join(', '))
  const [themes, setThemes] = useState(defaultThemes.join(', '))
  const [annee, setAnnee] = useState(defaultAnnee != null ? String(defaultAnnee) : '')
  const [domainePublic, setDomainePublic] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [texte, setTexte] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    setTexte('')
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const submit = async () => {
    if (loading) return
    if (!oeuvre.trim()) {
      setError("Indiquez le titre de l'œuvre.")
      return
    }
    if (!file && !texte.trim()) {
      setError('Déposez un fichier ou collez un texte.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const annee_publication = annee.trim() ? Number(annee) : undefined
      let res: Response
      if (file) {
        const form = new FormData()
        form.append('file', file)
        form.append('auteur', auteur)
        form.append('oeuvre', oeuvre)
        form.append('niveau', niveau)
        form.append('genres', genres)
        form.append('themes', themes)
        if (annee_publication) form.append('annee_publication', String(annee_publication))
        form.append('domaine_public', String(domainePublic))
        res = await fetch('/api/corpus/upload', { method: 'POST', body: form })
      } else {
        res = await fetch('/api/corpus/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texte, auteur, oeuvre, niveau, genres, themes,
            annee_publication, domaine_public: domainePublic,
          }),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erreur HTTP ${res.status}`)
      onDeposited((data as CorpusUploadResponse).item)
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Le dépôt a échoué')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={auteur}
          onChange={(e) => setAuteur(e.target.value)}
          disabled={loading}
          placeholder="Auteur (optionnel)"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/60"
        />
        <input
          type="text"
          value={oeuvre}
          onChange={(e) => setOeuvre(e.target.value)}
          disabled={loading}
          placeholder="Titre de l'œuvre *"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/60"
        />
      </div>

      {/* Métadonnées (pré-remplies depuis la suggestion, éditables) */}
      <div className="grid grid-cols-[1fr_1fr_5.5rem] gap-2">
        <input
          type="text"
          value={genres}
          onChange={(e) => setGenres(e.target.value)}
          disabled={loading}
          placeholder="Genres (séparés par ,)"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/60"
        />
        <input
          type="text"
          value={themes}
          onChange={(e) => setThemes(e.target.value)}
          disabled={loading}
          placeholder="Thèmes (séparés par ,)"
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/60"
        />
        <input
          type="number"
          value={annee}
          onChange={(e) => setAnnee(e.target.value)}
          disabled={loading}
          placeholder="Année"
          className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/60"
        />
      </div>

      {/* Dépôt de fichier (drag-drop) */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const dropped = e.dataTransfer.files?.[0]
          if (dropped) { setFile(dropped); setError(null) }
        }}
        className="flex items-center gap-2 rounded-lg border border-dashed border-gray-700 px-3 py-2"
      >
        {file ? (
          <>
            <FileText className="h-4 w-4 shrink-0 text-emerald-500" />
            <span className="flex-1 min-w-0 truncate text-xs text-gray-300">{file.name}</span>
            <button
              onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
              disabled={loading}
              className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors"
              title="Retirer le fichier"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-emerald-400 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Déposer un fichier (.txt, .docx, PDF) ou glisser-déposer
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null) } }}
        />
      </div>

      {!file && (
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          disabled={loading}
          rows={4}
          placeholder="…ou collez directement le texte ici"
          className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-600/50 resize-y scrollbar-thin"
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={domainePublic}
            onChange={(e) => setDomainePublic(e.target.checked)}
            disabled={loading}
            className="accent-emerald-600"
          />
          Domaine public
        </label>
        {error && <span className="flex-1 text-xs text-red-400 truncate">❌ {error}</span>}
        <button
          onClick={submit}
          disabled={loading}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0',
            loading
              ? 'bg-emerald-950/40 text-emerald-400 cursor-wait'
              : 'bg-emerald-700/80 text-white hover:bg-emerald-600',
          )}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Ajouter au corpus
        </button>
      </div>
      <p className="text-xs text-gray-600">
        Le texte déposé est enregistré tel quel (fidélité non vérifiée) et ajouté à votre corpus.
        Un PDF scanné sans couche texte sera refusé — l'OCR n'est pas encore disponible.
      </p>
    </div>
  )
}
