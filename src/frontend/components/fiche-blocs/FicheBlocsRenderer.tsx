'use client'

import { Lightbulb, Sparkles, AlertTriangle, FileText, HelpCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/shared/utils'
import type { Bloc, FicheQuestionsContenu, EncadreVariante } from '@/shared/resource-blocks'

/**
 * Rendu visuel (lecture seule) d'une fiche de questions structurée en blocs.
 *
 * Affiche chaque bloc avec un composant dédié, adapté à un public collège :
 * couleurs douces, numérotation automatique, badges de difficulté.
 *
 * `audience` :
 *   - 'eleve'      → trous vides, pas de corrigé
 *   - 'professeur' → réponses mises en évidence, explications visibles
 */

interface Props {
  contenu: FicheQuestionsContenu
  audience: 'eleve' | 'professeur'
}

const DIFFICULTE_STYLE: Record<string, { label: string; cls: string }> = {
  facile:    { label: 'Facile',    cls: 'bg-green-500/15 text-green-400 border-green-600/30' },
  moyen:     { label: 'Moyen',     cls: 'bg-amber-500/15 text-amber-400 border-amber-600/30' },
  difficile: { label: 'Difficile', cls: 'bg-red-500/15 text-red-400 border-red-600/30' },
}

const ENCADRE_STYLE: Record<EncadreVariante, { icon: typeof Lightbulb; cls: string; iconCls: string }> = {
  rappel:    { icon: Lightbulb,     cls: 'bg-blue-500/10 border-blue-600/30',   iconCls: 'text-blue-400' },
  astuce:    { icon: Sparkles,      cls: 'bg-purple-500/10 border-purple-600/30', iconCls: 'text-purple-400' },
  attention: { icon: AlertTriangle, cls: 'bg-amber-500/10 border-amber-600/30', iconCls: 'text-amber-400' },
  exemple:   { icon: FileText,      cls: 'bg-teal-500/10 border-teal-600/30',   iconCls: 'text-teal-400' },
}

export function FicheBlocsRenderer({ contenu, audience }: Props) {
  const isPro = audience === 'professeur'
  let qNum = 0

  return (
    <div className="space-y-4 font-sans">
      {/* En-tête */}
      <div className="pb-3 border-b border-gray-800">
        <h2 className="text-xl font-extrabold text-white">{contenu.objectif}</h2>
        {isPro && <p className="text-xs text-amber-400/80 mt-0.5 italic">Version professeur — avec corrigé</p>}
        {contenu.duree_estimee != null && (
          <p className="text-xs text-gray-500 mt-1">Durée estimée : {contenu.duree_estimee} min</p>
        )}
      </div>

      {contenu.introduction && (
        <p className="text-sm text-gray-300 italic leading-relaxed bg-gray-900/40 border-l-2 border-gray-700 pl-3 py-2">
          {contenu.introduction}
        </p>
      )}

      {/* Blocs */}
      {contenu.blocs.map((bloc) => {
        const isExercise = ['qcm', 'texte_a_trous', 'question_ouverte'].includes(bloc.type)
        if (isExercise) qNum++
        return <BlocView key={bloc.id} bloc={bloc} isPro={isPro} num={isExercise ? qNum : undefined} />
      })}
    </div>
  )
}

// ── Bloc individuel ────────────────────────────────────────────────────────────

function BlocView({ bloc, isPro, num }: { bloc: Bloc; isPro: boolean; num?: number }) {
  switch (bloc.type) {
    case 'consigne':
      return (
        <p className="text-sm font-semibold text-gray-200 flex items-start gap-2">
          <span className="text-blue-400 shrink-0">▸</span>
          {bloc.texte}
        </p>
      )

    case 'encadre': {
      const style = ENCADRE_STYLE[bloc.encadre_variante ?? 'rappel']
      const Icon = style.icon
      return (
        <div className={cn('rounded-lg border px-4 py-3 flex gap-3', style.cls)}>
          <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', style.iconCls)} />
          <div className="min-w-0">
            {bloc.encadre_titre && (
              <p className={cn('text-xs font-bold uppercase tracking-wide mb-1', style.iconCls)}>
                {bloc.encadre_titre}
              </p>
            )}
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{bloc.texte}</p>
          </div>
        </div>
      )
    }

    case 'qcm':
      return <QcmView bloc={bloc} isPro={isPro} num={num} />

    case 'texte_a_trous':
      return <TexteATrousView bloc={bloc} isPro={isPro} num={num} />

    case 'question_ouverte':
      return <QuestionOuverteView bloc={bloc} isPro={isPro} num={num} />

    default:
      return null
  }
}

// ── En-tête d'exercice (numéro + difficulté) ────────────────────────────────────

function ExerciseHeader({ num, bloc, children }: { num?: number; bloc: Bloc; children: React.ReactNode }) {
  const diff = bloc.difficulte ? DIFFICULTE_STYLE[bloc.difficulte] : null
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-gray-100 flex items-start gap-2 min-w-0">
          {num != null && (
            <span className="shrink-0 h-6 w-6 rounded-full bg-blue-600/20 text-blue-300 text-xs font-bold flex items-center justify-center">
              {num}
            </span>
          )}
          <span className="pt-0.5">{children}</span>
        </p>
        {diff && (
          <span className={cn('shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border', diff.cls)}>
            {diff.label}
          </span>
        )}
      </div>
    </div>
  )
}

function AideHint({ aide }: { aide: string | null }) {
  if (!aide) return null
  return (
    <span className="flex items-start gap-1.5 text-xs text-gray-500 mt-2 italic">
      <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gray-600" />
      Besoin d&apos;aide ? {aide}
    </span>
  )
}

// ── QCM ──────────────────────────────────────────────────────────────────────────

function QcmView({ bloc, isPro, num }: { bloc: Bloc; isPro: boolean; num?: number }) {
  const props = bloc.propositions ?? []
  const good = new Set(bloc.bonnes_reponses ?? [])
  return (
    <ExerciseHeader num={num} bloc={bloc}>
      {bloc.question}
      <span className="block mt-3 space-y-1.5 font-normal">
        {props.map((p, i) => {
          const letter = String.fromCharCode(65 + i)
          const isGood = isPro && good.has(i)
          return (
            <span
              key={i}
              className={cn(
                'flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border',
                isGood
                  ? 'bg-green-500/15 border-green-600/40 text-green-200'
                  : 'bg-gray-800/40 border-gray-700/50 text-gray-300',
              )}
            >
              <span className={cn('h-5 w-5 rounded-full border flex items-center justify-center text-xs font-bold shrink-0',
                isGood ? 'border-green-500 text-green-300' : 'border-gray-600 text-gray-400')}>
                {letter}
              </span>
              {p}
              {isGood && <CheckCircle2 className="h-4 w-4 text-green-400 ml-auto shrink-0" />}
            </span>
          )
        })}
      </span>
      {isPro && bloc.explication && (
        <span className="block mt-2 text-xs text-amber-300/80 italic font-normal">📌 {bloc.explication}</span>
      )}
      <AideHint aide={!isPro ? bloc.aide : null} />
    </ExerciseHeader>
  )
}

// ── Texte à trous ──────────────────────────────────────────────────────────────

function TexteATrousView({ bloc, isPro, num }: { bloc: Bloc; isPro: boolean; num?: number }) {
  const texte = bloc.texte_lacunaire ?? ''
  const reponses = bloc.reponses_trous ?? []

  // Découpe le texte sur les marqueurs [1], [2]… pour insérer les trous
  const parts = texte.split(/(\[\d+\])/g)

  return (
    <ExerciseHeader num={num} bloc={bloc}>
      Complète le texte :
      {bloc.banque_mots && bloc.banque_mots.length > 0 && (
        <span className="block mt-2 flex flex-wrap gap-1.5 font-normal">
          {bloc.banque_mots.map((m, i) => (
            <span key={i} className="text-xs bg-purple-500/15 text-purple-300 border border-purple-600/30 rounded-full px-2.5 py-0.5">
              {m}
            </span>
          ))}
        </span>
      )}
      <span className="block mt-3 text-sm text-gray-300 leading-loose font-normal">
        {parts.map((part, i) => {
          const m = part.match(/\[(\d+)\]/)
          if (m) {
            const idx = parseInt(m[1], 10) - 1
            const answer = reponses[idx]
            return (
              <span
                key={i}
                className={cn(
                  'inline-block min-w-[80px] mx-0.5 px-2 text-center border-b-2 border-dashed',
                  isPro && answer
                    ? 'border-green-500 text-green-300 font-semibold'
                    : 'border-gray-600 text-transparent',
                )}
              >
                {isPro && answer ? answer : '\u00A0'}
              </span>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </span>
      <AideHint aide={!isPro ? bloc.aide : null} />
    </ExerciseHeader>
  )
}

// ── Question ouverte ──────────────────────────────────────────────────────────

function QuestionOuverteView({ bloc, isPro, num }: { bloc: Bloc; isPro: boolean; num?: number }) {
  const n = bloc.lignes_reponse ?? 4
  return (
    <ExerciseHeader num={num} bloc={bloc}>
      {bloc.enonce}
      {isPro && bloc.reponse_attendue ? (
        <span className="block mt-2 text-sm bg-green-500/10 border border-green-600/30 rounded-lg px-3 py-2 text-green-200 font-normal">
          <span className="font-semibold">Réponse attendue : </span>
          {bloc.reponse_attendue}
        </span>
      ) : (
        <span className="block mt-3 space-y-2 font-normal">
          {Array.from({ length: n }).map((_, i) => (
            <span key={i} className="block border-b border-dashed border-gray-700 h-5" />
          ))}
        </span>
      )}
      <AideHint aide={!isPro ? bloc.aide : null} />
    </ExerciseHeader>
  )
}
