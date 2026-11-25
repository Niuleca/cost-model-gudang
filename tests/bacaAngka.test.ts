import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bacaAngka } from '../src/lib/bacaAngka.ts';

test('format angka: titik desimal, koma ribuan; koma dari keyboard HP tetap terbaca', () => {
  assert.equal(bacaAngka('1.1'), 1.1);
  assert.equal(bacaAngka('1,1'), 1.1);          // keyboard HP Indonesia
  assert.equal(bacaAngka('2,75'), 2.75);
  assert.equal(bacaAngka('0,250'), 0.25);       // diawali 0 → desimal
  assert.equal(bacaAngka('1,250'), 1250);       // koma + 3 angka → ribuan
  assert.equal(bacaAngka('1,250,000'), 1250000);
  assert.equal(bacaAngka('1,250.5'), 1250.5);
  assert.equal(bacaAngka('1.250,5'), 1250.5);   // format Indonesia lengkap
  assert.equal(bacaAngka('1.250.000'), 1250000);
  assert.equal(bacaAngka('25.000'), 25);        // satu titik = desimal
  assert.equal(bacaAngka(''), null);
  assert.equal(bacaAngka('-'), null);
  assert.equal((1250.5).toLocaleString('en-US'), '1,250.5');
});
