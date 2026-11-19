import type { OnCronjobHandler, OnRpcRequestHandler } from '@metamask/snaps-sdk';
import { Text } from '@metamask/snaps-sdk/jsx';
import { nextMessage, normalizeApiBase, parseNotification, type SnapNotification } from './messages';

interface StoredState {
  apiBase?: string;
  seen?: string | null;
}

async function readState(): Promise<StoredState> {
  const state = await snap.request({
    method: 'snap_manageState',
    params: { operation: 'get', encrypted: false },
  });
  return state && typeof state === 'object' ? (state as StoredState) : {};
}

async function writeState(state: StoredState): Promise<void> {
  await snap.request({
    method: 'snap_manageState',
    params: { operation: 'update', newState: state, encrypted: false },
  });
}

async function pollAnnouncement(): Promise<{ notified: boolean }> {
  const state = await readState();
  if (!state.apiBase) return { notified: false };

  let body: unknown;
  try {
    const response = await fetch(`${state.apiBase}/api/system/announcement`);
    if (!response.ok) return { notified: false };
    body = await response.json();
  } catch {
    return { notified: false };
  }

  const next = nextMessage(state.seen ?? null, parseNotification(body));
  if (next.seen === (state.seen ?? null)) return { notified: false };
  if (next.notice) {
    await snap.request({
      method: 'snap_notify',
      params: notifyParams(next.notice),
    });
  }
  await writeState({ ...state, seen: next.seen });
  return { notified: Boolean(next.notice) };
}

export const onRpcRequest: OnRpcRequestHandler = async ({ request }) => {
  switch (request.method) {
    case 'configure': {
      const params = request.params as { apiBase?: unknown } | undefined;
      const apiBase = normalizeApiBase(params?.apiBase);
      if (!apiBase) throw new Error('Invalid API origin.');
      const state = await readState();
      await writeState({ ...state, apiBase });
      return { ok: true };
    }
    case 'pollNow':
      return pollAnnouncement();
    default:
      throw new Error('Method not found.');
  }
};

function notifyParams(notice: SnapNotification) {
  if (typeof notice.content !== 'string') return notice;
  return { ...notice, content: Text({ children: notice.content }) };
}

export const onCronjob: OnCronjobHandler = async ({ request }) => {
  if (request.method !== 'poll') throw new Error('Method not found.');
  return pollAnnouncement();
};
