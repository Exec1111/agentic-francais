'use client'

import { useCallback } from 'react'
import { ChevronUp, ChevronDown, Trash2, Plus, GripVertical } from 'lucide-react'
import { cn } from '@/shared/utils'
import {
  type BilanBloc,
  type BilanBlocType,
  type BilanContenu,
  createEmptyBilanBloc,
  BILAN_BLOC_LABELS,
} from '@/shared/resource-blocks-bilan'
import type { EncadreVariante } from '@/shared/resource-blocks'

interface Props {
  contenu: BilanContenu
  onChange: (next: BilanContenu) => void
}

const BLOC_TYPES: BilanBlocType[] = ['paragraphe', 'liste', 'checklist', 'encadre', 'titre_section']
const VARIANTES: EncadreVariante[] = ['rappel', 'astuce', 'attention', 'exemple']

const inputCls = 'w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-600/60 transition-colors'
const labelCls = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1'

export function BilanBlocsEditor({ contenu, onChange }: Props) {
  const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? `b-${crypto.randomUUID().slice(0, 8)}` : `b-${Date.now()}`

  const patch = useCallback(
    (changes: Partial<BilanContenu>) => onChange({ ...contenu, ...changes }),
    [contenu, onChange]
  )
  const updateBloc = useCallback(
    (id: string, changes: Partial<BilanBloc>) =>
      patch({ blocs: contenu.blocs.map((b) => (b.id === id ? { ...b, ...changes } : b)) }),
    [contenu.blocs, patch]
  )
  const moveBloc = useCallback(
    (index: number, dir: -1 | 1) => {
      const target = index + dir
      if (target < 0 || target >= contenu.blocs.length) return
      const blocs = [...contenu.blocs]
      ;[blocs[index], blocs[target]] = [blocs[target], blocs[index]]
      patch({ blocs })
    },
    [contenu.blocs, patch]
  )
  const removeBloc = useCallback(
    (id: string) => patch({ blocs: contenu.blocs.filter((b) => b.id !== id) }),
    [contenu.blocs, patch]
  )
  const addBloc = useCallback(
    (type: BilanBlocType) => patch({ blocs: [...contenu.blocs, createEmptyBilanBloc(type, newId())] }),
    [contenu.blocs, patch]
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 space-y-3">
        <div>
          <label className={labelCls}>Titre du bilan</label>
          <input className={inputCls} value={contenu.titre}
            onChange={(e) => patch({ titre: e.target.value })} placeholder="Ex : Bilan — la poésie lyrique" />
        </div>
        <div>
          <label className={labelCls}>Introduction (optionnel)</label>
          <input className={inputCls} value={contenu.introduction ?? ''}
            onChange={(e) => patch({ introduction: e.target.value || null })} placeholder="Chapeau introductif court" />
        </div>
        <div>
          <label className={labelCls}>Note pédagogique globale (prof)</label>
          <textarea className={cn(inputCls, 'resize-y min-h-[40px]')} value={contenu.note_prof_globale ?? ''}
            onChange={(e) => patch({ note_prof_globale: e.target.value || null })}
            placeholder="Pistes de remédiation globales (masqué pour l'élève)" />
        </div>
      </div>

      {contenu.blocs.map((bloc, index) => (
        <BlocCard
          key={bloc.id}
          bloc={bloc}
          index={index}
          total={contenu.blocs.length}
          onUpdate={(changes) => updateBloc(bloc.id, changes)}
          onMove={(dir) => moveBloc(index, dir)}
          onRemove={() => removeBloc(bloc.id)}
        />
      ))}

      <div className="rounded-xl border border-dashed border-gray-700 p-3">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter un bloc
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BLOC_TYPES.map((type) => (
            <button key={type} onClick={() => addBloc(type)}
              className="px-2.5 py-1 rounded-lg border border-gray-700 text-xs text-gray-400 hover:border-blue-600/50 hover:text-blue-300 transition-colors">
              {BILAN_BLOC_LABELS[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function BlocCard({
  bloc, index, total, onUpdate, onMove, onRemove,
}: {
  bloc: BilanBloc
  index: number
  total: number
  onUpdate: (changes: Partial<BilanBloc>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/60 bg-gray-900/60">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
          <GripVertical className="h-3.5 w-3.5 text-gray-600" />
          {BILAN_BLOC_LABELS[bloc.type]}
        </span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => onMove(-1)} disabled={index === 0}
            className="p-1 text-gray-500 hover:text-gray-200 disabled:opacity-25 transition-colors" title="Monter">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1}
            className="p-1 text-gray-500 hover:text-gray-200 disabled:opacity-25 transition-colors" title="Descendre">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button onClick={onRemove}
            className="p-1 text-gray-500 hover:text-red-400 transition-colors" title="Supprimer">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="p-3 space-y-3">
        <BlocForm bloc={bloc} onUpdate={onUpdate} />
        <div>
          <label className={labelCls}>Note pédagogique (prof, optionnel)</label>
          <input className={inputCls} value={bloc.note_prof ?? ''}
            onChange={(e) => onUpdate({ note_prof: e.target.value || null })}
            placeholder="Conseil, point de vigilance (masqué pour l'élève)" />
        </div>
      </div>
    </div>
  )
}

function BlocForm({ bloc, onUpdate }: { bloc: BilanBloc; onUpdate: (c: Partial<BilanBloc>) => void }) {
  switch (bloc.type) {
    case 'titre_section':
      return (
        <div>
          <label className={labelCls}>Titre de section</label>
          <input className={inputCls} value={bloc.texte ?? ''}
            onChange={(e) => onUpdate({ texte: e.target.value })} placeholder="Ex : Ce qu'il faut retenir" />
        </div>
      )

    case 'paragraphe':
      return (
        <div>
          <label className={labelCls}>Synthèse</label>
          <textarea className={cn(inputCls, 'resize-y min-h-[70px]')} value={bloc.texte ?? ''}
            onChange={(e) => onUpdate({ texte: e.target.value })} placeholder="Ce qui a été appris" />
        </div>
      )

    case 'encadre':
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Style</label>
              <select className={inputCls} value={bloc.encadre_variante ?? 'rappel'}
                onChange={(e) => onUpdate({ encadre_variante: e.target.value as EncadreVariante })}>
                {VARIANTES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Titre</label>
              <input className={inputCls} value={bloc.encadre_titre ?? ''}
                onChange={(e) => onUpdate({ encadre_titre: e.target.value })} placeholder="Ex : À retenir" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Contenu</label>
            <textarea className={cn(inputCls, 'resize-y min-h-[60px]')} value={bloc.texte ?? ''}
              onChange={(e) => onUpdate({ texte: e.target.value })} placeholder="Texte du cadre" />
          </div>
        </>
      )

    case 'liste':
      return <ListeForm bloc={bloc} onUpdate={onUpdate} />

    case 'checklist':
      return <ChecklistForm bloc={bloc} onUpdate={onUpdate} />

    default:
      return null
  }
}

function ListeForm({ bloc, onUpdate }: { bloc: BilanBloc; onUpdate: (c: Partial<BilanBloc>) => void }) {
  const items = bloc.items ?? []
  const setItem = (i: number, val: string) => onUpdate({ items: items.map((it, j) => (j === i ? val : it)) })
  const addItem = () => onUpdate({ items: [...items, ''] })
  const removeItem = (i: number) => onUpdate({ items: items.filter((_, j) => j !== i) })

  return (
    <>
      <div>
        <label className={labelCls}>Introduction (optionnel)</label>
        <input className={inputCls} value={bloc.texte ?? ''}
          onChange={(e) => onUpdate({ texte: e.target.value || null })} placeholder="Phrase d'introduction" />
      </div>
      <div>
        <label className={labelCls}>Points clés</label>
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-gray-600 shrink-0">•</span>
              <input className={inputCls} value={it} onChange={(e) => setItem(i, e.target.value)}
                placeholder={`Point ${i + 1}`} />
              <button onClick={() => removeItem(i)} disabled={items.length <= 1}
                className="p-1 text-gray-600 hover:text-red-400 disabled:opacity-25 shrink-0" title="Retirer">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addItem} className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
          <Plus className="h-3 w-3" /> Ajouter un point
        </button>
      </div>
    </>
  )
}

function ChecklistForm({ bloc, onUpdate }: { bloc: BilanBloc; onUpdate: (c: Partial<BilanBloc>) => void }) {
  const items = bloc.checklist_items ?? []
  const remediation = bloc.checklist_remediation ?? []

  const setItem = (i: number, val: string) =>
    onUpdate({ checklist_items: items.map((it, j) => (j === i ? val : it)) })
  const setRem = (i: number, val: string) =>
    onUpdate({ checklist_remediation: remediation.map((r, j) => (j === i ? val : r)) })
  const addItem = () =>
    onUpdate({ checklist_items: [...items, ''], checklist_remediation: [...remediation, ''] })
  const removeItem = (i: number) =>
    onUpdate({
      checklist_items: items.filter((_, j) => j !== i),
      checklist_remediation: remediation.filter((_, j) => j !== i),
    })

  return (
    <>
      <div>
        <label className={labelCls}>Consigne (optionnel)</label>
        <input className={inputCls} value={bloc.texte ?? ''}
          onChange={(e) => onUpdate({ texte: e.target.value || null })} placeholder="Ex : Coche ce que tu sais faire :" />
      </div>
      <div>
        <label className={labelCls}>Énoncés « Je sais… » + remédiation (prof)</label>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-gray-600 shrink-0 mt-2">☐</span>
              <div className="flex-1 space-y-1">
                <input className={inputCls} value={it} onChange={(e) => setItem(i, e.target.value)}
                  placeholder={`Je sais… (${i + 1})`} />
                <input className={cn(inputCls, 'text-xs')} value={remediation[i] ?? ''}
                  onChange={(e) => setRem(i, e.target.value)}
                  placeholder="🔧 Remédiation si non maîtrisé (prof)" />
              </div>
              <button onClick={() => removeItem(i)} disabled={items.length <= 1}
                className="p-1 text-gray-600 hover:text-red-400 disabled:opacity-25 shrink-0 mt-2" title="Retirer">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addItem} className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
          <Plus className="h-3 w-3" /> Ajouter un énoncé
        </button>
      </div>
    </>
  )
}
