import { describe, it, expect } from 'vitest'
import { buildGeneratedTextMessages } from '../prompts/corpus-generate'

describe('buildGeneratedTextMessages', () => {
  it('inclut niveau, thème et demande dans le message utilisateur', () => {
    const messages = buildGeneratedTextMessages('5e', "le récit d'aventure", 'Séquence de 5e, 5 séances')
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[1].content).toContain('Niveau : 5e')
    expect(messages[1].content).toContain("le récit d'aventure")
    expect(messages[1].content).toContain('Séquence de 5e, 5 séances')
    expect(messages[1].content).not.toContain('INSTRUCTIONS COMPLÉMENTAIRES')
  })

  it('transmet les instructions complémentaires du professeur avec priorité', () => {
    const messages = buildGeneratedTextMessages(
      '5e',
      "le récit d'aventure",
      '',
      'Un dialogue au passé simple entre deux personnages, environ 200 mots',
    )
    const user = messages[1].content
    expect(user).toContain('INSTRUCTIONS COMPLÉMENTAIRES DU PROFESSEUR')
    expect(user).toContain('Un dialogue au passé simple entre deux personnages, environ 200 mots')
    expect(user).toContain('priment')
  })

  it("ignore les consignes vides ou composées d'espaces", () => {
    const messages = buildGeneratedTextMessages('5e', 'thème', '', '   ')
    expect(messages[1].content).not.toContain('INSTRUCTIONS COMPLÉMENTAIRES')
  })
})
