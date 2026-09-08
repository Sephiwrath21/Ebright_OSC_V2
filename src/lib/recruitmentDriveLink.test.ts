// Verifies the fuzzy name/doc-type matching logic without any live Drive
// access — the recruitment folder turned out to be Viewer-only for the
// service account (confirmed live 2026-09-04 via a real 403 on a write
// attempt, matching its intended read-only nature), so an end-to-end test
// against a real dummy file isn't possible. This exercises the exact same
// pure functions runRecruitmentDriveLink calls per file instead.
import { describe, it, expect } from "vitest";
import { nameMatchesFile, classifyDocType, stripExtension } from "@/lib/recruitmentDriveLink";

describe("stripExtension", () => {
  it("removes a trailing file extension", () => {
    expect(stripExtension("Test Hq Full Time - Resume.pdf")).toBe("Test Hq Full Time - Resume");
    expect(stripExtension("no-extension")).toBe("no-extension");
  });
});

describe("classifyDocType", () => {
  it("recognizes Resume/CV filenames", () => {
    expect(classifyDocType("Test Hq Full Time - Resume.pdf")).toBe("resume");
    expect(classifyDocType("John_Tan_CV.docx")).toBe("resume");
  });

  it("recognizes Offer Letter filenames", () => {
    expect(classifyDocType("Offer Letter - Test Hq Full-Time.pdf")).toBe("offer letter");
    expect(classifyDocType("OFFER_John_Tan.pdf")).toBe("offer letter");
  });

  it("excludes Reference files even if a resume/offer keyword also appears", () => {
    expect(classifyDocType("Test Hq Full Time - Reference.pdf")).toBeNull();
  });

  it("returns null for anything unrecognized", () => {
    expect(classifyDocType("Test Hq Full Time - IC Copy.pdf")).toBeNull();
  });
});

describe("nameMatchesFile", () => {
  it("matches the exact name, case/spacing-insensitive", () => {
    expect(nameMatchesFile("Test Hq Full Time", "Test Hq Full Time - Resume")).toBe(true);
    expect(nameMatchesFile("Test Hq Full Time", "TEST HQ FULL TIME_RESUME")).toBe(true);
  });

  it("tolerates underscore/hyphen separators and reordered doc-type words", () => {
    expect(nameMatchesFile("Test Hq Full Time", "Offer Letter - Test Hq Full-Time")).toBe(true);
  });

  it("tolerates a reordered name (order-independent word fallback)", () => {
    expect(nameMatchesFile("John Tan", "Tan John - Resume")).toBe(true);
  });

  it("does not match a different, unrelated employee's file", () => {
    expect(nameMatchesFile("Test Hq Full Time", "John Doe - Resume")).toBe(false);
  });

  it("does not match on a bare single-letter initial alone", () => {
    // "A Lee" would otherwise trivially match nearly any filename containing
    // a lone "A" if the length>=2 filter on name words weren't applied.
    expect(nameMatchesFile("A Lee", "Completely Unrelated File")).toBe(false);
  });

  it("still requires the real name words to be present, not just the initial", () => {
    expect(nameMatchesFile("A Lee", "A Lee - Resume")).toBe(true);
  });
});
