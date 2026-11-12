/** Short campus label for the selector: the part after " — " when the name
 * has one ("Grace East — Botany" → "Botany"), otherwise the full name. */
export function campusLabel(name: string) {
  const short = name.split(' — ')[1]?.trim();
  return short || name.trim() || 'Campus';
}
