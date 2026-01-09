/**
 * Normalize Japanese text.
 * - Katakana to Hiragana
 * - Lowercase
 */
export const normalizeJapanese = (text: string): string => {
    return text
        .replace(/[\u30a1-\u30f6]/g, (match) => {
            const chr = match.charCodeAt(0) - 0x60;
            return String.fromCharCode(chr);
        })
        .toLowerCase();
};
