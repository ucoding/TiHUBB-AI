// server/article-publisher.js

import { runTool } from './tool-runner.js';
import { pushArticleToWP } from './wp-client.js'; // 引入刚才那个强大的客户端

/**
 * 业务编排：生成大纲
 */
export async function generateArticleOutline(topic) {
  const response = await runTool('article_outline', { question: topic, _isRecursive: true });
  return response.result;
}

/**
 * 业务编排：生成章节
 */
export async function generateSection(sectionData, context) {
  return await runTool('article_section', {
    question: sectionData.heading,
    context,
    requirements: sectionData.key_points?.join('，'),
    _isRecursive: true
  });
}

/**
 * 核心：文章发布路由调用的具体逻辑
 */
export async function publishArticle({ title, content, excerpt, status = 'draft', tags = [] }) {
  // 1. 数据清洗/准备
  // 可以在这里做一些发布前的最后处理，比如自动提取关键词做标签
  const finalTags = tags.length > 0 ? tags : ['AI智能创作', '深度长文'];

  // 2. 调用统一的 WP 客户端进行推送
  // 此时逻辑已经流转到 wp-client.js，那里会处理 Markdown-It 的转换和分类 ID 匹配
  try {
    const result = await pushArticleToWP({
      title,
      content,      // 传入原始 MD
      excerpt,
      status,
      tags: finalTags,
      categories: ['深度观察'] // 也可以由前端传进来
    });

    return result; // 返回 { postId, link }
  } catch (err) {
    throw new Error(`[Publisher] ${err.message}`);
  }
}