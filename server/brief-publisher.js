// server/brief-publisher.js
import { pushBriefToWP } from './wp-client.js';

export async function publishBrief(aiResult) {
  return await pushBriefToWP({
    // 原生字段
    title: `【${aiResult.platformLabel}简报】${aiResult.question}`,
    content: aiResult.brief,
    excerpt: aiResult.summary, // 可选，但是原生支持的，留着没问题
    status: aiResult.status || 'draft', // 优先读取 aiResult.status 字段 publish

    /*
    ===============================
    ACF / 自定义字段（第二阶段启用）
    ===============================

    fields: {
      brief_platform: aiResult.platform,          // zhihu / xhs / x / linkedin
      brief_question: aiResult.question,          // 原始问题
      brief_tone: aiResult.tone,                  // 写作语气
      brief_ai_source: 'local',                   // local / api
      brief_model: aiResult.model,                // 使用模型
      brief_prompt_version: aiResult.promptVersion
    }
    */
  });
}
