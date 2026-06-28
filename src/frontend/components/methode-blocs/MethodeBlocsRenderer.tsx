'use client'

import { Lightbulb, Sparkles, AlertTriangle, FileText } from 'lucide-react'
import { cn } from '@/shared/utils'
import { type MethodeBloc, type MethodeContenu, isMethodeEtape } from '@/shared/resource-blocks-methode'
import type { EncadreVariante } from '@/shared/resource-blocks'
import { renderInline } from '../rich-text'

interface Props {
  contenu: MethodeContenu
  audience: 'eleve' | 'professeur'
}

const ENCADRE_STYLE: Record<EncadreVariante, { icon: typeof Lightbulb; cls: string; iconCls: string }> = {
  rappel:    { icon: Lightbulb,     cls: 'bg-blue-500/10 border-blue-600/30',     iconCls: 'text-blue-400' },
  astuce:    { icon: Sparkles,      cls: 'bg-purple-500/10 border-purple-600/30', iconCls: 'text-purple-400' },
  attention: { icon: AlertTriangle, cls: 'bg-amber-500/10 border-amber-600/30',   iconCls: 'text-amber-400' },
  exemple:   { icon: FileText,      cls: 'bg-teal-500/10 border-teal-600/30',     iconCls: 'text-teal-400' },
}

export function MethodeBlocsRenderer({ contenu, audience }: Props) {
  const isPro = audience === 'professeur'
  let etapeNum = 0

  return (
    <div className="space-y-4 font-sans">
      <div className="pb-3 border-b border-gray-800">
        <h2 className="text-xl font-extrabold text-white">{contenu.titre}</h2>
        {isPro && <p className="text-xs text-amber-400/80 mt-0.5 italic">Version professeur — avec notes pédagogiques</p>}
      </div>

      {contenu.objectif && (
        <p className="text-sm text-gray-200 bg-blue-500/10 border border-blue-600/30 rounded-lg px-3 py-2">
          <span className="font-semibold text-blue-300">🎯 Objectif : </span>{renderInline(contenu.objectif)}
        </p>
      )}

      {contenu.blocs.map((bloc) => {
        const isEtape = isMethodeEtape(bloc.type)
        if (isEtape) etapeNum++
        return <MethodeBlocView key={bloc.id} bloc={bloc} isPro={isPro} num={isEtape ? etapeNum : undefined} />
      })}

      {isPro && contenu.note_prof_globale && (
        <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span className="font-semibold">📝 Note pédagogique : </span>
          {renderInline(contenu.note_prof_globale)}
        </div>
      )}
    </div>
  )
}

function MethodeBlocView({ bloc, isPro, num }: { bloc: MethodeBloc; isPro: boolean; num?: number }) {
  return (
    <div className="space-y-2">
      <MethodeBlocBody bloc={bloc} num={num} />
      {isPro && bloc.note_prof && (
        <p className="text-xs text-amber-300/80 italic flex items-start gap-1.5">
          <span className="shrink-0">📝</span>
          <span><span className="font-semibold">Note prof :</span> {renderInline(bloc.note_prof)}</span>
        </p>
      )}
    </div>
  )
}

function MethodeBlocBody({ bloc, num }: { bloc: MethodeBloc; num?: number }) {
  switch (bloc.type) {
    case 'titre_section':
      return <h3 className="text-lg font-bold text-blue-300 mt-3 border-b border-gray-800/60 pb-1">{renderInline(bloc.texte)}</h3>

    case 'etape':
      return (
        <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 flex gap-3">
          <span className="shrink-0 h-7 w-7 rounded-full bg-blue-600/20 text-blue-300 text-sm font-bold flex items-center justify-center">
            {num}
          </span>
          <div className="min-w-0">
            {bloc.titre && <p className="text-sm font-semibold text-gray-100">{renderInline(bloc.titre)}</p>}
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line mt-0.5">{renderInline(bloc.texte)}</p>
          </div>
        </div>
      )

    case 'paragraphe':
      return <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{renderInline(bloc.texte)}</p>

    case 'exemple':
      return (
        <p className="text-sm text-teal-200/90 leading-relaxed flex items-start gap-2">
          <span className="text-teal-400 shrink-0 font-semibold">Ex.</span>
          <span className="italic">{renderInline(bloc.texte)}</span>
        </p>
      )

    case 'encadre': {
      const style = ENCADRE_STYLE[bloc.encadre_variante ?? 'astuce']
      const Icon = style.icon
      return (
        <div className={cn('rounded-lg border px-4 py-3 flex gap-3', style.cls)}>
          <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', style.iconCls)} />
          <div className="min-w-0">
            {bloc.encadre_titre && (
              <p className={cn('text-xs font-bold uppercase tracking-wide mb-1', style.iconCls)}>{renderInline(bloc.encadre_titre)}</p>
            )}
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{renderInline(bloc.texte)}</p>
          </div>
        </div>
      )
    }

    case 'liste':
      return (
        <div className="text-sm text-gray-200">
          {bloc.texte && <p className="mb-1.5 leading-relaxed">{renderInline(bloc.texte)}</p>}
          <ul className="space-y-1">
            {(bloc.items ?? []).map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-400 shrink-0 mt-1.5 h-1 w-1 rounded-full bg-blue-400" />
                <span className="leading-relaxed">{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      )

    default:
      return null
  }
}
