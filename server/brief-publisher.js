// server/brief-publisher.js
import { pushBriefToWP } from './wp-client.js';

export async function publishBrief(aiResult) {
  const seoData = aiResult.seo || { 
    seo_title: '', 
    seo_keywords: '', 
    seo_description: '' 
  };
  return await pushBriefToWP({
    // 原生字段
    //title: `【${aiResult.platformLabel}简报】${aiResult.question}`,
    title: `${aiResult.question}`,
    content: aiResult.brief,
    excerpt: aiResult.summary, // 可选，但是原生支持的，留着没问题
    status: aiResult.status || 'draft', // 优先读取 aiResult.status 字段 publish
    keywords: Array.isArray(aiResult.keywords) ? aiResult.keywords : [], // 确保 keywords 始终是一个数组，防止传递 undefined 导致 ensureTerms 报错
    acf: {
      brief_platform: aiResult.platform, // ← ACF field name    
      seo_meta: { // 对应你创建的 Group 字段名
        seo_title: seoData.seo_title || '',
        seo_keywords: seoData.seo_keywords || '',
        seo_description: seoData.seo_description || ''
      }
    },
  });
}
