/**
 * RegexInput：左侧正则输入区。
 * - 文本框 + 构造按钮
 * - 内置示例一点即填（并把推荐测试串也带给测试面板）
 * - 后端返回的错误（带 0 基位置）在输入框下方按列标出
 */

import { useState } from 'react';
import type { ExampleRegexDTO } from '../lib/types';

interface RegexInputProps {
  value: string;
  onChange: (v: string) => void;
  onConstruct: () => void;
  loading: boolean;
  error: string | null;
  errorPosition?: number;
  examples: ExampleRegexDTO[];
  onPickExample: (ex: ExampleRegexDTO) => void;
}

export function RegexInput({
  value,
  onChange,
  onConstruct,
  loading,
  error,
  errorPosition,
  examples,
  onPickExample,
}: RegexInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <aside className={`input-panel ${focused ? 'panel-focused' : ''}`}>
      <h2>正则表达式</h2>
      <p className="panel-hint">
        支持连接（并列）、选择 <code>|</code>、闭包 <code>*</code>、正闭包 <code>+</code>、
        可选 <code>?</code>、括号分组、字符类 <code>[a-z]</code> 与转义 <code>\d \w \s \n</code>。
      </p>

      <textarea
        className="regex-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onConstruct();
        }}
        rows={3}
        spellCheck={false}
        placeholder="例如：(a|b)*abb"
      />

      {error && (
        <div className="error-box" role="alert">
          <div className="error-title">正则有误</div>
          <div className="error-message">{error}</div>
          {errorPosition !== undefined && errorPosition < value.length && (
            <pre className="error-pointer">
              {`${value}\n${' '.repeat(errorPosition)}^ 位置 ${errorPosition}`}
            </pre>
          )}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={onConstruct}
        disabled={loading || value.trim().length === 0}
      >
        {loading ? '构造中…' : '构造（Ctrl/⌘ + Enter）'}
      </button>

      <div className="examples-block">
        <h3>内置示例（点击填入）</h3>
        <div className="example-list">
          {examples.map((ex) => (
            <button
              key={ex.id}
              type="button"
              className="example-chip"
              onClick={() => onPickExample(ex)}
              title={ex.description}
            >
              <span className="example-name">{ex.name}</span>
              <code>{ex.regex}</code>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
