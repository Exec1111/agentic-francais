'use client'

import { useCallback } from 'react'
import { ChevronUp, ChevronDown, Trash2, Plus, GripVertical } from 'lucide-react'
import { cn } from '@/shared/utils'
import {
  type Bloc,
  type BlocType,
  type FicheQuestionsContenu,
  type Difficulte,
  type EncadreVariante,
  createEmptyBloc,
  BLOC_LABELS,
} from '@/shared/resource-blocks'

/**
 * Éditeur de fiche de questions par blocs.
 *
 * Contrôlé : reçoit `contenu` et notifie chaque modification via `onChange`.
 * Le parent (ResourcePanel) détient l'état brouillon et gère la sauvegarde.
 *
 * Chaque type de bloc dispose d'un mini-formulaire dédié. Pour ajouter un type,
 * voir doc/fiche-questions-blocs.md (sections « Renderer » et « Éditeur »).
 */

interface Props {
  contenu: FicheQuestionsContenu
  onChange: (next: FicheQuestionsContenu) => void
}

const BLOC_TYPES: BlocType[] = ['consigne', 'encadre', 'qcm', 'texte_a_trous', 'question_ouverte']
const DIFFICULTES: Difficulte[] = ['facile', 'moyen', 'difficile']
const VARIANTES: EncadreVariante[] = ['rappel', 'astuce', 'attention', 'exemple']

const inputCls = 'w-full bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-600/60 transition-colors'
const labelCls = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1'

export function FicheBlocsEditor({ contenu, onChange }: Props) {
  const newId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? `b-${crypto.randomUUID().slice(0, 8)}` : `b-${Date.now()}`

  const patch = useCallback(
    (changes: Partial<FicheQuestionsContenu>) => onChange({ ...contenu, ...changes }),
    [contenu, onChange]
  )

  const updateBloc = useCallback(
    (id: string, changes: Partial<Bloc>) =>
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
    (type: BlocType) => patch({ blocs: [...contenu.blocs, createEmptyBloc(type, newId())] }),
    [contenu.blocs, patch]
  )

  return (
    <div className="space-y-4">
      {/* En-tête éditable */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 space-y-3">
        <div>
          <label className={labelCls}>Objectif pédagogique</label>
          <input
            className={inputCls}
            value={contenu.objectif}
            onChange={(e) => patch({ objectif: e.target.value })}
            placeholder="Ex : Identifier les figures de style"
          />
        </div>
        <div className="grid grid-cols-[1fr,auto] gap-3">
          <div>
            <label className={labelCls}>Introduction (optionnel)</label>
            <input
              className={inputCls}
              value={contenu.introduction ?? ''}
              onChange={(e) => patch({ introduction: e.target.value || null })}
              placeholder="Mise en contexte courte"
            />
          </div>
          <div>
            <label className={labelCls}>Durée (min)</label>
            <input
              type="number"
              className={cn(inputCls, 'w-20')}
              value={contenu.duree_estimee ?? ''}
              onChange={(e) => patch({ duree_estimee: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>
      </div>

      {/* Blocs */}
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

      {/* Ajouter un bloc */}
      <div className="rounded-xl border border-dashed border-gray-700 p-3">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter un bloc
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BLOC_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => addBloc(type)}
              className="px-2.5 py-1 rounded-lg border border-gray-700 text-xs text-gray-400 hover:border-blue-600/50 hover:text-blue-300 transition-colors"
            >
              {BLOC_LABELS[type]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Carte d'un bloc (toolbar + formulaire) ──────────────────────────────────────

function BlocCard({
  bloc, index, total, onUpdate, onMove, onRemove,
}: {
  bloc: Bloc
  index: number
  total: number
  onUpdate: (changes: Partial<Bloc>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/60 bg-gray-900/60">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
          <GripVertical className="h-3.5 w-3.5 text-gray-600" />
          {BLOC_LABELS[bloc.type]}
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

      {/* Formulaire spécifique au type */}
      <div className="p-3 space-y-3">
        <BlocForm bloc={bloc} onUpdate={onUpdate} />
      </div>
    </div>
  )
}

// ── Aiguillage vers le bon formulaire ───────────────────────────────────────────

function BlocForm({ bloc, onUpdate }: { bloc: Bloc; onUpdate: (c: Partial<Bloc>) => void }) {
  switch (bloc.type) {
    case 'consigne':
      return (
        <div>
          <label className={labelCls}>Consigne</label>
          <textarea className={cn(inputCls, 'resize-y min-h-[60px]')} value={bloc.texte ?? ''}
            onChange={(e) => onUpdate({ texte: e.target.value })}
            placeholder="Instruction adressée à l'élève" />
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
                onChange={(e) => onUpdate({ encadre_titre: e.target.value })} placeholder="Ex : Rappel" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Contenu</label>
            <textarea className={cn(inputCls, 'resize-y min-h-[60px]')} value={bloc.texte ?? ''}
              onChange={(e) => onUpdate({ texte: e.target.value })} placeholder="Texte du cadre" />
          </div>
        </>
      )

    case 'qcm':
      return <QcmForm bloc={bloc} onUpdate={onUpdate} />

    case 'texte_a_trous':
      return <TexteATrousForm bloc={bloc} onUpdate={onUpdate} />

    case 'question_ouverte':
      return <QuestionOuverteForm bloc={bloc} onUpdate={onUpdate} />

    default:
      return null
  }
}

// ── Champs communs (difficulté + aide) ──────────────────────────────────────────

function DifficulteAide({ bloc, onUpdate }: { bloc: Bloc; onUpdate: (c: Partial<Bloc>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>Difficulté</label>
        <select className={inputCls} value={bloc.difficulte ?? ''}
          onChange={(e) => onUpdate({ difficulte: (e.target.value || null) as Difficulte | null })}>
          <option value="">—</option>
          {DIFFICULTES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Indice (optionnel)</label>
        <input className={inputCls} value={bloc.aide ?? ''}
          onChange={(e) => onUpdate({ aide: e.target.value || null })} placeholder="Aide affichée à l'élève" />
      </div>
    </div>
  )
}

// ── QCM ──────────────────────────────────────────────────────────────────────────

function QcmForm({ bloc, onUpdate }: { bloc: Bloc; onUpdate: (c: Partial<Bloc>) => void }) {
  const props = bloc.propositions ?? []
  const good = new Set(bloc.bonnes_reponses ?? [])

  const setProp = (i: number, val: string) =>
    onUpdate({ propositions: props.map((p, j) => (j === i ? val : p)) })

  const addProp = () => onUpdate({ propositions: [...props, ''] })

  const removeProp = (i: number) => {
    const next = props.filter((_, j) => j !== i)
    const goodNext = Array.from(good)
      .filter((g) => g !== i)
      .map((g) => (g > i ? g - 1 : g))
    onUpdate({ propositions: next, bonnes_reponses: goodNext })
  }

  const toggleGood = (i: number) => {
    const next = new Set(good)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onUpdate({ bonnes_reponses: Array.from(next).sort((a, b) => a - b) })
  }

  return (
    <>
      <div>
        <label className={labelCls}>Question</label>
        <textarea className={cn(inputCls, 'resize-y min-h-[50px]')} value={bloc.question ?? ''}
          onChange={(e) => onUpdate({ question: e.target.value })} placeholder="Énoncé de la question" />
      </div>
      <div>
        <label className={labelCls}>Propositions (cochez la/les bonne(s) réponse(s))</label>
        <div className="space-y-1.5">
          {props.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <button onClick={() => toggleGood(i)} title="Bonne réponse"
                className={cn('h-6 w-6 shrink-0 rounded-md border flex items-center justify-center text-xs font-bold transition-colors',
                  good.has(i) ? 'bg-green-600/30 border-green-500 text-green-300' : 'border-gray-600 text-gray-500 hover:border-gray-400')}>
                {String.fromCharCode(65 + i)}
              </button>
              <input className={inputCls} value={p} onChange={(e) => setProp(i, e.target.value)}
                placeholder={`Proposition ${String.fromCharCode(65 + i)}`} />
              <button onClick={() => removeProp(i)} disabled={props.length <= 2}
                className="p-1 text-gray-600 hover:text-red-400 disabled:opacity-25 shrink-0" title="Retirer">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        {props.length < 5 && (
          <button onClick={addProp} className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
            <Plus className="h-3 w-3" /> Ajouter une proposition
          </button>
        )}
      </div>
      <div>
        <label className={labelCls}>Explication (prof)</label>
        <textarea className={cn(inputCls, 'resize-y min-h-[40px]')} value={bloc.explication ?? ''}
          onChange={(e) => onUpdate({ explication: e.target.value || null })}
          placeholder="Pourquoi cette réponse est correcte" />
      </div>
      <DifficulteAide bloc={bloc} onUpdate={onUpdate} />
    </>
  )
}

// ── Texte à trous ──────────────────────────────────────────────────────────────

function TexteATrousForm({ bloc, onUpdate }: { bloc: Bloc; onUpdate: (c: Partial<Bloc>) => void }) {
  const reponses = bloc.reponses_trous ?? []
  const setRep = (i: number, val: string) =>
    onUpdate({ reponses_trous: reponses.map((r, j) => (j === i ? val : r)) })
  const addRep = () => onUpdate({ reponses_trous: [...reponses, ''] })
  const removeRep = (i: number) => onUpdate({ reponses_trous: reponses.filter((_, j) => j !== i) })

  return (
    <>
      <div>
        <label className={labelCls}>Texte avec trous</label>
        <textarea className={cn(inputCls, 'resize-y min-h-[70px] font-mono text-xs')} value={bloc.texte_lacunaire ?? ''}
          onChange={(e) => onUpdate({ texte_lacunaire: e.target.value })}
          placeholder="Notez les trous [1], [2], [3]… Ex : Le chat [1] sur le [2]." />
        <p className="text-[10px] text-gray-600 mt-1">Utilisez [1], [2]… pour marquer les emplacements à compléter.</p>
      </div>
      <div>
        <label className={labelCls}>Réponses (dans l&apos;ordre des numéros — prof)</label>
        <div className="space-y-1.5">
          {reponses.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-6 w-6 shrink-0 rounded-md bg-gray-800 text-gray-400 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <input className={inputCls} value={r} onChange={(e) => setRep(i, e.target.value)}
                placeholder={`Réponse au trou [${i + 1}]`} />
              <button onClick={() => removeRep(i)} className="p-1 text-gray-600 hover:text-red-400 shrink-0" title="Retirer">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addRep} className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
          <Plus className="h-3 w-3" /> Ajouter une réponse
        </button>
      </div>
      <div>
        <label className={labelCls}>Boîte à mots (optionnel, séparés par des virgules)</label>
        <input className={inputCls}
          value={(bloc.banque_mots ?? []).join(', ')}
          onChange={(e) => {
            const mots = e.target.value.split(',').map((m) => m.trim()).filter(Boolean)
            onUpdate({ banque_mots: mots.length > 0 ? mots : null })
          }}
          placeholder="saute, table, dort" />
      </div>
      <DifficulteAide bloc={bloc} onUpdate={onUpdate} />
    </>
  )
}

// ── Question ouverte ──────────────────────────────────────────────────────────

function QuestionOuverteForm({ bloc, onUpdate }: { bloc: Bloc; onUpdate: (c: Partial<Bloc>) => void }) {
  return (
    <>
      <div>
        <label className={labelCls}>Question</label>
        <textarea className={cn(inputCls, 'resize-y min-h-[50px]')} value={bloc.enonce ?? ''}
          onChange={(e) => onUpdate({ enonce: e.target.value })} placeholder="La question posée à l'élève" />
      </div>
      <div className="grid grid-cols-[auto,1fr] gap-3 items-start">
        <div>
          <label className={labelCls}>Lignes</label>
          <input type="number" min={1} max={12} className={cn(inputCls, 'w-20')}
            value={bloc.lignes_reponse ?? 4}
            onChange={(e) => onUpdate({ lignes_reponse: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Réponse attendue (prof)</label>
          <textarea className={cn(inputCls, 'resize-y min-h-[40px]')} value={bloc.reponse_attendue ?? ''}
            onChange={(e) => onUpdate({ reponse_attendue: e.target.value || null })}
            placeholder="Éléments de réponse attendus" />
        </div>
      </div>
      <DifficulteAide bloc={bloc} onUpdate={onUpdate} />
    </>
  )
}
