import { readFile } from 'node:fs/promises';

const GITHUB_API = 'https://api.github.com';

function encodePath(path) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export async function readRemoteSha({ owner, repo, branch, path, token }) {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`GitHub read failed with ${response.status}.`);
  }

  const payload = await response.json();
  return payload.sha;
}

export async function publishStreamsFile({
  owner,
  repo,
  branch,
  path,
  localPath,
  token,
  message,
}) {
  const content = await readFile(localPath, 'utf8');
  const sha = await readRemoteSha({ owner, repo, branch, path, token });
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodePath(path)}`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        branch,
        content: Buffer.from(content, 'utf8').toString('base64'),
        message,
        sha,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub publish failed with ${response.status}: ${body}`);
  }

  return response.json();
}
