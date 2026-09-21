import { memo } from 'react';
import { formatTime } from '@/lib/utils';
import { CURRENCY_FORMAT } from '@/lib/chatConstants';
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
      <div className={`rounded-2xl px-5 py-3 max-w-[80%] text-center border border-border bg-background`}>
        <p className="text-muted-foreground text-xs font-medium mb-1">Transfer</p>
        <p className="text-muted-foreground text-sm">Transfer unavailable</p>
        <p className="text-muted-foreground text-[10px] mt-1">{formatTime(msg.timestamp)}</p>
      </div>
    );
  }

  const isReceived = transferData.toUserId === currentUserId;
  const currencyFormat = CURRENCY_FORMAT[transferData.currency] || {};
  const amountText = `${currencyFormat.prefix || ''}${transferData.amount}${currencyFormat.suffix || (!currencyFormat.prefix ? ` ${transferData.currency}` : '')}`;

  return (
    <div className={`rounded-2xl px-5 py-3 max-w-[80%] text-center border border-border ${isReceived ? 'bg-[#00C300]/10' : 'bg-background'}`}>
      <p className="text-[#00C300] text-xs font-medium mb-1">
        {isReceived ? '\u{1F4B0} You received' : '\u{1F4B8} You sent'}
      </p>
      <p className="text-foreground text-xl font-bold">{amountText}</p>
      {transferData.note && <p className="text-muted-foreground text-xs mt-1">{transferData.note}</p>}
      <p className="text-muted-foreground text-[10px] mt-1">{formatTime(msg.timestamp)}</p>
    </div>
  );
});