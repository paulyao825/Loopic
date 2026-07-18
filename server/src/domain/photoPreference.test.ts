import assert from "node:assert/strict";
import test from "node:test";
import { PHOTO_PREFERENCES, isPhotoPreference, preferenceProfile } from "./photoPreference.js";

test("all five photo preferences have normalized weights", () => {
  assert.equal(PHOTO_PREFERENCES.length, 5);
  for (const preference of PHOTO_PREFERENCES) {
    const sum = Object.values(preferenceProfile(preference).weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < Number.EPSILON);
  }
});

test("photo preference validation accepts only supported values", () => {
  assert.equal(isPhotoPreference("balanced"), true);
  assert.equal(isPhotoPreference("people-emotion"), true);
  assert.equal(isPhotoPreference("custom"), false);
  assert.equal(isPhotoPreference(undefined), false);
});
