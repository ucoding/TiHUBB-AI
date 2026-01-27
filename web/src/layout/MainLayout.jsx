// web/src/layout/MainLayout.jsx
import { Link, useLocation } from 'react-router-dom';
import { 
  DocumentTextIcon, 
  PencilSquareIcon, 
  PhotoIcon, 
  CommandLineIcon 
} from '@heroicons/react/24/outline'; // 建议安装 @heroicons/react

const MainLayout = ({ children }) => {
  const location = useLocation();

  const menuItems = [
    { name: '聊天会话', path: '/chat', icon: DocumentTextIcon },
    { name: '社媒简报', path: '/brief', icon: DocumentTextIcon },
    { name: '文章创作', path: '/article', icon: PencilSquareIcon },
    { name: 'AI 生图', path: '/image-gen', icon: PhotoIcon },
    { name: 'Skill 管理', path: '/skills', icon: CommandLineIcon },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 左侧侧边栏 */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 text-xl font-bold border-b border-slate-800">
          TiHUBB 智能应用
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                  isActive 
                  ? 'bg-blue-600 text-white' 
                  : 'hover:bg-slate-800 text-gray-400 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 text-xs text-gray-500">
          TiHUBB AI v1.0.0
        </div>
      </aside>

      {/* 右侧主区域 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <section className="flex-1 overflow-auto p-6">
          {children} {/* 这里就是具体的 BriefView 或其他 View */}
        </section>
      </main>
    </div>
  );
};

export default MainLayout;