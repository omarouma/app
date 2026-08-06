import { memo } from 'react';
import { formatTime } from '@/lib/utils';
import type { Message } from '@/types';

export interface MoneyTransferMessageProps {
  msg: Message;
  currentUserId: string;
}

export const MoneyTransferMessage = memo(function MoneyTransferMessage(props: MoneyTransferMessageProps) {
  const { msg, currentUserId } = props;

  return (
    <div className={`rounded-2xl px-5 py-3 max-w-[80%] text-center border border-[#EBEBEB] ${msg.transferData!.toUserId === currentUserId ? 'bg-[#00C300]/10' : 'bg-white'}`}>
      <p className="text-[#00C300] text-xs font-medium mb-1">
        {msg.transferData!.toUserId === currentUserId ? '\u{1F4B0} You received' : '\u{1F4B8} You sent'}
      </p>
      <p className="text-[#111111] text-xl font-bold">
        {msg.transferData!.currency === 'BDT' ? `\u09F3${msg.transferData!.amount}` : `${msg.transferData!.amount} coins`}
      </p>
      {msg.transferData!.note && <p className="text-[#8D8D8D] text-xs mt-1">{msg.transferData!.note}</p>}
      <p className="text-[#8D8D8D] text-[10px] mt-1">{formatTime(msg.timestamp)}</p>
    </div>
  );
});