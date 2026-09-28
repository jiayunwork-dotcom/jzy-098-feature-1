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
  /** 仅 /api/compare 使用：语法错来自 'left' 还是 'right' */
  side?: 'left' | 'right';
  /** 机器码，如组合状态超限时的 'product_limit' */
  code?: string;
}

// ---------------------------------------------------------------------------
// 答案对拍：两条正则的语言包含关系判定
// ---------------------------------------------------------------------------

/** 四条结论：等价 / 左真包含于右 / 右真包含于左 / 互不包含 */
export type CompareRelation =
  | 'equivalent'
  | 'left_subset_right'
  | 'right_subset_left'
  | 'incomparable';

/**
 * 一个方向上的差集反例。
 * exists=false 且 witness=null 表示该方向差集为空（没有反例）；
 * exists=true 且 witness="" 表示反例就是空串——二者绝不能都落成空值。
 */
export interface Counterexample {
  exists: boolean;
  /** 反例串；空串反例时为 ""，无反例时为 null */
  witness: string | null;
  /** 反例串的码点长度（空串为 0） */
  length: number;
  /** 该串到达的组合状态 id（无反例时为 null） */
  productState: number | null;
}

/** 组合状态的接受类型：两边都接受 / 仅左接受 / 仅右接受 / 两边都不接受 */
export type ProductAcceptClass = 'both' | 'left-only' | 'right-only' | 'neither';

/** 乘积自动机的一个组合状态：(左 DFA 状态, 右 DFA 状态) */
export interface ProductState {
  id: number;
  left: number;
  right: number;
  acceptClass: ProductAcceptClass;
  /** 从初态到达该组合状态的 shortlex 最小串（先长度、再按码点字典序） */
  witness: string;
}

// ---------------------------------------------------------------------------
// 逐步演示：乘积构造（两台 DFA 同步展开）
// ---------------------------------------------------------------------------

export type ProductStepKind = 'init' | 'expand' | 'finish';

export interface ProductStep {
  index: number;
  kind: ProductStepKind;
  title: string;
  description: string;
  /** 截至本步已经发现的组合状态数（状态按发现顺序编号，可见 id = 0..stateCount-1） */
  stateCount: number;
  /** 本步新连上的转移在最终 product.transitions 中的下标（无新边时为 -1）。
   *  转移严格按 BFS 顺序追加，故第 k 帧的累积转移 = product.transitions[0..maxIndex]，
   *  避免在每帧里快照整张转移表把响应撑到上百 MB。 */
  newTransition: number;
  /** 当前正在展开的组合状态 */
  currentState: number | null;
  /** 本步读取的并集字母表符号（状态头帧为 null） */
  symbol: Symbol | null;
  /** 本步新发现的组合状态（若是） */
  newState: number | null;
  /** 本步读到 symbol 后到达的组合状态 */
  targetState: number | null;
  /** 待处理（尚未展开）队列 */
  frontier: number[];
}

/** /api/compare 的完整响应 */
export interface CompareResult {
  left: CompareSide;
  right: CompareSide;
  /** 两边字母表的并集（按码点排序），判定就在这个字母表上进行 */
  alphabet: Symbol[];
  relation: CompareRelation;
  /** L(左) \\ L(右)：左接受、右拒绝的最短反例 */
  leftOnly: Counterexample;
  /** L(右) \\ L(左)：右接受、左拒绝的最短反例 */
  rightOnly: Counterexample;
  product: {
    start: number;
    states: ProductState[];
    transitions: DfaTransition[];
    accepting: {
      both: number[];
      leftOnly: number[];
      rightOnly: number[];
    };
  };
  steps: ProductStep[];
}

/** 对拍中的一侧：补出了显式死状态、在并集字母表上处处有转移的完整 DFA */
export interface CompareSide {
  regex: string;
  /** 该侧自己的字母表 */
  ownAlphabet: Symbol[];
  /** 补全死状态后的最小化 DFA（状态数 = 原最小 DFA + 1，deadState 即新状态） */
  dfa: DFA;
  /** 显式死状态 id */
  deadState: number;
}

/** /api/compare-batch 单条学生答案的结果 */
export interface BatchCompareItem {
  /** 提交序号（0 基，与提交顺序一致） */
  index: number;
  student: string;
  ok: boolean;
  /** ok=false 时的错误原因与位置（语法错带 position） */
  error?: {
    error: string;
    position?: number;
    code?: string;
  };
  relation?: CompareRelation;
  leftOnly?: Counterexample;
  rightOnly?: Counterexample;
}

export interface BatchCompareResult {
  reference: string;
  alphabet: Symbol[];
  results: BatchCompareItem[];
}
