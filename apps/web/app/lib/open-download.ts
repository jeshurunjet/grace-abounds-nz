/** Opens a short-lived download link (separate so tests can observe it). */
export function openDownload(url: string) {
  window.location.assign(url);
}
