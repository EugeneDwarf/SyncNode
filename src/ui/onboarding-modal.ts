import { App, Modal, Notice, Plugin, Setting } from 'obsidian';
import { I18nKey, getTranslation } from '../i18n';
import { SupportedLanguage, SyncNodeSettings, TestConnectionResult } from '../types';
import { normalizeUrl } from '../utils/path';

export interface ISyncNodePlugin extends Plugin {
  settings: SyncNodeSettings;
  saveSettings(): Promise<void>;
  testConnection(customConfig?: Partial<SyncNodeSettings> | null): Promise<TestConnectionResult>;
  importConfigToken(tokenString: string): Promise<boolean>;
  exportConfigToken(): string;
  sync(isBackground?: boolean): Promise<void>;
  t(key: I18nKey, ...args: any[]): string;
}

export class OnboardingModal extends Modal {
  plugin: ISyncNodePlugin;
  step: number;
  selectedPreset: string;
  testResult: TestConnectionResult | null;
  isTesting: boolean;
  draft: {
    language: SupportedLanguage;
    webdavUrl: string;
    username: string;
    password: string;
    targetFolder: string;
    useDedicatedAttachments: boolean;
    attachmentsFolder: string;
  };

  constructor(app: App, plugin: ISyncNodePlugin) {
    super(app);
    this.plugin = plugin;
    this.step = 1;
    this.selectedPreset = 'sftpgo';
    this.testResult = null;
    this.isTesting = false;

    this.draft = {
      language: this.plugin.settings.language || 'en',
      webdavUrl: this.plugin.settings.webdavUrl || '',
      username: this.plugin.settings.username || '',
      password: this.plugin.settings.password || '',
      targetFolder: this.plugin.settings.targetFolder || 'Notes',
      useDedicatedAttachments: this.plugin.settings.useDedicatedAttachments ?? false,
      attachmentsFolder: this.plugin.settings.attachmentsFolder || 'Notes/attachments'
    };
  }

  t(key: I18nKey, ...args: any[]): string {
    return getTranslation(this.draft.language || 'en', key, ...args);
  }

  onOpen(): void {
    this.modalEl.style.maxWidth = '640px';
    this.modalEl.style.width = '95%';
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  render(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Top Header: Title and Language Switcher
    const headerEl = contentEl.createDiv({ cls: 'syncnode-wizard-header' });
    headerEl.style.display = 'flex';
    headerEl.style.justifyContent = 'space-between';
    headerEl.style.alignItems = 'center';
    headerEl.style.marginBottom = '1.2rem';
    headerEl.style.paddingBottom = '0.6rem';
    headerEl.style.borderBottom = '1px solid var(--background-modifier-border)';

    const titleEl = headerEl.createEl('h2', { text: this.t('wizardTitle') });
    titleEl.style.margin = '0';
    titleEl.style.fontSize = '1.35rem';

    const langToggleEl = headerEl.createDiv();
    const langSelect = langToggleEl.createEl('select');
    langSelect.style.padding = '4px 8px';
    langSelect.style.borderRadius = '4px';
    langSelect.style.background = 'var(--background-secondary)';
    langSelect.style.color = 'var(--text-normal)';
    langSelect.style.border = '1px solid var(--background-modifier-border)';

    langSelect.createEl('option', { text: '🇬🇧 English', value: 'en' });
    langSelect.createEl('option', { text: '🇷🇺 Русский', value: 'ru' });
    langSelect.value = this.draft.language;
    langSelect.addEventListener('change', async (e: Event) => {
      const val = (e.target as HTMLSelectElement).value as SupportedLanguage;
      this.draft.language = val;
      this.plugin.settings.language = val;
      await this.plugin.saveSettings();
      this.render();
    });

    // Step Progress Bar
    const progressContainer = contentEl.createDiv({ cls: 'syncnode-wizard-progress-wrap' });
    progressContainer.style.marginBottom = '1.4rem';

    const progressBar = progressContainer.createDiv({ cls: 'syncnode-wizard-progress' });
    progressBar.style.display = 'flex';
    progressBar.style.gap = '8px';
    progressBar.style.marginBottom = '6px';

    for (let i = 1; i <= 4; i++) {
      const stepDot = progressBar.createDiv();
      stepDot.style.flex = '1';
      stepDot.style.height = '4px';
      stepDot.style.borderRadius = '2px';
      stepDot.style.backgroundColor =
        i <= this.step ? 'var(--interactive-accent)' : 'var(--background-modifier-border)';
      stepDot.style.transition = 'background-color 0.2s ease';
    }

    const stepLabel = progressContainer.createEl('div', {
      text: `${this.draft.language === 'ru' ? 'Шаг' : 'Step'} ${this.step} / 4`
    });
    stepLabel.style.fontSize = '0.8rem';
    stepLabel.style.color = 'var(--text-muted)';
    stepLabel.style.textAlign = 'right';

    // Step Body Container
    const bodyEl = contentEl.createDiv({ cls: 'syncnode-wizard-body' });
    bodyEl.style.minHeight = '260px';

    if (this.step === 1) {
      this.renderStep1(bodyEl);
    } else if (this.step === 2) {
      this.renderStep2(bodyEl);
    } else if (this.step === 3) {
      this.renderStep3(bodyEl);
    } else if (this.step === 4) {
      this.renderStep4(bodyEl);
    }

    // Modal Footer Navigation
    const footerEl = contentEl.createDiv({ cls: 'syncnode-wizard-footer' });
    footerEl.style.display = 'flex';
    footerEl.style.justifyContent = 'space-between';
    footerEl.style.alignItems = 'center';
    footerEl.style.marginTop = '1.5rem';
    footerEl.style.paddingTop = '1rem';
    footerEl.style.borderTop = '1px solid var(--background-modifier-border)';

    // Left navigation action
    const leftActions = footerEl.createDiv();
    if (this.step > 1) {
      const backBtn = leftActions.createEl('button', { text: this.t('wizardBtnBack') });
      backBtn.addEventListener('click', () => {
        this.step--;
        this.render();
      });
    } else {
      const skipBtn = leftActions.createEl('button', { text: this.t('wizardBtnSkip') });
      skipBtn.style.opacity = '0.7';
      skipBtn.addEventListener('click', () => {
        this.close();
      });
    }

    // Right navigation action
    const rightActions = footerEl.createDiv();
    if (this.step < 4) {
      const nextBtn = rightActions.createEl('button', {
        text: this.t('wizardBtnNext'),
        cls: 'mod-cta'
      });
      nextBtn.addEventListener('click', () => {
        if (this.step === 2) {
          this.draft.webdavUrl = normalizeUrl(this.draft.webdavUrl);
        }
        this.step++;
        this.render();
      });
    } else {
      const finishBtn = rightActions.createEl('button', {
        text: this.t('wizardBtnFinish'),
        cls: 'mod-cta'
      });
      finishBtn.addEventListener('click', async () => {
        await this.finishWizard();
      });
    }
  }

  renderStep1(container: HTMLElement): void {
    container.createEl('h3', { text: this.t('wizardStep1Title') });
    container.createEl('p', { text: this.t('wizardStep1Desc'), cls: 'setting-item-description' });

    const presets = [
      {
        id: 'sftpgo',
        title: this.t('wizardPresetSftpgo'),
        desc: this.t('wizardPresetSftpgoDesc'),
        tpl: 'https://your-server.com/webdav/'
      },
      {
        id: 'nextcloud',
        title: this.t('wizardPresetNextcloud'),
        desc: this.t('wizardPresetNextcloudDesc'),
        tpl: 'https://cloud.example.com/remote.php/dav/files/USER/'
      },
      {
        id: 'synology',
        title: this.t('wizardPresetSynology'),
        desc: this.t('wizardPresetSynologyDesc'),
        tpl: 'https://nas.example.com:5006/home/'
      },
      {
        id: 'custom',
        title: this.t('wizardPresetCustom'),
        desc: this.t('wizardPresetCustomDesc'),
        tpl: 'https://'
      }
    ];

    const cardsContainer = container.createDiv();
    cardsContainer.style.display = 'grid';
    cardsContainer.style.gridTemplateColumns = '1fr 1fr';
    cardsContainer.style.gap = '10px';
    cardsContainer.style.marginTop = '12px';

    presets.forEach((p) => {
      const isSelected = this.selectedPreset === p.id;
      const card = cardsContainer.createDiv({ cls: 'syncnode-preset-card' });
      card.style.padding = '12px';
      card.style.borderRadius = '6px';
      card.style.cursor = 'pointer';
      card.style.border = isSelected
        ? '2px solid var(--interactive-accent)'
        : '1px solid var(--background-modifier-border)';
      card.style.background = isSelected
        ? 'var(--background-primary-alt)'
        : 'var(--background-secondary)';
      card.style.transition = 'all 0.15s ease';

      const title = card.createEl('div', { text: p.title });
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '4px';

      const desc = card.createEl('div', { text: p.desc });
      desc.style.fontSize = '0.78rem';
      desc.style.color = 'var(--text-muted)';

      card.addEventListener('click', () => {
        this.selectedPreset = p.id;
        if (
          !this.draft.webdavUrl ||
          this.draft.webdavUrl === 'https://' ||
          this.draft.webdavUrl.includes('your-server.com') ||
          this.draft.webdavUrl.includes('cloud.example.com') ||
          this.draft.webdavUrl.includes('nas.example.com:5006')
        ) {
          this.draft.webdavUrl = p.tpl;
        }
        this.render();
      });
    });
  }

  renderStep2(container: HTMLElement): void {
    container.createEl('h3', { text: this.t('wizardStep2Title') });
    container.createEl('p', { text: this.t('wizardStep2Desc'), cls: 'setting-item-description' });

    new Setting(container)
      .setName(this.t('webdavUrlName'))
      .setDesc(this.t('wizardUrlHint'))
      .addText((text) =>
        text
          .setPlaceholder('https://your-server.com/webdav/')
          .setValue(this.draft.webdavUrl)
          .onChange((val) => {
            this.draft.webdavUrl = val.trim();
          })
      );

    new Setting(container)
      .setName(this.t('usernameName'))
      .setDesc(this.t('usernameDesc'))
      .addText((text) =>
        text
          .setPlaceholder('username')
          .setValue(this.draft.username)
          .onChange((val) => {
            this.draft.username = val.trim();
          })
      );

    new Setting(container)
      .setName(this.t('passwordName'))
      .setDesc(this.t('passwordDesc'))
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('••••••••••••')
          .setValue(this.draft.password)
          .onChange((val) => {
            this.draft.password = val;
          });
      });

    // 1-Click Import Token Expandable Box
    const importWrap = container.createDiv();
    importWrap.style.marginTop = '16px';
    importWrap.style.padding = '10px 14px';
    importWrap.style.background = 'var(--background-secondary)';
    importWrap.style.borderRadius = '6px';
    importWrap.style.border = '1px dashed var(--background-modifier-border)';

    let tokenInput = '';
    new Setting(importWrap)
      .setName(this.t('wizardImportTokenBtn'))
      .setDesc(this.t('importDesc'))
      .addText((t) =>
        t.setPlaceholder('syncnode://...').onChange((v) => {
          tokenInput = v;
        })
      )
      .addButton((btn) =>
        btn.setButtonText(this.t('importBtn')).onClick(async () => {
          if (!tokenInput.trim()) {
            new Notice(this.t('noticeImportEmpty'));
            return;
          }
          try {
            await this.plugin.importConfigToken(tokenInput);
            this.draft.webdavUrl = this.plugin.settings.webdavUrl;
            this.draft.username = this.plugin.settings.username;
            this.draft.password = this.plugin.settings.password;
            new Notice(this.t('noticeImportSuccess'));
            this.render();
          } catch (e: any) {
            new Notice(this.t('noticeImportError', e.message));
          }
        })
      );
  }

  renderStep3(container: HTMLElement): void {
    container.createEl('h3', { text: this.t('wizardStep3Title') });
    container.createEl('p', { text: this.t('wizardStep3Desc'), cls: 'setting-item-description' });

    const reviewBox = container.createDiv();
    reviewBox.style.padding = '12px 16px';
    reviewBox.style.borderRadius = '6px';
    reviewBox.style.background = 'var(--background-secondary)';
    reviewBox.style.marginBottom = '16px';

    const cleanU = normalizeUrl(this.draft.webdavUrl);
    reviewBox.createEl('div', { text: `🔗 URL: ${cleanU || '(not specified)'}` });
    const userDiv = reviewBox.createEl('div', {
      text: `👤 User: ${this.draft.username || '(not specified)'}`
    });
    userDiv.style.marginTop = '4px';

    const testBtnContainer = container.createDiv();
    testBtnContainer.style.textAlign = 'center';
    testBtnContainer.style.margin = '16px 0';

    const testButton = testBtnContainer.createEl('button', {
      text: this.isTesting ? this.t('testConnTesting') : this.t('testConnBtn'),
      cls: 'mod-cta'
    });
    testButton.style.padding = '8px 24px';
    testButton.disabled = this.isTesting;

    testButton.addEventListener('click', async () => {
      this.isTesting = true;
      this.testResult = null;
      this.render();

      this.draft.webdavUrl = cleanU;
      const res = await this.plugin.testConnection(this.draft);
      this.isTesting = false;
      this.testResult = res;
      this.render();
    });

    if (this.testResult) {
      const resultBox = container.createDiv();
      resultBox.style.padding = '12px 14px';
      resultBox.style.borderRadius = '6px';
      resultBox.style.marginTop = '12px';

      if (this.testResult.ok) {
        resultBox.style.background = 'rgba(74, 222, 128, 0.15)';
        resultBox.style.border = '1px solid rgba(74, 222, 128, 0.5)';
        resultBox.style.color = 'var(--text-normal)';
        resultBox.createEl('div', { text: `✅ ${this.t('wizardStep3Success')}` });
      } else {
        resultBox.style.background = 'rgba(239, 68, 68, 0.15)';
        resultBox.style.border = '1px solid rgba(239, 68, 68, 0.5)';
        resultBox.style.color = 'var(--text-normal)';
        resultBox.createEl('div', { text: `❌ ${this.testResult.message}` });
      }
    }
  }

  renderStep4(container: HTMLElement): void {
    container.createEl('h3', { text: this.t('wizardStep4Title') });
    container.createEl('p', { text: this.t('wizardStep4Desc'), cls: 'setting-item-description' });

    new Setting(container)
      .setName(this.t('targetFolderName'))
      .setDesc(this.t('wizardTargetFolderHint'))
      .addText((text) =>
        text
          .setPlaceholder('Notes')
          .setValue(this.draft.targetFolder)
          .onChange((val) => {
            this.draft.targetFolder = val.trim() || 'Notes';
          })
      );

    new Setting(container)
      .setName(this.t('useAttachName'))
      .setDesc(this.t('useAttachDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.draft.useDedicatedAttachments).onChange((val) => {
          this.draft.useDedicatedAttachments = val;
          this.render();
        })
      );

    if (this.draft.useDedicatedAttachments) {
      new Setting(container)
        .setName(this.t('attachPathName'))
        .setDesc(this.t('attachPathDesc'))
        .addText((text) =>
          text
            .setPlaceholder('Notes/attachments')
            .setValue(this.draft.attachmentsFolder)
            .onChange((val) => {
              this.draft.attachmentsFolder = val.trim() || 'Notes/attachments';
            })
        );
    }

    const summaryBox = container.createDiv();
    summaryBox.style.marginTop = '16px';
    summaryBox.style.padding = '12px 14px';
    summaryBox.style.background = 'var(--background-secondary)';
    summaryBox.style.borderRadius = '6px';
    summaryBox.style.border = '1px solid var(--background-modifier-border)';

    summaryBox.createEl('div', {
      text: `📥 ${this.draft.language === 'ru' ? 'Целевая папка' : 'Target folder'}: ${this.draft.targetFolder}/`
    });
    if (this.draft.useDedicatedAttachments) {
      const attDiv = summaryBox.createEl('div', {
        text: `🖼️ ${this.draft.language === 'ru' ? 'Вложения' : 'Attachments'}: ${this.draft.attachmentsFolder}/`
      });
      attDiv.style.marginTop = '4px';
    }
  }

  async finishWizard(): Promise<void> {
    this.draft.webdavUrl = normalizeUrl(this.draft.webdavUrl);
    Object.assign(this.plugin.settings, this.draft, { isConfigured: true });
    await this.plugin.saveSettings();
    new Notice(this.t('wizardCompleteNotice'));
    this.close();

    // Trigger initial pull
    setTimeout(() => {
      this.plugin.sync(false);
    }, 400);
  }
}
