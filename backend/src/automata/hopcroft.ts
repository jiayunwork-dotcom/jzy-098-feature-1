/**
 * Hopcroft 风格的 DFA 最小化（教学版：朴素划分细化）。
 *
 * 与标准 Hopcroft 的"工作队列+反向边"优化在结果上完全等价（都得到最粗的
 * 同余划分），但朴素版每轮把所有组重新检查一遍，过程更适合课堂逐步演示：
 *
 *   1. 初始划分：接受态一组、非接受态一组（空组略去）
 *   2. 每轮对每个组 G、每个符号 a，按"成员在 a 上落入哪个组"的签名分组；
 *      签名不同的成员必须拆开。一轮内所有签名都引用该轮开始时冻结的旧划分
 *   3. 一轮下来划分不再变化即得到等价类
 *   4. 每个等价类压成一个最小化状态，组间转移折叠
 *
 * 每个拆分动作都录成 HopStep：前端据此给原 DFA 的状态染组色，
 * 并说明"为什么被拆开"（代表状态在某符号上落进了不同的组）。
 */

import type { DFA, DfaTransition, HopStep, MinDFA, Partition, Symbol } from './types';

const MAX_PASSES = 100;

class TargetMap {
  /** from -> symbol -> to（缺失转移为 undefined，表示落入隐式死状态） */
  private readonly map = new Map<number, Map<Symbol, number>>();

  constructor(dfa: DFA) {
    for (const t of dfa.transitions) {
      let row = this.map.get(t.from);
      if (!row) {
        row = new Map();
        this.map.set(t.from, row);
      }
      row.set(t.symbol, t.to);
    }
  }

  get(state: number, symbol: Symbol): number | undefined {
    return this.map.get(state)?.get(symbol);
  }
}

/**
 * 给一个状态算"签名"：在每个符号上落入的组号序列。
 * 缺失转移（死路）用 -1 表示，它和任何真实组都不相同。
 */
function signature(
  state: number,
  alphabet: Symbol[],
  tm: TargetMap,
  partition: Partition,
): string {
  const parts: number[] = [];
  for (const sym of alphabet) {
    const to = tm.get(state, sym);
    parts.push(to === undefined ? -1 : partition[to]);
  }
  return parts.join('|');
}

function membersOf(partition: Partition, gid: number): number[] {
  return Object.entries(partition)
    .filter(([, g]) => g === gid)
    .map(([s]) => Number(s))
    .sort((a, b) => a - b);
}

/** 组号按"组内最小状态"排序，保证编号稳定可读 */
function normalizeGroupIds(groups: number[][]): {
  partition: Partition;
  membersById: number[][];
} {
  const sorted = groups
    .filter((g) => g.length > 0)
    .map((g) => [...g].sort((a, b) => a - b))
    .sort((a, b) => Math.min(...a) - Math.min(...b));
  const partition: Partition = {};
  sorted.forEach((members, id) => {
    for (const m of members) partition[m] = id;
  });
  return { partition, membersById: sorted };
}

export interface HopcroftOutput {
  min: MinDFA;
  steps: HopStep[];
}

export function minimizeDfa(dfa: DFA): HopcroftOutput {
  const tm = new TargetMap(dfa);
  const acceptSet = new Set(dfa.accepting);
  const steps: HopStep[] = [];

  // ---- 初始划分：非接受态 / 接受态（空组略去） ----
  const groups: number[][] = [];
  const nonAccepting = dfa.states.filter((s) => !acceptSet.has(s));
  const accepting = dfa.states.filter((s) => acceptSet.has(s));
  if (nonAccepting.length) groups.push(nonAccepting);
  if (accepting.length) groups.push(accepting);

  let { partition } = normalizeGroupIds(groups);

  steps.push({
    index: 0,
    kind: 'init',
    title: '第 1 步：初始划分（接受态 vs 非接受态）',
    description:
      '等价状态首先必须"同为接受态或同为非接受态"。据此分成：' +
      groups
        .map(
          (g, i) =>
            `P${i} = {${[...g].sort((a, b) => a - b).map((s) => `D${s}`).join(', ')}}`,
        )
        .join('；') +
      '。',
    partition: { ...partition },
    splitGroup: null,
    retainedGroup: null,
    newGroups: [],
    reason: null,
  });

  let stepIndex = 1;
  let finalGroups = groups.map((g) => [...g]);

  // ---- 迭代细化 ----
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // 本轮全程基于这份"冻结的旧划分"计算签名：同一轮里即使前面的组被拆开，
    // 后面的组仍然引用旧组号——这正是朴素划分细化的一整轮。
    const oldPartition: Partition = { ...partition };
    const oldGroupCount = Math.max(...Object.values(oldPartition), -1) + 1;

    const splitOf: number[][][] = [];
    let changed = false;
    for (let gid = 0; gid < oldGroupCount; gid++) {
      const members = membersOf(oldPartition, gid);
      const buckets = new Map<string, number[]>();
      for (const s of members) {
        const sig = signature(s, dfa.alphabet, tm, oldPartition);
        const bucket = buckets.get(sig);
        if (bucket) bucket.push(s);
        else buckets.set(sig, [s]);
      }
      const bucketList = [...buckets.values()].map((b) => [...b].sort((a, b) => a - b));
      splitOf[gid] = bucketList;
      if (bucketList.length > 1) changed = true;
    }

    if (!changed) break;

    // 一轮内逐组播放拆分：每拆一个旧组出一帧，帧中划分 =
    // "此前已处理旧组的拆分结果 + 当前旧组拆开 + 未处理旧组保持整块"。
    const accumulated: number[][] = [];
    for (let gid = 0; gid < oldGroupCount; gid++) {
      const bucketList = splitOf[gid];
      accumulated.push(...bucketList);
      if (bucketList.length <= 1) continue;

      const frameGroups: number[][] = [...accumulated];
      for (let rest = gid + 1; rest < oldGroupCount; rest++) {
        const restMembers = membersOf(oldPartition, rest);
        if (restMembers.length) frameGroups.push(restMembers);
      }
      const frameNorm = normalizeGroupIds(frameGroups);

      const reason = findSplitReason(bucketList, tm, dfa.alphabet, oldPartition);

      // 本帧首次出现的组：成员全部来自被拆旧组，且不是保留下来的第一个桶
      const splitMembers = new Set(membersOf(oldPartition, gid));
      const firstBucket = bucketList[0];
      const freshGroupIds = frameNorm.membersById
        .map((m, id) => ({ m, id }))
        .filter(({ m }) => {
          const allInSplit = m.every((s) => splitMembers.has(s));
          const isFirst =
            m.length === firstBucket.length && m.every((s, i) => s === firstBucket[i]);
          return allInSplit && !isFirst;
        })
        .map(({ id }) => id);
      const retainedGroup = frameNorm.membersById.findIndex(
        (m) =>
          m.length === firstBucket.length &&
          m.every((s, i) => s === firstBucket[i]),
      );

      steps.push({
        index: stepIndex++,
        kind: 'split',
        title: `拆分组 P${gid}：转移签名不一致`,
        description: buildSplitDescription(gid, bucketList, reason, oldPartition),
        partition: { ...frameNorm.partition },
        splitGroup: gid,
        retainedGroup,
        newGroups: freshGroupIds,
        reason: reason
          ? { state: reason.stateA, symbol: reason.symbol, target: reason.targetA }
          : null,
      });
    }

    const normalized = normalizeGroupIds(accumulated);
    partition = normalized.partition;
    finalGroups = normalized.membersById;
  }

  // ---- 折叠等价类，构造最小化 DFA ----
  finalGroups = finalGroups.map((g) => [...g].sort((a, b) => a - b));
  const oldToNew = new Map<number, number>();
  finalGroups.forEach((members, id) => {
    for (const m of members) oldToNew.set(m, id);
  });

  const minStates = finalGroups.map((_, id) => id);
  const minStart = oldToNew.get(dfa.start)!;
  const minAccepting = [...new Set(dfa.accepting.map((s) => oldToNew.get(s)!))].sort(
    (a, b) => a - b,
  );

  const minTransitions: DfaTransition[] = [];
  const seenEdge = new Set<string>();
  for (const t of dfa.transitions) {
    const from = oldToNew.get(t.from)!;
    const to = oldToNew.get(t.to)!;
    const key = `${from}:${t.symbol}:${to}`;
    if (!seenEdge.has(key)) {
      seenEdge.add(key);
      minTransitions.push({ from, symbol: t.symbol, to });
    }
  }
  minTransitions.sort((a, b) =>
    a.from !== b.from ? a.from - b.from : a.symbol.localeCompare(b.symbol),
  );

  const membersRecord: Record<number, number[]> = {};
  finalGroups.forEach((g, id) => {
    membersRecord[id] = g;
  });

  const min: MinDFA = {
    states: minStates,
    start: minStart,
    accepting: minAccepting,
    transitions: minTransitions,
    alphabet: dfa.alphabet,
    members: membersRecord,
  };

  steps.push({
    index: stepIndex,
    kind: 'final',
    title: `最小化完成：${dfa.states.length} 个状态 → ${minStates.length} 个等价类`,
    description:
      '划分不再变化，每个组就是一个等价状态：' +
      finalGroups.map((g, id) => `M${id} = {${g.map((s) => `D${s}`).join(', ')}}`).join('；') +
      '。等价状态在任意后续串上的接受结论都相同，因此可以安全合并。',
    partition: { ...partition },
    splitGroup: null,
    retainedGroup: null,
    newGroups: [],
    reason: null,
  });

  return { min, steps };
}

// ---------------------------------------------------------------------------

interface SplitReason {
  stateA: number;
  symbol: Symbol;
  targetA: number | null;
}

function findSplitReason(
  buckets: number[][],
  tm: TargetMap,
  alphabet: Symbol[],
  partition: Partition,
): SplitReason | null {
  const a = buckets[0][0];
  for (let bi = 1; bi < buckets.length; bi++) {
    const b = buckets[bi][0];
    for (const sym of alphabet) {
      const ta = tm.get(a, sym);
      const tb = tm.get(b, sym);
      const ga = ta === undefined ? -1 : partition[ta];
      const gb = tb === undefined ? -1 : partition[tb];
      if (ga !== gb) return { stateA: a, symbol: sym, targetA: ta ?? null };
    }
  }
  return null;
}

function buildSplitDescription(
  gid: number,
  buckets: number[][],
  reason: SplitReason | null,
  partition: Partition,
): string {
  const head = `组 P${gid} 里的状态在某些符号上会转移到不同的组，不满足同余关系，必须拆开：`;
  const tail = buckets.map((b) => `{${b.map((s) => `D${s}`).join(', ')}}`).join(' 与 ');
  if (!reason) return head + tail + '。';
  return (
    head +
    tail +
    `。例如同样读 "${reason.symbol}"，D${reason.stateA} 走到 ` +
    (reason.targetA === null ? '死路（无转移）' : `组 P${partition[reason.targetA]}`) +
    '，而另一桶的代表状态走到别的组，所以两边在任意后续串上的接受结论不可能始终相同。'
  );
}
