import { describe, it, expect } from 'vitest'
import { editorReducer, type EditorState } from '../useSequenceEditor'
import type { Sequence } from '@/shared/schemas'

describe('useSequenceEditor Reducer', () => {
  const mockSequence: Sequence = {
    id: 'seq-1',
    titre: 'La poésie lyrique',
    niveau: '4e',
    theme: 'L\'amour poétique',
    objectifs: ['Découvrir le lyrisme'],
    competences: ['Lecture'],
    corpus_refs: [],
    seances: [
      {
        numero: 1,
        titre: 'Première séance',
        duree: 55,
        objectifs: ['Reconnaître le lyrisme'],
        ressources: [
          {
            id: 'res-seance-1',
            titre: 'Le cours sur le lyrisme',
            type: 'cours',
            status: 'empty',
            contenu: ''
          }
        ],
        activites: [
          {
            titre: 'Lecture active d\'un poème',
            type: 'lecture',
            duree: 20,
            consigne: 'Relever les champs lexicaux du sentiment.',
            ressources: [
              {
                id: 'res-act-1',
                titre: 'Exercice de repérage',
                type: 'exercice',
                format_exercice: 'texte_a_trous',
                status: 'empty',
                contenu: ''
              }
            ]
          }
        ]
      }
    ],
    ressources: []
  }

  const initialState: EditorState = {
    current: null,
    past: [],
    future: [],
    isDirty: false
  }

  it('should set sequence correctly with SET_SEQUENCE', () => {
    const nextState = editorReducer(initialState, {
      type: 'SET_SEQUENCE',
      sequence: mockSequence
    })

    expect(nextState.current).toEqual(mockSequence)
    expect(nextState.past).toEqual([])
    expect(nextState.future).toEqual([])
    expect(nextState.isDirty).toBe(false)
  })

  it('should update sequence fields with UPDATE_FIELD', () => {
    const stateWithSeq = { ...initialState, current: mockSequence }
    const nextState = editorReducer(stateWithSeq, {
      type: 'UPDATE_FIELD',
      path: { level: 'sequence', field: 'titre' },
      value: 'Nouveau titre poétique'
    })

    expect(nextState.current?.titre).toBe('Nouveau titre poétique')
    expect(nextState.past).toHaveLength(1)
    expect(nextState.past[0].titre).toBe('La poésie lyrique')
    expect(nextState.isDirty).toBe(true)
  })

  it('should update resource status at seance level with UPDATE_RESSOURCE_STATUS', () => {
    const stateWithSeq = { ...initialState, current: mockSequence }
    const nextState = editorReducer(stateWithSeq, {
      type: 'UPDATE_RESSOURCE_STATUS',
      seanceIndex: 0,
      ressourceId: 'res-seance-1',
      status: 'generating'
    })

    expect(nextState.current?.seances[0].ressources?.[0].status).toBe('generating')
    expect(nextState.past).toHaveLength(1)
    expect(nextState.past[0].seances[0].ressources?.[0].status).toBe('empty')
  })

  it('should update resource status at activite level with UPDATE_RESSOURCE_STATUS', () => {
    const stateWithSeq = { ...initialState, current: mockSequence }
    const nextState = editorReducer(stateWithSeq, {
      type: 'UPDATE_RESSOURCE_STATUS',
      seanceIndex: 0,
      activiteIndex: 0,
      ressourceId: 'res-act-1',
      status: 'generating'
    })

    expect(nextState.current?.seances[0].activites[0].ressources?.[0].status).toBe('generating')
    expect(nextState.past).toHaveLength(1)
    expect(nextState.past[0].seances[0].activites[0].ressources?.[0].status).toBe('empty')
  })

  it('should update resource content at seance level with UPDATE_RESSOURCE_CONTENT', () => {
    const stateWithSeq = { ...initialState, current: mockSequence }
    const nextState = editorReducer(stateWithSeq, {
      type: 'UPDATE_RESSOURCE_CONTENT',
      seanceIndex: 0,
      ressourceId: 'res-seance-1',
      contenu: '# Cours sur le lyrisme\nLe lyrisme est...'
    })

    expect(nextState.current?.seances[0].ressources?.[0].contenu).toBe('# Cours sur le lyrisme\nLe lyrisme est...')
    expect(nextState.current?.seances[0].ressources?.[0].status).toBe('ready')
    expect(nextState.past).toHaveLength(1)
    expect(nextState.past[0].seances[0].ressources?.[0].contenu).toBe('')
  })

  it('should update resource content and format at activite level with UPDATE_RESSOURCE_CONTENT', () => {
    const stateWithSeq = { ...initialState, current: mockSequence }
    const nextState = editorReducer(stateWithSeq, {
      type: 'UPDATE_RESSOURCE_CONTENT',
      seanceIndex: 0,
      activiteIndex: 0,
      ressourceId: 'res-act-1',
      contenu: 'Remplir les trous : Le poète exprime sa [tristesse]',
      formatExercice: 'texte_a_trous'
    })

    expect(nextState.current?.seances[0].activites[0].ressources?.[0].contenu).toBe('Remplir les trous : Le poète exprime sa [tristesse]')
    expect(nextState.current?.seances[0].activites[0].ressources?.[0].status).toBe('ready')
    expect(nextState.current?.seances[0].activites[0].ressources?.[0].format_exercice).toBe('texte_a_trous')
  })

  it('should handle UNDO and REDO correctly', () => {
    const stateWithSeq = { ...initialState, current: mockSequence }
    
    // Action 1: modifier le titre
    const stateAfterUpdate = editorReducer(stateWithSeq, {
      type: 'UPDATE_FIELD',
      path: { level: 'sequence', field: 'titre' },
      value: 'Modifié 1'
    })

    // Action 2: modifier le thème
    const stateAfterUpdate2 = editorReducer(stateAfterUpdate, {
      type: 'UPDATE_FIELD',
      path: { level: 'sequence', field: 'theme' },
      value: 'Thème modifié'
    })

    expect(stateAfterUpdate2.current?.titre).toBe('Modifié 1')
    expect(stateAfterUpdate2.current?.theme).toBe('Thème modifié')
    expect(stateAfterUpdate2.past).toHaveLength(2)

    // Undo 1
    const stateUndo1 = editorReducer(stateAfterUpdate2, { type: 'UNDO' })
    expect(stateUndo1.current?.titre).toBe('Modifié 1')
    expect(stateUndo1.current?.theme).toBe('L\'amour poétique')
    expect(stateUndo1.past).toHaveLength(1)
    expect(stateUndo1.future).toHaveLength(1)

    // Undo 2
    const stateUndo2 = editorReducer(stateUndo1, { type: 'UNDO' })
    expect(stateUndo2.current?.titre).toBe('La poésie lyrique')
    expect(stateUndo2.current?.theme).toBe('L\'amour poétique')
    expect(stateUndo2.past).toHaveLength(0)
    expect(stateUndo2.future).toHaveLength(2)

    // Redo 1
    const stateRedo1 = editorReducer(stateUndo2, { type: 'REDO' })
    expect(stateRedo1.current?.titre).toBe('Modifié 1')
    expect(stateRedo1.current?.theme).toBe('L\'amour poétique')
    expect(stateRedo1.past).toHaveLength(1)
    expect(stateRedo1.future).toHaveLength(1)
  })
})
