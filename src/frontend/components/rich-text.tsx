import { Fragment, type ReactNode } from 'react'

/**
 * Rendu du markdown *inline* (gras / italique) à l'intérieur d'un champ texte.
 *
 * Les contenus produits par l'IA — en particulier les variantes différenciées
 * (dys, allophone…) — contiennent souvent des mises en exergue `**gras**` ou
 * `*italique*`. Les blocs étant rendus en texte brut, ces marqueurs apparaissaient
 * tels quels à l'écran. Ce helper les convertit en `<strong>` / `<em>`.
 *
 * Volontairement limité au markdown inline (gras, italique) : pas d'injection
 * HTML, pas de blocs. À utiliser pour les champs de prose des renderers de blocs.
 */

// Capture, dans l'ordre de priorité : **gras**, __gras__, *italique*, _italique_.
const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g

export function renderInline(text: string | null | undefined): ReactNode {
  if (!text) return text
  if (!text.includes('*') && !text.includes('_')) return text

  return text.split(INLINE_RE).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) {
      return (
        <strong key={i} className="font-bold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** Variante composant : `<RichText>{texte}</RichText>`. */
export function RichText({ children }: { children: string | null | undefined }) {
  return <>{renderInline(children)}</>
}
