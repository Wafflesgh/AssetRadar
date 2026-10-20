/**
 * Rich.tsx — Renders a translated sentence with light inline markup, so a paragraph stays one
 * translation key: **bold** → <strong>, `code` → <code>. No HTML is ever interpreted.
 */
import { Fragment } from 'react';

export function Rich({ text, strongStyle }: { text: string; strongStyle?: React.CSSProperties }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} style={strongStyle}>
            {p.slice(2, -2)}
          </strong>
        ) : p.startsWith('`') && p.endsWith('`') ? (
          <code key={i}>{p.slice(1, -1)}</code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}
