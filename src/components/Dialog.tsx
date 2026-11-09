import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  labelledBy: string;
  onClose: () => void;
  zIndex?: string;
  className?: string;
  children: ReactNode;
}

export function Dialog({
  labelledBy,
  onClose,
  zIndex = 'z-50',
  className = '',
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const returnFocusTo = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
    return () => returnFocusTo?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center p-2 sm:p-4 bg-black/50`}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`bg-white rounded-xl shadow-xl w-full flex flex-col focus:outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
