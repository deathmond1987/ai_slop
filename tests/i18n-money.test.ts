import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../lib/money.ts";

test("formats money without depending on runtime ICU locale data", () => {
  assert.equal(formatMoney(3890000, "kzt", "ru"), "38\u00a0900,00\u00a0KZT");
  assert.equal(formatMoney(3890000, "KZT", "en"), "KZT 38,900.00");
  assert.equal(formatMoney(123456789, "usd", "ru"), "1\u00a0234\u00a0567,89\u00a0USD");
  assert.equal(formatMoney(100000000, "JPY", "ru"), "1\u00a0000\u00a0000\u00a0JPY");
  assert.equal(formatMoney(100000000, "JPY", "en"), "JPY 1,000,000");
  assert.equal(formatMoney(-500, "eur", "en"), "EUR -5.00");
  assert.equal(formatMoney(99, null, "ru"), "0,99");
  assert.equal(formatMoney(1000, undefined, "en"), "10.00");
});
