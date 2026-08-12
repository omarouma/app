import { memo } from 'react';
import { formatTime } from '@/lib/utils';

interface ReadReceiptProps {
  isMe: boolean;
  timestamp: Date;
  deliveryStatus?: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  edited?: boolean;
}

const DoubleCheckIcon = () => (
  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
    <path d="M1 5L4 8L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 5L8 8L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SingleCheckIcon = ({ animate = false }) => (
  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className={`inline-block ${animate ? 'animate-pulse' : ''}`}>
    <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={animate ? 0.5 : 1} />
  </svg>
);

const FailedIcon = () => (
  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" className="inline-block">
    <circle cx="7" cy="5" r="4" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5 5H9" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);


export const ReadReceipt = memo(function ReadReceipt({ isMe, timestamp, deliveryStatus, edited }: ReadReceiptProps) {
  if (!isMe) {
    return (
      <div className="text-[10px] mt-1 text-[#8D8D8D]">
        <span>{formatTime(timestamp)}</span>
        {edited && <span className="ml-1 text-[9px] italic">edited</span>}
      </div>
    );
  }

  const renderStatusIcon = () => {
    switch (deliveryStatus) {
      case 'read':
      case 'delivered':
        return <DoubleCheckIcon />;
      case 'sent':
        return <SingleCheckIcon />;
      case 'pending':
      case 'sending':
        return <SingleCheckIcon animate />;
      case 'failed':
        return <FailedIcon />;
      default:
        return <SingleCheckIcon />;
    }
  };

  const statusText = deliveryStatus === 'failed' ? 'Failed' : formatTime(timestamp);

  const statusColor = deliveryStatus === 'read' ? 'text-[#2196F3]' : deliveryStatus === 'failed' ? 'text-[#FF3B30]' : 'text-white/70';

  return (
    <div className={`text-[10px] mt-1 text-right ${statusColor}`}>
      <span className="inline-flex items-center gap-0.5" role="img" aria-label={deliveryStatus}>
        {renderStatusIcon()}
        <span>{statusText}</span>
      </span>
      {edited && <span className="ml-1 text-[9px] italic">edited</span>}
    </div>
  );
});