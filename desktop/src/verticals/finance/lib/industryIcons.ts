import type { LucideIcon } from "lucide-react";
import {
  Armchair, Boxes, BrickWall, Car, Cog, Cpu, Factory, FileText, Flame,
  FlaskConical, Footprints, Fuel, Gauge, Gem, Hammer, HardHat, Hexagon, Layers3,
  Leaf, Mountain, Palette, Pill, Plug, Printer, Recycle, Scissors, Settings2,
  Shirt, Ship, TreeDeciduous, UtensilsCrossed, Waves, Wine, Wrench, Zap,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "煤炭开采和洗选业": Flame,
  "石油和天然气开采业": Fuel,
  "黑色金属矿采选业": Mountain,
  "有色金属矿采选业": Gem,
  "非金属矿采选业": Hexagon,
  "开采专业及辅助性活动": HardHat,
  "其他采矿业": Mountain,
  "农副食品加工业": Leaf,
  "食品制造业": UtensilsCrossed,
  "酒、饮料和精制茶制造业": Wine,
  "烟草制品业": Leaf,
  "纺织业": Scissors,
  "纺织服装、服饰业": Shirt,
  "皮革、毛皮、羽毛及其制品和制鞋业": Footprints,
  "木材加工和木、竹、藤、棕、草制品业": TreeDeciduous,
  "家具制造业": Armchair,
  "造纸和纸制品业": FileText,
  "印刷和记录媒介复制业": Printer,
  "文教、工美、体育和娱乐用品制造业": Palette,
  "石油、煤炭及其他燃料加工业": Flame,
  "化学原料和化学制品制造业": FlaskConical,
  "医药制造业": Pill,
  "化学纤维制造业": Scissors,
  "橡胶和塑料制品业": Boxes,
  "非金属矿物制品业": BrickWall,
  "黑色金属冶炼和压延加工业": Factory,
  "有色金属冶炼和压延加工业": Factory,
  "金属制品业": Hammer,
  "通用设备制造业": Cog,
  "专用设备制造业": Settings2,
  "汽车制造业": Car,
  "铁路、船舶、航空航天和其他运输设备制造业": Ship,
  "电气机械和器材制造业": Plug,
  "计算机、通信和其他电子设备制造业": Cpu,
  "仪器仪表制造业": Gauge,
  "其他制造业": Boxes,
  "废弃资源综合利用业": Recycle,
  "金属制品、机械和设备修理业": Wrench,
  "电力、热力生产和供应业": Zap,
  "燃气生产和供应业": Flame,
  "水的生产和供应业": Waves,
};

export function industryIcon(officialName: string): LucideIcon {
  return ICONS[officialName] ?? Layers3;
}

export const INDUSTRY_ICON_NAMES = Object.keys(ICONS);
