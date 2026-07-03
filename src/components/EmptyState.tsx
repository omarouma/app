import { type ReactNode, type ComponentType } from 'react';
import { motion } from 'framer-motion';


interface EmptyStateProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title?: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export default function EmptyState({ icon: Icon, title = 'Nothing here yet', description, action, compact = false }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-[#8D8D8D] ${compact ? 'py-12' : 'h-64'}`}
    >
      <div className={`${compact ? 'w-14 h-14' : 'w-20 h-20'} rounded-full bg-[#F5F5F5] flex items-center justify-center mb-3`}>
        <Icon size={compact ? 24 : 36} strokeWidth={1.5} className="text-[#C7C7CC]" />
      </div>
      <p className={`text-[#111111] font-medium ${compact ? 'text-sm' : 'text-[15px]'}`}>{title}</p>
      {description && <p className="text-[#8D8D8D] text-xs mt-1 max-w-[200px] text-center">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </motion.div>
  );
}
