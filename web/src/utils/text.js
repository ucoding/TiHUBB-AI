// web/src/utils/text.js
import { marked } from 'marked';

/**
 * 剥离 Markdown 标签，获取纯文本（用于生成摘要）
 */
export function stripMarkdown(md = '') {
  return md
    .replace(/(\*\*|__)(.*?)\1/g, '$2')  
    .replace(/(\*|_)(.*?)\1/g, '$2')     
    .replace(/`{1,3}.*?`{1,3}/g, '')     
    .replace(/!\[.*?\]\(.*?\)/g, '')     
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') 
    .replace(/#+\s?/g, '')               
    .replace(/^\s*>\s?/gm, '')           
    .replace(/[-*+]\s+/g, '')            
    .replace(/\n{2,}/g, '\n')            
    .trim();
}

/**
 * 统一模型显示名称
 */
export function formatModelName(name = '') {
  const lowName = name.toLowerCase();
  if (lowName.includes('gemini-3')) return '⚡️ Gemini 3 (Thinking)';
  if (lowName.includes('gemini-2')) return '⚖️ Gemini 2.x (Stable)';
  if (lowName.includes('gemma') || lowName.includes('ollama')) return '🏠 Local Gemma (Ollama)';
  return name || '未知模型';
}

/**
 * 高级复制功能：支持富文本（Word/飞书识别格式）
 */
export async function copyToClipboard(markdownText, elementRef) {
  if (!markdownText || !elementRef.current) return false;

  try {
    const rawHtml = elementRef.current.innerHTML;
    const plainText = elementRef.current.innerText;
    
    const htmlContent = `
      <html>
        <body>
          <style>
            h1 { font-size: 1.5em; font-weight: bold; margin-bottom: 1em; }
            p { margin-bottom: 0.8em; line-height: 1.6; }
            strong { font-weight: bold; }
          </style>
          ${rawHtml}
        </body>
      </html>
    `;

    if (navigator.clipboard && window.ClipboardItem) {
      const data = [
        new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([htmlContent], { type: "text/html" }),
        }),
      ];
      await navigator.clipboard.write(data);
      return true;
    } else {
      // 回退方案：纯文本复制
      const textarea = document.createElement('textarea');
      textarea.value = markdownText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    }
  } catch (err) {
    console.error('复制失败:', err);
    return false;
  }
}