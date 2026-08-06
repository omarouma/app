
import { useState } from 'react';
import type { Message } from '@/types';

export const useChatUI = () => {
  const [showAttachments, setShowAttachments] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ msg: Message; position: { x: number; y: number } } | null>(null);
  const [selectedReactionMsg, setSelectedReactionMsg] = useState<string | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [forwardBatch, setForwardBatch] = useState<Message[]>([]);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [chatBg, setChatBg] = useState('');
  const [showDeleteForEveryoneConfirm, setShowDeleteForEveryoneConfirm] = useState<string | null>(null);

  return {
    showAttachments,
    setShowAttachments,
    showEmojiPicker,
    setShowEmojiPicker,
    showSearch,
    setShowSearch,
    contextMenu,
    setContextMenu,
    selectedReactionMsg,
    setSelectedReactionMsg,
    showForwardModal,
    setShowForwardModal,
    forwardMsg,
    setForwardMsg,
    forwardBatch,
    setForwardBatch,
    showSchedulePicker,
    setShowSchedulePicker,
    scheduleDate,
    setScheduleDate,
    showPollModal,
    setShowPollModal,
    pollQuestion,
    setPollQuestion,
    pollOptions,
    setPollOptions,
    showReportModal,
    setShowReportModal,
    reportReason,
    setReportReason,
    reportDetails,
    setReportDetails,
    showBgPicker,
    setShowBgPicker,
    chatBg,
    setChatBg,
    showDeleteForEveryoneConfirm,
    setShowDeleteForEveryoneConfirm,
  };
};