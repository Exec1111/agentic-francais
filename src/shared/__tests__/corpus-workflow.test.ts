import { describe, expect, it } from 'vitest'
import { validateCorpusWorkflow } from '@/shared/corpus-workflow'

const item = (id: string, oeuvre = id) => ({ id, oeuvre, contenu: 'Texte exploitable', verified: true })

describe('validateCorpusWorkflow', () => {
  it('refuse un groupement avec moins de trois œuvres distinctes', () => {
    const result = validateCorpusWorkflow({
      intent: 'free', study_type: 'groupement', work_refs: ['a', 'a', 'b'], passage_selections: [],
    }, [item('a'), item('b')])
    expect(result).toEqual({ valid: false, message: 'Un groupement de textes nécessite au moins 3 œuvres exploitables (2/3).' })
  })

  it('accepte trois œuvres exploitables distinctes', () => {
    const result = validateCorpusWorkflow({
      intent: 'guided', study_type: 'groupement', work_refs: ['a', 'b', 'c'], passage_selections: [],
    }, [item('a'), item('b'), item('c')])
    expect(result).toEqual({ valid: true, message: null })
  })

  it('refuse les références sans texte vérifié', () => {
    const result = validateCorpusWorkflow({
      intent: 'identified', study_type: 'oeuvre_integrale', work_refs: ['a'], passage_selections: [],
    }, [{ ...item('a'), contenu: '', verified: true }])
    expect(result.valid).toBe(false)
  })

  it('exige un passage pour une œuvre intégrale', () => {
    const selection = { intent: 'free' as const, study_type: 'oeuvre_integrale' as const, work_refs: ['a'], passage_selections: [] }
    expect(validateCorpusWorkflow(selection, [item('a')]).valid).toBe(false)
    expect(validateCorpusWorkflow({ ...selection, passage_selections: [{ id: 'p', corpus_id: 'a', titre: 'Le passage', source: 'ia' }] }, [item('a')])).toEqual({ valid: true, message: null })
  })

  it('refuse plusieurs œuvres en mode intégral', () => {
    const result = validateCorpusWorkflow({
      intent: 'guided', study_type: 'oeuvre_integrale', work_refs: ['a', 'b'], passage_selections: [],
    }, [item('a'), item('b')])
    expect(result).toEqual({ valid: false, message: 'Une œuvre intégrale nécessite exactement une œuvre principale exploitable.' })
  })
})
