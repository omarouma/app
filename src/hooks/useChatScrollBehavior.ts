import { useRef, useState, useEffect, useCallback } from 'react';

export function useChatScrollBehavior(msgsLength: number) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Register scroll listener once — not on every message
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setShowScrollBtn(!atBottom);
      shouldAutoScrollRef.current = atBottom;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll when new messages arrive and user was already at bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [msgsLength]);

  const scrollToBottom = useCallback(
    () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }),
    []
  );

  return { messagesEndRef, messagesContainerRef, showScrollBtn, scrollToBottom };
}
