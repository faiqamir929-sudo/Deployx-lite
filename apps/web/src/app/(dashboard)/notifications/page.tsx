'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/notifications'),
  });

  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (isLoading) return <p className="text-zinc-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Notifications</h1>
        <Button variant="outline" onClick={() => markAllRead.mutate()}>Mark all read</Button>
      </div>
      <div className="space-y-3">
        {notifications.map((n) => (
          <Card key={n.id} className={n.read ? 'opacity-60' : ''}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">{n.title}</p>
                <p className="text-sm text-zinc-500">{n.message}</p>
                <p className="mt-1 text-xs text-zinc-400">{formatDate(n.createdAt)}</p>
              </div>
              {!n.read && <span className="h-2 w-2 rounded-full bg-indigo-500" />}
            </div>
          </Card>
        ))}
        {notifications.length === 0 && (
          <Card><CardHeader title="All caught up" description="No notifications yet." /></Card>
        )}
      </div>
    </div>
  );
}
