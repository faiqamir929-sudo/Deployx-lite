'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, FolderKanban, Bell, Bot, LogOut, Rocket,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearToken, getUser } from '@/lib/api';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/ai', label: 'AI Assistant', icon: Bot },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();

  function logout() {
    clearToken();
    router.push('/login');
  }

  return (
    <aside className="flex w-64 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
        <Rocket className="h-6 w-6 text-indigo-600" />
        <span className="text-lg font-bold">DeployX Lite</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <p className="truncate text-sm font-medium">{user?.name}</p>
        <p className="truncate text-xs text-zinc-500">{user?.email}</p>
        <button
          onClick={logout}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
