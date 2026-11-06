// Personalisation text: one line, printable characters only, at most `max` letters.
export const cleanEngravingText = (text: string, max = 200) =>
  (text ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.min(200, max))
