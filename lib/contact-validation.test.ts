// Run: node --test lib/
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderEmail, isValidEmail, normaliseSmsMobile } from "./utils.ts";

test("normaliseSmsMobile accepts the usual AU mobile formats", () => {
  for (const raw of ["0412 345 678", "0412345678", "+61 412 345 678", "61412345678", "  0412-345-678 "]) {
    assert.equal(normaliseSmsMobile(raw), "+61412345678", raw);
  }
});

test("normaliseSmsMobile rejects landlines and junk", () => {
  for (const raw of ["07 3123 4567", "+61 7 3123 4567", "041234567", "04123456789", "", "abc"]) {
    assert.equal(normaliseSmsMobile(raw), null, raw);
  }
});

test("isValidEmail", () => {
  assert.equal(isValidEmail("jane@example.com"), true);
  assert.equal(isValidEmail("jane@example"), false);
  assert.equal(isValidEmail("jane example@x.com"), false);
});

test("isPlaceholderEmail", () => {
  assert.equal(isPlaceholderEmail("jane.smith@cocoonskinandbeauty.com.au"), true);
  assert.equal(isPlaceholderEmail("Jane@CocoonSkinAndBeauty.com.au"), true);
  assert.equal(isPlaceholderEmail("jane@gmail.com"), false);
});
