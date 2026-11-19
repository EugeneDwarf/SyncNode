import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_NOTE_TEMPLATE_EN, DEFAULT_NOTE_TEMPLATE_RU } from '../constants';
import { I18nKey } from '../i18n';
import { ConflictStrategy, SupportedLanguage, UploadMode } from '../types';
import { ISyncNodePlugin, OnboardingModal } from './onboarding-modal';

export class SyncNodeSettingTab extends PluginSettingTab {
  plugin: ISyncNodePlugin;

  constructor(app: App, plugin: ISyncNodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  t(key: I18nKey, ...args: any[]): string {
    return this.plugin.t(key, ...args);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: this.t('tabTitle') });
    containerEl.createEl('p', {
      text: this.t('tabDesc')
    });

    // Prominent Onboarding Wizard button
    new Setting(containerEl)
      .setName(this.t('wizardBtnLaunch'))
      .setDesc(this.t('wizardLaunchDesc'))
      .addButton((button) => {
        button
          .setButtonText(this.t('wizardBtnLaunch'))
          .setCta()
          .onClick(() => {
            new OnboardingModal(this.app, this.plugin).open();
          });
      });

    new Setting(containerEl)
      .setName(this.t('langName'))
      .setDesc(this.t('langDesc'))
      .addDropdown((drop) =>
        drop
          .addOption('en', 'English')
          .addOption('ru', 'Русский')
          .setValue(this.plugin.settings.language || 'en')
          .onChange(async (value) => {
            this.plugin.settings.language = value as SupportedLanguage;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(this.t('webdavUrlName'))
      .setDesc(this.t('webdavUrlDesc'))
      .addText((text) =>
        text
          .setPlaceholder('https://your-webdav-server.com/webdav/')
          .setValue(this.plugin.settings.webdavUrl)
          .onChange(async (value) => {
            this.plugin.settings.webdavUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.t('usernameName'))
      .setDesc(this.t('usernameDesc'))
      .addText((text) =>
        text
          .setPlaceholder('username')
          .setValue(this.plugin.settings.username)
          .onChange(async (value) => {
            this.plugin.settings.username = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.t('passwordName'))
      .setDesc(this.t('passwordDesc'))
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('••••••••••••')
          .setValue(this.plugin.settings.password)
          .onChange(async (value) => {
            this.plugin.settings.password = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(this.t('testConnName'))
      .setDesc(this.t('testConnDesc'))
      .addButton((button) => {
        button
          .setButtonText(this.t('testConnBtn'))
          .setCta()
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText(this.t('testConnTesting'));
            try {
              const res = await this.plugin.testConnection();
              if (res.ok) {
                new Notice(`SyncNode: ✅ ${res.message}`, 6000);
              } else {
                new Notice(`SyncNode: ❌ ${res.message}`, 8000);
              }
            } finally {
              button.setDisabled(false);
              button.setButtonText(this.t('testConnBtn'));
            }
          });
      });

    new Setting(containerEl)
      .setName(this.t('targetFolderName'))
      .setDesc(this.t('targetFolderDesc'))
      .addText((text) =>
        text
          .setPlaceholder('Notes')
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value) => {
            this.plugin.settings.targetFolder = value.trim() || 'Notes';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.t('useAttachName'))
      .setDesc(this.t('useAttachDesc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useDedicatedAttachments)
          .onChange(async (value) => {
            this.plugin.settings.useDedicatedAttachments = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.useDedicatedAttachments) {
      new Setting(containerEl)
        .setName(this.t('attachPathName'))
        .setDesc(this.t('attachPathDesc'))
        .addText((text) =>
          text
            .setPlaceholder('Notes/attachments')
            .setValue(this.plugin.settings.attachmentsFolder)
            .onChange(async (value) => {
              this.plugin.settings.attachmentsFolder = value.trim() || 'Notes/attachments';
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName(this.t('intervalName'))
      .setDesc(this.t('intervalDesc'))
      .addSlider((slider) =>
        slider
          .setLimits(0, 60, 1)
          .setValue(this.plugin.settings.syncInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.syncInterval = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.t('startupName'))
      .setDesc(this.t('startupDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => {
          this.plugin.settings.syncOnStartup = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(this.t('notifyName'))
      .setDesc(this.t('notifyDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.notifyOnSync).onChange(async (value) => {
          this.plugin.settings.notifyOnSync = value;
          await this.plugin.saveSettings();
        })
      );

    // Upload to Server (Optional) Section
    containerEl.createEl('h3', { text: this.t('uploadSectionTitle') });

    const warningCallout = containerEl.createDiv({ cls: 'callout callout-warning' });
    warningCallout.style.marginBottom = '1rem';
    warningCallout.style.padding = '0.75rem 1rem';
    warningCallout.style.borderRadius = '6px';
    warningCallout.style.borderLeft = '4px solid var(--text-warning)';
    warningCallout.style.backgroundColor = 'var(--background-secondary)';
    const calloutTitle = warningCallout.createDiv({ cls: 'callout-title' });
    calloutTitle.style.fontWeight = 'bold';
    calloutTitle.style.marginBottom = '0.25rem';
    calloutTitle.style.color = 'var(--text-warning)';
    calloutTitle.setText('⚠️ ' + this.t('uploadSectionTitle'));
    const calloutContent = warningCallout.createDiv({ cls: 'callout-content' });
    calloutContent.setText(this.t('uploadSectionWarning'));

    new Setting(containerEl)
      .setName(this.t('enableUploadName'))
      .setDesc(this.t('enableUploadDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableUpload).onChange(async (value) => {
          this.plugin.settings.enableUpload = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.enableUpload) {
      new Setting(containerEl)
        .setName(this.t('uploadModeName'))
        .setDesc(this.t('uploadModeDesc'))
        .addDropdown((drop) =>
          drop
            .addOption('manual_only', this.t('uploadModeManual'))
            .addOption('auto_sync', this.t('uploadModeAuto'))
            .setValue(this.plugin.settings.uploadMode || 'manual_only')
            .onChange(async (value) => {
              this.plugin.settings.uploadMode = value as UploadMode;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName(this.t('conflictStrategyName'))
        .setDesc(this.t('conflictStrategyDesc'))
        .addDropdown((drop) =>
          drop
            .addOption('keep_newer', this.t('conflictKeepNewer'))
            .addOption('rename_conflict', this.t('conflictRename'))
            .addOption('skip', this.t('conflictSkip'))
            .setValue(this.plugin.settings.conflictStrategy || 'keep_newer')
            .onChange(async (value) => {
              this.plugin.settings.conflictStrategy = value as ConflictStrategy;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName(this.t('notifyOnUploadName'))
        .setDesc(this.t('notifyOnUploadDesc'))
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.notifyOnUpload).onChange(async (value) => {
            this.plugin.settings.notifyOnUpload = value;
            await this.plugin.saveSettings();
          })
        );
    }

    // Ingestion Template Section
    containerEl.createEl('h3', { text: this.t('templateHeader') });

    new Setting(containerEl)
      .setName(this.t('templateEnableName'))
      .setDesc(this.t('templateEnableDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableTemplate).onChange(async (value) => {
          this.plugin.settings.enableTemplate = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.enableTemplate) {
      new Setting(containerEl)
        .setName(this.t('templateEditorName'))
        .setDesc(this.t('templateEditorDesc'))
        .addButton((button) =>
          button.setButtonText(this.t('templateResetBtn')).onClick(async () => {
            this.plugin.settings.noteTemplate =
              this.plugin.settings.language === 'ru'
                ? DEFAULT_NOTE_TEMPLATE_RU
                : DEFAULT_NOTE_TEMPLATE_EN;
            await this.plugin.saveSettings();
            new Notice(this.t('templateResetNotice'));
            this.display();
          })
        );

      const templateWrap = containerEl.createDiv();
      templateWrap.style.marginBottom = '1.5rem';

      const textArea = templateWrap.createEl('textarea');
      textArea.rows = 8;
      textArea.style.width = '100%';
      textArea.style.boxSizing = 'border-box';
      textArea.style.fontFamily = 'var(--font-monospace)';
      textArea.style.fontSize = '0.85rem';
      textArea.style.padding = '8px 12px';
      textArea.style.borderRadius = '4px';
      textArea.style.border = '1px solid var(--background-modifier-border)';
      textArea.style.background = 'var(--background-secondary)';
      textArea.style.color = 'var(--text-normal)';
      textArea.value = this.plugin.settings.noteTemplate || '';
      textArea.addEventListener('change', async (e: Event) => {
        this.plugin.settings.noteTemplate = (e.target as HTMLTextAreaElement).value;
        await this.plugin.saveSettings();
      });
    }

    containerEl.createEl('h3', { text: this.t('quickTransferHeader') });
    containerEl.createEl('p', {
      text: this.t('quickTransferDesc')
    });

    new Setting(containerEl)
      .setName(this.t('exportName'))
      .setDesc(this.t('exportDesc'))
      .addButton((button) => {
        button
          .setButtonText(this.t('exportBtn'))
          .setIcon('copy')
          .onClick(async () => {
            try {
              const token = this.plugin.exportConfigToken();
              await navigator.clipboard.writeText(token);
              new Notice(this.t('noticeTokenCopied'));
            } catch (err: any) {
              new Notice(this.t('noticeCopyFailed', err.message));
            }
          });
      });

    let importTokenValue = '';
    new Setting(containerEl)
      .setName(this.t('importName'))
      .setDesc(this.t('importDesc'))
      .addText((text) => {
        text.setPlaceholder(this.t('importPlaceholder')).onChange((value) => {
          importTokenValue = value;
        });
      })
      .addButton((button) => {
        button
          .setButtonText(this.t('importBtn'))
          .setCta()
          .onClick(async () => {
            if (!importTokenValue.trim()) {
              new Notice(this.t('noticeImportEmpty'));
              return;
            }
            try {
              await this.plugin.importConfigToken(importTokenValue);
              new Notice(this.t('noticeImportSuccess'));
              this.display();
            } catch (err: any) {
              new Notice(this.t('noticeImportError', err.message));
            }
          });
      });
  }
}
