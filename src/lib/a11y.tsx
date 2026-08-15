/**
 * Accessibility (A11y) Utilities
 * Provides helpers for creating WCAG 2.1 AA compliant components
 */

import React from 'react';

/**
 * Button accessibility properties
 */
export const a11y = {
  /**
   * Properties for standard buttons
   */
  button: {
    /**
     * Get ARIA attributes for a button
     * @param label - Button label/tooltip text
     * @param isPrimary - Whether this is a primary action
     */
    getButtonProps: (label: string, isPrimary = false) => ({
      'aria-label': label,
      'aria-pressed': false,
      'title': label,
      'role': isPrimary ? 'button' : undefined,
    } as const),

    /**
     * Get ARIA attributes for icon-only buttons
     * @param label - Descriptive label for the icon
     */
    getIconButtonProps: (label: string) => ({
      'aria-label': label,
      'type': 'button' as const,
      'title': label,
    }),

    /**
     * Get ARIA attributes for toggle buttons
     * @param label - Button label
     * @param isActive - Current toggle state
     */
    getToggleButtonProps: (label: string, isActive: boolean) => ({
      'aria-label': label,
      'aria-pressed': isActive,
      'type': 'button' as const,
      'title': label,
    }),
  },

  /**
   * Menu and dropdown accessibility
   */
  menu: {
    /**
     * Get ARIA attributes for menu container
     * @param isOpen - Whether menu is currently open
     */
    getMenuProps: (isOpen: boolean) => ({
      'role': 'menu' as const,
      'aria-hidden': !isOpen,
    }),

    /**
     * Get ARIA attributes for menu items
     * @param label - Item label
     * @param isActive - Whether item is selected
     */
    getMenuItemProps: (label: string, isActive = false) => ({
      'role': 'menuitem' as const,
      'aria-label': label,
      'aria-current': isActive ? 'page' : undefined,
      'tabIndex': isActive ? 0 : -1,
    }),

    /**
     * Focus trap handler for menu keyboard navigation
     */
    getFocusTrap: (_containerRef: React.RefObject<HTMLDivElement>) => ({
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.currentTarget.dispatchEvent(new CustomEvent('close-menu'));
        }
        if (e.key === 'Tab') {
          e.preventDefault();
        }
      },
    }),
  },

  /**
   * List accessibility for message/notification lists
   */
  list: {
    /**
     * Get ARIA attributes for a list container
     */
    getListProps: () => ({
      'role': 'list' as const,
    }),

    /**
     * Get ARIA attributes for list items
     * @param label - Item label for screen readers
     * @param index - Item position in list
     */
    getListItemProps: (label: string, index: number) => ({
      'role': 'listitem' as const,
      'aria-label': label,
      'aria-posinset': index + 1,
    }),
  },

  /**
   * Loading state accessibility
   */
  loading: {
    /**
     * Get ARIA attributes for loading indicator
     * @param label - Loading description
     */
    getLoadingProps: (label = 'Loading...') => ({
      'role': 'status' as const,
      'aria-live': 'polite' as const,
      'aria-label': label,
      'aria-busy': true,
    }),
  },

  /**
   * Notification and toast accessibility
   */
  notification: {
    /**
     * Get ARIA live region properties for notifications
     * @param priority - Urgency level: 'high' for alerts, 'low' for updates
     */
    getAriaLiveProps: (priority: 'low' | 'high' = 'high') => ({
      'role': 'status' as const,
      'aria-live': priority === 'high' ? 'assertive' : 'polite',
      'aria-atomic': true,
    }),

    /**
     * Get ARIA attributes for alert dialogs
     */
    getAlertProps: () => ({
      'role': 'alert' as const,
      'aria-live': 'assertive' as const,
      'aria-atomic': true,
    }),
  },

  /**
   * Form accessibility
   */
  form: {
    /**
     * Get ARIA attributes for form inputs
     * @param label - Input label
     * @param isRequired - Whether field is required
     * @param error - Optional error message
     */
    getInputProps: (label: string, isRequired = false, error?: string) => ({
      'aria-label': label,
      'aria-required': isRequired,
      'aria-invalid': !!error,
      'aria-describedby': error ? `${label}-error` : undefined,
    }),

    /**
     * Get ARIA attributes for error messages
     * @param fieldLabel - Label of the field with error
     */
    getErrorProps: (fieldLabel: string) => ({
      'role': 'alert' as const,
      'id': `${fieldLabel}-error`,
      'aria-live': 'polite' as const,
    }),
  },

  /**
   * Dialog/Modal accessibility
   */
  dialog: {
    /**
     * Get ARIA attributes for dialog containers
     * @param title - Dialog title/heading
     * @param isOpen - Whether dialog is open
     */
    getDialogProps: (title: string, isOpen: boolean) => ({
      'role': 'dialog' as const,
      'aria-modal': true,
      'aria-labelledby': `${title}-heading`,
      'aria-hidden': !isOpen,
    }),

    /**
     * Get ARIA attributes for dialog close button
     */
    getCloseButtonProps: () => ({
      'aria-label': 'Close dialog',
      'type': 'button' as const,
    }),
  },

  /**
   * Tab/Tab panel accessibility (for tab navigation)
   */
  tabs: {
    /**
     * Get ARIA attributes for tab button
     * @param label - Tab label
     * @param isActive - Whether tab is currently active
     * @param panelId - ID of associated tab panel
     */
    getTabProps: (_label: string, isActive: boolean, panelId: string) => ({
      'role': 'tab' as const,
      'aria-selected': isActive,
      'aria-controls': panelId,
      'tabIndex': isActive ? 0 : -1,
    }),

    /**
     * Get ARIA attributes for tab panel
     * @param label - Tab label
     * @param isActive - Whether this panel is visible
     */
    getTabPanelProps: (label: string, isActive: boolean) => ({
      'role': 'tabpanel' as const,
      'aria-labelledby': `${label}-tab`,
      'hidden': !isActive,
    }),
  },

  /**
   * Checkbox accessibility
   */
  checkbox: {
    /**
     * Get ARIA attributes for checkboxes
     * @param label - Checkbox label
     * @param isChecked - Current checked state
     * @param isIndeterminate - Whether checkbox is in indeterminate state
     */
    getCheckboxProps: (label: string, isChecked: boolean, isIndeterminate = false) => ({
      'aria-label': label,
      'aria-checked': isIndeterminate ? 'mixed' : isChecked,
      'role': 'checkbox' as const,
    }),
  },
};

/**
 * Accessible button component
 */
interface AccessibleButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
  children?: React.ReactNode;
}

export const AccessibleButton = React.forwardRef<
  HTMLButtonElement,
  AccessibleButtonProps
>(
  (
    { label, icon, variant = 'primary', isLoading = false, children, ...props },
    ref
  ) => {
    const variantClasses = {
      primary: 'bg-[#00C300] hover:bg-[#00A800] text-white',
      secondary: 'bg-white/10 hover:bg-white/20 text-white',
      danger: 'bg-[#FF3B30] hover:bg-[#E0321B] text-white',
      ghost: 'bg-transparent hover:bg-gray-100 text-gray-900',
    };

    return (
      <button
        ref={ref}
        {...a11y.button.getIconButtonProps(label)}
        {...props}
        className={`
          flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-semibold
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00C300]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
          ${variantClasses[variant]}
          ${props.className || ''}
        `}
        disabled={isLoading || props.disabled}
      >
        {icon && <span aria-hidden="true">{icon}</span>}
        <span>{children || label}</span>
      </button>
    );
  }
);

AccessibleButton.displayName = 'AccessibleButton';

/**
 * Skip to main content link (should be first focusable element)
 */
export const SkipToMainContent = () => (
  <a
    href="#main-content"
    className="
      absolute -top-10 left-0 z-50 bg-[#00C300] text-white px-4 py-2
      focus:top-0 focus:outline-none focus:ring-2 focus:ring-offset-2
      rounded-br-lg font-semibold
    "
  >
    Skip to main content
  </a>
);

/**
 * Utility to announce messages to screen readers without visual changes
 */
export const useAriaLiveAnnouncement = () => {
  const [announcement, setAnnouncement] = React.useState('');

  const announce = (message: string, _priority: 'polite' | 'assertive' = 'polite') => {
    setAnnouncement(message);
    // Clear announcement after a delay to allow screen reader to read it
    setTimeout(() => setAnnouncement(''), 1000);
  };

  return { announcement, announce, Component: AnnounceComponent };
};

const AnnounceComponent = ({ message }: { message: string }) => (
  <div
    role="status"
    aria-live="polite"
    aria-atomic="true"
    className="sr-only"
  >
    {message}
  </div>
);
