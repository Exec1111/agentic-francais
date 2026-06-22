import { describe, it, expect } from 'vitest'
import { condenseSequenceForReview, buildUserPrompt } from '../prompts/reviewer'
import type { Sequence } from '@/shared/schemas'

const longConsigne =
  'Lisez attentivement le texte fourni puis répondez aux questions suivantes en justifiant ' +
  'chacune de vos réponses par une citation précise tirée du passage étudié, en veillant à ' +
  'expliciter le procédé satirique mobilisé et son effet sur le lecteur visé par l’auteur.'

const sequence = {
  id: 'seq-1',
  titre: 'Le sourire grinçant',
  niveau: '3ème (Niveau moyen/faible)',
  theme: 'La satire',
  problematique: 'Comment la satire dénonce-t-elle ?',
  objectifs: ['Identifier les procédés de la satire', "Distinguer l'implicite de l'explicite"],
  competences: ['Lire : analyser le ton satirique'],
  corpus_refs: ['maupassant-parure-extrait'],
  evaluation_finale: 'Oui (Séance 10)',
  ressources: [],
  seances: [
    {
      numero: 1,
      titre: "Qu'est-ce que la satire ?",
      duree: 55,
      objectifs: ['Définir la satire', 'Distinguer le rire de la moquerie'],
      ressources: [],
      activites: [
        {
          titre: 'Comprendre le mécanisme de la satire',
          type: 'lecture',
          duree: 25,
          consigne: longConsigne,
          supports: ['Définition du concept de satire'],
          differenciation: 'Liste à choix multiples pour les élèves en difficulté.',
          ressources: [],
          corpus_refs: ['maupassant-parure-extrait'],
          corpus_status: 'trouve',
        },
        {
          titre: "Atelier : Débusquer l'ironie",
          type: 'exercice',
          duree: 20,
          consigne: 'Identifiez les phrases ironiques.',
          supports: [],
          ressources: [],
          corpus_refs: ['maupassant-parure-extrait'],
          corpus_status: 'trouve',
        },
      ],
    },
  ],
} as unknown as Sequence

describe('condenseSequenceForReview', () => {
  it('conserve les titres d’activités MOT POUR MOT (cible des suggestions)', () => {
    const out = condenseSequenceForReview(sequence)
    expect(out).toContain('"Comprendre le mécanisme de la satire"')
    expect(out).toContain('"Atelier : Débusquer l\'ironie"')
  })

  it('garde les métadonnées de jugement (niveau, thème, objectifs, type, durée)', () => {
    const out = condenseSequenceForReview(sequence)
    expect(out).toContain('La satire')
    expect(out).toContain('3ème (Niveau moyen/faible)')
    expect(out).toContain('Définir la satire')
    expect(out).toContain('[lecture, 25 min]')
  })

  it('tronque les consignes longues (allège le contexte)', () => {
    const out = condenseSequenceForReview(sequence)
    expect(out).toContain('consigne :')
    expect(out).toContain('…') // la consigne longue est coupée
    expect(out).not.toContain(longConsigne) // jamais en intégralité
  })

  it('omet le bruit inutile (ids, ressources vides, corpus_status, différenciation)', () => {
    const out = condenseSequenceForReview(sequence)
    expect(out).not.toContain('corpus_status')
    expect(out).not.toContain('differenciation')
    expect(out).not.toContain('"id"')
  })

  it('réduit fortement la taille par rapport au JSON brut', () => {
    const condensed = condenseSequenceForReview(sequence)
    const rawJson = JSON.stringify(sequence, null, 2)
    expect(condensed.length).toBeLessThan(rawJson.length * 0.6)
  })

  it('buildUserPrompt intègre la vue condensée', () => {
    const prompt = buildUserPrompt(sequence)
    expect(prompt).toContain('Analyse cette séquence pédagogique complète')
    expect(prompt).toContain('SÉANCE 1')
  })
})
