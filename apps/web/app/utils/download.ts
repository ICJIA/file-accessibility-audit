/**
 * Native anchor-download helper — replaces the `file-saver` dependency
 * (Task F5). Triggers a browser download for an in-memory Blob: create an
 * object URL, click a detached `<a download>`, then revoke the URL.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
