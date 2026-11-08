/**
 * Join class names, dropping falsy entries.
 *
 * The components below compose Tailwind utilities from props, and `undefined`
 * or `false` in a template literal would render the literal text "undefined"
 * into the class attribute.
 *
 * @param {...(string|false|null|undefined)} parts
 * @returns {string}
 */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}
