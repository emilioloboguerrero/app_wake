// Minimal GitHub REST client using fetch. No Octokit dependency — the
// agent only needs issues, comments, and a handful of read-only endpoints.
//
// Auth: fine-grained PAT from GITHUB_OPS_TOKEN, scoped to the wake repo
// with Issues:RW + Contents:R + Pull requests:R.
//
// The client is stateless; callers construct a GithubClient with
// {token, owner, repo} and call methods that return plain JSON.

import * as functions from "firebase-functions";

export interface GithubIssueRef {
  number: number;
  htmlUrl: string;
  state: "open" | "closed";
  title: string;
  labels: string[];
  body: string | null;
}

export interface GithubCommit {
  sha: string;
  message: string;
  authorName: string | null;
  authorDate: string; // ISO 8601
  url: string;
}

export interface GithubClientOptions {
  token: string;
  owner: string;
  repo: string;
}

interface GithubError {
  message: string;
  status: number;
  body: unknown;
}

function isGithubError(x: unknown): x is GithubError {
  return typeof x === "object" && x !== null && "status" in x;
}

async function ghFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "wake-ops-agent",
      ...(body ? {"Content-Type": "application/json"} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? safeJson(text) : null;
  if (!res.ok) {
    const err: GithubError = {
      message: `GitHub ${method} ${path} ${res.status}`,
      status: res.status,
      body: parsed ?? text,
    };
    functions.logger.warn("github error", err);
    throw err;
  }
  return parsed;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class GithubClient {
  constructor(private readonly opts: GithubClientOptions) {}

  private repoPath(rest: string): string {
    return `/repos/${this.opts.owner}/${this.opts.repo}${rest}`;
  }

  async createIssue(input: {
    title: string;
    body: string;
    labels?: string[];
  }): Promise<GithubIssueRef> {
    const res = (await ghFetch(this.opts.token, "POST", this.repoPath("/issues"), {
      title: input.title,
      body: input.body,
      labels: input.labels ?? [],
    })) as {
      number: number;
      html_url: string;
      state: "open" | "closed";
      title: string;
      labels: Array<{name: string}>;
      body: string | null;
    };
    return {
      number: res.number,
      htmlUrl: res.html_url,
      state: res.state,
      title: res.title,
      labels: res.labels.map((l) => l.name),
      body: res.body,
    };
  }

  async commentOnIssue(
    issueNumber: number,
    body: string
  ): Promise<{htmlUrl: string}> {
    const res = (await ghFetch(
      this.opts.token,
      "POST",
      this.repoPath(`/issues/${issueNumber}/comments`),
      {body}
    )) as {html_url: string};
    return {htmlUrl: res.html_url};
  }

  async getIssue(issueNumber: number): Promise<GithubIssueRef | null> {
    try {
      const res = (await ghFetch(
        this.opts.token,
        "GET",
        this.repoPath(`/issues/${issueNumber}`)
      )) as {
        number: number;
        html_url: string;
        state: "open" | "closed";
        title: string;
        labels: Array<{name: string}>;
        body: string | null;
      };
      return {
        number: res.number,
        htmlUrl: res.html_url,
        state: res.state,
        title: res.title,
        labels: res.labels.map((l) => l.name),
        body: res.body,
      };
    } catch (err) {
      if (isGithubError(err) && err.status === 404) return null;
      throw err;
    }
  }

  async findIssuesByLabel(
    label: string,
    state: "open" | "closed" | "all" = "open"
  ): Promise<GithubIssueRef[]> {
    const qs = new URLSearchParams({
      labels: label,
      state,
      per_page: "100",
    }).toString();
    const res = (await ghFetch(
      this.opts.token,
      "GET",
      this.repoPath(`/issues?${qs}`)
    )) as Array<{
      number: number;
      html_url: string;
      state: "open" | "closed";
      title: string;
      labels: Array<{name: string}>;
      body: string | null;
      pull_request?: unknown;
    }>;
    return res
      .filter((r) => !r.pull_request)
      .map((r) => ({
        number: r.number,
        htmlUrl: r.html_url,
        state: r.state,
        title: r.title,
        labels: r.labels.map((l) => l.name),
        body: r.body,
      }));
  }

  async getRecentCommits(count: number): Promise<GithubCommit[]> {
    const qs = new URLSearchParams({
      per_page: String(Math.min(Math.max(count, 1), 100)),
    }).toString();
    const res = (await ghFetch(
      this.opts.token,
      "GET",
      this.repoPath(`/commits?${qs}`)
    )) as Array<{
      sha: string;
      html_url: string;
      commit: {
        message: string;
        author?: {name?: string; date?: string};
      };
    }>;
    return res.map((r) => ({
      sha: r.sha,
      message: r.commit.message,
      authorName: r.commit.author?.name ?? null,
      authorDate: r.commit.author?.date ?? "",
      url: r.html_url,
    }));
  }

  async getCommit(sha: string): Promise<GithubCommit | null> {
    try {
      const res = (await ghFetch(
        this.opts.token,
        "GET",
        this.repoPath(`/commits/${encodeURIComponent(sha)}`)
      )) as {
        sha: string;
        html_url: string;
        commit: {message: string; author?: {name?: string; date?: string}};
      };
      return {
        sha: res.sha,
        message: res.commit.message,
        authorName: res.commit.author?.name ?? null,
        authorDate: res.commit.author?.date ?? "",
        url: res.html_url,
      };
    } catch (err) {
      if (isGithubError(err) && err.status === 404) return null;
      throw err;
    }
  }
}
