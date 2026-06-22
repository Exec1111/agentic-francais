/**
 * Résolution des passages par ANCRAGE.
 *
 * L'agent de découpe ne recopie pas le texte et ne renvoie pas d'offsets
 * numériques (deux sources d'erreur classiques des LLM). Il renvoie pour chaque
 * passage deux ancres verbatim courtes — `debut_texte` et `fin_texte` — et c'est
 * ce module, côté serveur, qui localise ces ancres dans l'œuvre source et en
 * extrait la sous-chaîne EXACTE. Le contenu d'un passage est ainsi garanti
 * fidèle à la source, quoi qu'ait produit le LLM.
 *
 * La localisation tolère les différences d'espaces/sauts de ligne (le LLM
 * normalise souvent les blancs en recopiant une ancre) : chaque suite de blancs
 * de l'ancre matche `\s+` dans la source.
 */

export interface PassageAnchor {
  debut_texte: string
  fin_texte: string
}

export interface ResolvedPassage {
  /** true si les deux ancres ont été localisées et ordonnées correctement. */
  found: boolean
  /** Sous-chaîne exacte de la source (vide si non trouvé). */
  contenu: string
  /** Index de début dans la source (-1 si non trouvé). */
  debut_index: number
  /** Index de fin (exclusif) dans la source (-1 si non trouvé). */
  fin_index: number
}

/**
 * Transforme une ancre verbatim en expression régulière tolérante aux blancs :
 * chaque token est échappé (caractères spéciaux regex neutralisés) et les suites
 * de blancs deviennent `\s+`.
 */
function anchorToRegex(anchor: string): RegExp | null {
  const tokens = anchor.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const pattern = tokens
    .map((tok) => tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  return new RegExp(pattern, 'i')
}

/**
 * Localise un passage entre deux ancres et renvoie la sous-chaîne exacte.
 *
 * `fin_texte` est cherché à partir du DÉBUT de l'ancre de début, ce qui couvre
 * les passages courts où les deux ancres se chevauchent. Le passage retenu va du
 * début de l'ancre de début à la fin de l'ancre de fin.
 */
export function resolvePassageSpan(
  source: string,
  anchor: PassageAnchor,
): ResolvedPassage {
  const notFound: ResolvedPassage = { found: false, contenu: '', debut_index: -1, fin_index: -1 }

  const debutRe = anchorToRegex(anchor.debut_texte)
  const finRe = anchorToRegex(anchor.fin_texte)
  if (!debutRe || !finRe) return notFound

  const debutMatch = debutRe.exec(source)
  if (!debutMatch) return notFound
  const debutIndex = debutMatch.index

  // Cherche l'ancre de fin à partir du début de l'ancre de début (gère le
  // chevauchement des passages courts).
  const rest = source.slice(debutIndex)
  const finMatch = finRe.exec(rest)
  if (!finMatch) return notFound

  const finIndex = debutIndex + finMatch.index + finMatch[0].length
  if (finIndex <= debutIndex) return notFound

  return {
    found: true,
    contenu: source.slice(debutIndex, finIndex),
    debut_index: debutIndex,
    fin_index: finIndex,
  }
}

/** Résout une liste de passages contre la même œuvre source. */
export function resolvePassageSpans(
  source: string,
  anchors: PassageAnchor[],
): ResolvedPassage[] {
  return anchors.map((a) => resolvePassageSpan(source, a))
}
