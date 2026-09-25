import { isTauri } from '@/lib/apiTransport';

/**
 * Asks the user for files, on either runtime.
 *
 * `<input type="file">` is the obvious way and the wrong one here. The packaged
 * Android app runs in a WebView that only opens a picker if the host implements
 * `onShowFileChooser`, and this one does not - so the control looked broken and
 * the feature it belonged to (importing local music, changing the avatar) could
 * not be used at all.
 *
 * In the packaged app the file is therefore chosen through the dialog plugin and
 * read through the fs plugin. Paths returned by the dialog are added to the fs
 * scope automatically, so no extra permission is needed to read what the user
 * just picked.
 *
 * The browser keeps the input, because there it is the thing that works - and
 * because a file picker that only functions in one of the two runtimes is
 * exactly the class of bug this exists to remove.
 */

export interface PickOptions {
  /** Comma-separated accept list, same syntax as the input attribute. */
  accept?: string;
  multiple?: boolean;
  /** Dialog title, packaged app only. */
  title?: string;
}

/** The extension of a path, lowercased and without the dot. */
function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * A mime type for the file, from its extension.
 *
 * The audio types are the ones this app imports; anything else falls back to
 * `application/octet-stream`, which is what the import path already treats as
 * "not audio" and skips.
 */
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export async function pickFiles(options: PickOptions = {}): Promise<File[]> {
  const { accept, multiple = false, title } = options;

  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');

    const picked = await open({
      multiple,
      title,
      // The dialog filters take bare extensions, not the `audio/*` syntax the
      // input attribute uses, so the accept string is translated rather than
      // passed through.
      filters: accept
        ? [
            {
              name: '文件',
              extensions: accept
                .split(',')
                .map((part) => part.trim().replace(/^\./, ''))
                .filter((part) => part && !part.includes('/')),
            },
          ]
        : undefined,
    });
    if (!picked) return [];
    const paths = Array.isArray(picked) ? picked : [picked];

    const files: File[] = [];
    for (const path of paths) {
      try {
        const bytes = await readFile(path);
        const name = path.split(/[\\/]/).pop() ?? 'file';
        files.push(new File([bytes], name, { type: MIME[extensionOf(path)] ?? '' }));
      } catch {
        // One unreadable file is not a reason to abandon the rest.
      }
    }
    return files;
  }

  // Browser: an input, clicked from inside the gesture that called this.
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);

    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };

    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    // Cancelling fires no change event in some browsers, so the promise would
    // never settle and the caller would stay in its loading state forever.
    input.addEventListener('cancel', () => finish([]));
    input.click();
  });
}
