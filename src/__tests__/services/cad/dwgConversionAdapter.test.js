import {
  DWG_CONVERSION_UNAVAILABLE,
  convertDxfToDwg,
  resolveDwgConversionCapabilities,
} from "../../../services/cad/dwgConversionAdapter.js";

describe("dwgConversionAdapter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DWG_CONVERSION_ENABLED;
    delete process.env.DWG_CONVERSION_PROVIDER;
    delete process.env.ODA_FILE_CONVERTER_PATH;
    delete process.env.ODA_SDK_PATH;
    delete process.env.AUTODESK_APS_CLIENT_ID;
    delete process.env.AUTODESK_APS_CLIENT_SECRET;
    delete process.env.REACT_APP_DWG_CONVERSION_ENABLED;
    delete process.env.REACT_APP_DWG_CONVERSION_PROVIDER;
    delete process.env.REACT_APP_ODA_FILE_CONVERTER_PATH;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("resolveDwgConversionCapabilities uses explicit env object", () => {
    const capabilities = resolveDwgConversionCapabilities({
      DWG_CONVERSION_ENABLED: "true",
      DWG_CONVERSION_PROVIDER: "local_oda",
      ODA_FILE_CONVERTER_PATH: "C:\\ODA\\ODAFileConverter.exe",
    });

    expect(capabilities.available).toBe(true);
    expect(capabilities.provider).toBe("local_oda");
    expect(capabilities.reason).toBeNull();
  });

  test("resolveDwgConversionCapabilities uses process.env when no env is passed", () => {
    process.env.DWG_CONVERSION_ENABLED = "true";
    process.env.DWG_CONVERSION_PROVIDER = "oda";
    process.env.ODA_FILE_CONVERTER_PATH = "C:\\ODA\\ODAFileConverter.exe";

    const capabilities = resolveDwgConversionCapabilities();

    expect(capabilities.available).toBe(true);
    expect(capabilities.provider).toBe("oda");
  });

  test("reports DWG unavailable by default instead of pretending to export DWG", () => {
    const capabilities = resolveDwgConversionCapabilities({});

    expect(capabilities.available).toBe(false);
    expect(capabilities.code).toBe(DWG_CONVERSION_UNAVAILABLE);
    expect(capabilities.reason).toMatch(/DXF is the guaranteed CAD output/);
  });

  test("requires a real configured provider", () => {
    const capabilities = resolveDwgConversionCapabilities({
      DWG_CONVERSION_ENABLED: "true",
      DWG_CONVERSION_PROVIDER: "aps",
    });

    expect(capabilities.available).toBe(false);
    expect(capabilities.code).toBe(DWG_CONVERSION_UNAVAILABLE);
    expect(capabilities.reason).toMatch(
      /Autodesk APS client credentials are missing/,
    );
  });

  test("configured converter path is detected from env", () => {
    const capabilities = resolveDwgConversionCapabilities({
      DWG_CONVERSION_ENABLED: "true",
      DWG_CONVERSION_PROVIDER: "local_oda",
      ODA_FILE_CONVERTER_PATH: "C:\\Program Files\\ODA\\ODAFileConverter.exe",
    });

    expect(capabilities.available).toBe(true);
    expect(capabilities.provider).toBe("local_oda");
  });

  test("does not convert without DXF content", async () => {
    await expect(convertDxfToDwg({ dxf: "" })).rejects.toThrow(
      /DXF content is required/,
    );
  });

  test("convertDxfToDwg uses explicit env object", async () => {
    await expect(
      convertDxfToDwg({
        dxf: "0\nEOF\n",
        env: {
          DWG_CONVERSION_ENABLED: "true",
          DWG_CONVERSION_PROVIDER: "local_oda",
          ODA_FILE_CONVERTER_PATH: "C:\\ODA\\ODAFileConverter.exe",
        },
      }),
    ).rejects.toThrow(/provider "local_oda" is configured/);
  });

  test("convertDxfToDwg uses process.env when no env is passed", async () => {
    process.env.DWG_CONVERSION_ENABLED = "true";
    process.env.DWG_CONVERSION_PROVIDER = "oda";
    process.env.ODA_FILE_CONVERTER_PATH = "C:\\ODA\\ODAFileConverter.exe";

    await expect(convertDxfToDwg({ dxf: "0\nEOF\n" })).rejects.toThrow(
      /provider "oda" is configured/,
    );
  });

  test("conversion disabled by default does not create fake DWG", async () => {
    await expect(
      convertDxfToDwg({ dxf: "0\nEOF\n", env: {} }),
    ).rejects.toMatchObject({
      code: DWG_CONVERSION_UNAVAILABLE,
    });
  });

  test("unavailable converter throws a clear unavailable error", async () => {
    await expect(
      convertDxfToDwg({
        dxf: "0\nEOF\n",
        env: {
          DWG_CONVERSION_ENABLED: "true",
          DWG_CONVERSION_PROVIDER: "aps",
        },
      }),
    ).rejects.toMatchObject({
      code: DWG_CONVERSION_UNAVAILABLE,
      details: expect.objectContaining({
        available: false,
        reason: expect.stringMatching(
          /Autodesk APS client credentials are missing/,
        ),
      }),
    });
  });
});
