import { useState } from 'react';
import { PipelineView } from './components/PipelineView';
import { CompareView } from './components/CompareView';

type Page = 'pipeline' | 'compare';

export default function App() {
  const [page, setPage] = useState<Page>('pipeline');

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>正则表达式构造流水线</h1>
        <p className="app-subtitle">
          正则 → <strong>ε-NFA（Thompson）</strong> → <strong>DFA（子集构造）</strong> →{' '}
          <strong>最小化 DFA（Hopcroft 划分）</strong>，每一步都看得见。
        </p>
        <nav className="page-tabs" aria-label="功能切换">
          <button
            type="button"
            className={`page-tab ${page === 'pipeline' ? 'page-tab-active' : ''}`}
            onClick={() => setPage('pipeline')}
          >
            构造与模拟
          </button>
          <button
            type="button"
            className={`page-tab ${page === 'compare' ? 'page-tab-active' : ''}`}
            onClick={() => setPage('compare')}
          >
            答案对拍
          </button>
        </nav>
      </header>

      {page === 'pipeline' ? <PipelineView /> : <CompareView />}

      <footer className="app-footer">
        所有构造与模拟均由后端完成：解析器 · Thompson · 子集构造 · Hopcroft · 三机一致性模拟 ·
        乘积自动机语言对拍。
      </footer>
    </div>
  );
}
