import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { aboutMeDate, aboutMeSource, type AboutMeItem } from '../lib/aboutMe';
import { loadOpinions, OPINION_LIMIT } from '../lib/companyOpinion';
import './company-opinion.css';

/** 个股页论点下面的「我的看法」：用户自己说过、写过的看法，和系统判断并列。不比较、不评判，没有就不出现；读不到也不出现。 */
export function CompanyOpinion({ name, symbol }: { name: string; symbol: string }) {
  const [items, setItems] = useState<AboutMeItem[]>([]);
  useEffect(() => {
    let alive = true;
    setItems([]);
    loadOpinions({ name, symbol }).then(found => { if (alive) setItems(found); }, () => {});
    return () => { alive = false; };
  }, [name, symbol]);
  if (!items.length) return null;
  const shown = items.slice(0, OPINION_LIMIT), more = items.length - shown.length;
  return <div className="company-opinion" data-company-opinion="">
    {shown.map(item => {
      const meta = [aboutMeSource(item), aboutMeDate(item.updated_at)].filter(Boolean).join(' · ');
      return <p key={item.id} data-opinion={item.id}>我的看法：{item.text}<small>{meta}</small></p>;
    })}
    {more > 0 && <p><Link to="/settings" data-opinion-more="">另有 {more} 条</Link></p>}
  </div>;
}
