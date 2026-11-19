import { requestUrl } from 'obsidian';
import { RemoteFile, TestConnectionResult, WebDavItem } from '../types';
import { toBase64 } from '../utils/base64';
import { cleanUrl } from '../utils/path';

export function getAuthHeader(username?: string, password?: string): string {
  if (!username || !password) return '';
  return 'Basic ' + toBase64(`${username}:${password}`);
}

export function parsePropfindXml(xmlText: string): WebDavItem[] {
  const items: WebDavItem[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');

    // Universal namespace-safe response node matching
    const allElements = doc.getElementsByTagName('*');
    const responses: Element[] = [];
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (el.localName && el.localName.toLowerCase() === 'response') {
        responses.push(el);
      }
    }

    for (const resp of responses) {
      let href = '';
      let isCollection = false;
      let mtime = 0;
      let size = 0;

      const children = resp.getElementsByTagName('*');
      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        const tag = (child.localName || child.tagName || '').toLowerCase();

        if (tag === 'href' && !href && child.textContent) {
          href = decodeURIComponent(child.textContent.trim());
        } else if (tag === 'collection') {
          isCollection = true;
        } else if (tag === 'getlastmodified' && child.textContent) {
          const parsedDate = new Date(child.textContent).getTime();
          if (Number.isFinite(parsedDate)) {
            mtime = parsedDate;
          }
        } else if (tag === 'getcontentlength' && child.textContent) {
          size = parseInt(child.textContent, 10) || 0;
        }
      }

      if (href) {
        items.push({
          href,
          isCollection,
          mtime,
          size
        });
      }
    }
  } catch (e) {
    console.error('[SyncNode] Error parsing WebDAV XML:', e);
  }
  return items;
}

export async function fetchRemoteTree(
  baseUrl: string,
  authHeader: string,
  subPath: string = ''
): Promise<RemoteFile[]> {
  const files: RemoteFile[] = [];
  const headers: Record<string, string> = { Depth: '1' };
  if (authHeader) headers['Authorization'] = authHeader;

  const fullUrl = cleanUrl(baseUrl + (subPath ? encodeURI(subPath) : ''));

  let res;
  try {
    res = await requestUrl({
      url: fullUrl,
      method: 'PROPFIND',
      headers: headers
    });
  } catch (e) {
    console.warn(`[SyncNode] PROPFIND failed for ${fullUrl}:`, e);
    return files;
  }

  if (res.status !== 207 && res.status !== 200) {
    return files;
  }

  const items = parsePropfindXml(res.text);
  const parsedBase = new URL(baseUrl);
  const basePathName = decodeURIComponent(
    parsedBase.pathname.endsWith('/') ? parsedBase.pathname : parsedBase.pathname + '/'
  );

  for (const item of items) {
    let rel = item.href;

    // Handle full URL hrefs (e.g. Nextcloud)
    if (rel.startsWith('http://') || rel.startsWith('https://')) {
      try {
        const itemUrl = new URL(rel);
        rel = decodeURIComponent(itemUrl.pathname);
      } catch {
        // fallback to string slicing
      }
    }

    if (rel.startsWith(basePathName)) {
      rel = rel.slice(basePathName.length);
    } else if (rel.startsWith('/')) {
      const idx = rel.indexOf(basePathName);
      if (idx !== -1) rel = rel.slice(idx + basePathName.length);
    }

    rel = rel.replace(/^\/+|\/+$/g, '');
    if (!rel || rel === subPath.replace(/^\/+|\/+$/g, '')) {
      // Skip current directory itself
      continue;
    }

    if (item.isCollection) {
      // Recurse into collection
      const subFiles = await fetchRemoteTree(baseUrl, authHeader, rel);
      files.push(...subFiles);
    } else {
      files.push({
        relPath: rel,
        mtime: item.mtime,
        size: item.size
      });
    }
  }

  return files;
}

export async function testWebDavConnection(
  webdavUrl: string,
  username?: string,
  password?: string,
  t?: (key: any, ...args: any[]) => string
): Promise<TestConnectionResult> {
  const tr = t || ((k) => String(k));
  const baseUrl = cleanUrl(webdavUrl);

  if (!baseUrl) {
    return { ok: false, message: tr('diagMissingUrl') };
  }
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    return { ok: false, message: tr('diagMissingProto') };
  }
  if (!username || !password) {
    return { ok: false, message: tr('diagMissingCreds') };
  }

  const auth = getAuthHeader(username, password);
  const headers = { Depth: '0', Authorization: auth };

  try {
    const res = await requestUrl({
      url: baseUrl,
      method: 'PROPFIND',
      headers: headers
    });

    if (res.status === 207 || res.status === 200) {
      return { ok: true, status: res.status, message: tr('diagSuccess') };
    } else if (res.status === 401) {
      return { ok: false, status: res.status, message: tr('diag401') };
    } else if (res.status === 403) {
      return { ok: false, status: res.status, message: tr('diag403') };
    } else if (res.status === 404) {
      return { ok: false, status: res.status, message: tr('diag404') };
    } else if (res.status === 405) {
      return { ok: false, status: res.status, message: tr('diag405') };
    } else {
      return { ok: false, status: res.status, message: tr('diagHttpCode', res.status) };
    }
  } catch (err: any) {
    const status = err && err.status;
    const msg = err && (err.message || err.toString());
    if (status === 401) {
      return { ok: false, status: 401, message: tr('diag401') };
    } else if (status === 403) {
      return { ok: false, status: 403, message: tr('diag403') };
    } else if (status === 404) {
      return { ok: false, status: 404, message: tr('diag404') };
    } else if (status === 405) {
      return { ok: false, status: 405, message: tr('diag405') };
    } else if (status) {
      return { ok: false, status: status, message: tr('diagServerErr', status, msg) };
    }
    return { ok: false, message: tr('diagConnErr', msg) };
  }
}
