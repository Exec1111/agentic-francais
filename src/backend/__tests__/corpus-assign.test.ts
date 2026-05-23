import { describe, it, expect } from 'vitest'
import { assignCorpusFromPreselection } from '../workflow-engine'
import type { CorpusItem } from '@/shared/schemas'

const makeItem = (overrides: Partial<CorpusItem> = {}): CorpusItem => ({
  id: 'test-item',
  type: 'extrait',
  auteur: 'Auteur Test',
  oeuvre: 'Oeuvre Test',
  titre: 'Titre test',
  annee_publication: 1900,
  edition_reference: 'Gallimard, 2020',
  contenu: 'Contenu du texte...',
  checksum: 'abc123',
  niveaux: ['premiere'],
  genres: ['poésie'],
  themes: ['mélancolie'],
  domaine_public: true,
  verified: true,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  ...overrides,
})

describe('assignCorpusFromPreselection', () => {
  it("retourne null si le type d'activité ne nécessite pas de corpus", () => {
    const item = makeItem()
    const result = assignCorpusFromPreselection([item], 'debat', 'Débat sur le symbolisme', [])
    expect(result).toBeNull()
  })

  it("retourne null si aucun item n'est fourni", () => {
    const result = assignCorpusFromPreselection([], 'lecture', 'Lecture du texte', [])
    expect(result).toBeNull()
  })

  it('retourne directement le seul item disponible pour une lecture', () => {
    const item = makeItem({ id: 'baudelaire-spleen' })
    const result = assignCorpusFromPreselection([item], 'lecture', 'Lecture analytique', ['Identifier les figures de style'])
    expect(result).not.toBeNull()
    expect(result?.corpus_ref).toBe('baudelaire-spleen')
    expect(result?.corpus_status).toBe('trouve')
  })

  it('retourne directement le seul item pour un exercice', () => {
    const item = makeItem({ id: 'maupassant-parure' })
    const result = assignCorpusFromPreselection([item], 'exercice', 'Exercices de grammaire', [])
    expect(result?.corpus_ref).toBe('maupassant-parure')
  })

  it('retourne directement le seul item pour une production_ecrite', () => {
    const item = makeItem({ id: 'hugo-miserable' })
    const result = assignCorpusFromPreselection([item], 'production_ecrite', 'Rédaction', [])
    expect(result?.corpus_ref).toBe('hugo-miserable')
  })

  it('sélectionne le meilleur item par scoring quand plusieurs sont disponibles', () => {
    const baudelaire = makeItem({
      id: 'baudelaire-spleen',
      auteur: 'Baudelaire',
      oeuvre: 'Les Fleurs du mal',
      themes: ['mélancolie', 'spleen', 'symbolisme'],
      genres: ['poésie'],
    })
    const maupassant = makeItem({
      id: 'maupassant-parure',
      auteur: 'Maupassant',
      oeuvre: 'La Parure',
      themes: ['apparences', 'argent', 'réalisme'],
      genres: ['nouvelle'],
    })

    // Activité liée à la poésie → doit choisir Baudelaire
    const result = assignCorpusFromPreselection(
      [baudelaire, maupassant],
      'lecture',
      'Lecture du poème symboliste',
      ['Analyser les procédés poétiques', 'Identifier le spleen baudelairien']
    )
    expect(result?.corpus_ref).toBe('baudelaire-spleen')
  })

  it('sélectionne Maupassant pour une activité sur la nouvelle réaliste', () => {
    const baudelaire = makeItem({
      id: 'baudelaire-spleen',
      themes: ['mélancolie', 'symbolisme'],
      genres: ['poésie'],
    })
    const maupassant = makeItem({
      id: 'maupassant-parure',
      auteur: 'Maupassant',
      oeuvre: 'La Parure',
      themes: ['réalisme', 'argent'],
      genres: ['nouvelle', 'réalisme'],
    })

    const result = assignCorpusFromPreselection(
      [baudelaire, maupassant],
      'lecture',
      'Analyse de la nouvelle réaliste',
      ['Comprendre le réalisme de Maupassant']
    )
    expect(result?.corpus_ref).toBe('maupassant-parure')
  })

  it("n'assigne pas de corpus aux activités non concernées (oral, evaluation, debat, etc.)", () => {
    const item = makeItem()
    for (const type of ['oral', 'evaluation', 'collaboration', 'recherche', 'debat']) {
      const result = assignCorpusFromPreselection([item], type, 'titre', [])
      expect(result).toBeNull()
    }
  })
})
