import { useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { Message } from '@/types';

interface UseChatScrollBehaviorOptions {
  chatId: string;
  messages: Record<string, Message[]>;
  virtuoso: RefObject<VirtuosoHandle | null>;
  hasNewMessages: boolean;
  setHasNewMessages: (v: boolean) => void;
  initialLatestTimestampRef: RefObject<number | null>;
}

export function useChatScrollBehavior(opts: UseChatScrollBehaviorOptions | number) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);

  // When called with the object form (ChatRoom), use the passed virtuoso ref
  const resolvedVirtuosoRef = typeof opts === 'object' && 'virtuoso' in opts
    ? opts.virtuoso as RefObject<VirtuosoHandle | null>
    : virtuosoRef;

  const msgs: Message[] = typeof opts === 'object' && 'messages' in opts && 'chatId' in opts
    ? (opts.messages[opts.chatId] ?? [])
    : [];

  const unreadCount = 0;

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    shouldAutoScrollRef.current = atBottom;
    setIsAtBottom(atBottom);
    setShowScrollBtn(!atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    resolvedVirtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
  }, [resolvedVirtuosoRef]);

  const checkScroll = useCallback(() => {
    // no-op — scroll state is tracked via handleAtBottomStateChange
  }, []);

  const manualScroll = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return {
    messagesEndRef,
    messagesContainerRef,
    showScrollBtn,
    scrollToBottom,
    shouldAutoScrollRef,
    virtuosoRef: resolvedVirtuosoRef,
    handleAtBottomStateChange,
    isAtBottom,
    checkScroll,
    manualScroll,
    msgs,
    unreadCount,
  };
}
