// utils.js — Shared pure helpers (no imports, safe for any module to depend on)

// Escape a string for safe interpolation into innerHTML / attribute contexts.
// MUST wrap any untrusted value (file names, EXIF metadata, ZIP entries, error
// messages) before concatenating into HTML strings.
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
