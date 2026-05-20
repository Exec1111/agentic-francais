import { useReducer, useCallback, useMemo } from 'react'
import type { Sequence, Seance, Activite } from '@/shared/schemas'

// === Types ===

export type SequencePath =
  | { level: 'sequence'; field: keyof Pick<Sequence, 'titre' | 'niveau' | 'theme' | 'problematique' | 'evaluation_finale'> }
  | { level: 'sequence'; field: 'objectifs' | 'competences' }
  | { level: 'seance'; seanceIndex: number; field: keyof Pick<Seance, 'titre' | 'duree'> }
  | { level: 'seance'; seanceIndex: number; field: 'objectifs' }
  | { level: 'activite'; seanceIndex: number; activiteIndex: number; field: keyof Pick<Activite, 'titre' | 'type' | 'duree' | 'consigne'> }
  | { level: 'activite'; seanceIndex: number; activiteIndex: number; field: 'supports' }

type EditorAction =
  | { type: 'SET_SEQUENCE'; sequence: Sequence }
  | { type: 'UPDATE_FIELD'; path: SequencePath; value: any }
  | { type: 'ADD_SEANCE'; seance: Seance }
  | { type: 'REMOVE_SEANCE'; seanceIndex: number }
  | { type: 'MOVE_SEANCE'; from: number; to: number }
  | { type: 'ADD_ACTIVITE'; seanceIndex: number; activite: Activite }
  | { type: 'REMOVE_ACTIVITE'; seanceIndex: number; activiteIndex: number }
  | { type: 'MOVE_ACTIVITE'; seanceIndex: number; from: number; to: number }
  | { type: 'REPLACE_SEANCE'; seanceIndex: number; seance: Seance }
  | { type: 'REPLACE_ACTIVITE'; seanceIndex: number; activiteIndex: number; activite: Activite }
  | { type: 'ADD_LIST_ITEM'; path: SequencePath; value: string }
  | { type: 'REMOVE_LIST_ITEM'; path: SequencePath; itemIndex: number }
  | { type: 'UPDATE_LIST_ITEM'; path: SequencePath; itemIndex: number; value: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }

interface EditorState {
  current: Sequence | null
  past: Sequence[]
  future: Sequence[]
  isDirty: boolean
}

// === Helpers ===

function cloneSequence(seq: Sequence): Sequence {
  return JSON.parse(JSON.stringify(seq))
}

function updateSeances(seq: Sequence, fn: (seances: Seance[]) => Seance[]): Sequence {
  return { ...seq, seances: fn([...seq.seances]) }
}

function updateActivites(seance: Seance, fn: (acts: Activite[]) => Activite[]): Seance {
  return { ...seance, activites: fn([...seance.activites]) }
}

function applyFieldUpdate(seq: Sequence, path: SequencePath, value: any): Sequence {
  const clone = cloneSequence(seq)

  if (path.level === 'sequence') {
    ;(clone as any)[path.field] = value
    return clone
  }

  if (path.level === 'seance') {
    clone.seances = clone.seances.map((s, i) =>
      i === path.seanceIndex ? { ...s, [path.field]: value } : s
    )
    return clone
  }

  if (path.level === 'activite') {
    clone.seances = clone.seances.map((s, si) => {
      if (si !== path.seanceIndex) return s
      return {
        ...s,
        activites: s.activites.map((a, ai) =>
          ai === path.activiteIndex ? { ...a, [path.field]: value } : a
        ),
      }
    })
    return clone
  }

  return clone
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr]
  const [item] = result.splice(from, 1)
  result.splice(to, 0, item)
  return result
}

// === Reducer ===

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { current, past, future } = state

  // Undo / Redo ne touchent pas au snapshot
  if (action.type === 'UNDO') {
    if (past.length === 0 || !current) return state
    const prev = past[past.length - 1]
    return {
      current: prev,
      past: past.slice(0, -1),
      future: [current, ...future],
      isDirty: true,
    }
  }

  if (action.type === 'REDO') {
    if (future.length === 0 || !current) return state
    const next = future[0]
    return {
      current: next,
      past: [...past, current],
      future: future.slice(1),
      isDirty: true,
    }
  }

  if (action.type === 'SET_SEQUENCE') {
    return {
      current: cloneSequence(action.sequence),
      past: [],
      future: [],
      isDirty: false,
    }
  }

  // Toutes les actions suivantes créent un snapshot undo
  if (!current) return state
  const snapshot = cloneSequence(current)

  let next: Sequence

  switch (action.type) {
    case 'UPDATE_FIELD':
      next = applyFieldUpdate(current, action.path, action.value)
      break

    case 'ADD_SEANCE':
      next = updateSeances(current, (ss) => {
        const seance = { ...action.seance, numero: ss.length + 1 }
        return [...ss, seance]
      })
      break

    case 'REMOVE_SEANCE':
      next = updateSeances(current, (ss) => {
        const filtered = ss.filter((_, i) => i !== action.seanceIndex)
        return filtered.map((s, i) => ({ ...s, numero: i + 1 }))
      })
      break

    case 'MOVE_SEANCE':
      next = updateSeances(current, (ss) => {
        const moved = moveItem(ss, action.from, action.to)
        return moved.map((s, i) => ({ ...s, numero: i + 1 }))
      })
      break

    case 'ADD_ACTIVITE':
      next = updateSeances(current, (ss) =>
        ss.map((s, i) =>
          i === action.seanceIndex
            ? updateActivites(s, (acts) => [...acts, action.activite])
            : s
        )
      )
      break

    case 'REMOVE_ACTIVITE':
      next = updateSeances(current, (ss) =>
        ss.map((s, i) =>
          i === action.seanceIndex
            ? updateActivites(s, (acts) => acts.filter((_, j) => j !== action.activiteIndex))
            : s
        )
      )
      break

    case 'MOVE_ACTIVITE':
      next = updateSeances(current, (ss) =>
        ss.map((s, i) =>
          i === action.seanceIndex
            ? updateActivites(s, (acts) => moveItem(acts, action.from, action.to))
            : s
        )
      )
      break

    case 'REPLACE_SEANCE':
      next = updateSeances(current, (ss) =>
        ss.map((s, i) => (i === action.seanceIndex ? { ...action.seance, numero: i + 1 } : s))
      )
      break

    case 'REPLACE_ACTIVITE':
      next = updateSeances(current, (ss) =>
        ss.map((s, si) =>
          si === action.seanceIndex
            ? updateActivites(s, (acts) =>
                acts.map((a, ai) => (ai === action.activiteIndex ? action.activite : a))
              )
            : s
        )
      )
      break

    case 'ADD_LIST_ITEM': {
      const list = getListValue(current, action.path) || []
      next = applyFieldUpdate(current, action.path, [...list, action.value])
      break
    }

    case 'REMOVE_LIST_ITEM': {
      const list = getListValue(current, action.path) || []
      next = applyFieldUpdate(current, action.path, list.filter((_, i) => i !== action.itemIndex))
      break
    }

    case 'UPDATE_LIST_ITEM': {
      const list = getListValue(current, action.path) || []
      next = applyFieldUpdate(current, action.path, list.map((v, i) => (i === action.itemIndex ? action.value : v)))
      break
    }

    default:
      return state
  }

  return {
    current: next,
    past: [...past.slice(-29), snapshot], // Max 30 niveaux d'undo
    future: [],
    isDirty: true,
  }
}

function getListValue(seq: Sequence, path: SequencePath): string[] | undefined {
  if (path.level === 'sequence') {
    return (seq as any)[path.field]
  }
  if (path.level === 'seance') {
    return (seq.seances[path.seanceIndex] as any)?.[path.field]
  }
  if (path.level === 'activite') {
    return (seq.seances[path.seanceIndex]?.activites[path.activiteIndex] as any)?.[path.field]
  }
  return undefined
}

// === Hook principal ===

const initialState: EditorState = { current: null, past: [], future: [], isDirty: false }

export function useSequenceEditor() {
  const [state, dispatch] = useReducer(editorReducer, initialState)

  const setSequence = useCallback((seq: Sequence) => {
    dispatch({ type: 'SET_SEQUENCE', sequence: seq })
  }, [])

  const updateField = useCallback((path: SequencePath, value: any) => {
    dispatch({ type: 'UPDATE_FIELD', path, value })
  }, [])

  const addSeance = useCallback((seance: Seance) => {
    dispatch({ type: 'ADD_SEANCE', seance })
  }, [])

  const removeSeance = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_SEANCE', seanceIndex: index })
  }, [])

  const moveSeance = useCallback((from: number, to: number) => {
    dispatch({ type: 'MOVE_SEANCE', from, to })
  }, [])

  const addActivite = useCallback((seanceIndex: number, activite: Activite) => {
    dispatch({ type: 'ADD_ACTIVITE', seanceIndex, activite })
  }, [])

  const removeActivite = useCallback((seanceIndex: number, activiteIndex: number) => {
    dispatch({ type: 'REMOVE_ACTIVITE', seanceIndex, activiteIndex })
  }, [])

  const moveActivite = useCallback((seanceIndex: number, from: number, to: number) => {
    dispatch({ type: 'MOVE_ACTIVITE', seanceIndex, from, to })
  }, [])

  const replaceSeance = useCallback((index: number, seance: Seance) => {
    dispatch({ type: 'REPLACE_SEANCE', seanceIndex: index, seance })
  }, [])

  const replaceActivite = useCallback((seanceIndex: number, activiteIndex: number, activite: Activite) => {
    dispatch({ type: 'REPLACE_ACTIVITE', seanceIndex, activiteIndex, activite })
  }, [])

  const addListItem = useCallback((path: SequencePath, value: string) => {
    dispatch({ type: 'ADD_LIST_ITEM', path, value })
  }, [])

  const removeListItem = useCallback((path: SequencePath, itemIndex: number) => {
    dispatch({ type: 'REMOVE_LIST_ITEM', path, itemIndex })
  }, [])

  const updateListItem = useCallback((path: SequencePath, itemIndex: number, value: string) => {
    dispatch({ type: 'UPDATE_LIST_ITEM', path, itemIndex, value })
  }, [])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  const canUndo = state.past.length > 0
  const canRedo = state.future.length > 0

  return useMemo(() => ({
    sequence: state.current,
    isDirty: state.isDirty,
    canUndo,
    canRedo,
    setSequence,
    updateField,
    addSeance,
    removeSeance,
    moveSeance,
    addActivite,
    removeActivite,
    moveActivite,
    replaceSeance,
    replaceActivite,
    addListItem,
    removeListItem,
    updateListItem,
    undo,
    redo,
  }), [state, canUndo, canRedo, setSequence, updateField, addSeance, removeSeance, moveSeance, addActivite, removeActivite, moveActivite, replaceSeance, replaceActivite, addListItem, removeListItem, updateListItem, undo, redo])
}
