import type { CallRecord } from '@/types';

/**
 * Returns true if the call is a group (conference) call.
 * The CallRecord type supports 'group_voice' | 'group_video' in addition to
 * the 1:1 'voice' | 'video' types.
 */
export function isGroupCall(call: CallRecord | null | undefined): boolean {
  return call?.type === 'group_voice' || call?.type === 'group_video';
}

/**
 * Resolves whether a call should be treated as a video call, accounting for
 * the group_voice/group_video type union.
 */
export function isVideoCallType(type: CallRecord['type'] | undefined): boolean {
  return type === 'video' || type === 'group_video';
}

/**
 * Determines if a call is outgoing or incoming based on the current user's ID.
 * @param call The call record.
 * @param currentUserId The ID of the current user.
 * @returns 'outgoing' or 'incoming'.
 */
export function getCallDirection(call: CallRecord, currentUserId: string | undefined): 'outgoing' | 'incoming' {
  if (!currentUserId) return 'incoming';
  return call.initiatorId === currentUserId ? 'outgoing' : 'incoming';
}

/**
 * Finds the ID of the other participant in a call.
 * @param call The call record.
 * @param currentUserId The ID of the current user.
 * @returns The ID of the other participant.
 */
export function getOtherParticipantId(call: CallRecord, currentUserId: string | undefined): string {
  if (!currentUserId) return call.initiatorId || '';
  return call.participantIds?.find(id => id !== currentUserId) || call.initiatorId || '';
}

/**
 * Returns true when the given user has soft-deleted this call from their own
 * history. Call history is shared between participants, so deletion is tracked
 * per-user via the `deletedBy` list rather than by removing the row.
 */
export function isCallDeletedFor(call: CallRecord, userId: string | undefined): boolean {
  if (!userId) return false;
  return Array.isArray(call.deletedBy) && call.deletedBy.includes(userId);
}

export type CallStatusLabel = 'Missed' | 'Declined' | 'Cancelled' | 'Outgoing' | 'Incoming';

/**
 * Derives a precise, human-readable status label for a call row.
 *
 * - `missed`   → "Missed"    (incoming call that was never answered)
 * - `rejected` → "Declined"  (incoming) / "Cancelled" (outgoing)
 * - `ended`    → "Outgoing" / "Incoming"
 * - `calling`  → "Outgoing" / "Incoming" (still ringing)
 *
 * This replaces the previous coarse logic where a rejected incoming call was
 * shown as "Incoming" and an unanswered outgoing call as "Outgoing".
 */
export function getCallStatusLabel(call: CallRecord, currentUserId: string | undefined): CallStatusLabel {
  const direction = getCallDirection(call, currentUserId);
  if (call.status === 'missed') return 'Missed';
  if (call.status === 'rejected') return direction === 'outgoing' ? 'Cancelled' : 'Declined';
  return direction === 'outgoing' ? 'Outgoing' : 'Incoming';
}

export type CallDateGroupKey = 'today' | 'yesterday' | 'earlier';

export interface CallDateGroup<T> {
  key: CallDateGroupKey;
  label: string;
  items: T[];
}

/**
 * Groups call records into Today / Yesterday / Earlier buckets, preserving the
 * incoming order within each bucket. Items are expected to be pre-sorted
 * newest-first. Empty buckets are omitted.
 */
export function groupCallsByDate<T extends { timestamp: Date }>(items: T[]): CallDateGroup<T>[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const buckets: Record<CallDateGroupKey, T[]> = { today: [], yesterday: [], earlier: [] };

  for (const item of items) {
    const ts = item.timestamp instanceof Date ? item.timestamp.getTime() : new Date(item.timestamp as unknown as string).getTime();
    if (ts >= startOfToday.getTime()) buckets.today.push(item);
    else if (ts >= startOfYesterday.getTime()) buckets.yesterday.push(item);
    else buckets.earlier.push(item);
  }

  const labels: Record<CallDateGroupKey, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    earlier: 'Earlier',
  };

  return (['today', 'yesterday', 'earlier'] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: labels[key], items: buckets[key] }));
}