'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Archive, Copy, Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Project {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string;
  branch: string;
  framework: string | null;
  environment: string;
  tags: string[];
  archivedAt: string | null;
  _count: { deployments: number; envVars: number };
}

export default function ProjectsPage() {
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/projects'),
  });

  const createProject = useMutation({
    mutationFn: () => api<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New Project',
        description: 'A new deployment project',
        repoUrl: 'https://github.com/vercel/next.js',
        branch: 'canary',
        framework: 'Next.js',
        tags: ['new'],
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project created'); },
    onError: (e) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api(`/projects/${id}/archive`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project archived'); },
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => api(`/projects/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project duplicated'); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project deleted'); },
  });

  const restore = useMutation({
    mutationFn: (id: string) => api(`/projects/${id}/restore`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project restored'); },
  });

  if (isLoading) return <p className="text-zinc-500">Loading projects...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-zinc-500">Manage your deployment projects</p>
        </div>
        <Button onClick={() => createProject.mutate()} disabled={createProject.isPending}>
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <Card key={p.id} className={p.archivedAt ? 'opacity-60' : ''}>
            <div className="mb-2 flex items-start justify-between">
              <Link href={`/projects/${p.id}`} className="text-lg font-semibold hover:text-indigo-600">
                {p.name}
              </Link>
              {p.archivedAt && <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs">Archived</span>}
            </div>
            <p className="mb-3 line-clamp-2 text-sm text-zinc-500">{p.description}</p>
            <div className="mb-4 flex flex-wrap gap-1">
              {p.tags.map((t) => (
                <span key={t} className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{t}</span>
              ))}
            </div>
            <div className="mb-4 text-xs text-zinc-500">
              {p.framework} · {p.branch} · {p._count.deployments} deployments · {p._count.envVars} env vars
            </div>
            <div className="flex gap-2">
              {p.archivedAt ? (
                <Button size="sm" variant="outline" onClick={() => restore.mutate(p.id)}>
                  <RotateCcw className="h-3 w-3" />
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => archive.mutate(p.id)}>
                  <Archive className="h-3 w-3" />
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => duplicate.mutate(p.id)}>
                <Copy className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="destructive" onClick={() => remove.mutate(p.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
