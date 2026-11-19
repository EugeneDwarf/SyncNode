export function cleanUrl(url: string): string {
  if (!url) return '';
  return url.endsWith('/') ? url : url + '/';
}

export function normalizeUrl(url: string): string {
  let u = (url || '').trim();
  if (!u) return '';
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = 'https://' + u;
  }
  if (!u.endsWith('/')) {
    u += '/';
  }
  return u;
}

export function isAttachment(filePath: string): boolean {
  if (!filePath) return false;
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = filePath.slice(dotIdx + 1).toLowerCase();
  // Markdown notes and canvases are notes, not attachments
  if (ext === 'md' || ext === 'canvas') return false;
  return true;
}
