/** MetaMask `snap_notify` params from GET /api/system/announcement → `notification`. */

const IN_APP_LIMIT = 499;
const NATIVE_LIMIT = 49;

export type SnapNotifyType = 'inApp' | 'native';

export interface SnapFooterLink {
  href: string;
  text: string;
}

/** `content` is a MetaMask component. A string is wrapped in `Text` at send time. */
export interface SnapNotification {
  type: SnapNotifyType;
  message: string;
  title?: string;
  content?: string | Record<string, unknown>;
  footerLink?: SnapFooterLink;
}

export function normalizeApiBase(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const host = url.hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  if (local) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  } else if (url.protocol !== 'https:' || !isQ2Host(host)) {
    // ponytail: listed hosts only. Add a host when a new API origin ships.
    return null;
  }
  return url.origin;
}

/** Reads `notification`. Banner `text` / `url` are not a MetaMask payload. */
export function parseNotification(body: unknown): SnapNotification | null {
  const root = asRecord(body);
  if (!root) return null;
  const source = root.success === true ? asRecord(root.data) ?? root : root;
  return sanitizeNotification(source.notification);
}

/** Notify only when this MetaMask payload changes. Null clears the cursor. */
export function nextMessage(
  seen: string | null,
  notification: SnapNotification | null,
): { seen: string | null; notice: SnapNotification | null } {
  if (!notification) return { seen: null, notice: null };
  const seenKey = JSON.stringify(notification);
  if (seenKey === seen) return { seen, notice: null };
  return { seen: seenKey, notice: notification };
}

export function sanitizeNotification(value: unknown): SnapNotification | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.type !== 'inApp' && record.type !== 'native') return null;
  if (typeof record.message !== 'string') return null;
  const message = record.message.trim();
  const limit = record.type === 'native' ? NATIVE_LIMIT : IN_APP_LIMIT;
  if (!message || message.length > limit) return null;
  if (record.type === 'native') return { type: 'native', message };

  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const content = sanitizeContent(record.content);
  const footerLink = sanitizeFooterLink(record.footerLink);
  const detailed = Boolean(title || content || record.footerLink);
  if (!detailed) return { type: 'inApp', message };
  if (!title || !content) return null;
  if (record.footerLink && !footerLink) return null;
  return {
    type: 'inApp',
    message,
    title,
    content,
    ...(footerLink ? { footerLink } : {}),
  };
}

function sanitizeContent(value: unknown): string | Record<string, unknown> | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const record = asRecord(value);
  if (!record || typeof record.type !== 'string' || !asRecord(record.props)) return null;
  return record;
}

function sanitizeFooterLink(value: unknown): SnapFooterLink | null {
  const link = asRecord(value);
  const href = httpUrl(link?.href);
  const text = typeof link?.text === 'string' ? link.text.trim() : '';
  return href && text ? { href, text } : null;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.toString();
}

function isQ2Host(host: string): boolean {
  return host === 'q2-market.com' || host.endsWith('.q2-market.com');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
