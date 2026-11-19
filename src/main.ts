import { Notice, Plugin, requestUrl } from 'obsidian';
import { fetchRemoteTree, getAuthHeader, testWebDavConnection } from './api/webdav-client';
import { DEFAULT_SETTINGS } from './constants';
import { applyIngestionTemplate } from './engine/template-engine';
import { I18nKey, getTranslation } from './i18n';
import { ConfigTokenPayload, SyncNodeSettings, TestConnectionResult } from './types';
import { OnboardingModal } from './ui/onboarding-modal';
import { SyncNodeSettingTab } from './ui/settings-tab';
import { asyncPool } from './utils/async-pool';
import { fromBase64, toBase64 } from './utils/base64';
import { cleanUrl, isAttachment } from './utils/path';

export default class SyncNodePlugin extends Plugin {
  settings: SyncNodeSettings = DEFAULT_SETTINGS;
  isSyncing: boolean = false;
  private autoSyncTimerId: number | null = null;

  t(key: I18nKey, ...args: any[]): string {
    const lang = this.settings && this.settings.language === 'ru' ? 'ru' : 'en';
    return getTranslation(lang, key, ...args);
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.isSyncing = false;

    // Ribbon icon on the left sidebar
    this.addRibbonIcon('cloud-download', this.t('ribbonTitle'), () => {
      this.sync(false);
    });

    // Command palette: Sync now
    this.addCommand({
      id: 'syncnode-pull-now',
      name: this.t('cmdPullNow'),
      callback: () => this.sync(false)
    });

    // Command palette: Open Onboarding Wizard
    this.addCommand({
      id: 'syncnode-open-wizard',
      name: this.t('cmdOpenWizard'),
      callback: () => {
        new OnboardingModal(this.app, this).open();
      }
    });

    // Settings tab
    this.addSettingTab(new SyncNodeSettingTab(this.app, this));

    // Auto-sync timer
    this.startAutoSync();

    // Auto-launch Onboarding Wizard on first run if not configured
    if (!this.settings.isConfigured && !this.settings.webdavUrl) {
      setTimeout(() => {
        new OnboardingModal(this.app, this).open();
      }, 700);
    } else if (this.settings.syncOnStartup) {
      // Sync on startup (after 3 seconds)
      setTimeout(() => {
        this.sync(true);
      }, 3000);
    }
  }

  onunload(): void {
    this.stopAutoSync();
  }

  startAutoSync(): void {
    this.stopAutoSync();
    if (this.settings.syncInterval > 0) {
      const ms = this.settings.syncInterval * 60 * 1000;
      const timerId = window.setInterval(() => {
        this.sync(true);
      }, ms);
      this.autoSyncTimerId = timerId;
      // Obsidian API lifecycle registration
      this.registerInterval(timerId);
    }
  }

  stopAutoSync(): void {
    if (this.autoSyncTimerId !== null) {
      window.clearInterval(this.autoSyncTimerId);
      this.autoSyncTimerId = null;
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.startAutoSync();
  }

  getAuthHeader(): string {
    return getAuthHeader(this.settings.username, this.settings.password);
  }

  exportConfigToken(): string {
    const payload: ConfigTokenPayload = {
      v: 1,
      language: this.settings.language || 'en',
      webdavUrl: this.settings.webdavUrl || '',
      username: this.settings.username || '',
      password: this.settings.password || '',
      targetFolder: this.settings.targetFolder || 'Notes',
      useDedicatedAttachments: this.settings.useDedicatedAttachments ?? false,
      attachmentsFolder: this.settings.attachmentsFolder || 'Notes/attachments',
      syncInterval: this.settings.syncInterval ?? 5,
      syncOnStartup: this.settings.syncOnStartup ?? true,
      notifyOnSync: this.settings.notifyOnSync ?? true,
      enableTemplate: this.settings.enableTemplate ?? false,
      noteTemplate: this.settings.noteTemplate ?? ''
    };
    return 'syncnode://' + toBase64(JSON.stringify(payload));
  }

  async importConfigToken(tokenString: string): Promise<boolean> {
    if (!tokenString || typeof tokenString !== 'string') {
      throw new Error(this.t('noticeImportEmpty'));
    }
    let clean = tokenString.trim();
    if (clean.startsWith('syncnode://')) {
      clean = clean.slice('syncnode://'.length);
    }

    let jsonStr: string;
    try {
      jsonStr = fromBase64(clean);
    } catch {
      throw new Error('Invalid Base64 token encoding');
    }

    let data: Partial<ConfigTokenPayload>;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      throw new Error('Invalid JSON structure inside token');
    }

    if (typeof data !== 'object' || data === null) {
      throw new Error('Corrupted settings data');
    }

    if (typeof data.language === 'string') this.settings.language = data.language;
    if (typeof data.webdavUrl === 'string') this.settings.webdavUrl = data.webdavUrl;
    if (typeof data.username === 'string') this.settings.username = data.username;
    if (typeof data.password === 'string') this.settings.password = data.password;
    if (typeof data.targetFolder === 'string') this.settings.targetFolder = data.targetFolder;
    if (typeof data.useDedicatedAttachments === 'boolean')
      this.settings.useDedicatedAttachments = data.useDedicatedAttachments;
    if (typeof data.attachmentsFolder === 'string')
      this.settings.attachmentsFolder = data.attachmentsFolder;
    if (typeof data.syncInterval === 'number') this.settings.syncInterval = data.syncInterval;
    if (typeof data.syncOnStartup === 'boolean') this.settings.syncOnStartup = data.syncOnStartup;
    if (typeof data.notifyOnSync === 'boolean') this.settings.notifyOnSync = data.notifyOnSync;
    if (typeof data.enableTemplate === 'boolean') this.settings.enableTemplate = data.enableTemplate;
    if (typeof data.noteTemplate === 'string') this.settings.noteTemplate = data.noteTemplate;
    this.settings.isConfigured = true;

    await this.saveSettings();
    return true;
  }

  async testConnection(
    customConfig: Partial<SyncNodeSettings> | null = null
  ): Promise<TestConnectionResult> {
    const config = customConfig || this.settings;
    return testWebDavConnection(
      config.webdavUrl || '',
      config.username,
      config.password,
      (key, ...args) => this.t(key, ...args)
    );
  }

  async ensureDirectory(dirPath: string): Promise<void> {
    if (!dirPath || dirPath === '.' || dirPath === '/') return;
    const adapter = this.app.vault.adapter;
    const parts = dirPath.split('/').filter((p) => p.length > 0);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const exists = await adapter.exists(current);
      if (!exists) {
        await adapter.mkdir(current);
      }
    }
  }

  async sync(isBackground: boolean = false): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    const targetFolder = (this.settings.targetFolder || 'Notes').replace(/^\/+|\/+$/g, '');
    const baseUrl = cleanUrl(this.settings.webdavUrl);

    if (!baseUrl || !this.settings.username || !this.settings.password) {
      if (!isBackground) {
        new Notice(this.t('noticeConfigMissing'));
      }
      this.isSyncing = false;
      return;
    }

    if (!isBackground && this.settings.notifyOnSync) {
      new Notice(this.t('noticeChecking'));
    }

    let downloadedCount = 0;
    const adapter = this.app.vault.adapter;

    try {
      // 1. Ensure target base directory exists
      await this.ensureDirectory(targetFolder);

      // Ensure dedicated attachments directory exists if enabled
      if (this.settings.useDedicatedAttachments) {
        const attachDir = (this.settings.attachmentsFolder || 'Notes/attachments')
          .trim()
          .replace(/^\/+|\/+$/g, '');
        if (attachDir) {
          await this.ensureDirectory(attachDir);
        }
      }

      // 2. Fetch remote file tree
      const remoteFiles = await fetchRemoteTree(baseUrl, this.getAuthHeader());

      if (remoteFiles.length === 0) {
        if (!isBackground && this.settings.notifyOnSync) {
          new Notice(this.t('noticeNoFiles'));
        }
        this.isSyncing = false;
        return;
      }

      // 3. Download files with concurrency pool (5 parallel streams)
      const CONCURRENCY_LIMIT = 5;

      await asyncPool(CONCURRENCY_LIMIT, remoteFiles, async (remote) => {
        let localPath: string;
        const isAtt = isAttachment(remote.relPath);

        if (this.settings.useDedicatedAttachments && isAtt) {
          const attachDir = (this.settings.attachmentsFolder || 'Notes/attachments')
            .trim()
            .replace(/^\/+|\/+$/g, '');
          const fileName = remote.relPath.split('/').pop() || 'attachment';
          localPath = `${attachDir}/${fileName}`;
        } else {
          localPath = `${targetFolder}/${remote.relPath}`;
        }

        let needDownload = false;
        let isNewFile = false;

        const exists = await adapter.exists(localPath);
        if (!exists) {
          needDownload = true;
          isNewFile = true;
        } else {
          try {
            const stat = await adapter.stat(localPath);
            if (stat) {
              if (remote.mtime > 0 && remote.mtime > stat.mtime + 2000) {
                needDownload = true;
              } else if (remote.size > 0 && stat.size !== remote.size) {
                needDownload = true;
              }
            }
          } catch {
            needDownload = true;
          }
        }

        if (!needDownload) return;

        try {
          const downloadUrl = baseUrl + encodeURI(remote.relPath);
          const auth = this.getAuthHeader();
          const headers: Record<string, string> = {};
          if (auth) headers['Authorization'] = auth;

          const res = await requestUrl({
            url: downloadUrl,
            method: 'GET',
            headers: headers
          });

          if (res.status === 200 && res.arrayBuffer) {
            // Ensure parent directory exists
            const lastSlash = localPath.lastIndexOf('/');
            if (lastSlash !== -1) {
              await this.ensureDirectory(localPath.slice(0, lastSlash));
            }

            const isMd = localPath.toLowerCase().endsWith('.md');
            if (isNewFile && isMd && this.settings.enableTemplate && this.settings.noteTemplate) {
              try {
                const rawText = new TextDecoder('utf-8').decode(res.arrayBuffer);
                const fileName = localPath.split('/').pop() || 'Untitled';
                const formattedText = applyIngestionTemplate(rawText, {
                  template: this.settings.noteTemplate,
                  filename: fileName,
                  remoteMtime: remote.mtime,
                  now: new Date()
                });
                await adapter.write(localPath, formattedText);
              } catch (tplErr) {
                console.warn('[SyncNode] Template engine error, fallback to raw write:', tplErr);
                await adapter.writeBinary(localPath, res.arrayBuffer);
              }
            } else {
              await adapter.writeBinary(localPath, res.arrayBuffer);
            }
            downloadedCount++;
          }
        } catch (downloadErr) {
          console.error(`[SyncNode] Failed to download remote file ${remote.relPath}:`, downloadErr);
        }
      });

      if (downloadedCount > 0) {
        new Notice(this.t('noticeDownloaded', downloadedCount));
      } else if (!isBackground && this.settings.notifyOnSync) {
        new Notice(this.t('noticeUpToDate'));
      }
    } catch (err: any) {
      console.error('[SyncNode] Sync failed:', err);
      if (!isBackground) {
        new Notice(this.t('noticeSyncError', err.message || err));
      }
    } finally {
      this.isSyncing = false;
    }
  }
}
