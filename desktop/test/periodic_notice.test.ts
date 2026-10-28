import assert from 'node:assert/strict';
import test from 'node:test';
import { periodicNotice, periodicReportDefinition } from '../src/verticals/finance/dsh/result-projection.ts';

test('report notices show company/report names and keep raw errors in details', () => {
  const details = { companyName: '华能国际', reportName: '三季报', status: 'ready' };
  assert.deepEqual(periodicNotice({ details }), { text: '华能国际 三季报已入库' });
  const error = "can't compare offset-naive and offset-aware datetimes";
  const failed = periodicNotice({ details: { ...details, status: 'failed', error } });
  assert.equal(failed.text, '华能国际 三季报入库失败');
  assert.equal(failed.error, error);
  assert.doesNotMatch(failed.text, /quarterly_report|job:|offset/);
});

test('product notification exclusively owns presentation; model context has no duplicate native trigger', () => {
  for (const customType of ['stock-research-periodic-report', 'stock-research-periodic-report-context']) {
    const event: any = { type: 'user/message', seq: 10, data: { source: { kind: 'stock-research', message: { customType } } } };
    assert.equal(periodicReportDefinition.match(event)?.exclusive, true);
    assert.equal(periodicReportDefinition.start({} as any, { event } as any, {} as any), null);
  }
  assert.equal(periodicReportDefinition.match({ type: 'user/message', seq: 11, data: { source: { kind: 'user' } } } as any), null);
});
