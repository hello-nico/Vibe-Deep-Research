/** 本机数据服务的金融插件注册入口。 */
import { registerPlugin } from "../plugin.ts";
import { FINANCE_PLUGIN } from "./plugin.ts";

registerPlugin(FINANCE_PLUGIN);
export { FINANCE_PLUGIN };
