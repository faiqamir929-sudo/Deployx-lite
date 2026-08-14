import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm',
        'placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
        'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
