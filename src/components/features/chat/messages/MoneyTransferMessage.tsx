import { memo } from 'react';
import { formatTime } from '@/lib/utils';
import type { Message } from '@/types';

export interface MoneyTransferMessageProps {
  msg: Message;
  currentUserId: string;
}

export const MoneyTransferMessage = memo(function MoneyTransferMessage(props: MoneyTransferMessageProps) {
  const { msg, currentUserId } = props;

  const transferData = msg.transferData;

  if (!transferData) {
    return (
      <div className={`rounded-2xl px-5 py-3 max-w-[80%] text-center border border-[#EBEBEB] bg-white`}>
        <p className="text-[#8D8D8D] text-xs font-medium mb-1">Transfer</p>
        <p className="text-[#8D8D8D] text-sm">Transfer unavailable</p>
        <p className="text-[#8D8D8D] text-[10px] mt-1">{formatTime(msg.timestamp)}</p>
      </div>
    );
  }

  const isReceived = transferData.toUserId === currentUserId;
  const amountText = transferData.currency === 'BDT' ? `\u09F3${transferData.amount}` : `${transferData.amount} coins`;

  return (
    <div className={`rounded-2xl px-5 py-3 max-w-[80%] text-center border border-[#EBEBEB] ${isReceived ? 'bg-[#00C300]/10' : 'bg-white'}`}>
      <p className="text-[#00C300] text-xs font-medium mb-1">
        {isReceived ? '\u{1F4B0} You received' : '\u{1F4B8} You sent'}
      </p>
      <p className="text-[#111111] text-xl font-bold">{amountText}</p>
      {transferData.note && <p className="text-[#8D8D8D] text-xs mt-1">{transferData.note}</p>}
      <p className="text-[#8D8D8D] text-[10px] mt-1">{formatTime(msg.timestamp)}</p>
    </div>
  );
});