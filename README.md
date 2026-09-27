# 正则表达式构造流水线可视化

一个用于形式语言与自动机课程的浏览器教学工具，把

```
正则表达式 ──Thompson──▶ ε-NFA ──子集构造──▶ DFA ──Hopcroft 最小化──▶ 最小化 DFA
```

这整条流水线在页面上**一步步演出来**，每一步都看得见，并且可以在三台机器上
回放同一个测试串，直观验证"**同一正则、同一串，三台机器接受结论必然一致**"这条主线。

所有构造与判定（解析、Thompson、子集构造、Hopcroft、模拟）都在后端完成，
前端只负责展示和交互，不另算一套。

## 功能一览

- **正则输入**：连接（并列）、选择 `|`、闭包 `*`、正闭包 `+`、可选 `?`、括号分组、
  字符类 `[a-z]`、常见转义 `\d \w \s \n \t`，空分组 `()` 表示 ε。
- **三段逐步演示**，每段都支持「上一步 / 播放 / 暂停 / 下一步 / 一键跑完 / 拖动进度」：
  1. **Thompson 构造**：每个算子的小片段依次拼到已有 NFA 上，当前片段橙色高亮。
  2. **子集构造**：逐步求 ε-closure 与 move；左侧 DFA 图与右侧**子集对照表**同步高亮
     当前展开的子集、新发现的状态和待处理队列。
  3. **Hopcroft 最小化**：在原 DFA 上按等价类染色，逐组演示"为什么被拆开"
     （读某个符号后落进不同的组），最后一帧折叠成最小化 DFA，并给出
     每个最小化状态合并了哪些原状态。
- **状态图**：状态圆圈、接受态双圈、初态黑点+箭头、带标签有向边；
  支持滚轮缩放与拖拽平移，状态很多时可滚动查看。
- **测试串回放**：三台机器各跑一遍，逐字符高亮走过的状态/边与活动状态集，
  顶部字符条同步推进；结论横幅显示三机是否一致。
- **内置示例**：标识符、带小数的数字、字符串字面量、三段式电话号码、
  `(a|b)*abb`、可选与正闭包，一点即填（含推荐的接受/拒绝测试串）。
- **友好错误**：括号不配对、算子缺操作数、字符类区间非法等都返回带位置的错误，
  输入框下方用 `^` 标出列。

## 目录结构与模块职责

```
backend/
  src/
    parser/regexParser.ts     递归下降解析器：正则 → AST（错误带位置）
    automata/
      types.ts                NFA/DFA/最小化 DFA 与各阶段"逐步步骤"的数据结构
      thompson.ts             Thompson 构造（AST → ε-NFA）+ 逐步数据 + 边分组
      subset.ts               子集构造（ε-closure / move）+ 逐步数据
      hopcroft.ts             朴素划分细化的 Hopcroft 最小化 + 逐步数据
      simulate.ts             三机测试串模拟（NFA 活动集 / DFA 状态路径）
      pipeline.ts             五段算法的编排
      examples.ts             内置示例正则
    app.ts                    Express 路由（/api/construct、/api/simulate 等）
    index.ts                  服务器入口（生产环境同时托管前端静态文件）
  test/
    parser.test.ts            解析器错误与位置
    thompson.test.ts          Thompson 结构回归（边端点、连接链、分叉/回边）
    consistency.test.ts       ★ 主线：穷举短串，三机一致且与 AST 参考语义一致
    api.test.ts               HTTP 接口与接口层三机一致
frontend/
  src/
    components/
      RegexInput.tsx          左侧正则输入区 + 示例 + 错误定位
      AutomatonGraph.tsx      三机共用的 SVG 状态图（圆圈/双圈/有向边/高亮/轨迹）
      automatonLayout.ts      有向分层布局（纯函数，坐标稳定）
      NfaStage.tsx            第①段：Thompson 逐步拼装
      DfaStage.tsx            第②段：子集构造 + 子集对照表
      SubsetTable.tsx         子集对照表组件
      MinStage.tsx            第③段：Hopcroft 划分 + 折叠结果
      PartitionView.tsx       等价类划分卡片
      StepControls.tsx        统一的逐步控制条
      TestPanel.tsx           测试串输入、逐字符回放、三机结论横幅
    lib/api.ts                极简 fetch 客户端
    lib/types.ts              后端 DTO 的前端镜像类型
    App.tsx                   页面编排与阶段/回放状态
```

## HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/examples` | 内置示例列表 |
| `POST` | `/api/construct` | 入参 `{ "regex": "..." }`，返回三机完整结构与全部逐步数据 |
| `POST` | `/api/simulate` | 入参 `{ "regex": "...", "input": "..." }`，返回三机轨迹与 `agreement` |

非法正则返回 `400 { "error": "...", "position": 12 }`，`position` 为 0 基列号。

## 本地开发

需要 Node.js 20+。

```bash
npm install          # 安装两个 workspace 的依赖

# 终端 1：后端（tsx 热更新，:3000）
npm run dev:server

# 终端 2：前端 Vite 开发服务器（:5173，/api 代理到 3000）
npm run dev:web
```

打开 http://localhost:5173 。

## 生产构建与运行

```bash
npm run build        # tsc 编译后端 + vite 打包前端到 frontend/dist
npm start            # http://localhost:3000，页面与接口同端口
```

## Docker 一体构建

```bash
docker build -t regex-pipeline-viz .
docker run --rm -p 3000:3000 regex-pipeline-viz
# 或
docker compose up --build
```

容器起来后访问 http://localhost:3000 ，前端静态页面与 `/api/*` 接口由同一个
Node 进程对外提供。

## 测试

```bash
npm test             # backend workspace 下的 Vitest
```

`consistency.test.ts` 对 20+ 条覆盖各类算子的正则，穷举字母表上的短串
（二元字母表到长度 6），逐条断言：

1. NFA 的结论等于直接在 AST 上递归的**参考语义**；
2. DFA 与 NFA 一致；
3. 最小化 DFA 与 DFA 一致；
4. 最小化结果再最小化是幂等的。

这把"三台自动机对同一测试串判定一致"这条正确性主线锁死在了自动化测试里。

## 教学实现上的几点取舍

- **Hopcroft 用朴素划分细化**：与教科书"工作队列 + 反向边"的优化版结果完全等价
  （都得到最粗同余划分），但每轮把所有组重新检查一遍，拆分过程线性、可读，
  更适合课堂逐步演示。
- **不显式画死状态**：子集构造中没有任何 NFA 状态可达的符号不产生转移
  （相当于落入隐式死状态），保持图面简洁；模拟时据此判定拒绝。
- **状态编号稳定**：NFA 状态按构造后序编号，DFA 状态按子集发现顺序编号，
  最小化状态按"组内最小编号"编号，逐步播放时坐标不跳动。
- **字符类标签压缩**：`[a-zA-Z0-9_]` 这类在图上会把连续区间合并显示为 `0-9`、
  `A-Z`、`_`、`a-z`，但底层仍按单符号边参与构造与模拟。
