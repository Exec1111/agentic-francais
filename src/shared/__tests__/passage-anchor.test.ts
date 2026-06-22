import { describe, it, expect } from 'vitest'
import { resolvePassageSpan, resolvePassageSpans } from '../passage-anchor'

const CANDIDE = `Il y avait en Vestphalie, dans le château de M. le baron de Thunder-ten-tronckh, un jeune garçon à qui la nature avait donné les mœurs les plus douces. Sa physionomie annonçait son âme. Il avait le jugement assez droit, avec l'esprit le plus simple ; c'est, je crois, pour cette raison qu'on le nommait Candide.`

describe('resolvePassageSpan', () => {
  it('extrait la sous-chaîne exacte entre deux ancres', () => {
    const res = resolvePassageSpan(CANDIDE, {
      debut_texte: 'Il y avait en Vestphalie',
      fin_texte: 'les plus douces.',
    })
    expect(res.found).toBe(true)
    expect(res.contenu).toBe(
      'Il y avait en Vestphalie, dans le château de M. le baron de Thunder-ten-tronckh, un jeune garçon à qui la nature avait donné les mœurs les plus douces.'
    )
  })

  it("tolère des blancs différents dans l'ancre (espaces, sauts de ligne)", () => {
    const res = resolvePassageSpan(CANDIDE, {
      // espaces multiples / saut de ligne là où la source a un espace simple
      debut_texte: 'Sa   physionomie\nannonçait',
      fin_texte: 'son âme.',
    })
    expect(res.found).toBe(true)
    expect(res.contenu).toBe('Sa physionomie annonçait son âme.')
  })

  it('retourne found=false quand une ancre est introuvable', () => {
    const res = resolvePassageSpan(CANDIDE, {
      debut_texte: 'Il y avait en Vestphalie',
      fin_texte: 'cette phrase absente du texte',
    })
    expect(res.found).toBe(false)
    expect(res.contenu).toBe('')
    expect(res.fin_index).toBe(-1)
  })

  it('gère un passage court où les deux ancres se chevauchent', () => {
    const res = resolvePassageSpan(CANDIDE, {
      debut_texte: 'on le nommait',
      fin_texte: 'nommait Candide.',
    })
    expect(res.found).toBe(true)
    expect(res.contenu).toBe('on le nommait Candide.')
  })

  it('neutralise les caractères spéciaux regex présents dans une ancre', () => {
    const res = resolvePassageSpan(CANDIDE, {
      debut_texte: "avec l'esprit le plus simple ;",
      fin_texte: 'pour cette raison',
    })
    expect(res.found).toBe(true)
    expect(res.contenu).toContain("l'esprit le plus simple")
  })
})

describe('resolvePassageSpans', () => {
  it('résout plusieurs passages contre la même source', () => {
    const results = resolvePassageSpans(CANDIDE, [
      { debut_texte: 'Il y avait', fin_texte: 'plus douces.' },
      { debut_texte: 'Sa physionomie', fin_texte: 'introuvable ici' },
    ])
    expect(results).toHaveLength(2)
    expect(results[0].found).toBe(true)
    expect(results[1].found).toBe(false)
  })
})
