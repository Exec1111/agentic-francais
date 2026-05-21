import { describe, it, expect } from 'vitest'
import { RessourceSchema, SeanceSchema, ActiviteSchema, SequenceSchema } from '../schemas'

describe('Zod Schemas Validation', () => {
  describe('RessourceSchema', () => {
    it('should validate a correct resource object', () => {
      const ressource = {
        id: 'res-1',
        titre: 'Cours sur les figures de style',
        type: 'cours',
        status: 'ready',
        contenu: '# Les figures de style\nUn cours complet...'
      }

      const parsed = RessourceSchema.safeParse(ressource)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.id).toBe('res-1')
        expect(parsed.data.status).toBe('ready')
        expect(parsed.data.contenu).toBe('# Les figures de style\nUn cours complet...')
      }
    })

    it('should set default values for status and contenu when not provided', () => {
      const minimalRessource = {
        id: 'res-2',
        titre: 'Fiche bilan',
        type: 'bilan'
      }

      const parsed = RessourceSchema.safeParse(minimalRessource)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.status).toBe('empty')
        expect(parsed.data.contenu).toBe('')
      }
    })

    it('should fail validation when required fields are missing', () => {
      const invalidRessource = {
        id: 'res-3'
        // titre and type are missing
      }

      const parsed = RessourceSchema.safeParse(invalidRessource)
      expect(parsed.success).toBe(false)
    })

    it('should fail validation when type is invalid', () => {
      const invalidRessource = {
        id: 'res-4',
        titre: 'Invalide',
        type: 'unknown-type' // invalid resource type
      }

      const parsed = RessourceSchema.safeParse(invalidRessource)
      expect(parsed.success).toBe(false)
    })
  })

  describe('ActiviteSchema', () => {
    it('should default ressources to an empty array', () => {
      const activite = {
        titre: 'Analyse d\'un extrait de texte',
        type: 'lecture',
        duree: 30,
        consigne: 'Lire le texte attentivement et identifier le thème.'
      }

      const parsed = ActiviteSchema.safeParse(activite)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.ressources).toEqual([])
      }
    })
  })

  describe('SeanceSchema', () => {
    it('should default ressources to an empty array and duree to 55', () => {
      const seance = {
        numero: 1,
        titre: 'Introduction au genre poétique',
        objectifs: ['Découvrir la poésie', 'Identifier les rimes'],
        activites: [
          {
            titre: 'Lecture active',
            type: 'lecture',
            duree: 20,
            consigne: 'Lire le poème et relever les rimes.'
          }
        ]
      }

      const parsed = SeanceSchema.safeParse(seance)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.duree).toBe(55)
        expect(parsed.data.ressources).toEqual([])
      }
    })
  })

  describe('SequenceSchema', () => {
    it('should validate a full sequence and default sequence level ressources to empty', () => {
      const sequence = {
        id: 'seq-1',
        titre: 'La poésie lyrique',
        niveau: '4e',
        theme: 'Vivre en société, participer à la société',
        objectifs: ['Comprendre le lyrisme', 'Écrire un poème'],
        competences: ['Écriture', 'Lecture'],
        seances: [
          {
            numero: 1,
            titre: 'Séance 1',
            objectifs: ['Objectif 1'],
            activites: [
              {
                titre: 'Activité 1',
                type: 'debat',
                duree: 15,
                consigne: 'Débattre.'
              }
            ]
          }
        ]
      }

      const parsed = SequenceSchema.safeParse(sequence)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.ressources).toEqual([])
        expect(parsed.data.seances[0].ressources).toEqual([])
        expect(parsed.data.seances[0].activites[0].ressources).toEqual([])
      }
    })
  })
})
