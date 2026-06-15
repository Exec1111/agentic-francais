import { describe, it, expect } from 'vitest'
import {
  assignCorpusFromPreselection,
  inferCorpusRefs,
  isCorpusItemMentioned,
} from '../corpus-match'
import type { CorpusMatchable } from '../corpus-match'

const pacte: CorpusMatchable = {
  id: 'ia-le-pacte-du-banc-de-classe-mqf8mkaf',
  auteur: 'Atelier (texte original IA)',
  oeuvre: 'Le pacte du banc de classe',
  titre: 'Le pacte du banc de classe',
}

const ble: CorpusMatchable = {
  id: 'ia-le-secret-du-champ-de-ble-mqf8oo0y',
  auteur: 'Atelier (texte original IA)',
  oeuvre: 'Le Secret du Champ de Blé',
  titre: 'Le Secret du Champ de Blé',
}

describe('isCorpusItemMentioned', () => {
  it('repère un titre dans la consigne', () => {
    const ctx = "Dans le texte 'Le pacte du banc de classe', les actions sont au présent."
    expect(isCorpusItemMentioned(pacte, ctx)).toBe(true)
    expect(isCorpusItemMentioned(ble, ctx)).toBe(false)
  })
})

describe('inferCorpusRefs', () => {
  it('lie les deux textes quand ils apparaissent dans supports et consigne', () => {
    const refs = inferCorpusRefs(
      [pacte, ble],
      'exercice',
      'Le rythme du récit : Présent ou Passé Simple ?',
      ['Comparer les temps'],
      {
        consigne:
          "Dans le texte 'Le pacte du banc de classe'… Dans le texte 'Le Secret du Champ de Blé'…",
        supports: ['Le Secret du Champ de Blé', 'Le pacte du banc de classe'],
      }
    )
    expect(refs).toHaveLength(2)
    expect(refs).toContain(pacte.id)
    expect(refs).toContain(ble.id)
  })

  it('retourne le seul texte disponible sans mention explicite', () => {
    const refs = inferCorpusRefs([pacte], 'lecture', 'Lecture analytique', [])
    expect(refs).toEqual([pacte.id])
  })

  it('ne retourne rien pour un type sans corpus', () => {
    const refs = inferCorpusRefs([pacte, ble], 'debat', 'Débat', [])
    expect(refs).toEqual([])
  })
})

describe('assignCorpusFromPreselection', () => {
  it('retourne null si le type ne nécessite pas de corpus', () => {
    expect(assignCorpusFromPreselection([pacte], 'debat', 'Débat', [])).toBeNull()
  })

  it('sélectionne les deux textes pour une activité comparative', () => {
    const result = assignCorpusFromPreselection(
      [pacte, ble],
      'exercice',
      'Comparer les temps verbaux',
      ['Analyser le rythme'],
      "Comparez « Le pacte du banc de classe » et « Le Secret du Champ de Blé ».",
      ['Le Secret du Champ de Blé', 'Le pacte du banc de classe']
    )
    expect(result?.corpus_refs).toHaveLength(2)
  })

  it('choisit le meilleur item par scoring si aucune mention explicite', () => {
    const baudelaire: CorpusMatchable = {
      id: 'baudelaire-spleen',
      auteur: 'Baudelaire',
      oeuvre: 'Les Fleurs du mal',
      titre: 'Spleen',
    }
    const maupassant: CorpusMatchable = {
      id: 'maupassant-parure',
      auteur: 'Maupassant',
      oeuvre: 'La Parure',
      titre: 'La Parure',
    }
    const result = assignCorpusFromPreselection(
      [baudelaire, maupassant],
      'lecture',
      'Lecture du poème symboliste',
      ['Identifier le spleen baudelairien']
    )
    expect(result?.corpus_refs).toEqual(['baudelaire-spleen'])
  })
})
