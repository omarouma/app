/**
 * Simple module-level active chat tracker to avoid brittle pathname checks.
 *
 * ChatRoom sets the active chat id when mounted; useChatStore reads it in order
 * to decide whether to play incoming message sounds.
 */

let activeChatId: string | null = null;

export function setActiveChatId(chatId: string | null) {
  activeChatId = chatId;
}

export function getActiveChatId() {
  return activeChatId;
}

