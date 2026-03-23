/**
 * Lightweight inline markdown renderer.
 * Handles **bold**, *italic*, and `code` — no block elements.
 * Safe for use inside <span>, <label>, <td>, <option>, etc.
 */
export default function InlineMarkdown({ children }) {
  if (!children || typeof children !== "string") return children || null;

  const parts = [];
  // Regex: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(children)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(children.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      // `code`
      parts.push(<code key={match.index}>{match[4]}</code>);
    }
    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < children.length) {
    parts.push(children.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : children;
}
