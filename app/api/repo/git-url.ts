const DEFAULT_ALLOWED_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'];

function getAllowedHosts(): Set<string> {
  const configured = process.env.GITMAPS_ALLOWED_GIT_HOSTS;
  const hosts = configured
    ? configured.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWED_HOSTS;
  return new Set(hosts);
}

export function parseSafeGitUrl(input: string): { url: string; repoName: string } {
  if (!input || typeof input !== 'string') {
    throw new Error('url is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('Invalid git URL. Use an HTTPS Git URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS Git URLs are supported.');
  }

  const allowedHosts = getAllowedHosts();
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error(`Unsupported Git host: ${parsed.hostname}`);
  }

  const pathSegments = parsed.pathname
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean);

  if (pathSegments.length < 2) {
    throw new Error('Git URL must include an owner/group and repository name.');
  }

  const repoName = pathSegments[pathSegments.length - 1]
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);

  if (!repoName) {
    throw new Error('Could not determine repository name from URL');
  }

  return { url: parsed.toString(), repoName };
}
