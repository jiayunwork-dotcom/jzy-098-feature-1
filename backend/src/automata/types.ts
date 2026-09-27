/**
 * 共享数据结构：NFA / DFA / 最小化 DFA，以及"逐步演示"所需的步骤数据。
 * 后端所有构造算法都产出这里定义的结构，前端只消费这些结构做绘制。
 */

/** 转移标签：普通字符或 ε（空转移） */
export type Symbol = string;

/** AST 节点 id，同时作为 Thompson 片段在 NFA 状态/边上的归属标记 */
export type AstNodeId = number;

// ---------------------------------------------------------------------------
// 语法树
// ---------------------------------------------------------------------------

export type AstNode =
  | { id: AstNodeId; kind: 'char'; symbol: Symbol; synthetic?: boolean }
  | { id: AstNodeId; kind: 'epsilon'; synthetic?: boolean }
  | { id: AstNodeId; kind: 'class'; symbols: Symbol[] }
  | { id: AstNodeId; kind: 'union'; left: AstNode; right: AstNode }
  | { id: AstNodeId; kind: 'concat'; left: AstNode; right: AstNode }
  | { id: AstNodeId; kind: 'star'; child: AstNode }
  | { id: AstNodeId; kind: 'plus'; child: AstNode }
  | { id: AstNodeId; kind: 'optional'; child: AstNode };

// ---------------------------------------------------------------------------
// NFA（Thompson 构造产物）
// ---------------------------------------------------------------------------

export interface NfaEdge {
  id: string;
  from: number;
  to: number;
  symbol: Symbol;
  /** 该边由哪个 AST 节点（算子）产生，用于逐步高亮 Thompson 片段 */
  astId: AstNodeId;
}

export interface NfaState {
  id: number;
  /** 产生该状态的 AST 节点（片段归属） */
  astId: AstNodeId;
  accepting: boolean;
}

export interface NFA {
  states: NfaState[];
  edges: NfaEdge[];
  start: number;
  accept: number;
  alphabet: Symbol[];
}

/** 一条 NFA 边的分组显示键（同 from/to 的 ε/字符边合并成一条多标签边绘制） */
export interface GraphEdge {
  id: string;
  from: number;
  to: number;
  labels: Symbol[];
  /** 构成该合并边的原始边 id（逐步高亮时判定归属） */
  edgeIds: string[];
}

// ---------------------------------------------------------------------------
// DFA（子集构造产物）
// ---------------------------------------------------------------------------

export interface DfaTransition {
  from: number;
  symbol: Symbol;
  to: number;
}

export interface DFA {
  states: number[];
  start: number;
  accepting: number[];
  transitions: DfaTransition[];
  alphabet: Symbol[];
}

/** 子集对照表的一行 */
export interface SubsetRow {
  state: number;
  members: number[];
  accepting: boolean;
}

// ---------------------------------------------------------------------------
// 最小化 DFA（Hopcroft 划分产物）
// ---------------------------------------------------------------------------

export interface MinDFA {
  states: number[];
  start: number;
  accepting: number[];
  transitions: DfaTransition[];
  alphabet: Symbol[];
  /** 最小化状态 -> 被合并进来的原 DFA 状态 */
  members: Record<number, number[]>;
}

// ---------------------------------------------------------------------------
// 逐步演示：Thompson
// ---------------------------------------------------------------------------

export interface ThompsonStep {
  index: number;
  astId: AstNodeId;
  title: string;
  description: string;
  /** 截至本步已经拼出来的所有状态 */
  stateIds: number[];
  /** 截至本步已经拼出来的所有边 */
  edgeIds: string[];
  /** 本步新算子对应的活动状态（高亮焦点） */
  activeStateIds: number[];
  /** 本步新产生/涉及的边（高亮焦点） */
  activeEdgeIds: string[];
}

// ---------------------------------------------------------------------------
// 逐步演示：子集构造
// ---------------------------------------------------------------------------

export type SubsetStepKind = 'init' | 'process' | 'finish';

export interface SubsetStep {
  index: number;
  kind: SubsetStepKind;
  title: string;
  description: string;
  /** 出现在描述中的 ε-closure / move 集合，方便前端高亮 NFA 状态 */
  nfaHighlight: number[];
  /** 当前正在处理的 DFA 状态（DFA 图 + 子集表共同高亮） */
  currentState: number | null;
  /** 本步涉及的符号 */
  symbol: Symbol | null;
  /** 本步新发现的 DFA 状态（若是） */
  newState: number | null;
  /** 本步读取符号后到达的 DFA 状态（画/高亮转移） */
  targetState: number | null;
  /** 截至本步子集表应显示的所有行 */
  rows: SubsetRow[];
  /** 截至本步已经存在的 DFA 转移 */
  transitions: DfaTransition[];
  /** 待处理（尚未展开）的 DFA 状态 */
  frontier: number[];
}

// ---------------------------------------------------------------------------
// 逐步演示：Hopcroft
// ---------------------------------------------------------------------------

export type HopStepKind = 'init' | 'split' | 'final';

/** 某个划分快照下：原 DFA 状态 -> 组号 */
export type Partition = Record<number, number>;

export interface HopStep {
  index: number;
  kind: HopStepKind;
  title: string;
  description: string;
  /** 本步快照下的划分（逐步给 DFA 状态上组色） */
  partition: Partition;
  /** 本步被拆开的原组号（按上一个快照编号） */
  splitGroup: number | null;
  /** 拆分后保留原组主体的组号（本帧快照下的编号） */
  retainedGroup: number | null;
  /** 拆分产生的新组组号（本步首次出现的组） */
  newGroups: number[];
  /** 触发拆分的代表状态与符号，讲清"为什么不等价" */
  reason: { state: number; symbol: Symbol; target: number | null } | null;
}

// ---------------------------------------------------------------------------
// /api/construct 的完整响应
// ---------------------------------------------------------------------------

export interface ConstructResult {
  regex: string;
  astRootId: AstNodeId;
  nfa: {
    states: { id: number; accepting: boolean; astId: AstNodeId }[];
    edges: NfaEdge[];
    start: number;
    accept: number;
    alphabet: Symbol[];
    graphEdges: GraphEdge[];
  };
  nfaSteps: ThompsonStep[];
  subsetTable: SubsetRow[];
  dfaSteps: SubsetStep[];
  dfa: DFA;
  hopSteps: HopStep[];
  minDfa: MinDFA;
}

// ---------------------------------------------------------------------------
// 测试串模拟
// ---------------------------------------------------------------------------

export interface NfaTraceStep {
  index: number;
  consumed: number;
  active: number[];
  /** 刚消费的字符（第一步为 null，表示起始闭包） */
  symbol: Symbol | null;
}

export interface NfaTrace {
  steps: NfaTraceStep[];
  accepted: boolean;
}

export interface DfaTraceStep {
  index: number;
  state: number;
  symbol: Symbol | null;
  /** 本步走过的合并边（from-to 对），最后一步无 */
  edgeKey: string | null;
}

export interface DfaTrace {
  steps: DfaTraceStep[];
  accepted: boolean;
  /** 走到无转移而拒绝时给出原因 */
  rejectedAt: { state: number; symbol: Symbol } | null;
}

export interface SimulateResult {
  input: string;
  nfa: NfaTrace;
  dfa: DfaTrace;
  min: DfaTrace;
  /** 三台机器结论是否一致——贯穿全局的正确性主线 */
  agreement: boolean;
}

export interface ApiError {
  error: string;
  position?: number;
}
