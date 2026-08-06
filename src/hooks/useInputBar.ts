import { useState } from 'react';

export function useInputBar() {
  const [showAttachments, setShowAttachments] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const onToggleAttachments = () => {
    setShowAttachments((prev) => !prev);
    setShowEmojiPicker(false);
    setShowStickerPicker(false);
  };

  const onToggleEmojiPicker = () => {
    setShowEmojiPicker((prev) => !prev);
    setShowAttachments(false);
    setShowStickerPicker(false);
  };

  const onToggleStickerPicker = () => {
    setShowStickerPicker((prev) => !prev);
    setShowAttachments(false);
    setShowEmojiPicker(false);
  };

  return {
    showAttachments,
    showEmojiPicker,
    showStickerPicker,
    onToggleAttachments,
    onToggleEmojiPicker,
    onToggleStickerPicker,
  };
}