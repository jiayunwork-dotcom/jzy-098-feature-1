/**
 * 内置示例正则：一点即填。选择覆盖三类经典词法单元，
 * 并附带两条推荐测试串，方便学生立刻验证三机一致性。
 * 全部只用本工具支持的基本算子（连接、|、*、+、?、括号、字符类）。
 */

export interface ExampleRegex {
  id: string;
  name: string;
  regex: string;
  description: string;
  testAccept: string;
  testReject: string;
}

export const EXAMPLES: ExampleRegex[] = [
  {
    id: 'identifier',
    name: '标识符',
    regex: '[a-zA-Z_][a-zA-Z0-9_]*',
    description: '字母或下划线开头，后接任意个字母、数字、下划线。',
    testAccept: 'user_name42',
    testReject: '2nd_place',
  },
  {
    id: 'number',
    name: '带小数的数字',
    regex: '(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?',
    description: '整数部分不允许前导 0，小数部分与指数部分都可选。',
    testAccept: '3.14E-2',
    testReject: '01.5',
  },
  {
    id: 'string',
    name: '字符串字面量',
    // " 开头结尾；内部字符要么是反斜杠转义（\" \\ \n \t），
    // 要么是普通可见字符（字符类区间排除了 " (34) 与 \ (92)）
    regex: String.raw`"(\\["\\nt]|[ -!#-[\]-~])*"`,
    description: '双引号包裹，内部为普通可见字符或反斜杠转义（\\"、\\\\、\\n、\\t），演示选择、闭包与字符类区间的嵌套。',
    testAccept: String.raw`"he said \"hi\""`,
    testReject: '"unterminated',
  },
  {
    id: 'phone',
    name: '三段式电话号码',
    regex: '[0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]',
    description: '三位-四位-四位数字，显式展示"连接"是怎么逐个片段拼起来的。',
    testAccept: '010-8888-9999',
    testReject: '010-888-9999',
  },
  {
    id: 'ab',
    name: '入门：(a|b)*abb',
    regex: '(a|b)*abb',
    description: '龙书经典例子：所有以 abb 结尾的 a/b 串，最小化后只剩 4 个状态。',
    testAccept: 'ababb',
    testReject: 'ababa',
  },
  {
    id: 'optional',
    name: '可选与正闭包',
    regex: 'colou?r+',
    description: '演示 ?（英式/美式拼写）与 + 的组合。',
    testAccept: 'colourrr',
    testReject: 'colouur',
  },
];
