import { motion } from 'framer-motion';
import { memo } from 'react';

interface LoadingSkeletonProps {
  count?: number;
  variant?: 'list' | 'chat' | 'card' | 'profile';
}

function LoadingSkeleton({ count = 3, variant = 'list' }: LoadingSkeletonProps) {
  if (variant === 'chat') {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[60%] ${i % 2 === 0 ? 'bg-[#00C300]/20' : 'bg-[#F5F5F5]'} rounded-2xl px-4 py-3 animate-pulse`}>
              <div className="h-3 rounded w-32 mb-1" />
              <div className="h-2 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="bg-[#F5F5F5] rounded-xl p-4 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white shrink-0" />
              <div className="flex-1">
                <div className="h-3 bg-white rounded w-1/3 mb-2" />
                <div className="h-2 bg-white rounded w-2/3" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (variant === 'profile') {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-4 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-[#F5F5F5]" />
          <div className="flex-1">
            <div className="h-4 bg-[#F5F5F5] rounded w-1/3 mb-2" />
            <div className="h-3 bg-[#F5F5F5] rounded w-1/2" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="aspect-square bg-[#F5F5F5] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Default list
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-3 animate-pulse"
        >
          <div className={`${variant === 'list' ? 'w-14 h-14 rounded-2xl' : 'w-10 h-10 rounded-full'} bg-[#F5F5F5] shrink-0`} />
          <div className="flex-1 py-2">
            <div className="h-4 bg-[#F5F5F5] rounded w-1/3 mb-2" />
            <div className="h-3 bg-[#F5F5F5] rounded w-2/3" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
export default memo(LoadingSkeleton);