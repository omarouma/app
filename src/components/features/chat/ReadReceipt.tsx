import { memo } from 'react';
import { formatTime } from '@/lib/utils';

interface ReadReceiptProps {
  isMe: boolean;
  timestamp: Date;
  read: boolean | undefined;
  deliveryStatus?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  edited?: boolean;
}

export const ReadReceipt = memo(function ReadReceipt({ isMe, timestamp, read, deliveryStatus, edited }: ReadReceiptProps) {
  if (!isMe) {
    return (
      <div className="text-[10px] mt-1 text-[#8D8D8D]">
        <span>{formatTime(timestamp)}</span>
        {edited && <span className="ml-1 text-[9px] italic">edited</span>}
      </div>
    );
  }

  // Enhanced delivery status rendering
  if (deliveryStatus) {
    switch (deliveryStatus) {
      case 'sending':
        return (
          <div className="text-[10px] mt-1 text-right text-white/70">
            <span className="inline-flex items-center gap-0.5">
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block animate-pulse">
                <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
              </svg>
              {formatTime(timestamp)}
            </span>
            {edited && <span className="ml-1 text-[9px] italic">edited</span>}
          </div>
        );
      case 'failed':
        return (
          <div className="text-[10px] mt-1 text-right text-[#FF3B30]">
            <span className="inline-flex items-center gap-0.5">
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
                <circle cx="7" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 5H9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Failed
            </span>
            {edited && <span className="ml-1 text-[9px] italic">edited</span>}
          </div>
        );
      case 'read':
        return (
          <div className="text-[10px] mt-1 text-right">
            <span className="inline-flex items-center gap-0.5 text-[#2196F3]">
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
                <path d="M1 5L4 8L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 5L8 8L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {formatTime(timestamp)}
            </span>
            {edited && <span className="ml-1 text-[9px] italic">edited</span>}
          </div>
        );
      case 'delivered':
        return (
          <div className="text-[10px] mt-1 text-right text-white/70">
            <span className="inline-flex items-center gap-0.5">
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
                <path d="M1 5L4 8L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 5L8 8L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {formatTime(timestamp)}
            </span>
            {edited && <span className="ml-1 text-[9px] italic">edited</span>}
          </div>
        );
      default:
        break;
    }
  }

  return (
    <div className="text-[10px] mt-1 text-right text-white/70">
      <span className="inline-flex items-center gap-0.5">
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
          {read ? (
            <>
              <path d="M1 5L4 8L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 5L8 8L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : (
            <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
        {formatTime(timestamp)}
      </span>
      {edited && <span className="ml-1 text-[9px] italic">edited</span>}
    </div>
  );
});

