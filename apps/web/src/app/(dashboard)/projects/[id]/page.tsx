'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Rocket, Key, GitBranch, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDuration, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string;
  branch: string;
  framework: string | null;
  environment: string;
}

interface Deployment {
  id: string;
  number: number;
  status: string;
  durationMs: number | null;
  logs: string;
  failureReason: string | null;
  rollbackAvailable: boolean;
  createdAt: string;
  triggeredBy: { name: string };
}

interface EnvVar {
  id: string;
  key: string;
  environment: string;
  version: number;
}

interface GitInfo {
  branches: string[];
  lastCommit: { sha: string; message: string; author: string; date: string } | null;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [envKey, setEnvKey] = useState('');
  const [envValue, setEnvValue] = useState('');
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(null);

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api<Project>(`/projects/${id}`),
  });

  const { data: deployments = [] } = useQuery({
    queryKey: ['deployments', id],
    queryFn: () => api<Deployment[]>(`/projects/${id}/deployments`),
    refetchInterval: 3000,
  });

  const { data: envVars = [] } = useQuery({
    queryKey: ['env-vars', id],
    queryFn: () => api<EnvVar[]>(`/projects/${id}/env-vars`),
  });

  const { data: gitInfo } = useQuery({
    queryKey: ['git', project?.repoUrl, project?.branch],
    queryFn: () => api<GitInfo>(`/git/info?url=${encodeURIComponent(project!.repoUrl)}&branch=${project!.branch}`),
    enabled: !!project,
  });

  const deploy = useMutation({
    mutationFn: () => api(`/projects/${id}/deployments`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deployments', id] }); toast.success('Deployment started'); },
    onError: (e) => toast.error(e.message),
  });

  const rollback = useMutation({
    mutationFn: (deploymentId: string) => api(`/projects/${id}/deployments/${deploymentId}/rollback`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deployments', id] }); toast.success('Rollback completed'); },
  });

  const addEnvVar = useMutation({
    mutationFn: () => api(`/projects/${id}/env-vars`, {
      method: 'POST',
      body: JSON.stringify({ key: envKey, value: envValue, environment: project?.environment ?? 'DEVELOPMENT' }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['env-vars', id] });
      setEnvKey('');
      setEnvValue('');
      toast.success('Environment variable added');
    },
    onError: (e) => toast.error(e.message),
  });

  const activeDeployment = deployments.find((d) => d.id === selectedDeployment) ?? deployments[0];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{project?.name ?? 'Project'}</h1>
          <p className="text-zinc-500">{project?.description}</p>
        </div>
        <Button onClick={() => deploy.mutate()} disabled={deploy.isPending}>
          <Rocket className="mr-2 h-4 w-4" />
          {deploy.isPending ? 'Deploying...' : 'Deploy'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Git Repository" description={project?.repoUrl} />
          {gitInfo?.lastCommit && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                <span>{project?.branch}</span>
                <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{gitInfo.lastCommit.sha}</code>
              </div>
              <p>{gitInfo.lastCommit.message}</p>
              <p className="text-zinc-500">{gitInfo.lastCommit.author} · {formatDate(gitInfo.lastCommit.date)}</p>
            </div>
          )}
          {gitInfo?.branches && (
            <p className="mt-3 text-xs text-zinc-500">{gitInfo.branches.length} branches available</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Environment Variables" />
          <div className="mb-4 space-y-2">
            {envVars.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded border border-zinc-100 px-3 py-2 text-sm dark:border-zinc-800">
                <span className="font-mono">{v.key}</span>
                <span className="text-zinc-500">v{v.version} · {v.environment}</span>
              </div>
            ))}
            {envVars.length === 0 && <p className="text-sm text-zinc-500">No variables configured</p>}
          </div>
          <div className="flex gap-2">
            <Input placeholder="KEY_NAME" value={envKey} onChange={(e) => setEnvKey(e.target.value.toUpperCase())} />
            <Input placeholder="value" value={envValue} onChange={(e) => setEnvValue(e.target.value)} />
            <Button size="sm" onClick={() => addEnvVar.mutate()} disabled={!envKey || !envValue}>
              <Key className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Deployment History" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            {deployments.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDeployment(d.id)}
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                  activeDeployment?.id === d.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div>
                  <span className="font-medium">#{d.number}</span>
                  <span className="ml-2 text-zinc-500">{d.triggeredBy.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${
                    d.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                    d.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>{d.status}</span>
                  {d.durationMs && <span className="text-xs text-zinc-500">{formatDuration(d.durationMs)}</span>}
                  {d.rollbackAvailable && (
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); rollback.mutate(d.id); }}>
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </button>
            ))}
            {deployments.length === 0 && <p className="text-sm text-zinc-500">No deployments yet</p>}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Build Logs</p>
            <pre className="h-64 overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs text-green-400">
              {activeDeployment?.logs || 'Select a deployment to view logs'}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
