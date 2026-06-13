import { describe, expect, it } from "vitest";
import { COUNTRY_CODES } from "./countryCodes";

describe("COUNTRY_CODES", () => {
  // The phone-country <select> now keys + values on the ISO code, so these MUST
  // be unique or React duplicate-key warnings and uncontrollable selection
  // return (regression guard for BUG-013).
  it("has unique ISO country codes", () => {
    const codes = COUNTRY_CODES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // Dial codes are intentionally allowed to collide (+1 → US & Canada,
  // +7 → Russia & Kazakhstan). This test documents that they DO collide, which
  // is exactly why the <option value> can no longer be the dial code.
  it("contains colliding dial codes that justify keying on ISO code", () => {
    const dials = COUNTRY_CODES.map((c) => c.dial);
    expect(new Set(dials).size).toBeLessThan(dials.length);
  });

  it("can resolve a dial code from an ISO code", () => {
    const us = COUNTRY_CODES.find((c) => c.code === "US");
    const ca = COUNTRY_CODES.find((c) => c.code === "CA");
    expect(us?.dial).toBe("+1");
    expect(ca?.dial).toBe("+1");
    expect(us?.code).not.toBe(ca?.code);
  });
});
