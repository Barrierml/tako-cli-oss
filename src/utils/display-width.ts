/**
 * Calculate the visual width of a string in the terminal.
 *
 * This accounts for:
 * - Wide characters (CJK characters, emoji) that take 2 columns
 * - Regular ASCII characters that take 1 column
 * - ANSI escape codes that take 0 columns
 */

/**
 * Check if a character is a wide character (takes 2 terminal columns)
 */
function isWideChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (!code) return false;

  // CJK Unified Ideographs: 4E00-9FFF
  // CJK Extension A: 3400-4DBF
  // CJK Extension B-F: 20000-2EBEF
  // CJK Compatibility Ideographs: F900-FAFF, 2F800-2FA1F
  // Hangul Syllables: AC00-D7AF
  // Hiragana & Katakana: 3040-309F, 30A0-30FF
  // Fullwidth ASCII variants: FF00-FFEF
  // Emoji: 1F000-1FFFF, 2600-27BF, 2B50, etc.

  return (
    (code >= 0x4e00 && code <= 0x9fff) ||      // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) ||      // CJK Extension A
    (code >= 0x20000 && code <= 0x2ebef) ||    // CJK Extension B-F
    (code >= 0xf900 && code <= 0xfaff) ||      // CJK Compatibility
    (code >= 0x2f800 && code <= 0x2fa1f) ||    // CJK Compatibility Supplement
    (code >= 0xac00 && code <= 0xd7af) ||      // Hangul Syllables
    (code >= 0x3040 && code <= 0x309f) ||      // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) ||      // Katakana
    (code >= 0xff00 && code <= 0xffef) ||      // Fullwidth forms
    (code >= 0x1f000 && code <= 0x1ffff) ||    // Emoji & symbols
    (code >= 0x2600 && code <= 0x27bf) ||      // Misc symbols
    code === 0x2b50                             // White star (⭐)
  );
}

/**
 * Remove ANSI escape codes from a string
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Calculate the display width of a string in the terminal
 */
export function getDisplayWidth(str: string): number {
  // Remove ANSI codes first
  const cleaned = stripAnsi(str);

  let width = 0;

  // Iterate through each character (properly handling surrogate pairs)
  for (const char of cleaned) {
    width += isWideChar(char) ? 2 : 1;
  }

  return width;
}

/**
 * Pad a string to a specific display width
 *
 * @param str - The string to pad
 * @param targetWidth - The target display width
 * @param align - Alignment: 'left', 'center', 'right'
 * @returns The padded string
 */
export function padToWidth(
  str: string,
  targetWidth: number,
  align: 'left' | 'center' | 'right' = 'left'
): string {
  const currentWidth = getDisplayWidth(str);
  const paddingNeeded = Math.max(0, targetWidth - currentWidth);

  if (paddingNeeded === 0) {
    return str;
  }

  switch (align) {
    case 'left':
      return str + ' '.repeat(paddingNeeded);

    case 'right':
      return ' '.repeat(paddingNeeded) + str;

    case 'center': {
      const leftPad = Math.floor(paddingNeeded / 2);
      const rightPad = paddingNeeded - leftPad;
      return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
    }
  }
}

/**
 * Truncate a string to fit within a display width
 */
export function truncateToWidth(str: string, maxWidth: number, ellipsis = '...'): string {
  const currentWidth = getDisplayWidth(str);

  if (currentWidth <= maxWidth) {
    return str;
  }

  const ellipsisWidth = getDisplayWidth(ellipsis);
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) {
    return ellipsis.slice(0, maxWidth);
  }

  let width = 0;
  let result = '';

  for (const char of str) {
    const charWidth = isWideChar(char) ? 2 : 1;

    if (width + charWidth > targetWidth) {
      break;
    }

    result += char;
    width += charWidth;
  }

  return result + ellipsis;
}
