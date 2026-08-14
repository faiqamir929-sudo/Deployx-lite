import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { EnvVarsService } from '../env-vars/env-vars.service';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { AnalyzeFailureDto, ReviewReadmeDto, SuggestEnvVarsDto, ChatDto } from './dto/ai.dto';

@Injectable()
export class AiService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private projects: ProjectsService,
    private envVars: EnvVarsService,
  ) { }

  async analyzeFailure(dto: AnalyzeFailureDto, user: JwtPayload) {
    const deployment = await this.prisma.deployment.findFirst({
      where: { id: dto.deploymentId, projectId: dto.projectId },
    });
    if (!deployment) throw new NotFoundException('Deployment not found');
    await this.projects.findOne(dto.projectId, user);

    const prompt = `Analyze this deployment failure and suggest fixes:\n\nLogs:\n${deployment.logs}\n\nFailure: ${deployment.failureReason ?? 'Unknown'}`;
    const analysis = await this.callLlm(prompt);
    return { deploymentId: deployment.id, analysis };
  }

  async reviewReadme(dto: ReviewReadmeDto) {
    const prompt = `Review this README for a deployment platform project. Rate quality 1-10 and suggest improvements:\n\n${dto.readmeContent}`;
    const review = await this.callLlm(prompt);
    return { review };
  }

  async suggestEnvVars(dto: SuggestEnvVarsDto, user: JwtPayload) {
    const project = await this.projects.findOne(dto.projectId, user);
    const existing = await this.envVars.getDecryptedKeys(dto.projectId, project.environment);
    const framework = dto.framework ?? project.framework ?? 'Node.js';

    const commonVars: Record<string, string[]> = {
      'Next.js': ['NEXT_PUBLIC_API_URL', 'DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'],
      'React': ['REACT_APP_API_URL', 'NODE_ENV'],
      'NestJS': ['DATABASE_URL', 'JWT_SECRET', 'PORT', 'REDIS_URL'],
      'Node.js': ['NODE_ENV', 'PORT', 'DATABASE_URL'],
    };

    const suggested = commonVars[framework] ?? commonVars['Node.js'];
    const missing = suggested.filter((key) => !existing[key]);

    const prompt = missing.length
      ? `Suggest values and descriptions for these missing environment variables for a ${framework} app: ${missing.join(', ')}`
      : `All common env vars are set for ${framework}. Suggest any additional production env vars.`;

    const aiSuggestions = await this.callLlm(prompt);
    return { framework, existing: Object.keys(existing), missing, suggestions: aiSuggestions };
  }

  async chat(dto: ChatDto, user: JwtPayload) {
    let context = '';
    if (dto.projectId) {
      const project = await this.projects.findOne(dto.projectId, user);
      context = `Project: ${project.name}, Framework: ${project.framework}, Repo: ${project.repoUrl}\n`;
    }
    const response = await this.callLlm(`${context}User question: ${dto.message}`);
    return { response };
  }

  private async callLlm(prompt: string): Promise<string> {
    const provider = this.config.get('AI_PROVIDER', 'ollama');

    try {
      if (provider === 'ollama') {
        return await this.callOllama(prompt);
      }
      return await this.callOpenRouter(prompt);
    } catch {
      return this.fallbackAnalysis(prompt);
    }
  }

  private async callOllama(prompt: string): Promise<string> {
    const baseUrl = this.config.get('OLLAMA_BASE_URL', 'http://localhost:11434');
    const model = this.config.get('OLLAMA_MODEL', 'llama3.2');

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    });

    if (!res.ok) throw new Error('Ollama unavailable');
    const data = await res.json() as { response: string };
    return data.response;
  }

  private async callOpenRouter(prompt: string): Promise<string> {
    const apiKey = this.config.get('OPENROUTER_API_KEY') || this.config.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('No API key configured');

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) throw new Error('OpenRouter unavailable');
    const data = await res.json() as { choices: { message: { content: string } }[] };
    return data.choices[0].message.content;
  }

  private fallbackAnalysis(prompt: string): string {
    if (prompt.includes('failure') || prompt.includes('Failed')) {
      return `## Deployment Failure Analysis (Offline Mode)

**Likely causes:**
1. Missing environment variables — check DATABASE_URL and API keys
2. Dependency installation failed — verify package.json and lock file
3. Build configuration error — review build scripts

**Suggested fixes:**
- Run \`npm install\` locally to reproduce
- Check deployment logs for the first error line
- Ensure all required env vars are set for the target environment
- Verify the branch exists and has the latest commits`;
    }
    return `## AI Assistant (Offline Mode)

I'm running in offline mode because no LLM provider is configured.

**To enable AI features:**
1. Install [Ollama](https://ollama.ai) and run \`ollama pull llama3.2\`
2. Or set \`OPENROUTER_API_KEY\` in your .env file

**General deployment tips:**
- Keep environment variables in sync across dev/staging/production
- Write a clear README with setup instructions
- Use health check endpoints for deployment verification`;
  }
}
