# UK Building Regulations Reference

**For AI-Generated Residential Architecture**

This document provides the key UK building regulations and best practices that must be enforced in AI-generated designs. These constraints are embedded in the Together.ai prompts to ensure compliance.

---

## 📏 Critical Dimensions

### Doors
| Requirement | Minimum | Recommended | Code Reference |
|-------------|---------|-------------|----------------|
| **Internal Door Width** | 775mm | 800mm+ | Part M (Approved Document M 2015) |
| **External Door Width** | 850mm | 900mm+ | Part M |
| **Door Height** | 1981mm | 2040mm | BS 8212 |
| **Bathroom Door** | 800mm | 850mm | Part M (accessible) |
| **Fire Door** | As internal | - | Part B |

**Critical Rules**:
- Bathroom must NOT open directly into living/dining room (Part G, hygiene)
- Doors must allow 300mm clear space on pull side (Part M, accessibility)
- Minimum clear opening width: 750mm (Part M)

### Corridors & Circulation

| Space | Minimum Width | Recommended | Code Reference |
|-------|---------------|-------------|----------------|
| **Corridor** | 900mm | 1050mm+ | Part M |
| **Corridor (wheelchair)** | 1200mm | 1500mm | Part M (Cat 3) |
| **Landing** | 900mm × 900mm | 1200mm × 1200mm | Part K |
| **Entry Hall** | 1200mm | 1500mm | Part M |

**Critical Rules**:
- Corridors must have passing spaces every 10m if <1500mm wide
- No sharp turns without enlarged space
- Minimum ceiling height: 2.0m (2000mm) in circulation

### Stairs

| Requirement | Residential | Code Reference |
|-------------|-------------|----------------|
| **Rise (height)** | 150mm - 220mm | Part K |
| **Going (depth)** | 220mm minimum | Part K |
| **Pitch (angle)** | 42° maximum | Part K |
| **Width** | 900mm minimum | Part K, Part M |
| **Width (escape)** | 1000mm | Part B (fire escape) |
| **Headroom** | 2000mm | Part K |
| **Handrail Height** | 900mm - 1000mm | Part K, Part M |

**Formulas**:
- **2R + G = 550-700mm** (Rise + Going relationship)
- **Pitch = arctan(R/G) ≤ 42°**

**Critical Rules**:
- All risers must be equal (±5mm tolerance)
- All goings must be equal
- Minimum 2 risers per flight (Part K)
- Handrail required on both sides if width >1000mm
- Landings required at top and bottom (min length = stair width)

---

## 🏠 Room Dimensions

### Living Spaces

| Room | Minimum Area | Minimum Width | Recommended | Notes |
|------|--------------|---------------|-------------|-------|
| **Living Room** | 11.5 m² | 2.75m | 20+ m² | - |
| **Kitchen** | 6.5 m² | 1.8m | 10+ m² | - |
| **Kitchen-Dining** | 13 m² | 2.75m | 16+ m² | Open plan |
| **Dining Room** | 8 m² | 2.4m | 12+ m² | Separate |
| **Utility Room** | 2.5 m² | 1.5m | 4+ m² | If provided |

### Bedrooms

| Room | Minimum Area | Minimum Width | Recommended | Notes |
|------|--------------|---------------|-------------|-------|
| **Single Bedroom** | 7.5 m² | 2.15m | 9+ m² | NDSS 2015 |
| **Double Bedroom** | 11.5 m² | 2.75m | 13+ m² | NDSS 2015 |
| **Master Bedroom** | 11.5 m² | 2.75m | 15+ m² | Usually en-suite |

**NDSS** = Nationally Described Space Standard (2015)

### Bathrooms

| Room | Minimum Area | Minimum Width | Recommended | Notes |
|------|--------------|---------------|-------------|-------|
| **WC** | 0.8 m² | 0.9m | 1.2+ m² | Cloakroom |
| **Bathroom** | 3.5 m² | 1.5m | 5+ m² | With bath |
| **Shower Room** | 2.5 m² | 1.3m | 3.5+ m² | Shower only |
| **En-Suite** | 3.0 m² | 1.5m | 4+ m² | Minimum |

**Critical Rules**:
- Bathroom must NOT open directly into kitchen
- Bathroom must NOT open directly into living/dining room
- Ventilation required: 15 l/s (mechanical) or 1/20 floor area (natural)
- Soil pipe must be ventilated (Part H)

---

## 🪟 Windows & Glazing

### Window-to-Wall Ratio (WWR)

| Context | Minimum | Maximum | Recommended | Code Reference |
|---------|---------|---------|-------------|----------------|
| **Overall WWR** | 0.20 (20%) | 0.45 (45%) | 0.25-0.35 | Part L |
| **North Facade** | 0.15 | 0.30 | 0.20-0.25 | Part L (heat loss) |
| **South Facade** | 0.25 | 0.45 | 0.35-0.40 | Part L (solar gain) |
| **East/West** | 0.20 | 0.40 | 0.25-0.35 | Part L |

**Critical Rules**:
- Higher WWR = more daylighting BUT more heat loss
- UK climate (HDD 2400-3000): favor thermal mass over glass
- Overhangs on south facade: 600mm minimum to control summer solar gain

### Window Dimensions

| Requirement | Dimension | Code Reference |
|-------------|-----------|----------------|
| **Sill Height** | 800-1100mm | BS 8213 |
| **Head Height** | 2000-2200mm | BS 8213 |
| **Min Width** | 600mm | - |
| **Max Width (single)** | 1800mm | Structural |
| **Egress Window** | 0.33 m² min | Part B (fire escape) |

**Egress Requirements** (Fire Escape Windows):
- Minimum opening: 450mm high × 450mm wide
- Minimum clear area: 0.33 m²
- Maximum sill height: 1100mm from floor
- Required in habitable rooms above ground floor (Part B)

---

## 🧱 Walls & Structure

### Wall Thicknesses

| Wall Type | Thickness | U-value Target | Notes |
|-----------|-----------|----------------|-------|
| **External Cavity Wall** | 300-350mm | ≤0.18 W/m²K | Part L 2021 |
| **Internal Load-Bearing** | 100-150mm | - | Structural |
| **Internal Partition** | 75-100mm | - | Non-load-bearing |
| **Party Wall** | 215mm min | - | Part E (sound) |

**Typical External Wall Construction** (300mm total):
- 102mm outer brick
- 100mm cavity (insulated)
- 100mm blockwork inner leaf
- 12.5mm plasterboard finish

### Thermal Performance (Part L 2021)

| Element | U-value (W/m²K) | Notes |
|---------|-----------------|-------|
| **External Wall** | ≤0.18 | Target |
| **Roof** | ≤0.11 | Target |
| **Floor** | ≤0.13 | Target |
| **Windows** | ≤1.4 | Triple glazing recommended |
| **Doors** | ≤1.4 | External |

---

## 🏔️ Roofs

### Roof Pitches

| Roof Type | Typical Pitch | Range | Notes |
|-----------|---------------|-------|-------|
| **Gable** | 30-35° | 25-45° | Traditional UK |
| **Hip** | 25-30° | 20-40° | More wind-resistant |
| **Flat** | 1-5° | 0-10° | Not truly flat |
| **Mansard** | 70° + 30° | - | Two slopes |
| **Gambrel** | 45° + 30° | - | Barn style |

**Material-Specific Pitches**:
- **Slate**: Minimum 22.5° (BS 5534)
- **Clay Tiles**: Minimum 30° (BS 5534)
- **Concrete Tiles**: Minimum 15° (BS 5534)
- **Metal Sheet**: Minimum 5° (manufacturer spec)

### Roof Overhangs

| Context | Overhang | Purpose |
|---------|----------|---------|
| **Standard** | 300-450mm | Wall protection |
| **Enhanced** | 500-800mm | Solar control (south) |
| **Minimal** | 150-250mm | Contemporary |
| **None** | 0mm | Parapet wall |

---

## 🌡️ Climate & Energy

### UK Climate Zones (Heating)

| Region | HDD (15.5°C) | Design Temp | Priority |
|--------|--------------|-------------|----------|
| **South England** | 2200-2600 | -3°C | Heating |
| **Midlands** | 2400-2800 | -4°C | Heating |
| **North England** | 2600-3000 | -5°C | Heating |
| **Scotland** | 2800-3400 | -6°C | Heating |
| **Wales** | 2400-2800 | -4°C | Heating |

**HDD** = Heating Degree Days (base 15.5°C)
**CDD** = Cooling Degree Days (typically 50-200 for UK)

**Design Implications**:
- High HDD (>2600): Prioritize insulation, reduce WWR, use thermal mass
- Low CDD (<200): Overheating rare, focus on winter heating
- Prevailing wind: SW in most of UK → protect west and south facades

### Ventilation Rates (Part F)

| Space | Rate | Method |
|-------|------|--------|
| **Living Room** | 13 l/s | Continuous |
| **Bedroom** | 10 l/s | Continuous |
| **Kitchen** | 60 l/s | Extract (cooking) |
| **Bathroom** | 15 l/s | Extract |
| **WC** | 6 l/s | Extract |

**Whole Dwelling**: 0.3 l/s/m² floor area (trickle ventilation)

---

## 🔥 Fire Safety (Part B)

### Escape Distances

| Building Type | Max Travel Distance | Notes |
|---------------|---------------------|-------|
| **Residential** | 9m (dead-end) | From furthest point to stair |
| **Residential** | 18m (alternative) | Two escape routes |

### Fire Resistance

| Element | FD Rating | Notes |
|---------|-----------|-------|
| **Internal Doors** | FD20 or none | Kitchen may need FD20 |
| **Garage Door** | FD30 | To dwelling |
| **Flat Entrance** | FD30S | Self-closing |

### Smoke Alarms
- Grade D1 (mains-powered) in all habitable areas
- Interconnected system required
- Test button and hush facility

---

## ♿ Accessibility (Part M)

### Part M Categories

| Category | Description | When Required |
|----------|-------------|---------------|
| **Cat 1** | Visitable dwellings | All new homes |
| **Cat 2** | Accessible & Adaptable | 20% of new homes |
| **Cat 3** | Wheelchair user dwellings | 5% of new homes (affordable) |

### Cat 1 (Visitable) Requirements
- Level access from parking to entrance (max 1:20 slope)
- 900mm clear width on approach to entrance
- WC on entrance level with 750mm clear space
- 900mm corridor widths
- 300mm nib beside doors

### Cat 2 (Accessible) Requirements
- As Cat 1, PLUS:
- WC on entrance level with potential for future shower
- 1200mm turning circles in WC
- 1500mm × 1500mm clear space in bathroom for future hoist
- Socket heights 450-1200mm
- Switches/controls 750-1200mm

---

## 📐 Modularity & Grids

### Recommended Design Modules

| Module | Use Case | Benefits |
|--------|----------|----------|
| **300mm** | Standard residential | Aligns with brick coursing (75mm) |
| **600mm** | Efficient construction | Aligns with sheet goods (1200×2400) |
| **100mm** | Fine-grain planning | Maximum flexibility |

**Why 300mm**:
- 4 brick courses = 300mm (75mm per course × 4)
- Standard door widths: 600mm, 700mm, 800mm, 900mm (multiples of 100mm)
- Window widths: 600mm, 900mm, 1200mm, 1500mm, 1800mm (multiples of 300mm)
- Room dimensions: 3.0m, 3.3m, 3.6m, 4.5m (multiples of 300mm)

---

## 🏗️ Construction Standards

### Floor-to-Floor Heights

| Floor | Minimum | Standard | Generous |
|-------|---------|----------|----------|
| **Ground** | 2400mm | 2700mm | 3000mm |
| **Upper** | 2400mm | 2600mm | 2800mm |

**Finished Floor to Ceiling** = Floor-to-Floor Height - 200-300mm (structure/services)

### Foundations & Ground Floor

| Element | Depth/Height | Notes |
|---------|--------------|-------|
| **Strip Foundation** | 1000mm min | Below frost line |
| **Floor Slab** | 150mm | Concrete + insulation |
| **DPM** | - | Damp-proof membrane |
| **DPC** | 150mm min | Above external ground |

---

## 📋 GIA vs NIA

### Gross Internal Area (GIA)
Total area inside external walls, including:
- All internal walls and partitions
- Stairwells
- Corridors
- Built-in storage

### Net Internal Area (NIA)
Usable floor area, excluding:
- Walls and partitions
- Stairs
- Built-in storage

**Typical Ratio**: NIA = 75-85% of GIA

---

## ✅ AI Prompt Integration

### Hardcoded Constraints for Together.ai

```javascript
// In system prompt:
const UK_CONSTRAINTS = {
  doors: {
    min_internal_width_mm: 800,
    min_external_width_mm: 900,
    bathroom_min_width_mm: 850
  },
  corridors: {
    min_width_mm: 900,
    recommended_width_mm: 1050
  },
  stairs: {
    max_pitch_deg: 42,
    min_width_mm: 900,
    min_rise_mm: 150,
    max_rise_mm: 220,
    min_going_mm: 220
  },
  windows: {
    min_sill_mm: 800,
    max_sill_mm: 1100,
    min_head_mm: 2000,
    wwr_min: 0.20,
    wwr_max: 0.45,
    wwr_north_max: 0.30,
    wwr_south_max: 0.45
  },
  ceilings: {
    min_height_mm: 2000,  // Absolute minimum (Part K)
    circulation_min_height_mm: 2000,
    habitable_min_height_mm: 2300
  },
  adjacency: {
    bathroom_not_open_to: ["living", "dining", "kitchen"],
    kitchen_not_adjacent_to: ["bathroom"]
  }
};
```

### Validation Rules for validators.ts

```typescript
export const UK_VALIDATORS = {
  doorWidth: (width_mm: number, type: string) => {
    if (type === 'internal') return width_mm >= 800;
    if (type === 'external') return width_mm >= 900;
    if (type === 'bathroom') return width_mm >= 850;
    return false;
  },

  corridorWidth: (width_mm: number) => width_mm >= 900,

  stairPitch: (rise_mm: number, going_mm: number) => {
    const pitch_deg = Math.atan(rise_mm / going_mm) * (180 / Math.PI);
    return pitch_deg <= 42;
  },

  wwr: (wall_area_m2: number, window_area_m2: number, orientation: string) => {
    const wwr = window_area_m2 / wall_area_m2;
    if (orientation === 'N') return wwr >= 0.15 && wwr <= 0.30;
    if (orientation === 'S') return wwr >= 0.20 && wwr <= 0.45;
    return wwr >= 0.20 && wwr <= 0.40;
  },

  bathroomAdjacency: (bathroom_doors: string[], adjacent_rooms: string[]) => {
    const forbidden = ['living', 'dining', 'kitchen'];
    return !adjacent_rooms.some(room => forbidden.includes(room.toLowerCase()));
  }
};
```

---

## 📚 References

### Primary Sources
- **Part K**: Protection from falling, collision and impact (2013)
- **Part L**: Conservation of fuel and power (2021)
- **Part M**: Access to and use of buildings (2015)
- **Part B**: Fire safety (2019)
- **Part F**: Ventilation (2021)
- **Part E**: Resistance to the passage of sound (2015)
- **Part G**: Sanitation, hot water safety and water efficiency (2015)
- **Part H**: Drainage and waste disposal (2015)

### Standards
- **BS 5534**: Slating and tiling for pitched roofs
- **BS 8213-1**: Windows, doors and rooflights - Design for accessibility
- **BS 8212**: Code of practice for dry lining and partitioning
- **NDSS 2015**: Nationally Described Space Standard (March 2015)

### Design Guides
- **Building Regulations Approved Documents** (gov.uk)
- **CIBSE Guide A**: Environmental design (2015)
- **Housing Design Standards** (Local planning authorities)
- **Lifetime Homes Standard** (superseded by Part M but still referenced)

---

**Version**: 1.0 | **Last Updated**: 2025-10-28 | **Status**: ✅ Production Ready
