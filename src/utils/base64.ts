/**
 * Universal cross-platform Base64 encode/decode utility.
 * Works seamlessly in Node.js (desktop) and Browser/Webview (mobile).
 */

export function toBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64').toString('utf8');
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}
