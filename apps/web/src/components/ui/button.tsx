import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50',
        variant === 'default' && 'bg-indigo-600 text-white hover:bg-indigo-700',
        variant === 'outline' && 'border border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900',
        variant === 'ghost' && 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
        variant === 'destructive' && 'bg-red-600 text-white hover:bg-red-700',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-11 px-6',
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
