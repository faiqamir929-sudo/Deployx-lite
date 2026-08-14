'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FolderKanban, Rocket, CheckCircle, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDuration, formatDate } from '@/lib/utils';
import { Card, CardHeader } from '@/components/ui/card';

interface DashboardStats {
  projects: number;
  totalDeployments: number;
  successRate: number;
  avgDeploymentTimeMs: number;
  deploymentChart: { date: string; deployments: number }[];
  recentDeployments: {
    id: string;
    number: number;
    status: string;
    durationMs: number | null;
    createdAt: string;
    project: { name: string };
    triggeredBy: { name: string };
  }[];
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardStats>('/dashboard/stats'),
  });

  if (isLoading) return <p className="text-zinc-500">Loading dashboard...</p>;

  const stats = [
    { label: 'Projects', value: data?.projects ?? 0, icon: FolderKanban },
    { label: 'Deployments', value: data?.totalDeployments ?? 0, icon: Rocket },
    { label: 'Success Rate', value: `${data?.successRate ?? 0}%`, icon: CheckCircle },
    { label: 'Avg Duration', value: formatDuration(data?.avgDeploymentTimeMs ?? 0), icon: Clock },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-zinc-500">Overview of your deployment activity</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-500">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
              <Icon className="h-8 w-8 text-indigo-500 opacity-80" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Deployments (Last 7 Days)" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.deploymentChart ?? []}>
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="deployments" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardHeader title="Recent Deployments" />
          <div className="space-y-3">
            {(data?.recentDeployments ?? []).length === 0 && (
              <p className="text-sm text-zinc-500">No deployments yet. Trigger one from a project.</p>
            )}
            {(data?.recentDeployments ?? []).map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                <div>
                  <p className="font-medium">{d.project.name} #{d.number}</p>
                  <p className="text-xs text-zinc-500">by {d.triggeredBy.name} · {formatDate(d.createdAt)}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                  d.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                  d.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
