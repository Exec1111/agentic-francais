/**
 * Tests unitaires — text-utils (numérotation des lignes, placeholder œuvre protégée)
 */

import { describe, it, expect } from 'vitest'
import { numberTextLines, buildTexteProtegePlaceholder } from '../text-utils'

describe('numberTextLines', () => {
  it('numérote la 5e et la 10e ligne non vide', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Vers ${i + 1}`).join('\n')
    const result = numberTextLines(text)
    expect(result).toContain('[5] Vers 5')
    expect(result).toContain('[10] Vers 10')
    expect(result).not.toContain('[1]')
    expect(result).not.toContain('[12]')
  })

  it('ignore les lignes vides dans le décompte (strophes)', () => {
    // 2 strophes de 3 vers séparées par une ligne vide → le 5e vers est "E"
    const text = 'A\nB\nC\n\nD\nE\nF'
    const result = numberTextLines(text)
    expect(result).toContain('[5] E')
  })

  it('préserve les lignes vides telles quelles', () => {
    const text = 'A\n\nB'
    expect(numberTextLines(text).split('\n')).toHaveLength(3)
  })

  it('laisse un texte en un seul paragraphe non numéroté', () => {
    const text = 'Une seule longue ligne de prose sans retour à la ligne.'
    expect(numberTextLines(text)).toBe(text)
  })

  it('ne modifie pas le contenu des lignes (fidélité au texte source)', () => {
    const text = 'Maître Corbeau, sur un arbre perché,\nTenait en son bec un fromage.'
    const result = numberTextLines(text)
    expect(result).toContain('Maître Corbeau, sur un arbre perché,')
    expect(result).toContain('Tenait en son bec un fromage.')
  })

  it('accepte un pas de numérotation personnalisé', () => {
    const text = 'A\nB\nC\nD'
    const result = numberTextLines(text, 2)
    expect(result).toContain('[2] B')
    expect(result).toContain('[4] D')
  })
})

describe('buildTexteProtegePlaceholder', () => {
  it('inclut œuvre, auteur et pages', () => {
    const placeholder = buildTexteProtegePlaceholder({
      oeuvre: "L'Étranger", auteur: 'Albert Camus', pages: 'p. 9',
    })
    expect(placeholder).toBe("[Texte à insérer par l'enseignant — L'Étranger, Albert Camus, p. 9]")
  })

  it('omet les pages si absentes', () => {
    const placeholder = buildTexteProtegePlaceholder({
      oeuvre: "L'Étranger", auteur: 'Albert Camus', pages: undefined,
    })
    expect(placeholder).toBe("[Texte à insérer par l'enseignant — L'Étranger, Albert Camus]")
  })
})
