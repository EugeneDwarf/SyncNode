import { SyncNodeSettings } from './types';

export const DEFAULT_NOTE_TEMPLATE_EN = `---
created: {{date}} {{time}}
status: inbox
---
> [!info] {{title}}
> Created: [[{{date}}]] {{time}}

- [ ] Process note

{{content}}`;

export const DEFAULT_NOTE_TEMPLATE_RU = `---
created: {{date}} {{time}}
status: inbox
---
> [!info] {{title}}
> Создано: [[{{date}}]] в {{time}}

- [ ] Разобрать заметку

{{content}}`;

export const DEFAULT_SETTINGS: SyncNodeSettings = {
  language: 'en',
  webdavUrl: '',
  username: '',
  password: '',
  targetFolder: 'Notes',
  useDedicatedAttachments: false,
  attachmentsFolder: 'Notes/attachments',
  syncInterval: 5,
  syncOnStartup: true,
  notifyOnSync: true,
  enableTemplate: false,
  noteTemplate: DEFAULT_NOTE_TEMPLATE_EN,
  isConfigured: false,
  enableUpload: false,
  uploadMode: 'manual_only',
  conflictStrategy: 'keep_newer',
  notifyOnUpload: true
};
