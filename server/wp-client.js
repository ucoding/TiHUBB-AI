// server/wp-client.js

import fetch from 'node-fetch';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: true,     // 允许原生的 HTML 标签
  linkify: true,  // 自动转换链接
  typographer: true
});

/**
 * 内部辅助函数：确保 Taxonomy 中的 Term 存在，并返回其 ID
 */
async function ensureTerms(baseUrl, auth, taxonomy, names) {
  if (!names || !names.length) return [];
  
  const termIds = [];
  for (const name of names) {
    if (!name) continue;
    const trimmedName = name.trim();

    try {
      // 1. 尝试查找
      const searchRes = await fetch(
        `${baseUrl}/wp/v2/${taxonomy}?search=${encodeURIComponent(trimmedName)}`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      const existing = await searchRes.json();
      const match = Array.isArray(existing) ? existing.find(t => t.name === trimmedName) : null;

      if (match) {
        termIds.push(match.id);
        continue;
      }

      // 2. 尝试创建
      console.log(`[WP] 正在尝试创建新分类: "${trimmedName}"`);
      const createRes = await fetch(`${baseUrl}/wp/v2/${taxonomy}`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: trimmedName })
      });

      const result = await createRes.json();

      if (createRes.ok && result.id) {
        console.log(`[WP] 创建成功: ID ${result.id}`);
        termIds.push(result.id);
      } else {
        // --- 这里是关键：打印 WP 返回的错误信息 ---
        console.error(`[WP 创建失败详情]:`, {
          name: trimmedName,
          status: createRes.status,
          code: result.code, // 比如 'rest_cannot_create'
          message: result.message
        });
        
        // 如果是因为已存在但刚才没搜到，尝试从结果拿 ID
        if (result.code === 'term_exists') {
          termIds.push(result.data.term_id);
        }
      }
    } catch (err) {
      console.error(`[网络请求错误]: ${trimmedName}`, err.message);
    }
  }
  return [...new Set(termIds)];
}

/**
 * 推送 Brief 到 WordPress
 */
export async function pushBriefToWP({
  title,
  excerpt,
  content,
  status = 'draft',
  acf = {},
  keywords = [] // 修复：必须在此接收 keywords 参数
}) {
  const {
    WP_API_BASE,
    WP_USERNAME,
    WP_APP_PASSWORD
  } = process.env;

  if (!WP_API_BASE || !WP_USERNAME || !WP_APP_PASSWORD) {
    throw new Error('WordPress API credentials are not fully configured.');
  }

  const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
  const baseUrl = WP_API_BASE.replace(/\/$/, '');

  // 1. 处理分类法逻辑
  const categoryIds = await ensureTerms(baseUrl, auth, 'brief-category', keywords);
  console.log('获取到的分类 IDs:', categoryIds); // 调试用

  // 2. 构造 Payload
  const payload = {
    title,
    excerpt,
    content,
    status,
    // 将获取到的 ID 数组绑定到自定义分类法字段
    'brief-category': categoryIds, 
    ...(Object.keys(acf).length ? { acf } : {})
  };

  // 3. 执行推送
  const res = await fetch(`${baseUrl}/wp/v2/brief`, {
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


/**
 * 推送长文到 WordPress
 */
export async function pushArticleToWP({
  title,
  content,      // Markdown 格式
  excerpt = '', 
  status = 'draft',
  categories = ['AI生成'], // 默认分类
  tags = [],
  authorId = 1
}) {
  const { WP_API_BASE, WP_USERNAME, WP_APP_PASSWORD } = process.env;
  const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
  const baseUrl = WP_API_BASE.replace(/\/$/, '');

  // 1. 格式转换：将 Markdown 转为 WP 喜欢的结构化 HTML
  // 你可以给生成的 HTML 包裹一层类名，方便在网站前端做样式隔离
  const formattedContent = `
    <div class="ai-generated-article">
      ${md.render(content)}
    </div>
  `;

  // 2. 处理标准分类 (WP 自带的 categories 是 ID 数组)
  const categoryIds = await ensureTerms(baseUrl, auth, 'categories', categories);
  const tagIds = await ensureTerms(baseUrl, auth, 'tags', tags);

  // 3. 构造 Payload (针对标准文章 post)
  const payload = {
    title,
    excerpt,
    content: formattedContent,
    status,
    categories: categoryIds,
    tags: tagIds,
    author: authorId
  };

  // 4. 执行推送 (注意：标准文章路径是 /wp/v2/posts)
  const res = await fetch(`${baseUrl}/wp/v2/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'WP Article push failed');

  return { postId: data.id, link: data.link };
}