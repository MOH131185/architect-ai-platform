import {
  buildArtifactPackage,
  buildArtifactPackageWithPdfStitching,
  IFC_EXPORT_UNAVAILABLE,
  listZipEntryNames,
  PDF_STITCHING_FAILED,
  PDF_STITCHING_NO_INPUT_PDFS,
} from "../../../services/export/artifactPackageService.js";
import { DWG_CONVERSION_UNAVAILABLE } from "../../../services/cad/dwgConversionAdapter.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function dataUri(mimeType, value) {
  return `data:${mimeType};base64,${Buffer.from(value).toString("base64")}`;
}

async function pdfDataUri(label) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(label);
  pdf.setCreator("artifact-package-test");
  pdf.setProducer("artifact-package-test");
  pdf.setCreationDate(new Date("1980-01-01T00:00:00.000Z"));
  pdf.setModificationDate(new Date("1980-01-01T00:00:00.000Z"));
  const page = pdf.addPage([200, 200]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(label, {
    x: 24,
    y: 144,
    font,
    size: 12,
    color: rgb(0, 0, 0),
  });
  const bytes = await pdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
  return dataUri("application/pdf", bytes);
}

function readZipEntry(zipBytes, entryName) {
  const bytes = Buffer.from(zipBytes);
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = bytes.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const name = bytes.slice(nameStart, nameEnd).toString("utf8");
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (name === entryName) {
      return bytes.slice(dataStart, dataEnd);
    }
    offset = dataEnd;
  }

  return null;
}

function baseInput(overrides = {}) {
  return {
    projectId: "project-001",
    projectGraphId: "project-graph-001",
    geometryHash: "geometryhash001",
    visualManifestHash: "visualmanifesthash001",
    styleBlendManifestHash: "styleblendhash001",
    jurisdictionId: "uk-england",
    countryCode: "GB",
    projectName: "Deterministic Package",
    flags: {
      structuralEnabled: false,
      mepEnabled: false,
      detailsEnabled: false,
      dwgEnabled: false,
      ifcEnabled: false,
    },
    a1Sheet: {
      svgString:
        '<svg xmlns="http://www.w3.org/2000/svg"><text>A1</text></svg>',
      sheetNumber: "A1-001",
    },
    a1Pdf: {
      dataUrl: dataUri("application/pdf", "%PDF-1.7 deterministic"),
      sheetNumber: "A1-001",
    },
    dxfArtifact: {
      content: "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n",
      fileName: "cad/deterministic-package.dxf",
    },
    qaReport: {
      status: "pass",
      score: 96,
      issues: [],
    },
    ...overrides,
  };
}

describe("artifactPackageService", () => {
  test("manifest includes required package, authority, QA, producer, and flag fields", () => {
    const result = buildArtifactPackage(baseInput());

    expect(result.manifest).toEqual(
      expect.objectContaining({
        schemaVersion: "artifact-package-manifest-v1",
        packageId: expect.stringMatching(/^artifact-package-/),
        packageHash: expect.any(String),
        createdAtPolicy: "deterministic-fixed",
        fixedTimestamp: "1980-01-01T00:00:00.000Z",
        projectId: "project-001",
        projectGraphId: "project-graph-001",
        geometryHash: "geometryhash001",
        visualManifestHash: "visualmanifesthash001",
        styleBlendManifestHash: "styleblendhash001",
        jurisdictionId: "uk-england",
        countryCode: "GB",
        qaSummary: expect.objectContaining({ status: "pass" }),
        producerVersions: expect.objectContaining({
          artifactPackageService: "artifact-package-service-v1",
        }),
        flags: expect.objectContaining({
          structuralEnabled: false,
          mepEnabled: false,
          detailsEnabled: false,
          dwgEnabled: false,
          ifcEnabled: false,
        }),
      }),
    );
    expect(result.manifest.artifacts[0]).toEqual(
      expect.objectContaining({
        artifactId: expect.any(String),
        type: expect.any(String),
        fileName: expect.any(String),
        mimeType: expect.any(String),
        role: expect.any(String),
        discipline: expect.any(String),
        hash: expect.any(String),
        byteLength: expect.any(Number),
        geometryHash: "geometryhash001",
        visualManifestHash: "visualmanifesthash001",
        styleBlendManifestHash: "styleblendhash001",
        jurisdictionId: "uk-england",
        reviewRequired: expect.any(Boolean),
        preliminary: expect.any(Boolean),
        advisory: expect.any(Boolean),
      }),
    );
  });

  test("artifact hashes and package hash are deterministic for identical inputs", () => {
    const first = buildArtifactPackage(baseInput());
    const second = buildArtifactPackage(baseInput());

    expect(second.packageHash).toBe(first.packageHash);
    expect(second.zipHash).toBe(first.zipHash);
    expect(second.manifest.artifacts.map((artifact) => artifact.hash)).toEqual(
      first.manifest.artifacts.map((artifact) => artifact.hash),
    );
  });

  test("ZIP entries are sorted and deterministic", () => {
    const input = baseInput({
      existingArtifacts: [
        {
          fileName: "technical/z-section.svg",
          mimeType: "image/svg+xml",
          discipline: "architecture",
          role: "technical_drawing",
          content: "<svg>z</svg>",
        },
        {
          fileName: "technical/a-plan.svg",
          mimeType: "image/svg+xml",
          discipline: "architecture",
          role: "technical_drawing",
          content: "<svg>a</svg>",
        },
      ],
      technicalDrawings: [
        {
          panelType: "section_pdf",
          mimeType: "application/pdf",
          pdfDataUrl: dataUri("application/pdf", "%PDF technical"),
        },
      ],
    });
    const first = buildArtifactPackage(input);
    const second = buildArtifactPackage(input);
    const names = listZipEntryNames(first.zipBytes);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual(
      expect.arrayContaining([
        "manifest.json",
        "qa/qa-report.json",
        "technical/section_pdf.pdf",
        "presentation/",
        "technical/",
        "cad/",
        "bim/",
        "qa/",
        "previews/",
        "schedules/",
      ]),
    );
    expect(second.zipHash).toBe(first.zipHash);
  });

  test("DWG unavailable produces a source gap and no DWG artifact", () => {
    const result = buildArtifactPackage(baseInput());

    expect(result.manifest.sourceGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DWG_CONVERSION_UNAVAILABLE }),
      ]),
    );
    expect(
      result.manifest.artifacts.some((a) => a.fileName.endsWith(".dwg")),
    ).toBe(false);
    expect(
      listZipEntryNames(result.zipBytes).some((name) => name.endsWith(".dwg")),
    ).toBe(false);
  });

  test("IFC unavailable produces a source gap and no IFC artifact", () => {
    const result = buildArtifactPackage(baseInput());

    expect(result.manifest.sourceGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: IFC_EXPORT_UNAVAILABLE }),
      ]),
    );
    expect(
      result.manifest.artifacts.some((a) => a.fileName.endsWith(".ifc")),
    ).toBe(false);
    expect(
      listZipEntryNames(result.zipBytes).some((name) => name.endsWith(".ifc")),
    ).toBe(false);
  });

  test("structural, MEP, and detail disabled flags do not fail the package", () => {
    const result = buildArtifactPackage(baseInput());

    expect(result.packageHash).toEqual(expect.any(String));
    expect(result.manifest.sourceGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "STRUCTURAL_OUTPUTS_DISABLED",
          severity: "info",
          omittedByFlag: true,
        }),
        expect.objectContaining({
          code: "MEP_OUTPUTS_DISABLED",
          severity: "info",
          omittedByFlag: true,
        }),
        expect.objectContaining({
          code: "DETAIL_OUTPUTS_DISABLED",
          severity: "info",
          omittedByFlag: true,
        }),
      ]),
    );
  });

  test("supplied structural, MEP, and detail artifacts appear under correct disciplines", () => {
    const result = buildArtifactPackage(
      baseInput({
        flags: {
          structuralEnabled: true,
          mepEnabled: true,
          detailsEnabled: true,
          dwgEnabled: false,
          ifcEnabled: false,
        },
        structuralArtifacts: [
          {
            fileName: "technical/s-100-structural-plan.svg",
            svgString: "<svg>structure</svg>",
          },
        ],
        mepArtifacts: [
          {
            fileName: "technical/m-100-mep-plan.svg",
            svgString: "<svg>mep</svg>",
          },
        ],
        detailArtifacts: [
          {
            fileName: "technical/d-501-detail.svg",
            svgString: "<svg>detail</svg>",
          },
        ],
      }),
    );

    expect(result.manifest.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: "technical/s-100-structural-plan.svg",
          discipline: "structure",
          reviewRequired: true,
          preliminary: true,
          advisory: true,
        }),
        expect.objectContaining({
          fileName: "technical/m-100-mep-plan.svg",
          discipline: "mep",
        }),
        expect.objectContaining({
          fileName: "technical/d-501-detail.svg",
          discipline: "details",
        }),
      ]),
    );
  });

  test("real supplied DWG and IFC artifacts are included without creating fake outputs", () => {
    const result = buildArtifactPackage(
      baseInput({
        flags: {
          structuralEnabled: false,
          mepEnabled: false,
          detailsEnabled: false,
          dwgEnabled: true,
          ifcEnabled: true,
        },
        dwgArtifact: {
          fileName: "cad/real-output.dwg",
          content: "real dwg bytes from configured converter",
        },
        ifcArtifact: {
          fileName: "bim/real-output.ifc",
          content: "ISO-10303-21; real ifc",
        },
      }),
    );

    expect(result.manifest.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: "cad/real-output.dwg",
          discipline: "cad",
        }),
        expect.objectContaining({
          fileName: "bim/real-output.ifc",
          discipline: "bim",
        }),
      ]),
    );
    expect(result.manifest.sourceGaps).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: DWG_CONVERSION_UNAVAILABLE }),
        expect.objectContaining({ code: IFC_EXPORT_UNAVAILABLE }),
      ]),
    );
  });

  test("package manifest carries geometry, visual, style, and jurisdiction authority hashes", () => {
    const result = buildArtifactPackage(baseInput());

    expect(result.manifest).toEqual(
      expect.objectContaining({
        geometryHash: "geometryhash001",
        visualManifestHash: "visualmanifesthash001",
        styleBlendManifestHash: "styleblendhash001",
        jurisdictionId: "uk-england",
      }),
    );
    for (const artifact of result.manifest.artifacts) {
      expect(artifact.geometryHash).toBe("geometryhash001");
      expect(artifact.visualManifestHash).toBe("visualmanifesthash001");
      expect(artifact.styleBlendManifestHash).toBe("styleblendhash001");
      expect(artifact.jurisdictionId).toBe("uk-england");
    }
  });

  test("stitches existing generated PDFs into deterministic deliverables PDF", async () => {
    const a1Pdf = await pdfDataUri("A1 sheet");
    const sectionPdf = await pdfDataUri("Section sheet");
    const input = baseInput({
      a1Pdf: {
        dataUrl: a1Pdf,
        sheetNumber: "A1-001",
      },
      technicalDrawings: [
        {
          panelType: "section",
          mimeType: "application/pdf",
          pdfDataUrl: sectionPdf,
          sheetNumber: "A-201",
        },
      ],
    });

    const first = await buildArtifactPackageWithPdfStitching(input);
    const second = await buildArtifactPackageWithPdfStitching(input);
    const stitchedFileName =
      "presentation/deterministic-package-deliverables.pdf";
    const stitchedArtifact = first.manifest.artifacts.find(
      (artifact) => artifact.fileName === stitchedFileName,
    );

    expect(stitchedArtifact).toEqual(
      expect.objectContaining({
        type: "stitched_pdf_package",
        mimeType: "application/pdf",
        role: "stitched_deliverables_pdf",
        source: "PDF stitching from existing generated PDF artifacts",
      }),
    );
    expect(listZipEntryNames(first.zipBytes)).toContain(stitchedFileName);
    expect(second.packageHash).toBe(first.packageHash);
    expect(
      second.manifest.artifacts.find(
        (artifact) => artifact.fileName === stitchedFileName,
      )?.hash,
    ).toBe(stitchedArtifact.hash);

    const stitchedBytes = readZipEntry(first.zipBytes, stitchedFileName);
    expect(stitchedBytes).toBeTruthy();
    const stitchedPdf = await PDFDocument.load(new Uint8Array(stitchedBytes));
    expect(stitchedPdf.getPageCount()).toBe(3);
  });

  test("stitching source gap is reported when no existing PDFs are supplied", async () => {
    const result = await buildArtifactPackageWithPdfStitching(
      baseInput({
        a1Pdf: null,
        technicalDrawings: [],
        existingArtifacts: [],
      }),
    );

    expect(result.manifest.sourceGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: PDF_STITCHING_NO_INPUT_PDFS }),
      ]),
    );
    expect(
      result.manifest.artifacts.some(
        (artifact) => artifact.type === "stitched_pdf_package",
      ),
    ).toBe(false);
  });

  test("stitching failure reports a source gap without creating a fake stitched PDF", async () => {
    const result = await buildArtifactPackageWithPdfStitching(
      baseInput({
        a1Pdf: {
          dataUrl: dataUri("application/pdf", "not a real pdf"),
          sheetNumber: "A1-001",
        },
      }),
    );

    expect(result.manifest.sourceGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: PDF_STITCHING_FAILED }),
      ]),
    );
    expect(
      result.manifest.artifacts.some(
        (artifact) => artifact.type === "stitched_pdf_package",
      ),
    ).toBe(false);
    expect(
      listZipEntryNames(result.zipBytes).some((name) =>
        name.endsWith("-deliverables.pdf"),
      ),
    ).toBe(false);
  });
});
