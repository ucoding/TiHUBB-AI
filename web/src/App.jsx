// web/src/App.jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layout/MainLayout';
import BriefView from './views/Brief/BriefView';
import ChatView from './views/Chat/ChatView';

// 路由入口
export default function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          {/* 默认跳转到简报 */}
          <Route path="/" element={<Navigate to="/brief" replace />} />
          
          {/* 简报业务模块 */}
          <Route path="/brief" element={<BriefView />} />

          <Route path="/chat" element={<ChatView />} />
          
          {/* 占位路由：长文创作 */}
          <Route path="/long-form" element={
            <div className="flex items-center justify-center h-full text-slate-400 italic">
              长文/战略分析模块正在开发中...
            </div>
          } />
          
          {/* 404 兜底 */}
          <Route path="*" element={<div className="flex items-center justify-center h-full text-slate-400 italic">页面不存在</div>} />
        </Routes>
      </MainLayout>
    </Router>
  );
}