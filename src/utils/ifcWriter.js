/**
 * IFC 2x3 writer for BIM export
 * Generates valid IFC STEP files from BuildingModel geometry.
 * Output opens in BIMvision, xBIM, FreeCAD, and other IFC viewers.
 *
 * Entity hierarchy:
 *   IFCPROJECT → IFCSITE → IFCBUILDING → IFCBUILDINGSTOREY
 *     → IFCWALLSTANDARDCASE (extruded rectangles)
 *     → IFCWINDOW (with placement)
 *     → IFCDOOR (with placement)
 */

// IFC base64-encoded GUID (22 chars)
function generateIFCGUID() {
  const chars =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  let guid = "";
  for (let i = 0; i < 22; i++) {
    guid += chars[Math.floor(Math.random() * chars.length)];
  }
  return guid;
}

/**
 * Export BuildingModel to IFC 2x3 STEP format.
 *
 * @param {Object} buildingModel - BuildingModel instance (mm units internally)
 * @param {Object} metadata - { projectName, address, author }
 * @returns {string} IFC STEP file content
 */
export function exportToIFC(buildingModel, metadata = {}) {
  const projectName = metadata.projectName || "ArchitectAI Design";
  const author = metadata.author || "ArchitectAI Platform";
  const timestamp = new Date().toISOString();

  // Entity ID counter
  let id = 0;
  const next = () => ++id;
  const lines = [];
  const emit = (entityId, content) => {
    lines.push(`#${entityId}=${content};`);
  };

  // ──────────────────────────────────────────────────────────────────────
  // Shared geometry primitives
  // ──────────────────────────────────────────────────────────────────────
  const origin3dId = next();
  emit(origin3dId, "IFCCARTESIANPOINT((0.,0.,0.))");

  const zDirId = next();
  emit(zDirId, "IFCDIRECTION((0.,0.,1.))");

  const xDirId = next();
  emit(xDirId, "IFCDIRECTION((1.,0.,0.))");

  const yDirId = next();
  emit(yDirId, "IFCDIRECTION((0.,1.,0.))");

  const origin2dId = next();
  emit(origin2dId, "IFCCARTESIANPOINT((0.,0.))");

  const worldPlacementId = next();
  emit(worldPlacementId, `IFCAXIS2PLACEMENT3D(#${origin3dId},#${zDirId},#${xDirId})`);

  // ──────────────────────────────────────────────────────────────────────
  // Owner history, units, context
  // ──────────────────────────────────────────────────────────────────────
  const personId = next();
  emit(personId, `IFCPERSON($,$,'${author}',$,$,$,$,$)`);

  const orgId = next();
  emit(orgId, "IFCORGANIZATION($,'ArchitectAI','AI Architecture Platform',$,$)");

  const personOrgId = next();
  emit(personOrgId, `IFCPERSONANDORGANIZATION(#${personId},#${orgId},$)`);

  const appId = next();
  emit(appId, `IFCAPPLICATION(#${orgId},'1.0','ArchitectAI','ArchitectAI')`);

  const ownerHistoryId = next();
  const unixTime = Math.floor(Date.now() / 1000);
  emit(ownerHistoryId, `IFCOWNERHISTORY(#${personOrgId},#${appId},$,.NOCHANGE.,$,$,$,${unixTime})`);

  // Units – meters
  const lengthUnitId = next();
  emit(lengthUnitId, "IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");

  const areaUnitId = next();
  emit(areaUnitId, "IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");

  const volumeUnitId = next();
  emit(volumeUnitId, "IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");

  const angleUnitId = next();
  emit(angleUnitId, "IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");

  const unitAssignId = next();
  emit(unitAssignId, `IFCUNITASSIGNMENT((#${lengthUnitId},#${areaUnitId},#${volumeUnitId},#${angleUnitId}))`);

  // Geometric representation context
  const geoContextId = next();
  emit(geoContextId, `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${worldPlacementId},$)`);

  // Sub-context for Body representation
  const bodyContextId = next();
  emit(bodyContextId, `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${geoContextId},$,.MODEL_VIEW.,$)`);

  // ──────────────────────────────────────────────────────────────────────
  // Project → Site → Building hierarchy
  // ──────────────────────────────────────────────────────────────────────
  const projectId = next();
  emit(projectId, `IFCPROJECT('${generateIFCGUID()}',#${ownerHistoryId},'${projectName}',$,$,$,$,(#${geoContextId}),#${unitAssignId})`);

  // Site
  const sitePlacementId = next();
  emit(sitePlacementId, `IFCLOCALPLACEMENT($,#${worldPlacementId})`);

  const siteId = next();
  emit(siteId, `IFCSITE('${generateIFCGUID()}',#${ownerHistoryId},'Site',$,$,#${sitePlacementId},$,$,.ELEMENT.,$,$,$,$,$)`);

  // Building
  const buildingPlacementId = next();
  emit(buildingPlacementId, `IFCLOCALPLACEMENT(#${sitePlacementId},#${worldPlacementId})`);

  const buildingId = next();
  emit(buildingId, `IFCBUILDING('${generateIFCGUID()}',#${ownerHistoryId},'${projectName}',$,$,#${buildingPlacementId},$,$,.ELEMENT.,$,$,$)`);

  // ──────────────────────────────────────────────────────────────────────
  // Building storeys + walls + openings
  // ──────────────────────────────────────────────────────────────────────
  const storeyIds = [];
  const allElementIds = []; // Per-storey arrays of element IDs

  const floors = buildingModel.floors || [];
  const MM = 1000; // mm per meter

  for (let fi = 0; fi < floors.length; fi++) {
    const floor = floors[fi];
    const elevationM = (floor.slab?.z || 0) / MM;
    const floorHeightM = (floor.floorHeight || floor.height || 2800) / MM;
    const floorName = fi === 0 ? "Ground Floor" : `Floor ${fi}`;

    // Storey placement
    const storeyOriginId = next();
    emit(storeyOriginId, `IFCCARTESIANPOINT((0.,0.,${elevationM.toFixed(4)}))`);

    const storeyAxisId = next();
    emit(storeyAxisId, `IFCAXIS2PLACEMENT3D(#${storeyOriginId},#${zDirId},#${xDirId})`);

    const storeyPlacementId = next();
    emit(storeyPlacementId, `IFCLOCALPLACEMENT(#${buildingPlacementId},#${storeyAxisId})`);

    const storeyId = next();
    emit(storeyId, `IFCBUILDINGSTOREY('${generateIFCGUID()}',#${ownerHistoryId},'${floorName}',$,$,#${storeyPlacementId},$,$,.ELEMENT.,${elevationM.toFixed(4)})`);
    storeyIds.push(storeyId);

    const elementIds = [];

    // ── Walls ──
    for (const wall of floor.walls) {
      const x1 = wall.start.x / MM;
      const y1 = wall.start.y / MM;
      const x2 = wall.end.x / MM;
      const y2 = wall.end.y / MM;
      const thickness = (wall.thickness || 300) / MM;
      const height = floorHeightM;

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 0.01) continue; // skip degenerate walls

      // Wall direction vector (normalized)
      const dirX = dx / length;
      const dirY = dy / length;

      // Wall local placement at start point (relative to storey)
      const wallOriginId = next();
      emit(wallOriginId, `IFCCARTESIANPOINT((${x1.toFixed(4)},${y1.toFixed(4)},0.))`);

      const wallRefDirId = next();
      emit(wallRefDirId, `IFCDIRECTION((${dirX.toFixed(6)},${dirY.toFixed(6)},0.))`);

      const wallAxisId = next();
      emit(wallAxisId, `IFCAXIS2PLACEMENT3D(#${wallOriginId},#${zDirId},#${wallRefDirId})`);

      const wallPlacementId = next();
      emit(wallPlacementId, `IFCLOCALPLACEMENT(#${storeyPlacementId},#${wallAxisId})`);

      // Rectangle profile (length × thickness)
      const profilePlacementId = next();
      emit(profilePlacementId, `IFCAXIS2PLACEMENT2D(#${origin2dId},#${origin2dId})`);

      const profileId = next();
      emit(profileId, `IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profilePlacementId},${length.toFixed(4)},${thickness.toFixed(4)})`);

      // Extruded area solid (rectangle extruded along Z)
      const extrusionId = next();
      emit(extrusionId, `IFCEXTRUDEDAREASOLID(#${profileId},#${worldPlacementId},#${zDirId},${height.toFixed(4)})`);

      // Shape representation
      const shapeRepId = next();
      emit(shapeRepId, `IFCSHAPEREPRESENTATION(#${bodyContextId},'Body','SweptSolid',(#${extrusionId}))`);

      const prodShapeId = next();
      emit(prodShapeId, `IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}))`);

      // Wall entity
      const wallId = next();
      const wallType = wall.type === "external" ? "external" : "internal";
      emit(wallId, `IFCWALLSTANDARDCASE('${generateIFCGUID()}',#${ownerHistoryId},'${wallType} wall',$,$,#${wallPlacementId},#${prodShapeId},$)`);
      elementIds.push(wallId);
    }

    // ── Openings (windows + doors) ──
    for (const opening of floor.openings) {
      const cx = (opening.position?.x ?? opening.center?.x ?? 0) / MM;
      const cy = (opening.position?.y ?? opening.center?.y ?? 0) / MM;
      const w = (opening.width || 900) / MM;
      const h = (opening.height || (opening.type === "door" ? 2100 : 1200)) / MM;
      const sill = (opening.sillHeight || (opening.type === "door" ? 0 : 900)) / MM;

      // Placement relative to storey
      const openOriginId = next();
      emit(openOriginId, `IFCCARTESIANPOINT((${cx.toFixed(4)},${cy.toFixed(4)},${sill.toFixed(4)}))`);

      const openAxisId = next();
      emit(openAxisId, `IFCAXIS2PLACEMENT3D(#${openOriginId},#${zDirId},#${xDirId})`);

      const openPlacementId = next();
      emit(openPlacementId, `IFCLOCALPLACEMENT(#${storeyPlacementId},#${openAxisId})`);

      const openingEntityId = next();
      if (opening.type === "door") {
        emit(openingEntityId, `IFCDOOR('${generateIFCGUID()}',#${ownerHistoryId},'Door',$,$,#${openPlacementId},$,$,${h.toFixed(4)},${w.toFixed(4)})`);
      } else {
        emit(openingEntityId, `IFCWINDOW('${generateIFCGUID()}',#${ownerHistoryId},'Window',$,$,#${openPlacementId},$,$,${h.toFixed(4)},${w.toFixed(4)})`);
      }
      elementIds.push(openingEntityId);
    }

    allElementIds.push({ storeyId, elementIds });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Aggregation relationships (Project→Site→Building→Storeys→Elements)
  // ──────────────────────────────────────────────────────────────────────
  // Project → Site
  const relProjSiteId = next();
  emit(relProjSiteId, `IFCRELAGGREGATES('${generateIFCGUID()}',#${ownerHistoryId},$,$,#${projectId},(#${siteId}))`);

  // Site → Building
  const relSiteBuildId = next();
  emit(relSiteBuildId, `IFCRELAGGREGATES('${generateIFCGUID()}',#${ownerHistoryId},$,$,#${siteId},(#${buildingId}))`);

  // Building → Storeys
  if (storeyIds.length > 0) {
    const storeyRefs = storeyIds.map((sid) => `#${sid}`).join(",");
    const relBuildStoreysId = next();
    emit(relBuildStoreysId, `IFCRELAGGREGATES('${generateIFCGUID()}',#${ownerHistoryId},$,$,#${buildingId},(${storeyRefs}))`);
  }

  // Storey → Elements (using IFCRELCONTAINEDINSPATIALSTRUCTURE)
  for (const { storeyId, elementIds } of allElementIds) {
    if (elementIds.length > 0) {
      const elementRefs = elementIds.map((eid) => `#${eid}`).join(",");
      const relContainId = next();
      emit(relContainId, `IFCRELCONTAINEDINSPATIALSTRUCTURE('${generateIFCGUID()}',#${ownerHistoryId},$,$,(${elementRefs}),#${storeyId})`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Assemble STEP file
  // ──────────────────────────────────────────────────────────────────────
  const header = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ArchitectAI Generated Model'),'2;1');
FILE_NAME('${projectName.replace(/'/g, "").replace(/\s+/g, "_")}.ifc','${timestamp}',('${author}'),('ArchitectAI'),'','ArchitectAI IFC Export','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
`;

  return header + "\nDATA;\n" + lines.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
}
