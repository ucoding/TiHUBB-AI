// web/src/App.jsx

import { useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { marked } from 'marked';
import { 
  SparklesIcon, 
  ChatBubbleLeftRightIcon,
  ClipboardDocumentIcon, 
  ClipboardDocumentCheckIcon
} from '@heroicons/react/24/outline';

// 从环境变量读取 API 基础 URL
const API_BASE = import.meta.env.VITE_API_BASE;

export default function App() {
  const [question, setQuestion] = useState('');
  const [platform, setPlatform] = useState('zhihu');
  const [result, setResult] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const contentRef = useRef(null);
  const [copied, setCopied] = useState(false);

  function stripMarkdown(md) {
    return md
      .replace(/(\*\*|__)(.*?)\1/g, '$2')  // 粗体
      .replace(/(\*|_)(.*?)\1/g, '$2')     // 斜体
      .replace(/`{1,3}.*?`{1,3}/g, '')     // 代码块
      .replace(/!\[.*?\]\(.*?\)/g, '')     // 图片
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // 链接
      .replace(/#+\s?/g, '')               // 标题
      .replace(/^\s*>\s?/gm, '')           // 引用
      .replace(/[-*+]\s+/g, '')            // 列表符号
      .replace(/\n{2,}/g, '\n')            // 多空行合并
      .trim();
  }

  const handleCopy = useCallback(async () => {
    if (!result || !contentRef.current) return;

    try {
      const rawHtml = contentRef.current.innerHTML;
      const plainText = contentRef.current.innerText;
      // 构造带基础样式的 HTML（为了让 Word/飞书等识别格式）
      const htmlContent = `
        <html>
          <body>
            <style>
              h1 { font-size: 1.5em; font-weight: bold; margin-bottom: 1em; }
              p { margin-bottom: 0.8em; line-height: 1.6; }
              strong { font-weight: bold; }
              ol, ul { padding-left: 1.5em; margin-bottom: 1em; }
              li { margin-bottom: 0.4em; }
            </style>
            ${rawHtml}
          </body>
        </html>
      `;

      // 检查浏览器是否支持最新的剪贴板 API
      if (navigator.clipboard && window.ClipboardItem) {
        const data = [
          new ClipboardItem({
            "text/plain": new Blob([plainText], { type: "text/plain" }),
            "text/html": new Blob([htmlContent], { type: "text/html" }),
          }),
        ];

        await navigator.clipboard.write(data);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // 如果不支持新 API，回退到旧的纯文本复制
        fallbackCopy(result);
      }
    } catch (err) {
      console.error('富文本复制失败:', err);
      fallbackCopy(result); // 出错时尝试纯文本复制
    }
  }, [result]);

  function fallbackCopy(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('复制失败', e);
    }
  }

  async function runTool() {
    setLoading(true);
    setError(null);

    // --- 开始新任务时，复位所有旧状态 ---
    setResult('');         // 清空 Markdown 内容
    setKeywords([]);       // 清空旧关键词
    setPublishResult(null); // 清空旧推送成功的链接
    setAiResult(null);     // 清空发送给后端的数据对象
    // ------------------------------------------

    try {
      const res = await fetch(`${API_BASE}/api/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'brief', inputs: { question, platform } }),
      });

      const data = await res.json();
      // 从 data.output.result 中提取真正的 Markdown 文本
      const actualOutput = data.output?.result || '';

      if (res.ok && actualOutput) {
        const briefMarkdown = actualOutput.trim();
        const briefText = stripMarkdown(briefMarkdown); 
        const briefHtml = marked.parse(briefMarkdown);
        const finalKeywords = data.output?.keywords || [];
        
        setResult(briefMarkdown);
        
        setKeywords(finalKeywords); // 如果后端有 keywords 字段则设置，否则给空数组

        setAiResult({
          platform,
          platformLabel: platformConfigs.find(p => p.id === platform)?.label || platform.toUpperCase(),
          question,
          brief: briefHtml, // 将 MD 转为 HTML 字符串发送
          summary: briefText.slice(0, 120),
          keywords: finalKeywords,
          status: 'publish', 
        });
      } else {
        // 如果后端确实报错了，依然显示错误
        setError(data.error || '后端返回数据格式不正确');
      }
    } catch (e) {
      console.error('请求过程崩溃:', e);
      setError('网络连接失败，请检查后端服务是否启动');
    } finally {
      setLoading(false);
    }
  }

  const platformConfigs = [
    { id: 'zhihu', label: '知乎', icon: '知' },
    { id: 'x', label: ' X.com ', icon: '𝕏' },
    { id: 'xhs', label: '小红书', icon: '📕' },
  ];
  /*
  const platformConfigs = [
    {
      id: 'zhihu',
      label: '知乎',
      active: 'bg-blue-600 text-white',
      inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
    },
    {
      id: 'x',
      label: 'X / Twitter',
      active: 'bg-blue-400 text-white',
      inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
    },
    {
      id: 'xhs',
      label: '小红书',
      active: 'bg-red-500 text-white',
      inactive: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
    },
  ];*/

  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  
  async function handlePublish() {
    if (!aiResult) {
      alert('请先生成内容');
      return;
    }

    if (!aiResult.keywords || aiResult.keywords.length === 0) {
      // 如果这里弹窗了，说明是生成阶段或状态保存阶段出了问题
      const confirm = window.confirm('检测到关键词为空，确定要发布吗？');
      if (!confirm) return;
    }

    setPublishing(true);
    setPublishResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/publish-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiResult)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setPublishResult(data.result);
    } catch (err) {
      alert('推送失败：' + err.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200 mb-2">
          <SparklesIcon className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          TiHUBB 内容简报生成器
        </h1>
        <p className="text-lg text-slate-500">
          拒绝废话，一键生成高质量、有观点的社交媒体短文。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full min-h-[400px]">
          <div className="flex items-center space-x-2 mb-4">
            <ChatBubbleLeftRightIcon className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-900">输入话题</h2>
          </div>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="例如：为什么现在的年轻人不愿意生孩子？"
            className="w-full flex-1 p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-slate-700 placeholder:text-slate-400 text-base leading-relaxed mb-6"
          />
          <div className="space-y-4">

            {/* 平台选择区域 */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between px-1">
                <label className="text-sm font-bold text-slate-700">发布平台</label>
                <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                  已选: {platformConfigs.find(p => p.id === platform)?.label}
                </span>
              </div>

              <div className="bg-slate-100/80 p-1 rounded-xl flex flex-wrap gap-1">
                {platformConfigs.map((p) => {
                  const isSelected = platform === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlatform(p.id)}
                      disabled={loading || publishing}
                      className={`
                        flex-1 min-w-[80px] px-3 py-2 rounded-lg text-sm font-bold transition-all duration-200
                        ${isSelected 
                          ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' 
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                        }
                        ${(loading || publishing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        {/* 动态显示图标或文字首字母 */}
                        <span className="text-base">
                          {p.id === 'zhihu' ? '知' : p.id === 'xhs' ? '📕' : p.id === 'x' ? '𝕏' : 'R'}
                        </span>
                        {p.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-slate-400 mb-1 text-end">AI 将根据平台属性调整语气</div>
            </div>

            {/* 生成按钮 */}
            <button
              onClick={runTool}
              disabled={loading || !question.trim()}
              className={`
                relative w-full py-4 px-6 rounded-2xl font-bold text-lg transition-all duration-300 overflow-hidden
                flex items-center justify-center gap-3
                ${loading || !question.trim() 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0'
                }
              `}
            >
              {/* 1. 背景流光效果：仅在 Loading 时显示 */}
              {loading && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              )}

              {loading ? (
                <>
                  {/* 2. 呼吸灯加载图标 */}
                  <div className="relative flex h-5 w-5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-5 w-5 bg-white/20 items-center justify-center">
                      <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </span>
                  </div>
                  <span className="tracking-widest">AI 思考中...</span>
                </>
              ) : (
                <>
                  <SparklesIcon className={`h-6 w-6 transition-transform ${question.trim() ? 'animate-pulse' : ''}`} />
                  <span>开始生成简报</span>
                </>
              )}
            </button>
            
          </div>
        </div>
        
        {/* Output Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full min-h-[400px] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              生成结果
            </h2>
            {result && (
                <button
                  onClick={handleCopy}
                  className={`flex items-center space-x-1 text-sm font-medium transition-colors ${
                    copied ? 'text-green-600' : 'text-slate-500 hover:text-indigo-600'
                  }`}
                >
                  {copied ? (
                    <>
                      <ClipboardDocumentCheckIcon className="h-4 w-4" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <ClipboardDocumentIcon className="h-4 w-4" />
                      <span>一键复制</span>
                    </>
                  )}
                </button>
              )}
          </div>
        
          <div className="flex-1 rounded-xl border border-slate-100 p-4 overflow-y-auto relative">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                <div className="h-4 bg-slate-200 rounded w-2/3"></div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <div className="text-red-500 mb-2">⚠️</div>
                  <p className="text-red-600 font-medium">{error}</p>
                  <p className="text-sm text-slate-500 mt-1">请检查网络或稍后重试</p>
              </div>
            ) : result ? (
                <div ref={contentRef} className="prose prose-sm max-w-full">
                  <ReactMarkdown>{result}</ReactMarkdown>
                </div>
            ) : (
              <div className="h-full"></div>
            )}
          </div>

          {keywords.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium text-slate-700 mb-2">
                AI 建议关键词（可选）
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.map((kw, idx) => (
                  <label
                    key={idx}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      defaultChecked
                      onChange={(e) => {
                        setAiResult(prev => {
                          if (!prev) return prev;
                          const nextKeywords = e.target.checked
                            ? [...new Set([...(prev.keywords || []), kw])]
                            : (prev.keywords || []).filter(k => k !== kw);

                          return {
                            ...prev,
                            keywords: nextKeywords,
                          };
                        });
                      }}
                    />
                    <span>{kw}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          

          {/* 发布按钮与成功反馈整合区域 */}
          {result && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <button
                onClick={handlePublish}
                disabled={loading || publishing || !!publishResult}
                className={`w-full px-4 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center
                  ${(loading || publishing || !!publishResult)
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white shadow-md active:scale-95'
                  }`}
              >
                {publishing ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    推送中...
                  </>
                ) : publishResult ? (
                  '✓ 已成功推送至 WordPress'
                ) : (
                  '推送到 WordPress'
                )}
              </button>

              {/* 成功后的查看链接卡片 */}
              {publishResult && (
                <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-bottom-2">
                  <span className="text-sm text-green-700 font-medium">文章草稿已准备就绪</span>
                  <a
                    href={publishResult.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm bg-white px-3 py-1 rounded shadow-sm text-green-600 hover:text-green-700 border border-green-200 transition-colors"
                  >
                    去查看
                  </a>
                </div>
              )}
              
              {/* 字数统计 */}
              <div className="mt-2 flex justify-end">
                <span className="text-xs text-slate-400">{result.length} 字</span>
              </div>
            </div>
          )}
        </div>  
        
      </div>
      
    </div>
  );
}
