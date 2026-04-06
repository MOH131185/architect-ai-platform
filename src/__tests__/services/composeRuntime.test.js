import { getOpusSheetCritic } from "../../services/a1/composeRuntime.js";

describe("composeRuntime", () => {
  test("getOpusSheetCritic returns a usable critic export", async () => {
    const criticExport = await getOpusSheetCritic();
    expect(criticExport).toBeTruthy();

    const critic =
      typeof criticExport === "function" ? new criticExport() : criticExport;

    expect(typeof critic.critiqueSheet).toBe("function");
  });
});
