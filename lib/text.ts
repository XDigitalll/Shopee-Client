export function cleanDisplayText(value?: string | null) {
  if (!value) return "";

  return value
    .replace(/Ã¢ÂÅ’|âŒ|Ã¢â€Å’|Ã¢ÂÅ’/g, "")
    .replace(/Ã /g, "à")
    .replace(/Ã¡/g, "á")
    .replace(/Ã¢/g, "â")
    .replace(/Ã£/g, "ã")
    .replace(/Ã§/g, "ç")
    .replace(/Ã©/g, "é")
    .replace(/Ãª/g, "ê")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãµ/g, "õ")
    .replace(/Ãº/g, "ú")
    .replace(/Ã/g, "Á")
    .replace(/Ã‰/g, "É")
    .replace(/Ã“/g, "Ó")
    .replace(/[ \t]+\n/g, "\n")
    .trimStart();
}
