'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText, CheckCircle2, Copy, Sparkles, BookOpen, AlertCircle, Edit3, Eye, Printer } from 'lucide-react'
import { cn } from '@/shared/utils'
import type { Ressource, ExerciceFormat } from '@/shared/schemas'

interface ResourceDrawerProps {
  isOpen: boolean
  onClose: () => void
  ressource: Ressource | null
  seanceIndex: number
  activiteIndex?: number
  sequenceContext: {
    sequenceTitle: string
    niveau: string
    theme: string
    seanceTitle: string
    activiteTitle?: string
    activiteType?: string
  }
  onUpdateContent: (seanceIndex: number, activiteIndex: number | undefined, ressourceId: string, contenu: string, formatExercice?: any) => void
  onUpdateStatus: (seanceIndex: number, activiteIndex: number | undefined, ressourceId: string, status: 'empty' | 'generating' | 'ready' | 'error') => void
  provider?: string
  corpusRef?: string
}

// Parseur Markdown ultra-léger et robuste adapté aux contenus pédagogiques
function renderMarkdown(md: string): string {
  if (!md) return ''
  let html = md
    // Échapement de base pour prévenir XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Titres
    .replace(/^### (.*$)/gim, '<h4 class="text-md font-semibold text-gray-200 mt-5 mb-2">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 class="text-lg font-bold text-blue-400 mt-6 mb-3 border-b border-gray-800/50 pb-1">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 class="text-xl font-extrabold text-white mt-7 mb-4 pb-2 border-b border-gray-800">$1</h2>')
    // Citations / Extraits (très important pour les textes littéraires)
    .replace(/^\>\s?(.*$)/gim, '<blockquote class="border-l-4 border-blue-500 bg-blue-500/5 px-4 py-2.5 my-4 rounded-r text-gray-300 italic font-serif leading-relaxed">$1</blockquote>')
    // Checkboxes (Textes à trous ou QCM)
    .replace(/^\s*-\s?\[ \]\s?(.*$)/gim, '<div class="flex items-start gap-2 my-2"><input type="checkbox" disabled class="mt-1 rounded border-gray-700 bg-gray-800" /> <span class="text-gray-300 text-sm">$1</span></div>')
    .replace(/^\s*-\s?\[x\]\s?(.*$)/gim, '<div class="flex items-start gap-2 my-2"><input type="checkbox" checked disabled class="mt-1 rounded border-gray-700 bg-gray-800 text-blue-500" /> <span class="text-gray-400 line-through text-sm">$1</span></div>')
    // Listes à puces simples
    .replace(/^\s*-\s?(.*$)/gim, '<li class="list-disc ml-5 my-1 text-gray-300 text-sm">$1</li>')
    // Gras, Italique, Souligné
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/__(.*?)__/g, '<u>$1</u>')

  // Séparation en paragraphes pour le texte normal
  const paragraphs = html.split(/\n\n+/)
  html = paragraphs.map(p => {
    const trimmed = p.trim()
    if (!trimmed) return ''
    if (
      trimmed.startsWith('<h') || 
      trimmed.startsWith('<blockquote') || 
      trimmed.startsWith('<li') || 
      trimmed.startsWith('<div') || 
      trimmed.startsWith('<table') || 
      trimmed.startsWith('|-') || 
      trimmed.startsWith('|')
    ) {
      return p
    }
    return `<p class="my-3 text-gray-300 leading-relaxed text-sm">${p.replace(/\n/g, '<br />')}</p>`
  }).join('\n')

  // Parseur de Tableaux Markdown (crucial pour l'exercice "relier les notions")
  html = html.replace(/((?:\|[^\n]*\|(?:\n|$))+)/g, (match) => {
    const lines = match.trim().split('\n').filter(Boolean)
    if (lines.length < 2) return match
    
    const hasSeparator = lines[1].includes('-')
    const startIdx = hasSeparator ? 2 : 1
    
    const headers = lines[0].split('|').map(x => x.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1)
    const headerHtml = `<thead><tr class="bg-gray-800/80 text-gray-200 border-b border-gray-700">${headers.map(h => `<th class="p-2 text-left font-semibold text-xs uppercase tracking-wider">${h}</th>`).join('')}</tr></thead>`
    
    const bodyHtml = `<tbody>${lines.slice(startIdx).map((line, idx) => {
      const cols = line.split('|').map(x => x.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1)
      return `<tr class="${idx % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-800/10'} border-b border-gray-800/50 hover:bg-blue-500/5 transition-colors">${cols.map(c => `<td class="p-2 text-sm text-gray-300 font-sans">${c}</td>`).join('')}</tr>`
    }).join('')}</tbody>`
    
    return `<div class="overflow-x-auto my-4 rounded-lg border border-gray-800 bg-gray-950/20"><table class="min-w-full divide-y divide-gray-800">${headerHtml}${bodyHtml}</table></div>`
  })

  return html
}

export function ResourceDrawer({
  isOpen,
  onClose,
  ressource,
  seanceIndex,
  activiteIndex,
  sequenceContext,
  onUpdateContent,
  onUpdateStatus,
  provider,
  corpusRef,
}: ResourceDrawerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<ExerciceFormat>('libre')
  const [copySuccess, setCopySuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Synchroniser le contenu édité avec la ressource
  useEffect(() => {
    if (ressource) {
      setEditedContent(ressource.contenu || '')
      setSelectedFormat(ressource.format_exercice || 'libre')
      setIsEditing(false)
      setErrorMsg('')
    }
  }, [ressource])

  if (!ressource) return null

  // Lancement de la génération d'IA
  const handleGenerate = async () => {
    onUpdateStatus(seanceIndex, activiteIndex, ressource.id, 'generating')
    setErrorMsg('')
    
    try {
      const response = await fetch('/api/generate/resource', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequenceTitle: sequenceContext.sequenceTitle,
          niveau: sequenceContext.niveau,
          theme: sequenceContext.theme,
          seanceNumero: seanceIndex + 1,
          seanceTitle: sequenceContext.seanceTitle,
          activiteTitle: sequenceContext.activiteTitle,
          activiteType: sequenceContext.activiteType,
          ressourceTitle: ressource.titre,
          ressourceType: ressource.type,
          formatExercice: ressource.type === 'exercice' ? selectedFormat : undefined,
          corpus_ref: corpusRef,
          provider,
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`)
      }

      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }

      onUpdateContent(seanceIndex, activiteIndex, ressource.id, data.content, ressource.type === 'exercice' ? selectedFormat : undefined)
    } catch (err) {
      console.error(err)
      setErrorMsg(err instanceof Error ? err.message : 'Erreur de génération')
      onUpdateStatus(seanceIndex, activiteIndex, ressource.id, 'error')
    }
  }

  // Enregistrer l'édition manuelle
  const handleSaveEdit = () => {
    onUpdateContent(seanceIndex, activiteIndex, ressource.id, editedContent, ressource.type === 'exercice' ? selectedFormat : undefined)
    setIsEditing(false)
  }

  // Copier le texte
  const handleCopy = () => {
    navigator.clipboard.writeText(editedContent)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  // Imprimer / Exporter
  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${ressource.titre}</title>
            <style>
              body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
              h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
              h2 { font-size: 20px; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
              h3 { font-size: 16px; margin-top: 20px; }
              blockquote { border-left: 4px solid #0066cc; background: #f0f7ff; padding: 15px; margin: 20px 0; font-style: italic; }
              table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
              th { background-color: #f5f5f5; }
              p { margin-bottom: 15px; }
              li { margin-bottom: 5px; }
              @media print {
                body { padding: 0; }
                button { display: none; }
              }
            </style>
          </head>
          <body>
            <h1>${ressource.titre}</h1>
            <div>${renderMarkdown(editedContent)}</div>
            <script>window.onload = function() { window.print(); }</script>
          </body>
        </html>
      `)
      printWindow.document.close()
    }
  }

  // Labels pour le type de ressource
  const typeLabels: Record<string, { label: string; color: string }> = {
    cours: { label: 'Cours Théorique', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    bilan: { label: 'Bilan & Synthèse', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
    extrait_oeuvre: { label: "Extrait d'œuvre", color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
    oeuvre_complete: { label: 'Texte Court / Poème', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    exercice: { label: 'Fiche d\'exercice', color: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay flou d'arrière-plan */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black backdrop-blur-sm z-40 transition-opacity"
          />

          {/* Drawer latéral principal (Glassmorphism de luxe) */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-gray-950/95 backdrop-blur-xl border-l border-gray-800 shadow-2xl z-50 flex flex-col h-screen text-gray-200"
          >
            {/* Header */}
            <div className="p-5 border-b border-gray-800/80 flex items-center justify-between bg-gray-900/40">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-100 line-clamp-1">{ressource.titre}</h3>
                  <div className="flex gap-2 items-center mt-1">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border shrink-0', typeLabels[ressource.type]?.color)}>
                      {typeLabels[ressource.type]?.label || ressource.type}
                    </span>
                    {ressource.type === 'exercice' && ressource.format_exercice && ressource.status === 'ready' && (
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                        {ressource.format_exercice.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-full border border-gray-800 hover:bg-gray-800/80 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Corps du Drawer */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
              {/* Statut : VIDE */}
              {ressource.status === 'empty' && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6">
                  <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400 animate-pulse">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <div className="max-w-md space-y-2">
                    <h4 className="text-lg font-bold text-white">Cette ressource n'est pas encore rédigée</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      L'IA de l'Atelier Pédagogique peut rédiger un document complet en Markdown adapté au niveau et aux consignes en quelques secondes.
                    </p>
                  </div>

                  {/* Options de format si c'est un exercice */}
                  {ressource.type === 'exercice' && (
                    <div className="w-full max-w-sm bg-gray-900/50 p-4 rounded-xl border border-gray-800 space-y-3 text-left">
                      <label className="text-xs font-semibold text-gray-400 uppercase font-mono">Format de l'exercice :</label>
                      <select
                        value={selectedFormat}
                        onChange={(e) => setSelectedFormat(e.target.value as ExerciceFormat)}
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                      >
                        <option value="libre">Exercices libres (Progressif standard)</option>
                        <option value="texte_a_trous">Texte à trous (Cloze test)</option>
                        <option value="relier_notions">Relier des notions (Tableau de correspondance)</option>
                        <option value="entourer_reponse">QCM / Entourer la bonne réponse</option>
                        <option value="questions_reponses">Questions / Réponses directes</option>
                      </select>
                    </div>
                  )}

                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-6 py-3 rounded-lg shadow-lg shadow-blue-900/30 transition-all hover:scale-[1.02]"
                  >
                    <Sparkles className="h-4 w-4" />
                    Générer la ressource
                  </button>
                </div>
              )}

              {/* Statut : GÉNÉRATION EN COURS */}
              {ressource.status === 'generating' && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-6">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-t-2 border-r-2 border-blue-500 animate-spin" />
                    <Sparkles className="h-6 w-6 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-lg font-bold text-white animate-pulse">Rédaction en cours...</h4>
                    <p className="text-sm text-gray-400 max-w-xs">
                      L'IA structure le contenu et rédige le document en Markdown. Veuillez patienter.
                    </p>
                  </div>
                </div>
              )}

              {/* Statut : ERREUR */}
              {ressource.status === 'error' && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-400">
                    <AlertCircle className="h-8 w-8" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-lg font-bold text-white">Échec de la rédaction</h4>
                    <p className="text-sm text-red-400/80 max-w-sm">
                      {errorMsg || 'Une erreur est survenue lors de la communication avec le LLM.'}
                    </p>
                  </div>
                  <button
                    onClick={handleGenerate}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Réessayer
                  </button>
                </div>
              )}

              {/* Statut : PRÊT */}
              {ressource.status === 'ready' && (
                <div className="space-y-4 h-full flex flex-col">
                  {/* Barre d'outils du visualiseur / éditeur */}
                  <div className="flex gap-2 bg-gray-900/30 p-1.5 rounded-lg border border-gray-800/80 w-fit shrink-0">
                    <button
                      onClick={() => setIsEditing(false)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                        !isEditing ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Aperçu Rendu
                    </button>
                    <button
                      onClick={() => setIsEditing(true)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                        isEditing ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
                      )}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Modifier (Markdown)
                    </button>
                  </div>

                  {/* Zone de contenu principale */}
                  <div className="flex-1 min-h-[300px] bg-gray-950/40 rounded-xl border border-gray-900 p-5 overflow-y-auto scrollbar-thin">
                    {!isEditing ? (
                      // Rendu visuel HTML
                      <div
                        className="prose prose-invert max-w-none font-sans"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(editedContent) }}
                      />
                    ) : (
                      // Éditeur de texte Markdown brut
                      <textarea
                        ref={textareaRef}
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="w-full h-full min-h-[400px] bg-transparent border-0 resize-none font-mono text-sm leading-relaxed text-gray-300 focus:outline-none focus:ring-0"
                        placeholder="Rédigez votre contenu ici en Markdown..."
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer : Actions de sauvegarde et d'export */}
            {ressource.status === 'ready' && (
              <div className="p-4 border-t border-gray-800/80 flex justify-between items-center bg-gray-900/40 shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 hover:bg-gray-800/80 text-gray-300 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    {copySuccess ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copier le texte
                      </>
                    )}
                  </button>
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 hover:bg-gray-800/80 text-gray-300 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimer / PDF
                  </button>
                </div>
                <div>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditedContent(ressource.contenu);
                          setIsEditing(false);
                        }}
                        className="text-gray-400 hover:text-white px-3 py-2 text-xs font-semibold transition-colors"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors shadow-md shadow-blue-900/20"
                      >
                        Enregistrer
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={onClose}
                      className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                    >
                      Fermer
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
