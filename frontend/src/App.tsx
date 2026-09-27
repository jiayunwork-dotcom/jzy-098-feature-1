import { useState } from 'react';
import { PipelineView } from './components/PipelineView';
import { CompareView } from './components/CompareView';

type Tab = 'pipeline' | 'compare';

export default function App() {
  const [tab, setTab] = useState<Tab>('pipeline');

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>正则表达式构造流水线</h1>
        <p className="app-subtitle">
          正则 → <strong>ε-NFA（Thompson）</strong> → <strong>DFA（子集构造）</strong> →{' '}
          <strong>最小化 DFA（Hopcroft 划分）</strong>，每一步都看得见。
        </p>
      </header>

      <nav className="app-tabs" aria-label="功能切换">
        <button
          type="button"
          className={`app-tab ${tab === 'pipeline' ? 'app-tab-active' : ''}`}
          onClick={() => setTab('pipeline')}
        >
          构造与模拟
        </button>
        <button
          type="button"
          className={`app-tab ${tab === 'compare' ? 'app-tab-active' : ''}`}
          onClick={() => setTab('compare')}
        >
          答案对拍
        </button>
      </nav>

      {tab === 'pipeline' ? <PipelineView /> : <CompareView />}

      <footer className="app-footer">
        所有构造与模拟均由后端完成：解析器 · Thompson · 子集构造 · Hopcroft · 三机一致性模拟 · 乘积自动机语言判定。
      </footer>
    </div>
  );
}
