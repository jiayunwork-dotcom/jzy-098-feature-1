/**
 * 前端镜像类型：结构与后端 backend/src/automata/types.ts 的响应一致。
 * 前端只消费这些数据做展示，不自行计算任何构造结果。
 */

export type Symbol = string;

export interface NfaStateDTO {
  id: number;
  accepting: boolean;
  astId: number;
}

export interface NfaEdgeDTO {
  id: string;
  from: number;
  to: number;
  symbol: Symbol;
  astId: number;
}

export interface GraphEdgeDTO {
  id: string;
  from: number;
  to: number;
  labels: Symbol[];
  edgeIds: string[];
}

export interface DfaTransitionDTO {
  from: number;
  symbol: Symbol;
  to: number;
}

export interface SubsetRowDTO {
  state: number;
  members: number[];
  accepting: boolean;
}

export interface ThompsonStepDTO {
  index: number;
  astId: number;
  title: string;
  description: string;
  stateIds: number[];
  edgeIds: string[];
  activeStateIds: number[];
  activeEdgeIds: string[];
}

export interface SubsetStepDTO {
  index: number;
  kind: 'init' | 'process' | 'finish';
  title: string;
  description: string;
  nfaHighlight: number[];
  currentState: number | null;
  symbol: Symbol | null;
  newState: number | null;
  targetState: number | null;
  rows: SubsetRowDTO[];
  transitions: DfaTransitionDTO[];
  frontier: number[];
}

export type PartitionDTO = Record<number, number>;

export interface HopStepDTO {
  index: number;
  kind: 'init' | 'split' | 'final';
  title: string;
  description: string;
  partition: PartitionDTO;
  splitGroup: number | null;
  retainedGroup: number | null;
  newGroups: number[];
  reason: { state: number; symbol: Symbol; target: number | null } | null;
}

export interface DfaDTO {
  states: number[];
  start: number;
  accepting: number[];
  transitions: DfaTransitionDTO[];
  alphabet: Symbol[];
}

export interface MinDfaDTO extends DfaDTO {
  members: Record<number, number[]>;
}

export interface ConstructResultDTO {
  regex: string;
  astRootId: number;
  nfa: {
    states: NfaStateDTO[];
    edges: NfaEdgeDTO[];
    start: number;
    accept: number;
    alphabet: Symbol[];
    graphEdges: GraphEdgeDTO[];
  };
  nfaSteps: ThompsonStepDTO[];
  subsetTable: SubsetRowDTO[];
  dfaSteps: SubsetStepDTO[];
  dfa: DfaDTO;
  hopSteps: HopStepDTO[];
  minDfa: MinDfaDTO;
}

export interface NfaTraceStepDTO {
  index: number;
  consumed: number;
  active: number[];
  symbol: Symbol | null;
}

export interface DfaTraceStepDTO {
  index: number;
  state: number;
  symbol: Symbol | null;
  edgeKey: string | null;
}

export interface SimulateResultDTO {
  input: string;
  nfa: { steps: NfaTraceStepDTO[]; accepted: boolean };
  dfa: {
    steps: DfaTraceStepDTO[];
    accepted: boolean;
    rejectedAt: { state: number; symbol: Symbol } | null;
  };
  min: {
    steps: DfaTraceStepDTO[];
    accepted: boolean;
    rejectedAt: { state: number; symbol: Symbol } | null;
  };
  agreement: boolean;
}

export interface ExampleRegexDTO {
  id: string;
  name: string;
  regex: string;
  description: string;
  testAccept: string;
  testReject: string;
}

export interface ApiErrorDTO {
  error: string;
  position?: number;
  side?: 'left' | 'right';
}

// ---------------------------------------------------------------------------
// 答案对拍
// ---------------------------------------------------------------------------

export type CompareRelationDTO = 'equal' | 'left_subset' | 'right_subset' | 'incomparable';

export type ProductCategoryDTO = 'both' | 'leftOnly' | 'rightOnly' | 'neither';

export interface CompareMachineDTO {
  states: number[];
  start: number;
  accepting: number[];
  transitions: DfaTransitionDTO[];
  alphabet: Symbol[];
  deadState: number;
}

export interface ProductStateDTO {
  id: number;
  left: number;
  right: number;
  category: ProductCategoryDTO;
  witness: string;
}

export interface CompareStepDTO {
  index: number;
  kind: 'init' | 'process' | 'finish';
  title: string;
  description: string;
  currentState: number | null;
  symbol: Symbol | null;
  newState: number | null;
  targetState: number | null;
  states: ProductStateDTO[];
  transitions: DfaTransitionDTO[];
  frontier: number[];
}

export interface CompareResultDTO {
  leftRegex: string;
  rightRegex: string;
  relation: CompareRelationDTO;
  alphabet: Symbol[];
  leftMachine: CompareMachineDTO;
  rightMachine: CompareMachineDTO;
  product: {
    start: number;
    states: ProductStateDTO[];
    transitions: DfaTransitionDTO[];
  };
  steps: CompareStepDTO[];
  leftOnlyWitness: string | null;
  rightOnlyWitness: string | null;
}

export interface CompareBatchItemDTO {
  index: number;
  relation?: CompareRelationDTO;
  leftOnlyWitness?: string | null;
  rightOnlyWitness?: string | null;
  error?: string;
  position?: number;
  side?: 'left' | 'right';
}

export interface CompareBatchResultDTO {
  leftRegex: string;
  results: CompareBatchItemDTO[];
}
