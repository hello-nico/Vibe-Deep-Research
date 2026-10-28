import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const shanghaiToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(now);
/** 已经发生的披露、发布日期：交易所把盘后发布记在下一个交易日，比今天晚的一律按今天。预约日、截止日这类将来的日期不用它。 */
export const disclosedDay = (date: string, today = shanghaiToday()) => date.slice(0, 10) > today ? today : date.slice(0, 10);

/** 页面上的日期：「2026-10-08」写成「10-08」；对话问句另用口语日期。 */
export const dayLabel = (date: string) => {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
  return match ? `${match[1]}-${match[2]}` : date;
};
