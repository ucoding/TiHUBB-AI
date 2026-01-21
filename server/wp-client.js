// server/wp-client.js

import fetch from 'node-fetch';

/**
 * 推送 Brief 到 WordPress
 */
export async function pushBriefToWP({
  title,
  excerpt,
  content,
  status = 'draft',
  fields = {}
}) {
  const {
    WP_API_BASE,
    WP_USERNAME,
    WP_APP_PASSWORD
  } = process.env;

  if (!WP_API_BASE || !WP_USERNAME || !WP_APP_PASSWORD) {
    throw new Error('WordPress API credentials are not fully configured.');
  }

  const auth = Buffer.from(
    `${WP_USERNAME}:${WP_APP_PASSWORD}`
  ).toString('base64');

  const payload = {
    title,
    excerpt,
    content,
    status,
    ...(Object.keys(fields).length ? { fields } : {})
  };

  const res = await fetch(`${WP_API_BASE}/wp/v2/brief`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[WP PUSH ERROR]', {
      status: res.status,
      data
    });
    throw new Error(data?.message || 'WP push failed');
  }

  return {
    postId: data.id,
    link: data.link,
    status: data.status
  };
}

