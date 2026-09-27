/** 服务器入口：容器/本地生产模式都从这里启动，页面与接口同端口对外。 */

import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();
app.listen(PORT, () => {
  console.log(`正则流水线教学工具已启动：http://localhost:${PORT}`);
});
