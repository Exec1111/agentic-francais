'use client'

import { Lightbulb, Sparkles, AlertTriangle, FileText, Square } from 'lucide-react'
import { cn } from '@/shared/utils'
import type { BilanBloc, BilanContenu } from '@/shared/resource-blocks-bilan'
import type { EncadreVariante } from '@/shared/resource-blocks'

interface Props {
  contenu: BilanContenu
  audience: 'eleve' | 'professeur'
}

const ENCADRE_STYLE: Record<EncadreVariante, { icon: typeof Lightbulb; cls: string; iconCls: string }> = {
  rappel:    { icon: Lightbulb,     cls: 'bg-blue-500/10 border-blue-600/30',     iconCls: 'text-blue-400' },
  astuce:    { icon: Sparkles,      cls: 'bg-purple-500/10 border-purple-600/30', iconCls: 'text-purple-400' },
  attention: { icon: AlertTriangle, cls: 'bg-amber-500/10 border-amber-600/30',   iconCls: 'text-amber-400' },
  exemple:   { icon: FileText,      cls: 'bg-teal-500/10 border-teal-600/30',     iconCls: 'text-teal-400' },
}

export function BilanBlocsRenderer({ contenu, audience }: Props) {
  const isPro = audience === 'professeur'

  return (
    <div className="space-y-4 font-sans">
      <div className="pb-3 border-b border-gray-800">
        <h2 className="text-xl font-extrabold text-white">{contenu.titre}</h2>
        {isPro && <p className="text-xs text-amber-400/80 mt-0.5 italic">Version professeur — avec remédiation</p>}
      </div>

      {contenu.introduction && (
        <p className="text-sm text-gray-300 italic leading-relaxed bg-gray-900/40 border-l-2 border-gray-700 pl-3 py-2">
          {contenu.introduction}
        </p>
      )}

      {contenu.blocs.map((bloc) => (
        <BilanBlocView key={bloc.id} bloc={bloc} isPro={isPro} />
      ))}

      {isPro && contenu.note_prof_globale && (
        <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span className="font-semibold">📝 Note pédagogique : </span>
          {contenu.note_prof_globale}
        </div>
      )}
    </div>
  )
}

function BilanBlocView({ bloc, isPro }: { bloc: BilanBloc; isPro: boolean }) {
  return (
    <div className="space-y-2">
      <BilanBlocBody bloc={bloc} isPro={isPro} />
      {isPro && bloc.note_prof && (
        <p className="text-xs text-amber-300/80 italic flex items-start gap-1.5">
          <span className="shrink-0">📝</span>
          <span><span className="font-semibold">Note prof :</span> {bloc.note_prof}</span>
        </p>
      )}
    </div>
  )
}

function BilanBlocBody({ bloc, isPro }: { bloc: BilanBloc; isPro: boolean }) {
  switch (bloc.type) {
    case 'titre_section':
      return <h3 className="text-lg font-bold text-blue-300 mt-3 border-b border-gray-800/60 pb-1">{bloc.texte}</h3>

    case 'paragraphe':
      return <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{bloc.texte}</p>

    case 'encadre': {
      const style = ENCADRE_STYLE[bloc.encadre_variante ?? 'rappel']
      const Icon = style.icon
      return (
        <div className={cn('rounded-lg border px-4 py-3 flex gap-3', style.cls)}>
          <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', style.iconCls)} />
          <div className="min-w-0">
            {bloc.encadre_titre && (
              <p className={cn('text-xs font-bold uppercase tracking-wide mb-1', style.iconCls)}>{bloc.encadre_titre}</p>
            )}
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{bloc.texte}</p>
          </div>
        </div>
      )
    }

    case 'liste':
      return (
        <div className="text-sm text-gray-200">
          {bloc.texte && <p className="mb-1.5 leading-relaxed">{bloc.texte}</p>}
          <ul className="space-y-1">
            {(bloc.items ?? []).map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-400 shrink-0 mt-1.5 h-1 w-1 rounded-full bg-blue-400" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )

    case 'checklist': {
      const statements = bloc.checklist_items ?? []
      const remediation = bloc.checklist_remediation ?? []
      return (
        <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4">
          {bloc.texte && <p className="text-sm font-semibold text-gray-100 mb-2">{bloc.texte}</p>}
          <ul className="space-y-2">
            {statements.map((s, i) => (
              <li key={i} className="text-sm text-gray-200">
                <span className="flex items-start gap-2">
                  <Square className="h-4 w-4 shrink-0 mt-0.5 text-gray-500" />
                  <span className="leading-relaxed">{s}</span>
                </span>
                {isPro && remediation[i] && (
                  <span className="block ml-6 mt-0.5 text-xs text-amber-300/80 italic">🔧 {remediation[i]}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )
    }

    default:
      return null
  }
}
