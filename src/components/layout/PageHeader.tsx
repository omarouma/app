import { memo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  /** Page title. */
  title?: ReactNode;
  /** Optional subtitle shown under the title. */
  subtitle?: ReactNode;
  /** Show a back button. Defaults to false. */
  showBack?: boolean;
  /** Custom back handler. Defaults to navigate(-1). */
  onBack?: () => void;
  /** Right-aligned actions (buttons, icons). */
  actions?: ReactNode;
  /** Left slot override (replaces back button / title area). */
  left?: ReactNode;
  /** Render a large, top-level title (Chats/Contacts style). */
  large?: boolean;
  /** Extra content rendered below the main row (search, tabs, etc.). */
  children?: ReactNode;
  /** Sticky positioning. Defaults to true. */
  sticky?: boolean;
  /** Additional classes for the outer header. */
  className?: string;
  /** Additional classes for the inner row. */
  rowClassName?: string;
}

/**
 * Unified page header used across every screen.
 *
 * Guarantees consistent height, safe-area padding, blur surface, title
 * typography, back-button sizing and action alignment — fixing the
 * previously inconsistent per-page headers.
 */
const PageHeader = memo(function PageHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  actions,
  left,
  large = false,
  children,
  sticky = true,
  className,
  rowClassName,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <header
      className={cn(
        'page-header shrink-0',
        sticky && 'sticky top-0',
        className,
      )}
    >
      <div className={cn('flex items-center gap-2 w-full', rowClassName)}>
        {left ? (
          left
        ) : (
          <>
            {showBack && (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Go back"
                className="icon-btn w-10 h-10 -ml-1.5 shrink-0 text-foreground"
              >
                <ArrowLeft size={22} strokeWidth={2} />
              </button>
            )}
            {title && (
              <div className="min-w-0 flex-1">
                <h1
                  className={cn(
                    'font-bold text-foreground tracking-tight truncate',
                    large ? 'text-[26px] leading-tight' : 'text-[17px]',
                  )}
                >
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-muted-foreground text-xs mt-0.5 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {actions && (
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {actions}
          </div>
        )}
      </div>

      {children}
    </header>
  );
});

export default PageHeader;
