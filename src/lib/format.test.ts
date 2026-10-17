import { describe, expect, it } from "vitest";
import { accuracyLabel, freshness, isValidImei, timeAgo, toCsv } from "./format";

describe("format", () => {
  it("never claims precision when accuracy is poor", () => {
    expect(accuracyLabel(20).level).toBe("good");
    expect(accuracyLabel(300).text).toContain("approximate");
    expect(accuracyLabel(2000).text).toContain("low precision");
  });
  it("freshness is honest", () => {
    const now = Date.parse("2026-10-17T12:00:00Z");
    expect(freshness("2026-10-17T11:58:00Z", now)).toBe("recent");
    expect(freshness("2026-10-17T11:00:00Z", now)).toBe("stale");
    expect(freshness(null, now)).toBe("unknown");
    expect(timeAgo("2026-10-17T10:00:00Z", now)).toBe("2 h ago");
  });
  it("validates IMEI with Luhn", () => {
    expect(isValidImei("490154203237518")).toBe(true);
    expect(isValidImei("490154203237519")).toBe(false);
    expect(isValidImei("1234")).toBe(false);
  });
  it("escapes CSV and blocks formula injection", () => {
    const csv = toCsv([{ a: "=cmd()", b: 'x,"y"' }], ["a", "b"]);
    expect(csv.split("\n")[1]).toBe(`'=cmd(),"x,""y"""`);
  });
});
