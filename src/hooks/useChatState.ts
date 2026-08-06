
import { useState } from 'react';
import type { Message } from '@/types';

export const useChatState = () => {
  const [input, setInput] = useState('');
  const [editInput, setEditInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);

  return {
    input,
    setInput,
    editInput,
    setEditInput,
    replyingTo,
    setReplyingTo,
    editingMessageId,
    setEditingMessageId,
    lightboxImage,
    setLightboxImage,
    searchQuery,
    setSearchQuery,
    searchIndex,
    setSearchIndex,
  };
};