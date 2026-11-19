import { TFile, Vault } from 'obsidian';
import { headRemoteFile, putRemoteFile } from '../api/webdav-client';
import { SyncNodeSettings, UploadResult } from '../types';
import { asyncPool } from '../utils/async-pool';
import { cleanUrl } from '../utils/path';

export function normalizePathSeparators(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/**
 * Strict security guard: verifies that a local vault file path is strictly inside the target folder.
 * Completely blocks directory traversal attempts and access to private vault areas.
 */
export function isPathInsideTarget(filePath: string, targetFolder: string): boolean {
  const normFile = normalizePathSeparators(filePath);
  const normTarget = normalizePathSeparators(targetFolder);

  if (!normFile || !normTarget) return false;
  // Disallow path traversal attempts
  if (normFile.includes('..') || normTarget.includes('..')) return false;

  return normFile === normTarget || normFile.startsWith(normTarget + '/');
}

/**
 * Determines appropriate MIME content type from filename extension.
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'md':
      return 'text/markdown; charset=utf-8';
    case 'txt':
      return 'text/plain; charset=utf-8';
    case 'json':
      return 'application/json; charset=utf-8';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'mp4':
      return 'video/mp4';
    case 'zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Calculates remote relative path from local vault path.
 * e.g., targetFolder: 'Notes', file: 'Notes/Work/doc.md' -> 'Work/doc.md'
 */
export function getRemoteRelPath(
  filePath: string,
  targetFolder: string,
  useDedicatedAttachments: boolean,
  attachmentsFolder: string
): string {
  const normFile = normalizePathSeparators(filePath);
  const normTarget = normalizePathSeparators(targetFolder);
  const normAttach = normalizePathSeparators(attachmentsFolder);

  // If dedicated attachments are enabled and file is inside attachments folder
  if (useDedicatedAttachments && normAttach && normFile.startsWith(normAttach + '/')) {
    const attachRel = normFile.slice(normAttach.length + 1);
    const attachBase = normAttach.split('/').pop() || 'attachments';
    return `${attachBase}/${attachRel}`;
  }

  if (normFile.startsWith(normTarget + '/')) {
    return normFile.slice(normTarget.length + 1);
  }

  return normFile;
}

/**
 * Uploads a single file to WebDAV with conflict and scope checks.
 */
export async function uploadSingleFile(
  vault: Vault,
  file: TFile,
  settings: SyncNodeSettings,
  authHeader: string
): Promise<UploadResult> {
  if (!settings.enableUpload) {
    return {
      ok: false,
      status: 'error',
      relPath: file.path,
      error: 'Upload feature is disabled in settings'
    };
  }

  // 1. Strict security boundary check
  const isTarget = isPathInsideTarget(file.path, settings.targetFolder);
  const isAttach =
    settings.useDedicatedAttachments &&
    isPathInsideTarget(file.path, settings.attachmentsFolder);

  if (!isTarget && !isAttach) {
    return {
      ok: false,
      status: 'error',
      relPath: file.path,
      error: `Security Guard: file "${file.path}" is outside target folder "${settings.targetFolder}"`
    };
  }

  const baseUrl = cleanUrl(settings.webdavUrl);
  if (!baseUrl) {
    return {
      ok: false,
      status: 'error',
      relPath: file.path,
      error: 'WebDAV URL is not configured'
    };
  }

  const relPath = getRemoteRelPath(
    file.path,
    settings.targetFolder,
    settings.useDedicatedAttachments,
    settings.attachmentsFolder
  );

  try {
    // 2. Query remote file metadata via HEAD / PROPFIND
    const remoteHead = await headRemoteFile(baseUrl, authHeader, relPath);

    if (remoteHead.exists) {
      const localMtime = file.stat.mtime;
      const remoteMtime = remoteHead.mtime;
      const delta = remoteMtime - localMtime;

      // If remote file is newer by more than 2000ms
      if (delta > 2000) {
        if (settings.conflictStrategy === 'skip') {
          return {
            ok: true,
            status: 'skipped',
            relPath,
            conflict: true,
            error: 'Remote version is newer; skipped upload'
          };
        }

        if (settings.conflictStrategy === 'rename_conflict') {
          // Create local conflict backup before pushing
          const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const ext = file.extension ? `.${file.extension}` : '';
          const baseName = file.basename;
          const parentDir = file.parent ? file.parent.path : '';
          const conflictPath = parentDir
            ? `${parentDir}/${baseName} (local conflict ${nowStr})${ext}`
            : `${baseName} (local conflict ${nowStr})${ext}`;

          const existingBytes = await vault.readBinary(file);
          await vault.createBinary(conflictPath, existingBytes);
        }
      }
    }

    // 3. Read local binary content
    const binaryData = await vault.readBinary(file);
    const contentType = getMimeType(file.name);

    // 4. PUT request to WebDAV
    const putRes = await putRemoteFile(baseUrl, authHeader, relPath, binaryData, contentType);

    if (putRes.ok) {
      return {
        ok: true,
        status: 'uploaded',
        relPath,
        bytesUploaded: binaryData.byteLength
      };
    }

    return {
      ok: false,
      status: 'error',
      relPath,
      error: putRes.error || `HTTP ${putRes.status}`
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'error',
      relPath,
      error: err && err.message ? err.message : String(err)
    };
  }
}

/**
 * Scans local target folder and uploads modified or new files to WebDAV server in 5 parallel streams.
 */
export async function syncLocalFolderToRemote(
  vault: Vault,
  settings: SyncNodeSettings,
  authHeader: string
): Promise<UploadResult[]> {
  if (!settings.enableUpload) return [];

  const targetNorm = normalizePathSeparators(settings.targetFolder);
  const attachNorm = settings.useDedicatedAttachments
    ? normalizePathSeparators(settings.attachmentsFolder)
    : '';

  // Collect all files inside targetFolder and attachmentsFolder
  const allFiles = vault.getFiles();
  const eligibleFiles: TFile[] = [];

  for (const file of allFiles) {
    const isTarget = isPathInsideTarget(file.path, targetNorm);
    const isAttach = attachNorm && isPathInsideTarget(file.path, attachNorm);
    if (isTarget || isAttach) {
      eligibleFiles.push(file);
    }
  }

  if (eligibleFiles.length === 0) return [];

  const CONCURRENCY_LIMIT = 5;
  const results: UploadResult[] = [];

  await asyncPool(CONCURRENCY_LIMIT, eligibleFiles, async (file) => {
    const res = await uploadSingleFile(vault, file, settings, authHeader);
    results.push(res);
  });

  return results;
}
