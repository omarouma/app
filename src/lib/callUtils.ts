import type { CallRecord } from '@/types';

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