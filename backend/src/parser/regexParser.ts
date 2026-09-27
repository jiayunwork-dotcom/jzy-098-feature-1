/**
 * 正则解析器（递归下降）。
 *
 * 文法（从低优先级到高）：
 *   alt    := concat ('|' concat)*
 *   concat := repeat*
 *   repeat := atom ('*' | '+' | '?')*
 *   atom   := '(' alt? ')' | '[' class ']' | char | '\' escape
 *
 * 支持的基本算子：连接（并列）、选择 |、闭包 *、正闭包 +、可选 ?、括号分组。
 * 额外提供字符类 [abc]、区间 [a-z]、常见转义（\d \w \s \n \t 等）以及
 * 空分组 () 显式表示 ε（方便演示 epsilon-NFA 的退化情形）。
 *
 * 所有词法/语法错误都抛 ParseError，带 0 基位置，前端可直接定位到列。
 */

import type { AstNode, Symbol } from '../automata/types';

export class ParseError extends Error {
  position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
  }
}

export interface ParseOutput {
  ast: AstNode;
  /** 按首次出现顺序收集到的字母表 */
  alphabet: Symbol[];
}

const SIMPLE_ESCAPES: Record<string, Symbol> = {
  n: '\n',
  t: '\t',
  r: '\r',
  f: '\f',
  v: '\v',
  '0': '\0',
};

/** 字符类/转义里可表示的"单词字符"集合，用于 \d \w \s */
const DIGITS = '0123456789'.split('');
const WORD_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_'.split('');
const SPACES = [' ', '\t', '\n', '\r', '\f', '\v'];

const REGEX_META = new Set(['(', ')', '|', '*', '+', '?', '[', ']', '\\']);
const CLASS_META = new Set(['[', ']', '\\']);

let nextId = 1;
const newId = () => nextId++;

export function parseRegex(source: string): ParseOutput {
  if (source.length > 500) {
    throw new ParseError('正则过长（最多 500 个字符）', 500);
  }
  nextId = 1;
  const p = new Parser(source);
  const ast = p.parseAlt();
  if (!ast) {
    throw new ParseError('空正则：请至少输入一个表达式（空表达式请用 () 表示 ε）', 0);
  }
  p.skipSpaces();
  if (!p.atEnd()) {
    throw new ParseError(`意外的字符 ")"，缺少与之配对的 "("`, p.pos);
  }
  const alphabet: Symbol[] = [];
  collectAlphabet(ast, alphabet);
  return { ast, alphabet };
}

class Parser {
  src: string;
  pos = 0;

  constructor(src: string) {
    this.src = src;
  }

  atEnd(): boolean {
    return this.pos >= this.src.length;
  }

  peek(): string {
    return this.src[this.pos];
  }

  skipSpaces(): void {
    while (!this.atEnd() && this.peek() === ' ') this.pos++;
  }

  // alt := concat ('|' concat)*
  parseAlt(): AstNode | null {
    let left = this.parseConcat();
    for (;;) {
      this.skipSpaces();
      if (this.atEnd() || this.peek() !== '|') break;
      const barPos = this.pos;
      this.pos++; // 吃掉 |
      if (!left) {
        throw new ParseError(
          `选择符 "|" 缺少左操作数（位置 ${barPos} 前面需要一个表达式）`,
          barPos,
        );
      }
      const right = this.parseConcat();
      if (!right) {
        throw new ParseError(
          `选择符 "|" 缺少右操作数（位置 ${barPos} 后面需要一个表达式）`,
          barPos,
        );
      }
      left = { id: newId(), kind: 'union', left: left!, right };
    }
    return left;
  }

  // concat := repeat*   —— 在遇到 ) 或 | 或串尾时结束
  parseConcat(): AstNode | null {
    const parts: AstNode[] = [];
    for (;;) {
      this.skipSpaces();
      if (this.atEnd()) break;
      const c = this.peek();
      if (c === ')' || c === '|') break;
      if (c === '*' || c === '+' || c === '?') {
        throw new ParseError(
          `闭包符 "${c}" 缺少操作数：它必须紧跟在一个字符、分组或字符类后面`,
          this.pos,
        );
      }
      parts.push(this.parseRepeat());
    }
    if (parts.length === 0) return null;
    return parts.reduce((left, right) => ({ id: newId(), kind: 'concat', left, right }));
  }

  // repeat := atom ('*' | '+' | '?')*
  parseRepeat(): AstNode {
    let node = this.parseAtom();
    for (;;) {
      this.skipSpaces();
      if (this.atEnd()) break;
      const c = this.peek();
      if (c === '*') {
        this.pos++;
        node = { id: newId(), kind: 'star', child: node };
      } else if (c === '+') {
        this.pos++;
        node = { id: newId(), kind: 'plus', child: node };
      } else if (c === '?') {
        this.pos++;
        node = { id: newId(), kind: 'optional', child: node };
      } else {
        break;
      }
    }
    return node;
  }

  parseAtom(): AstNode {
    this.skipSpaces();
    if (this.atEnd()) {
      throw new ParseError('表达式意外结束：这里缺少一个操作数', this.pos);
    }
    const c = this.peek();
    if (c === '(') return this.parseGroup();
    if (c === '[') return this.parseClass();
    if (c === '\\') return this.parseEscapeAtom();
    if (c === ')') {
      throw new ParseError('意外的字符 ")"，缺少与之配对的 "("', this.pos);
    }
    if (c === '|') {
      throw new ParseError(`选择符 "|" 缺少左操作数`, this.pos);
    }
    this.pos++;
    return { id: newId(), kind: 'char', symbol: c };
  }

  parseGroup(): AstNode {
    const openPos = this.pos;
    this.pos++; // 吃掉 (
    const inner = this.parseAlt();
    this.skipSpaces();
    if (this.atEnd() || this.peek() !== ')') {
      throw new ParseError(`括号不配对：位置 ${openPos} 的 "(" 缺少对应的 ")"`, openPos);
    }
    this.pos++; // 吃掉 )
    // 空分组 () 显式表示 ε
    return inner ?? { id: newId(), kind: 'epsilon' };
  }

  parseEscapeAtom(): AstNode {
    const slashPos = this.pos;
    this.pos++; // 吃掉 \
    if (this.atEnd()) {
      throw new ParseError('转义符 "\\" 后面缺少字符', slashPos);
    }
    const e = this.peek();
    this.pos++;
    if (e in SIMPLE_ESCAPES) {
      return { id: newId(), kind: 'char', symbol: SIMPLE_ESCAPES[e] };
    }
    if (e === 'd') return makeClassNode(DIGITS);
    if (e === 'w') return makeClassNode(WORD_CHARS);
    if (e === 's') return makeClassNode(SPACES);
    if (e === 'D') return makeClassNode(invert(DIGITS));
    if (e === 'W') return makeClassNode(invert(WORD_CHARS));
    if (e === 'S') return makeClassNode(invert(SPACES));
    if (e === 'e' || e === 'ε') {
      return { id: newId(), kind: 'epsilon' };
    }
    if (REGEX_META.has(e) || e === '.' || e === '-' || e === '/' || e === '"' || e === "'") {
      // 转义元字符即字面量
      return { id: newId(), kind: 'char', symbol: e };
    }
    throw new ParseError(`无法识别的转义序列 "\\${e}"`, slashPos);
  }

  // [a-z] / [abc] / [\d]，不支持取反（教学范围内保持确定字母表）
  parseClass(): AstNode {
    const openPos = this.pos;
    this.pos++; // 吃掉 [
    if (!this.atEnd() && this.peek() === '^') {
      throw new ParseError(
        '本教学工具不支持取反字符类 [^...]：字母表需要是有限可枚举的，请显式列出字符',
        this.pos,
      );
    }
    const symbols: Symbol[] = [];
    const add = (s: Symbol) => {
      if (!symbols.includes(s)) symbols.push(s);
    };
    for (;;) {
      if (this.atEnd()) {
        throw new ParseError(`字符类未闭合：位置 ${openPos} 的 "[" 缺少 "]"`, openPos);
      }
      const c = this.peek();
      if (c === ']') {
        if (symbols.length === 0) {
          throw new ParseError('空字符类 [] 没有意义，请至少放入一个字符', openPos);
        }
        this.pos++;
        return makeClassNode(symbols);
      }
      let ch: Symbol;
      if (c === '\\') {
        const slashPos = this.pos;
        this.pos++;
        if (this.atEnd()) throw new ParseError('字符类内的转义符 "\\" 后缺少字符', slashPos);
        const e = this.peek();
        this.pos++;
        if (e in SIMPLE_ESCAPES) ch = SIMPLE_ESCAPES[e];
        else if (e === 'd') {
          DIGITS.forEach(add);
          continue;
        } else if (e === 'w') {
          WORD_CHARS.forEach(add);
          continue;
        } else if (e === 's') {
          SPACES.forEach(add);
          continue;
        } else if (CLASS_META.has(e) || REGEX_META.has(e) || e === '-' || e === '.') {
          ch = e;
        } else {
          throw new ParseError(`字符类内无法识别的转义序列 "\\${e}"`, slashPos);
        }
      } else {
        this.pos++;
        ch = c;
      }

      if (!this.atEnd() && this.peek() === '-') {
        // 前瞻：'-' 后面还有普通字符才算区间
        const after = this.pos + 1;
        if (after < this.src.length && this.src[after] !== ']') {
          this.pos++; // 吃掉 -
          let right: Symbol;
          const rc = this.src[after];
          if (rc === '\\') {
            const slashPos = after;
            this.pos++; // 指向 \
            this.pos++; // 吃掉 \
            if (this.atEnd()) throw new ParseError('字符类区间的转义不完整', slashPos);
            const e = this.peek();
            this.pos++;
            if (e in SIMPLE_ESCAPES) right = SIMPLE_ESCAPES[e];
            else if (CLASS_META.has(e) || REGEX_META.has(e) || e === '-') right = e;
            else throw new ParseError(`字符类区间右端不支持的转义 "\\${e}"`, slashPos);
          } else {
            this.pos++; // 吃掉右端字符
            right = rc;
          }
          if (ch.length !== 1 || right.length !== 1) {
            throw new ParseError('字符类区间两端必须是单个普通字符', openPos);
          }
          const a = ch.codePointAt(0)!;
          const b = right.codePointAt(0)!;
          if (a > b) {
            throw new ParseError(
              `字符类区间 [${ch}-${right}] 方向反了：左端编码不能大于右端`,
              openPos,
            );
          }
          if (b - a > 200) {
            throw new ParseError(`字符类区间 [${ch}-${right}] 过大，请缩小范围`, openPos);
          }
          for (let code = a; code <= b; code++) add(String.fromCodePoint(code));
          continue;
        }
      }

      add(ch);
    }
  }
}

function makeClassNode(symbols: Symbol[]): AstNode {
  // 去重并保持稳定顺序
  const uniq = symbols.filter((s, i) => symbols.indexOf(s) === i);
  return { id: newId(), kind: 'class', symbols: uniq };
}

/** 在可打印 ASCII + 常用空白范围内取补集（仅供 \D \W \S 的教学演示使用） */
function invert(set: Symbol[]): Symbol[] {
  const result: Symbol[] = [];
  for (let code = 9; code <= 126; code++) {
    const ch = String.fromCodePoint(code);
    if (!set.includes(ch)) result.push(ch);
  }
  return result;
}

export function collectAlphabet(node: AstNode, out: Symbol[]): void {
  switch (node.kind) {
    case 'char':
      if (!out.includes(node.symbol)) out.push(node.symbol);
      return;
    case 'class':
      for (const s of node.symbols) if (!out.includes(s)) out.push(s);
      return;
    case 'epsilon':
      return;
    case 'union':
    case 'concat':
      collectAlphabet(node.left, out);
      collectAlphabet(node.right, out);
      return;
    case 'star':
    case 'plus':
    case 'optional':
      collectAlphabet(node.child, out);
      return;
  }
}
