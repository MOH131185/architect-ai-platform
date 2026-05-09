import {
  buildArtifactPackage,
  IFC_EXPORT_UNAVAILABLE,
  listZipEntryNames,
} from "../../../services/export/artifactPackageService.js";
import { DWG_CONVERSION_UNAVAILABLE } from "../../../services/cad/dwgConversionAdapter.js";

function dataUri(mimeType, value) {
  return `data:${mimeType};base64,${Buffer.from(value).toString("base64")}`;
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
});
