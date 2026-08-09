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