'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader } from '@/components/ui/card';

export default function AiPage() {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const chat = useMutation({
    mutationFn: (msg: string) => api<{ response: string }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: msg }),
    }),
    onSuccess: (data, msg) => {
      setChatHistory((h) => [...h, { role: 'user', content: msg }, { role: 'assistant', content: data.response }]);
      setMessage('');
    },
  });

  const reviewReadme = useMutation({
    mutationFn: () => api<{ review: string }>('/ai/review-readme', {
      method: 'POST',
      body: JSON.stringify({
        readmeContent: '# My App\n\nA simple deployment project.\n\n## Setup\n\nnpm install && npm run dev',
      }),
    }),
    onSuccess: (data) => {
      setChatHistory((h) => [...h, { role: 'assistant', content: data.review }]);
    },
  });

  function handleSend() {
    if (!message.trim()) return;
    chat.mutate(message);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Deployment Assistant</h1>
        <p className="text-zinc-500">Get help with deployments, env vars, and README reviews</p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => reviewReadme.mutate()} disabled={reviewReadme.isPending}>
          Review Sample README
        </Button>
      </div>

      <Card className="flex h-[500px] flex-col">
        <CardHeader title="Chat" description="Ask about deployment issues, env vars, or best practices" />
        <div className="flex-1 space-y-4 overflow-auto p-2">
          {chatHistory.length === 0 && (
            <p className="text-sm text-zinc-500">Try: &quot;What env vars does a Next.js app need?&quot;</p>
          )}
          {chatHistory.map((m, i) => (
            <div key={i} className={`rounded-lg p-3 text-sm ${
              m.role === 'user' ? 'ml-8 bg-indigo-100 dark:bg-indigo-950' : 'mr-8 bg-zinc-100 dark:bg-zinc-800'
            }`}>
              <p className="mb-1 text-xs font-medium uppercase text-zinc-500">{m.role}</p>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask the deployment assistant..."
          />
          <Button onClick={handleSend} disabled={chat.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}
