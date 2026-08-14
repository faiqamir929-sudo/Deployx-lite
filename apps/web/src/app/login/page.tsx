'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { api, setToken, setUser } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'dev@deployx.local', password: 'Dev123456!' },
  });

  async function onSubmit(data: FormData) {
    try {
      const res = await api<{ accessToken: string; user: { id: string; email: string; name: string; role: string } }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify(data) },
      );
      setToken(res.accessToken);
      setUser(res.user);
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      <Card className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Rocket className="h-8 w-8 text-indigo-600" />
          <h1 className="text-2xl font-bold">DeployX Lite</h1>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <Input type="email" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <Input type="password" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          No account?{' '}
          <Link href="/register" className="text-indigo-600 hover:underline">Register</Link>
        </p>
      </Card>
    </div>
  );
}
