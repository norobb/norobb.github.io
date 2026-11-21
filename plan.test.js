// node plan.test.js
const assert = require('node:assert');
const { parsePlan, band } = require('./plan.js');

const wed = new Date(2026, 10, 18); // a Wednesday
const t = (s) => parsePlan(s, wed);

assert.deepStrictEqual(t('minecraft friday 8pm'), { day: 4, hour: 20, minute: 0, title: 'Minecraft' });
assert.deepStrictEqual(t('Cinema on Sat at 18:30?'), { day: 5, hour: 18, minute: 30, title: 'Cinema' });
assert.deepStrictEqual(t('homework call tomorrow 5pm'), { day: 3, hour: 17, minute: 0, title: 'Homework call' });
assert.deepStrictEqual(t('Kino morgen um 19 Uhr'), { day: 3, hour: 19, minute: 0, title: 'Kino' });
assert.deepStrictEqual(t('pizza tonight'), { day: 2, hour: 20, minute: 0, title: 'Pizza' });
assert.deepStrictEqual(t('so tired, gaming sunday 7:15'), { day: 6, hour: 19, minute: 15, title: 'So tired gaming' });
assert.deepStrictEqual(t('???'), { day: 2, hour: null, minute: 0, title: 'Hang out' });
assert.strictEqual(t('basketball 25:00').hour, null);
assert.strictEqual(band(null), 2);
assert.strictEqual(band(10), 0);
assert.strictEqual(band(22), 3);
console.log('plan.js ok');
