import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financialNumber, sourceName, dataCsv } from '../src/verticals/finance/lib/financialDisplay.ts';

test('financial display rounds decimals without losing large integer digits or identities', () => {
  assert.equal(financialNumber('246724789201'), '246,724,789,201');
  assert.equal(financialNumber('-9007199254740993.001200'), '-9,007,199,254,740,993.00');
  assert.equal(financialNumber('7.4799999999999995'), '7.48');
  assert.equal(financialNumber('7.780000'), '7.78');
  assert.equal(financialNumber('7', 2), '7.00');
  assert.equal(financialNumber('999.999'), '1,000.00');
  assert.equal(financialNumber('-0.001'), '0.00');
  assert.equal(financialNumber('186190130.0', 0), '186,190,130');
  assert.equal(financialNumber('2025-12-31'), '2025-12-31');
  assert.equal(financialNumber('600011.SH'), '600011.SH');
  assert.equal(financialNumber(null), '—');
  assert.equal(financialNumber('0'), '0');
});
test('CSV retains source values, units and quoted labels', () => {
  const csv = dataCsv([{ key: 'amount', label: '金额', unit: '元' }], [{ amount: '9007199254740993.0012' }, { amount: null }]);
  assert.equal(csv, '\uFEFF"金额（元）"\r\n"9007199254740993.0012"\r\n""');
  assert.equal(sourceName('hithink'), '同花顺');
  assert.equal(sourceName('同花顺扶摇'), '同花顺扶摇', '不做字符串替换：来源名由 Backend 在源头归一');
  assert.equal(sourceName('扶摇'), '扶摇', '不做字符串替换：来源名由 Backend 在源头归一');
  assert.equal(sourceName('https://fuyao.aicubes.cn'), 'https://fuyao.aicubes.cn');
});
