// Renders disclosure text (see disclosures.ts) as paragraphs, lists and bold,
// never as HTML.
import { parse, type Inline, type Values } from './disclosures';

export function Spans({ inline }: { inline: Inline }) {
  return <>{inline.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : s.text))}</>;
}

export function Rich({ text, values }: { text: string; values: Values }) {
  return (
    <>
      {parse(text, values).map((b, i) =>
        b.list ? (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Spans inline={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Spans inline={b.text} />
          </p>
        ),
      )}
    </>
  );
}

/** One line of text, such as an acknowledgment: every paragraph run together. */
export function RichLine({ text, values }: { text: string; values: Values }) {
  const inline = parse(text, values).flatMap((b) => (b.list ? b.items.flat() : b.text));
  return <Spans inline={inline} />;
}
