import { describe, expect, it } from 'vitest';
import { ParseError, parseRegex } from '../src/parser/regexParser';

describe('正则解析器：错误带位置', () => {
  const invalidCases: Array<[string, number?]> = [
    ['(', 0],
    [')', 0],
    ['a)', 1],
    ['*', 0],
    ['|a', 0],
    ['a|', 1],
    ['(a', 0],
    ['[a-', 0],
    ['[]', 0],
    ['[z-a]', 0],
    ['\\q', 0],
  ];

  for (const [regex, pos] of invalidCases) {
    it(`拒绝 /${regex}/ 并给出位置`, () => {
      try {
        parseRegex(regex);
        throw new Error('应当抛出 ParseError');
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
        if (pos !== undefined) expect((e as ParseError).position).toBe(pos);
      }
    });
  }

  it('空正则被拒绝', () => {
    expect(() => parseRegex('')).toThrow(ParseError);
  });

  it('合法表达式不报错', () => {
    for (const r of ['a*', 'a|b', '(ab)+', '[a-z]?', 'a**b', 'a?*', '\\d+', 'a b']) {
      expect(() => parseRegex(r)).not.toThrow();
    }
  });

  it('收集字母表且去重', () => {
    const { alphabet } = parseRegex('aba|c[ab]');
    expect(alphabet).toEqual(['a', 'b', 'c']);
  });

  it('字符类区间展开', () => {
    const { ast } = parseRegex('[a-c]');
    expect(ast.kind).toBe('class');
    if (ast.kind === 'class') expect(ast.symbols).toEqual(['a', 'b', 'c']);
  });

  it('空分组 () 解析为 epsilon', () => {
    const { ast } = parseRegex('()');
    expect(ast.kind).toBe('epsilon');
  });
});
