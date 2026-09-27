/**
 * Thompson 构造：把语法树展开成带 ε 转移的 NFA。
 *
 * 严格按教科书方式为每个算子拼装小片段：
 *   字符 a:        s --a--> (s)
 *   ε:            s --ε--> (s)
 *   字符类[...] :  s 出发用 |C| 条带标签边并到同一个接受态（单个片段）
 *   连接 R·S:      R 的接受态与 S 的初态合并
 *   选择 R|S:      新建初态/接受态，各加两条 ε 分叉/汇合
 *   闭包 R*:       新建初态/接受态，循环回边 + 跳过 ε
 *   正闭包 R+:     与 R* 相同但没有跳过 R 的 ε
 *   可选 R?:       一条 ε 直接跳过 R
 *
 * 构造期间状态用临时 id，构造结束后按后序（AST 遍历顺序）重排成
 * 连续编号，保证每次运行编号稳定、便于学生对照。
 *
 * 每个状态/边都记录了来源 astId，buildThompsonSteps 据此生成
 * "截至当前算子已拼出哪些状态/边"的逐步演示数据。
 */

import type {
  AstNode,
  AstNodeId,
  GraphEdge,
  NFA,
  NfaEdge,
  NfaState,
  Symbol,
  ThompsonStep,
} from './types';

interface InternalNfa {
  tempStates: Map<number, { astId: AstNodeId; accepting: boolean }>;
  tempEdges: Array<{ id: string; from: number; to: number; symbol: Symbol; astId: AstNodeId }>;
  counter: number;
  edgeCounter: number;
}

interface Fragment {
  start: number;
  accept: number;
}

export interface ThompsonOutput {
  nfa: NFA;
  /** AST 节点 -> 后序遍历序号（0 基），也就是演示的逐步顺序 */
  order: Map<AstNodeId, number>;
  steps: ThompsonStep[];
}

const EPSILON = 'ε';

export function buildThompson(root: AstNode, alphabet: Symbol[]): ThompsonOutput {
  const internal: InternalNfa = {
    tempStates: new Map(),
    tempEdges: [],
    counter: 0,
    edgeCounter: 0,
  };

  const addState = (astId: AstNodeId, accepting = false): number => {
    const id = internal.counter++;
    internal.tempStates.set(id, { astId, accepting });
    return id;
  };

  const addEdge = (from: number, to: number, symbol: Symbol, astId: AstNodeId): void => {
    internal.tempEdges.push({ id: `e${internal.edgeCounter++}`, from, to, symbol, astId });
  };

  /**
   * 连接合并时记录"被删状态 -> 并入的存活状态"别名。
   * 后处理重排时用它把所有边端点解析到真实存活的状态上。
   */
  const alias = new Map<number, number>();

  /**
   * 后序构造：先递归建完所有子片段，再为当前算子分配状态。
   * 这样"同一棵子树用到的状态 id 构成一个连续区间"，兄弟子树的区间互不相交，
   * 连接时把 left.accept 并入 right.start 绝不会误伤右片段内部边。
   */
  const build = (node: AstNode): Fragment => {
    switch (node.kind) {
      case 'char': {
        const s = addState(node.id);
        const a = addState(node.id, true);
        addEdge(s, a, node.symbol, node.id);
        return { start: s, accept: a };
      }
      case 'epsilon': {
        const s = addState(node.id);
        const a = addState(node.id, true);
        addEdge(s, a, EPSILON, node.id);
        return { start: s, accept: a };
      }
      case 'class': {
        const s = addState(node.id);
        const a = addState(node.id, true);
        for (const sym of node.symbols) addEdge(s, a, sym, node.id);
        return { start: s, accept: a };
      }
      case 'concat': {
        // 左子树占一段 id，紧接着右子树占下一段
        const left = build(node.left);
        const right = build(node.right);
        for (const e of internal.tempEdges) {
          if (e.to === left.accept) e.to = right.start;
        }
        internal.tempStates.delete(left.accept);
        alias.set(left.accept, right.start);
        // 拼接点归属到当前 concat，高亮"连接"这一步时能看到它
        const rs = internal.tempStates.get(right.start);
        if (rs) rs.astId = node.id;
        return { start: left.start, accept: right.accept };
      }
      case 'union': {
        const left = build(node.left);
        const right = build(node.right);
        const s = addState(node.id);
        const a = addState(node.id, true);
        addEdge(s, left.start, EPSILON, node.id);
        addEdge(s, right.start, EPSILON, node.id);
        addEdge(left.accept, a, EPSILON, node.id);
        addEdge(right.accept, a, EPSILON, node.id);
        internal.tempStates.get(left.accept)!.accepting = false;
        internal.tempStates.get(right.accept)!.accepting = false;
        return { start: s, accept: a };
      }
      case 'star': {
        const child = build(node.child);
        const s = addState(node.id);
        const a = addState(node.id, true);
        addEdge(s, child.start, EPSILON, node.id);
        addEdge(child.accept, a, EPSILON, node.id);
        addEdge(child.accept, child.start, EPSILON, node.id); // 循环
        addEdge(s, a, EPSILON, node.id); // 跳过（出现零次）
        internal.tempStates.get(child.accept)!.accepting = false;
        return { start: s, accept: a };
      }
      case 'plus': {
        const child = build(node.child);
        const s = addState(node.id);
        const a = addState(node.id, true);
        addEdge(s, child.start, EPSILON, node.id);
        addEdge(child.accept, a, EPSILON, node.id);
        addEdge(child.accept, child.start, EPSILON, node.id); // 至少一次 + 循环
        internal.tempStates.get(child.accept)!.accepting = false;
        return { start: s, accept: a };
      }
      case 'optional': {
        const child = build(node.child);
        const s = addState(node.id);
        const a = addState(node.id, true);
        addEdge(s, child.start, EPSILON, node.id);
        addEdge(child.accept, a, EPSILON, node.id);
        addEdge(s, a, EPSILON, node.id); // 跳过（出现零次）
        internal.tempStates.get(child.accept)!.accepting = false;
        return { start: s, accept: a };
      }
    }
  };

  const fragment = build(root);

  // ---- 重排状态编号：按 AST 后序给状态重新编号 ----
  const order = new Map<AstNodeId, number>();
  const postorder: AstNode[] = [];
  const walk = (n: AstNode): void => {
    switch (n.kind) {
      case 'union':
      case 'concat':
        walk(n.left);
        walk(n.right);
        break;
      case 'star':
      case 'plus':
      case 'optional':
        walk(n.child);
        break;
      default:
        break;
    }
    if (!order.has(n.id)) order.set(n.id, postorder.length);
    postorder.push(n);
  };
  walk(root);

  // 存活状态按临时 id 升序编号即可——临时 id 是构造时后序分配的，
  // 天然就是稳定的拓扑顺序。不要按 astId 重排：拼接点归属到 concat 节点，
  // 其 astId 序号会晚于右子树，重排会让编号换位、边指向错误状态。
  const surviving = [...internal.tempStates.keys()].sort((x, y) => x - y);
  const remap = new Map<number, number>();
  surviving.forEach((oldId, idx) => remap.set(oldId, idx));

  /** 把一个（可能已在连接中被删除的）临时 id 解析到存活状态，再映射为最终编号 */
  const resolve = (id: number): number => {
    let cur = id;
    const seen = new Set<number>();
    while (alias.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = alias.get(cur)!;
    }
    const mapped = remap.get(cur);
    if (mapped === undefined) {
      throw new Error(`Thompson 构造内部错误：状态 ${id} 无法解析到存活状态`);
    }
    return mapped;
  };

  const states: NfaState[] = surviving.map((oldId, idx) => {
    const meta = internal.tempStates.get(oldId)!;
    return { id: idx, astId: meta.astId, accepting: resolve(fragment.accept) === idx };
  });

  // 边按"源状态编号、目标状态编号、标签"稳定排序后重编号
  const mappedEdges: NfaEdge[] = internal.tempEdges
    .map((e) => ({
      from: resolve(e.from),
      to: resolve(e.to),
      symbol: e.symbol,
      astId: e.astId,
    }))
    .sort((a, b) =>
      a.from !== b.from
        ? a.from - b.from
        : a.to !== b.to
          ? a.to - b.to
          : a.symbol === EPSILON
            ? 1
            : b.symbol === EPSILON
              ? -1
              : a.symbol.localeCompare(b.symbol),
    )
    .map((e, i) => ({ id: `e${i}`, ...e }));

  const nfa: NFA = {
    states,
    edges: mappedEdges,
    start: resolve(fragment.start),
    accept: resolve(fragment.accept),
    alphabet,
  };

  const steps = buildThompsonSteps(postorder, nfa, order);
  return { nfa, order, steps };
}

// ---------------------------------------------------------------------------
// 逐步演示
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<string, string> = {
  char: '字符',
  epsilon: '空串 ε',
  class: '字符类',
  union: '选择 |',
  concat: '连接',
  star: '闭包 *',
  plus: '正闭包 +',
  optional: '可选 ?',
};

function nodeLabel(node: AstNode): string {
  switch (node.kind) {
    case 'char':
      return `字符 "${displaySymbol(node.symbol)}"`;
    case 'epsilon':
      return '空串 ε';
    case 'class':
      return `字符类 [${node.symbols.map(displaySymbol).join('')}]`;
    case 'union':
      return '选择 R|S（两条 ε 分叉）';
    case 'concat':
      return '连接 R·S（合并拼接状态）';
    case 'star':
      return '闭包 R*（循环回边 + 跳过）';
    case 'plus':
      return '正闭包 R+（循环回边，至少一次）';
    case 'optional':
      return '可选 R?（ε 跳过）';
  }
}

export function displaySymbol(s: Symbol): string {
  if (s === '\n') return '\\n';
  if (s === '\t') return '\\t';
  if (s === '\r') return '\\r';
  if (s === ' ') return '␣';
  if (s === '\0') return '\\0';
  if (s === EPSILON) return 'ε';
  return s;
}

/** 收集某节点整棵子树下的所有 AST 节点 id */
function subtreeIds(node: AstNode, out: Set<AstNodeId>): void {
  out.add(node.id);
  switch (node.kind) {
    case 'union':
    case 'concat':
      subtreeIds(node.left, out);
      subtreeIds(node.right, out);
      break;
    case 'star':
    case 'plus':
    case 'optional':
      subtreeIds(node.child, out);
      break;
    default:
      break;
  }
}

function buildThompsonSteps(
  postorder: AstNode[],
  nfa: NFA,
  order: Map<AstNodeId, number>,
): ThompsonStep[] {
  // 每个状态/边的"出现时机" = 其归属节点在后序中的位置。
  // 走到第 k 步时，所有时机 <= k 的元素都已拼好。
  const stateTime = (s: NfaState) => order.get(s.astId) ?? 0;
  const edgeTime = (e: NfaEdge) => order.get(e.astId) ?? 0;

  return postorder.map((node, idx) => {
    const subTree = new Set<AstNodeId>();
    subtreeIds(node, subTree);

    const stateIds = nfa.states.filter((s) => stateTime(s) <= idx).map((s) => s.id);
    const edgeIds = nfa.edges.filter((e) => edgeTime(e) <= idx).map((e) => e.id);

    // 焦点：当前算子自身片段直接包含的状态与边
    const activeStateIds = nfa.states.filter((s) => s.astId === node.id).map((s) => s.id);
    const activeEdgeIds = nfa.edges.filter((e) => e.astId === node.id).map((e) => e.id);

    return {
      index: idx,
      astId: node.id,
      title: `第 ${idx + 1} 步：${KIND_LABEL[node.kind]}`,
      description: `拼装 ${nodeLabel(node)} 对应的 Thompson 片段，再与已经构造好的子片段接到一起。`,
      stateIds,
      edgeIds,
      activeStateIds,
      activeEdgeIds,
    };
  });
}

/**
 * 把同 from/to 的边合并成一条多标签边用于绘制。
 * ε 排在标签最后（视觉上 ε 边多为结构性的回边/分叉）。
 */
export function groupEdges(nfa: NFA): GraphEdge[] {
  const groups = new Map<string, NfaEdge[]>();
  for (const e of nfa.edges) {
    const key = `${e.from}->${e.to}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => {
      if (a.symbol === EPSILON) return 1;
      if (b.symbol === EPSILON) return -1;
      return a.symbol.localeCompare(b.symbol);
    });
    const rawSymbols = sorted.map((e) => e.symbol);
    return {
      id: key,
      from: list[0].from,
      to: list[0].to,
      // 标签做区间压缩：连续 ≥3 个可打印字符合并成 x-y，避免字符类把标签撑爆
      labels: compressLabels(rawSymbols),
      edgeIds: sorted.map((e) => e.id),
    };
  });
}

/** 把一组单字符标签压缩成区间记号，ε 始终单独留在最后。 */
export function compressLabels(symbols: Symbol[]): Symbol[] {
  const eps = symbols.filter((s) => s === EPSILON);
  const chars = symbols.filter((s) => s !== EPSILON && s.length === 1);
  const others = symbols.filter((s) => s !== EPSILON && s.length !== 1);
  if (chars.length < 3) return [...chars, ...others, ...eps];

  const sorted = [...chars].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  const flush = (end: string) => {
    const a = start.codePointAt(0)!;
    const b = end.codePointAt(0)!;
    if (b - a >= 2) ranges.push(`${displaySymbol(start)}-${displaySymbol(end)}`);
    else for (let c = a; c <= b; c++) ranges.push(displaySymbol(String.fromCodePoint(c)));
  };

  for (let i = 1; i < sorted.length; i++) {
    const code = sorted[i].codePointAt(0)!;
    if (code === prev.codePointAt(0)! + 1) {
      prev = sorted[i];
    } else {
      flush(prev);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  flush(prev);

  return [...ranges, ...others, ...eps];
}

export const NFA_EPSILON = EPSILON;
