const groups = [
  ["audifonos", "auriculares", "cascos", "headset", "headphones"],
  ["mouse", "raton"],
  ["teclado", "keyboard"],
  ["ssd", "unidad de estado solido", "disco de estado solido"],
  ["control", "mando", "gamepad"],
  ["parlante", "altavoz", "bocina", "speaker"],
  ["hub", "multipuerto", "adaptador multipuerto"],
  ["router", "enrutador"],
  ["gaming", "gamer"],
];

export function searchTerms(query: string) {
  let clean = query.slice(0, 120).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(?:l[ea][iy]?\s*te(?:ch|ck|k|c)|ley\s+tech)(?:\s+peru)?\b/g, " ")
    .replace(/\s+/g, " ").trim();
  for (const [first, ...aliases] of groups) {
    for (const phrase of aliases.filter(alias => alias.includes(" "))) {
      clean = clean.replaceAll(phrase, first);
    }
  }
  return clean.split(/\s+/).filter(Boolean).slice(0, 8).map(word =>
    groups.find(group => group.includes(word) || group.includes(word.replace(/s$/, ""))) || [word]);
}
