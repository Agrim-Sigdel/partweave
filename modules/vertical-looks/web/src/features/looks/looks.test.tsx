import { describe, expect, it } from "vitest";
import { LOOK_OPTIONS } from "./look-context";
import { VERTICAL_LIST, VERTICAL_PRESETS } from "@/features/verticals/vertical-config";

describe("vertical-looks module", () => {
  it("exposes three looks and four business vertical presets", () => {
    expect(LOOK_OPTIONS.map((o) => o.id)).toEqual(["storefront", "scheduler", "desk"]);
    expect(VERTICAL_LIST.map((v) => v.id)).toEqual(["escrow", "barber", "florist", "saas"]);
    expect(VERTICAL_PRESETS.barber.defaultLook).toBe("scheduler");
  });
});
