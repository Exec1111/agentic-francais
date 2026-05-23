import { describe, it, expect } from 'vitest'
import { normalizeNiveau, expandNiveauxForSearch, applyScoreThreshold } from '../corpus-repo'

// Note : searchCorpus nécessite SQLite (better-sqlite3) et le filesystem.
// Ces tests couvrent les fonctions pures sans I/O.

describe('normalizeNiveau', () => {
  it('normalise les formes communes de 6e', () => {
    expect(normalizeNiveau('6e')).toBe('sixieme')
    expect(normalizeNiveau('6ème')).toBe('sixieme')
    expect(normalizeNiveau('6eme')).toBe('sixieme')
    expect(normalizeNiveau('sixieme')).toBe('sixieme')
  })

  it('normalise les formes communes de Première', () => {
    expect(normalizeNiveau('1ere')).toBe('premiere')
    expect(normalizeNiveau('1ère')).toBe('premiere')
    expect(normalizeNiveau('premiere')).toBe('premiere')
    expect(normalizeNiveau('première')).toBe('premiere')
  })

  it('normalise Terminale', () => {
    expect(normalizeNiveau('terminale')).toBe('terminale')
    expect(normalizeNiveau('tale')).toBe('terminale')
    expect(normalizeNiveau('tle')).toBe('terminale')
  })

  it('est insensible à la casse', () => {
    expect(normalizeNiveau('PREMIERE')).toBe('premiere')
    expect(normalizeNiveau('Terminale')).toBe('terminale')
  })

  it('retourne null pour un niveau inconnu', () => {
    expect(normalizeNiveau('master')).toBeNull()
    expect(normalizeNiveau('')).toBeNull()
    expect(normalizeNiveau('bac+2')).toBeNull()
  })

  it('tolère les espaces en début/fin', () => {
    expect(normalizeNiveau('  3e  ')).toBe('troisieme')
  })

  it('retourne null pour les termes génériques (gérés par expandNiveauxForSearch)', () => {
    // Les termes génériques ne sont plus dans NIVEAU_MAP — ils sont dans expandNiveauxForSearch
    // pour retourner plusieurs niveaux à la fois.
    expect(normalizeNiveau('lycee')).toBeNull()
    expect(normalizeNiveau('lycée')).toBeNull()
    expect(normalizeNiveau('Secondaire')).toBeNull()
    expect(normalizeNiveau('college')).toBeNull()
    expect(normalizeNiveau('collège')).toBeNull()
  })
})

describe('expandNiveauxForSearch', () => {
  it('retourne le niveau précis pour une classe spécifique', () => {
    expect(expandNiveauxForSearch('3e')).toEqual(['troisieme'])
    expect(expandNiveauxForSearch('terminale')).toEqual(['terminale'])
    expect(expandNiveauxForSearch('1ère')).toEqual(['premiere'])
  })

  it('retourne tout le lycée pour un terme générique lycée', () => {
    expect(expandNiveauxForSearch('Secondaire')).toEqual(['seconde', 'premiere', 'terminale'])
    expect(expandNiveauxForSearch('lycée')).toEqual(['seconde', 'premiere', 'terminale'])
    expect(expandNiveauxForSearch('lycee')).toEqual(['seconde', 'premiere', 'terminale'])
  })

  it('retourne tout le collège pour un terme générique collège', () => {
    expect(expandNiveauxForSearch('collège')).toEqual(['sixieme', 'cinquieme', 'quatrieme', 'troisieme'])
    expect(expandNiveauxForSearch('college')).toEqual(['sixieme', 'cinquieme', 'quatrieme', 'troisieme'])
  })

  it('retourne [] pour un niveau inconnu (pas de filtre SQL)', () => {
    expect(expandNiveauxForSearch('master')).toEqual([])
    expect(expandNiveauxForSearch('')).toEqual([])
  })
})

describe('applyScoreThreshold', () => {
  const item = (id: string) => ({ id }) as any

  // === Mode souple (pas de requête thématique, ex. recherche par auteur) ===

  it('mode souple : retourne tout si tous les scores sont à 0', () => {
    const input = [{ item: item('a'), score: 0 }, { item: item('b'), score: 0 }]
    expect(applyScoreThreshold(input, false)).toHaveLength(2)
  })

  it('mode souple : exclut les score-0 quand un item est positif', () => {
    const input = [
      { item: item('baudelaire'), score: 4 },
      { item: item('maupassant'), score: 0 },
    ]
    const result = applyScoreThreshold(input, false)
    expect(result).toHaveLength(1)
    expect(result[0].item.id).toBe('baudelaire')
  })

  // === Mode strict (requête thématique fournie) ===

  it('mode strict : exclut Maupassant (score 0) quand Baudelaire a un score thématique', () => {
    // Cas réel : query "poésie symboliste", niveau "seconde" (niveau = filtre SQL, non scoré)
    // Baudelaire : thèmes matchés → score 4 ; Maupassant : aucun thème → score 0
    const input = [
      { item: item('baudelaire-fleurs-du-mal'), score: 4 },
      { item: item('maupassant-la-parure'), score: 0 },
    ]
    const result = applyScoreThreshold(input, true)
    expect(result).toHaveLength(1)
    expect(result[0].item.id).toBe('baudelaire-fleurs-du-mal')
  })

  it('mode strict : exclut Maupassant même s\'il est le SEUL item dans le corpus', () => {
    // Pas de Baudelaire en DB → Maupassant seul, score 0.
    // requirePositive=true → retourne [] → l'IA suggère des textes pertinents.
    const input = [{ item: item('maupassant-la-parure'), score: 0 }]
    const result = applyScoreThreshold(input, true)
    expect(result).toHaveLength(0)
  })

  it('mode strict : conserve tous les items si tous ont un score positif', () => {
    const input = [
      { item: item('a'), score: 4 },
      { item: item('b'), score: 2 },
      { item: item('c'), score: 1 },
    ]
    expect(applyScoreThreshold(input, true)).toHaveLength(3)
  })

  it('retourne un tableau vide si l\'entrée est vide', () => {
    expect(applyScoreThreshold([], true)).toHaveLength(0)
    expect(applyScoreThreshold([], false)).toHaveLength(0)
  })
})
