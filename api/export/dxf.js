/**
 * DXF Export API Endpoint
 *
 * Generates a DXF file from spatial graph and room positions JSON.
 * Uses a minimal DXF writer (no Python dependency required).
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { spatialGraph, roomPositions, projectName } = req.body || {};

    if (!spatialGraph?.building) {
      return res.status(400).json({ error: "Missing spatialGraph.building" });
    }

    const dxfContent = generateDXF(spatialGraph, roomPositions, projectName);

    res.setHeader("Content-Type", "application/dxf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${(projectName || "floor_plan").replace(/[^a-zA-Z0-9_-]/g, "_")}.dxf"`,
    );
    return res.status(200).send(dxfContent);
  } catch (err) {
    console.error("[DXF Export] Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Minimal DXF writer (AutoCAD R2010 ASCII format)
// ---------------------------------------------------------------------------

function dxfPair(code, value) {
  return `  ${code}\n${value}\n`;
}

function generateDXF(spatialGraph, roomPositions, projectName) {
  const building = spatialGraph.building;
  const envelope = building.envelope || {};
  const floors = building.floors || [];

  const parts = [];

  // HEADER section
  parts.push(dxfHeader(envelope));

  // TABLES section (layers)
  parts.push(dxfTables());

  // ENTITIES section
  parts.push(dxfPair(0, "SECTION"));
  parts.push(dxfPair(2, "ENTITIES"));

  for (const floor of floors) {
    for (const room of floor.rooms || []) {
      const pos = roomPositions?.[room.id];
      const x = pos?.x ?? room.position_x ?? 0;
      const y = pos?.y ?? room.position_y ?? 0;
      const w = pos?.width ?? room.actual_width ?? room.min_width_m ?? 4;
      const d =
        pos?.height ??
        pos?.depth ??
        room.actual_length ??
        room.min_length_m ??
        4;

      // Room outline (closed polyline on WALLS layer)
      parts.push(
        drawPolyline(
          [
            [x, y],
            [x + w, y],
            [x + w, y + d],
            [x, y + d],
          ],
          "A-WALL",
          true,
        ),
      );

      // Room name label
      parts.push(
        drawText(
          x + w / 2,
          y + d / 2 + 0.15,
          (room.type || room.id || "").toUpperCase(),
          "A-TEXT",
          0.2,
        ),
      );

      // Area label
      const area = (w * d).toFixed(1);
      parts.push(
        drawText(x + w / 2, y + d / 2 - 0.2, `${area} m2`, "A-TEXT", 0.15),
      );

      // Width dimension (below room)
      parts.push(
        drawDimLine(x, y - 0.8, x + w, y - 0.8, `${w.toFixed(2)}`, "A-DIMS"),
      );

      // Depth dimension (left of room)
      parts.push(
        drawDimLine(x - 0.8, y, x - 0.8, y + d, `${d.toFixed(2)}`, "A-DIMS"),
      );
    }
  }

  // Overall envelope if present
  if (envelope.width_m && envelope.depth_m) {
    parts.push(
      drawPolyline(
        [
          [0, 0],
          [envelope.width_m, 0],
          [envelope.width_m, envelope.depth_m],
          [0, envelope.depth_m],
        ],
        "A-WALL-EXTR",
        true,
      ),
    );
  }

  // Title block text
  parts.push(
    drawText(0, -1.0, projectName || "ArchiAI Floor Plan", "A-TEXT", 0.3),
  );
  parts.push(
    drawText(
      0,
      -1.5,
      `Date: ${new Date().toISOString().split("T")[0]}`,
      "A-TEXT",
      0.15,
    ),
  );

  parts.push(dxfPair(0, "ENDSEC"));

  // EOF
  parts.push(dxfPair(0, "EOF"));

  return parts.join("");
}

function dxfHeader(envelope) {
  let s = "";
  s += dxfPair(0, "SECTION");
  s += dxfPair(2, "HEADER");
  s += dxfPair(9, "$ACADVER");
  s += dxfPair(1, "AC1024"); // AutoCAD 2010
  s += dxfPair(9, "$INSUNITS");
  s += dxfPair(70, "6"); // Meters
  s += dxfPair(9, "$LUNITS");
  s += dxfPair(70, "2"); // Decimal
  s += dxfPair(9, "$LUPREC");
  s += dxfPair(70, "3"); // 3 decimal places
  s += dxfPair(0, "ENDSEC");
  return s;
}

function dxfTables() {
  let s = "";
  s += dxfPair(0, "SECTION");
  s += dxfPair(2, "TABLES");
  s += dxfPair(0, "TABLE");
  s += dxfPair(2, "LAYER");
  s += dxfPair(70, "7"); // max entries

  const layers = [
    { name: "A-WALL", color: 7 },
    { name: "A-WALL-EXTR", color: 7 },
    { name: "A-DOOR", color: 3 },
    { name: "A-GLAZ", color: 5 },
    { name: "A-FURN", color: 8 },
    { name: "A-DIMS", color: 2 },
    { name: "A-TEXT", color: 7 },
  ];

  for (const layer of layers) {
    s += dxfPair(0, "LAYER");
    s += dxfPair(2, layer.name);
    s += dxfPair(70, "0");
    s += dxfPair(62, String(layer.color));
    s += dxfPair(6, "CONTINUOUS");
  }

  s += dxfPair(0, "ENDTAB");
  s += dxfPair(0, "ENDSEC");
  return s;
}

function drawPolyline(points, layer, close = false) {
  let s = "";
  s += dxfPair(0, "LWPOLYLINE");
  s += dxfPair(8, layer);
  s += dxfPair(90, String(points.length));
  s += dxfPair(70, close ? "1" : "0");

  for (const [x, y] of points) {
    s += dxfPair(10, x.toFixed(4));
    s += dxfPair(20, y.toFixed(4));
  }

  return s;
}

function drawText(x, y, text, layer, height) {
  let s = "";
  s += dxfPair(0, "TEXT");
  s += dxfPair(8, layer);
  s += dxfPair(10, x.toFixed(4));
  s += dxfPair(20, y.toFixed(4));
  s += dxfPair(40, height.toFixed(3));
  s += dxfPair(1, text);
  s += dxfPair(72, "1"); // horizontal center
  s += dxfPair(11, x.toFixed(4)); // alignment point
  s += dxfPair(21, y.toFixed(4));
  return s;
}

function drawDimLine(x1, y1, x2, y2, text, layer) {
  let s = "";
  // Draw the line
  s += dxfPair(0, "LINE");
  s += dxfPair(8, layer);
  s += dxfPair(10, x1.toFixed(4));
  s += dxfPair(20, y1.toFixed(4));
  s += dxfPair(11, x2.toFixed(4));
  s += dxfPair(21, y2.toFixed(4));
  // Draw text at midpoint
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  s += drawText(mx, my - 0.15, text, layer, 0.1);
  return s;
}
