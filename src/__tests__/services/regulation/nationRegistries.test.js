import { APPROVED_DOCUMENTS_WALES } from "../../../services/regulation/walesSourceRegistry.js";
import {
  TECHNICAL_HANDBOOKS_SCOTLAND,
  SCOTTISH_SECTION_INDEX,
} from "../../../services/regulation/scotlandSourceRegistry.js";
import { TECHNICAL_BOOKLETS_NI } from "../../../services/regulation/niSourceRegistry.js";
import {
  resolveJurisdiction,
  getNationSourceDocuments,
  jurisdictionLimitations,
} from "../../../services/regulation/jurisdictionRouter.js";

describe("Wales registry", () => {
  test("includes Wales-specific Part L 2022", () => {
    const partL = APPROVED_DOCUMENTS_WALES.find((d) => d.part === "L");
    expect(partL).toBeTruthy();
    expect(partL.version).toMatch(/2022/);
    expect(partL.source_url).toMatch(/gov\.wales/);
  });

  test("every entry has a non-empty gov.wales source URL", () => {
    for (const doc of APPROVED_DOCUMENTS_WALES) {
      expect(doc.source_url).toMatch(/gov\.wales/);
      expect(doc.title).toMatch(/Wales/i);
    }
  });
});

describe("Scotland registry", () => {
  test("Technical Handbooks 2024 cover Domestic + Non-Domestic", () => {
    const sections = TECHNICAL_HANDBOOKS_SCOTLAND.map((d) => d.section);
    expect(sections).toEqual(
      expect.arrayContaining(["Domestic", "Non-Domestic"]),
    );
    for (const handbook of TECHNICAL_HANDBOOKS_SCOTLAND) {
      expect(handbook.source_url).toMatch(/gov\.scot/);
    }
  });

  test("section index covers Scotland's 0-7 structure", () => {
    expect(SCOTTISH_SECTION_INDEX.length).toBe(8);
    expect(SCOTTISH_SECTION_INDEX[6].title).toBe("Energy");
  });
});

describe("Northern Ireland registry", () => {
  test("Technical Booklets B, D, E, F1, R are present", () => {
    const booklets = TECHNICAL_BOOKLETS_NI.map((d) => d.booklet);
    expect(booklets).toEqual(
      expect.arrayContaining(["B", "D", "E", "F1", "R"]),
    );
    for (const tb of TECHNICAL_BOOKLETS_NI) {
      expect(tb.source_url).toMatch(/finance-ni\.gov\.uk/);
    }
  });
});

describe("getNationSourceDocuments", () => {
  test("Wales jurisdiction returns Wales documents only", async () => {
    const docs = await getNationSourceDocuments("wales");
    expect(docs.length).toBeGreaterThan(2);
    for (const doc of docs) {
      expect(doc.url).not.toMatch(/gov\.uk\/government\/publications/); // not English ADs
    }
  });

  test("Scotland returns Technical Handbooks + NPF4", async () => {
    const docs = await getNationSourceDocuments("scotland");
    const titles = docs.map((d) => d.title);
    expect(titles.some((t) => /Technical Handbook 2024/i.test(t))).toBe(true);
    expect(titles.some((t) => /National Planning Framework 4/i.test(t))).toBe(
      true,
    );
  });

  test("Northern Ireland returns Technical Booklets + SPPS", async () => {
    const docs = await getNationSourceDocuments("northern_ireland");
    expect(docs.some((d) => /Technical Booklet R/i.test(d.title))).toBe(true);
    expect(
      docs.some((d) => /Strategic Planning Policy Statement/i.test(d.title)),
    ).toBe(true);
  });

  test("England returns empty (uses sourceRegistry directly)", async () => {
    expect(await getNationSourceDocuments("england")).toEqual([]);
  });
});

describe("jurisdictionLimitations references the right registry by file path", () => {
  test("Wales limitation cites walesSourceRegistry.js", () => {
    const limits = jurisdictionLimitations("wales");
    expect(limits[0]).toMatch(/walesSourceRegistry\.js/);
  });

  test("Scotland limitation cites scotlandSourceRegistry.js + Sections 0-7", () => {
    const limits = jurisdictionLimitations("scotland");
    expect(limits[0]).toMatch(/scotlandSourceRegistry\.js/);
    expect(limits[0]).toMatch(/Sections 0-7/);
  });

  test("NI limitation cites niSourceRegistry.js + Technical Booklets", () => {
    const limits = jurisdictionLimitations("northern_ireland");
    expect(limits[0]).toMatch(/niSourceRegistry\.js/);
    expect(limits[0]).toMatch(/Technical Booklets/);
  });
});

describe("end-to-end Wales/Scotland/NI routing via resolveJurisdiction", () => {
  test("Welsh postcode → wales jurisdiction → Welsh ADs", async () => {
    const j = resolveJurisdiction({ site_input: { postcode: "CF10 1AA" } });
    expect(j).toBe("wales");
    const docs = await getNationSourceDocuments(j);
    expect(docs.some((d) => /Wales/i.test(d.title))).toBe(true);
  });

  test("Scottish postcode → scotland jurisdiction → Technical Handbooks", async () => {
    const j = resolveJurisdiction({ site_input: { postcode: "EH1 1YZ" } });
    expect(j).toBe("scotland");
    const docs = await getNationSourceDocuments(j);
    expect(docs.some((d) => /Technical Handbook/i.test(d.title))).toBe(true);
  });

  test("NI postcode → northern_ireland → Technical Booklets", async () => {
    const j = resolveJurisdiction({ site_input: { postcode: "BT1 1AA" } });
    expect(j).toBe("northern_ireland");
    const docs = await getNationSourceDocuments(j);
    expect(docs.some((d) => /Technical Booklet/i.test(d.title))).toBe(true);
  });
});
