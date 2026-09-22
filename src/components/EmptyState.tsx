import { type ReactNode, type ComponentType, memo } from 'react';
import { motion } from 'framer-motion';


interface EmptyStateProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title?: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

function EmptyState({ icon: Icon, title = 'Nothing here yet', description, action, compact = false }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-muted-foreground dark:text-white/50 ${compact ? 'py-12' : 'h-64'}`}
    >
      <div
        className={`${compact ? 'w-14 h-14' : 'w-20 h-20'} rounded-full bg-muted dark:bg-white/5 flex items-center justify-center mb-3`}
      >
        <Icon size={compact ? 24 : 36} strokeWidth={1.5} className="text-muted-foreground dark:text-white/30" />
      </div>
      <p className={`text-foreground dark:text-white font-medium ${compact ? 'text-sm' : 'text-[15px]'}`}>{title}</p>
      {description && (
        <p className="text-muted-foreground dark:text-white/50 text-xs mt-1 max-w-[220px] text-center leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </motion.div>
  );
}
export default memo(EmptyState);
