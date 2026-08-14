'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { api, setToken, setUser } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    try {
      const res = await api<{ accessToken: string; user: { id: string; email: string; name: string; role: string } }>(
        '/auth/register',
        { method: 'POST', body: JSON.stringify(data) },
      );
      setToken(res.accessToken);
      setUser(res.user);
      toast.success('Account created!');
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      <Card className="w-full max-w-md">
        <h1 className="mb-6 text-center text-2xl font-bold">Create Account</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <Input {...register('name')} />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>
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
            {isSubmitting ? 'Creating...' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link href="/login" className="text-indigo-600 hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
