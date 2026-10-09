import { readFile } from 'node:fs/promises';

// 读取部署结果状态用的轻量检查脚本
const config = await readFile('C:/Users/26780/AppData/Roaming/xdg.config/.wrangler/config/default.toml', 'utf8');
const token = /oauth_token\s*=\s*"([^"]+)"/.exec(config)?.[1];
if (!token) { console.log('NO_TOKEN'); process.exit(1); }
const account = 'a6fc25eb5bd6e9ee026276d9c876b797';
const base = 'https://api.cloudflare.com/client/v4/accounts/' + account;

const bucket = await fetch(base + '/r2/buckets/flyme-music-releases', { headers: { Authorization: 'Bearer ' + token } });
const bucketBody = await bucket.json();
console.log('bucket:', bucket.status, bucketBody.success ? (bucketBody.result?.name ?? 'exists') : JSON.stringify(bucketBody.errors).slice(0, 200));

if (bucketBody.success) {
  const domain = await fetch(base + '/r2/buckets/flyme-music-releases/domains/managed', { headers: { Authorization: 'Bearer ' + token } });
  const domainBody = await domain.json();
  console.log('domain:', domain.status, JSON.stringify(domainBody.result ?? domainBody.errors).slice(0, 300));

  const cfg = await fetch(base + '/pages/projects/flyme-music/deployment_configs', { headers: { Authorization: 'Bearer ' + token } });
  const cfgBody = await cfg.json();
  const mirror = cfgBody.result?.production?.env_vars?.RELEASE_MIRROR;
  console.log('pages RELEASE_MIRROR:', mirror ?? '(not set)');

  const deploys = await fetch(base + '/pages/projects/flyme-music/deployments?per_page=3', { headers: { Authorization: 'Bearer ' + token } });
  const deploysBody = await deploys.json();
  for (const d of deploysBody.result ?? []) {
    console.log('deploy:', d.created_on, d.environment, d.latest_stage?.status, d.deployment_trigger?.metadata?.commit_hash?.slice(0, 7));
  }
}
