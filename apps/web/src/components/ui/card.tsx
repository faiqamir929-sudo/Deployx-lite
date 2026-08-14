import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="text-sm text-zinc-500">{description}</p>}
    </div>
  );
}
