/**
 * Mobile browsers ignore a[download] (iOS Safari entirely, Android WebView
 * inside Tauri as well), so offer the file through Web Share first.
 */
export async function saveBlobInBrowser(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}