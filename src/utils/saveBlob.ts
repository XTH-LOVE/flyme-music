import { isTauri } from '@/lib/apiTransport';

/**
 * Writes a blob to a file the user can find.
 *
 * Three paths, because the three platforms disagree about what saving means:
 *
 *  - **Packaged app**: the OS is asked to write it. There is no share sheet,
 *    and `<a download>` is dropped by the WebView, so the only route that works
 *    is through the bridge - the same `save_image_base64` the share cards use,
 *    which takes any bytes despite the name.
 *  - **Mobile browser**: Web Share, because iOS Safari ignores `a[download]`
 *    entirely and Android is unreliable about it.
 *  - **Desktop browser**: a download.
 *
 * This is the shared helper rather than each caller's problem on purpose. It
 * used to have no packaged-app branch at all, and three callers - history
 * export, playlist export, backup - went through it and reported success while
 * writing nothing. The ones that worked had each grown their own Tauri branch.
 */
export async function saveFile(blob: Blob, fileName: string): Promise<void> {
  if (isTauri()) {
    const dataUrl = await blobToDataUrl(blob);
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke<string>('save_image_base64', { fileName, dataUrl });
    return;
  }

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

/** `save_image_base64` takes a data URL, so the blob has to become one. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(blob);
  });
}
