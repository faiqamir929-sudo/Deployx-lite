import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';

@Injectable()
export class GitService {
  private octokit: Octokit;

  constructor(private config: ConfigService) {
    this.octokit = new Octokit({
      auth: this.config.get<string>('GITHUB_TOKEN') || undefined,
    });
  }

  parseRepoUrl(url: string): { owner: string; repo: string } {
    const match = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (!match) throw new BadRequestException('Invalid GitHub repository URL');
    return { owner: match[1], repo: match[2] };
  }

  async validateRepository(url: string) {
    const { owner, repo } = this.parseRepoUrl(url);
    try {
      const { data } = await this.octokit.repos.get({ owner, repo });
      return {
        valid: true,
        name: data.full_name,
        description: data.description,
        defaultBranch: data.default_branch,
        stars: data.stargazers_count,
        language: data.language,
        private: data.private,
      };
    } catch {
      throw new BadRequestException('Repository not found or inaccessible');
    }
  }

  async getBranches(url: string) {
    const { owner, repo } = this.parseRepoUrl(url);
    const { data } = await this.octokit.repos.listBranches({ owner, repo, per_page: 30 });
    return data.map((b) => b.name);
  }

  async getLastCommit(url: string, branch: string) {
    const { owner, repo } = this.parseRepoUrl(url);
    const { data } = await this.octokit.repos.getCommit({ owner, repo, ref: branch });
    return {
      sha: data.sha.slice(0, 7),
      message: data.commit.message,
      author: data.commit.author?.name ?? 'Unknown',
      email: data.commit.author?.email,
      date: data.commit.author?.date,
      url: data.html_url,
    };
  }

  async getRepoInfo(url: string, branch: string) {
    const [metadata, branches, lastCommit] = await Promise.all([
      this.validateRepository(url),
      this.getBranches(url),
      this.getLastCommit(url, branch).catch(() => null),
    ]);
    return { ...metadata, branches, lastCommit };
  }
}
