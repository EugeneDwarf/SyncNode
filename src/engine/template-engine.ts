import { ParsedFrontmatter, TemplateOptions } from '../types';
import { formatLocalDate, formatLocalTime } from '../utils/date';

export function extractFrontmatterAndBody(text: string): ParsedFrontmatter {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (match) {
    return {
      hasFrontmatter: true,
      frontmatterText: match[1],
      body: match[2]
    };
  }
  return {
    hasFrontmatter: false,
    frontmatterText: '',
    body: text
  };
}

export function extractSourceUrl(text: string, frontmatterText: string = ''): string {
  if (frontmatterText) {
    const fmMatch = frontmatterText.match(/(?:url|source|link|source_url):\s*["']?(https?:\/\/[^\s"']+)["']?/i);
    if (fmMatch) return fmMatch[1];
  }
  const mdLinkMatch = text.match(/\[.*?\]\((https?:\/\/[^\s\)]+)\)/i);
  if (mdLinkMatch) return mdLinkMatch[1];

  const rawUrlMatch = text.match(/https?:\/\/[^\s\)]+/i);
  if (rawUrlMatch) return rawUrlMatch[0];

  return '';
}

export function applyIngestionTemplate(rawContent: string, options: TemplateOptions): string {
  const {
    template = '',
    filename = 'Untitled',
    remoteMtime = 0,
    now = new Date()
  } = options;

  if (!template || typeof template !== 'string' || !template.trim()) {
    return rawContent;
  }

  const title = filename.replace(/\.md$/i, '');
  const parsed = extractFrontmatterAndBody(rawContent);
  const sourceUrl = extractSourceUrl(parsed.body, parsed.frontmatterText);
  
  // Safe date parsing with validation
  const validMtime = (typeof remoteMtime === 'number' && Number.isFinite(remoteMtime) && remoteMtime > 0);
  const mtimeDate = validMtime ? new Date(remoteMtime) : now;

  const vars: Record<string, string> = {
    '{{title}}': title,
    '{{date}}': formatLocalDate(now),
    '{{time}}': formatLocalTime(now),
    '{{mtime_date}}': formatLocalDate(mtimeDate),
    '{{mtime_time}}': formatLocalTime(mtimeDate),
    '{{source_url}}': sourceUrl,
    '{{content}}': parsed.body.trim()
  };

  let rendered = template;
  for (const [placeholder, val] of Object.entries(vars)) {
    rendered = rendered.split(placeholder).join(val);
  }

  if (parsed.hasFrontmatter && parsed.frontmatterText.trim()) {
    const tplFmMatch = rendered.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (tplFmMatch) {
      const tplFm = tplFmMatch[1].trimEnd();
      const rest = tplFmMatch[2];
      const mergedFm = `${tplFm}\n# Imported metadata\n${parsed.frontmatterText.trim()}\n`;
      rendered = `---\n${mergedFm}---\n${rest}`;
    } else {
      rendered = `---\n${parsed.frontmatterText.trim()}\n---\n${rendered}`;
    }
  }

  return rendered;
}
