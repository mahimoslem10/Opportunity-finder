import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, children, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  className?: string;
  disabled?: boolean;
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  className = '',
  disabled = false,
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary:
      'bg-navy-600 text-on-brand hover:bg-navy-700 active:bg-navy-800',
    secondary:
      'bg-gray-100 text-gray-800 hover:bg-gray-200 active:bg-gray-300',
    danger: 'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800',
    success:
      'bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-700',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-navy-400 focus:border-navy-400 transition-colors';

export const selectClass = inputClass;

export const textareaClass = `${inputClass} min-h-[90px] resize-y`;

interface TagProps {
  children: ReactNode;
  color?: 'default' | 'flag' | 'late' | 'ok';
  className?: string;
}

export function Tag({ children, color = 'default', className = '' }: TagProps) {
  const colors: Record<string, string> = {
    default: 'bg-gray-100 text-gray-700',
    flag: 'bg-amber-100 text-amber-800',
    late: 'bg-red-100 text-red-700',
    ok: 'bg-green-100 text-green-700',
  };
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]} ${className}`}
    >
      {children}
    </span>
  );
}

interface MessageProps {
  children: ReactNode;
  type?: 'success' | 'error' | 'info';
}

export function Message({ children, type = 'success' }: MessageProps) {
  const colors: Record<string, string> = {
    success: 'text-green-700',
    error: 'text-red-700',
    info: 'text-gray-600',
  };
  return (
    <p className={`mt-3 text-sm ${colors[type]}`}>{children}</p>
  );
}
