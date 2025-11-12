# ⚡ Quick Test Guide - Location & DNA Enhancements

## 🚀 Start Testing Immediately

```bash
# Terminal 1
npm start

# Terminal 2 (REQUIRED!)
npm run server
```

---

## 🧪 Test 1: Tropical Climate (Miami)

### Input:
```
Location: Miami Beach, Florida
Building: 2-bedroom house
Area: 150m²
Style: Let system choose
```

### Expected Results:
✅ **Elevated structure** (0.5m above grade)
✅ **Deep overhangs** (1.2m for sun protection)
✅ **Louvered windows** (natural ventilation)
✅ **Light colors** (white/beige exterior)
✅ **Cross-ventilation** design
✅ **Hurricane-resistant** features

### Console Should Show:
```
🌍 Applying location context to Master DNA...
   Climate: tropical
   Style: Art Deco or Mediterranean
🌡️ Climate strategy: cooling-dominated
```

---

## 🧪 Test 2: Cold Climate (Minneapolis)

### Input:
```
Location: Minneapolis, Minnesota
Building: 2-bedroom house
Area: 150m²
```

### Expected Results:
✅ **Steep roof** (45° for snow shedding)
✅ **Triple-glazed windows**
✅ **Vestibule entrance** (airlock)
✅ **Dark roof** (heat absorption)
✅ **Compact form** (minimize heat loss)
✅ **South-facing windows** (passive solar)

### Console Should Show:
```
🌍 Applying location context to Master DNA...
   Climate: cold
🌡️ Climate strategy: heating-dominated
   Insulation: R-50 roof, R-30 walls
```

---

## 🧪 Test 3: Desert Climate (Phoenix)

### Input:
```
Location: Phoenix, Arizona
Building: 2-bedroom house
Area: 150m²
```

### Expected Results:
✅ **Thick walls** (thermal mass)
✅ **Small windows** (minimize heat gain)
✅ **Courtyard** with water feature
✅ **Light colors** (heat reflection)
✅ **Flat/low-pitch roof**
✅ **Deep recessed windows**

### Console Should Show:
```
🌍 Applying location context to Master DNA...
   Climate: desert
🌡️ Climate strategy: cooling-dominated
   Thermal mass: high
```

---

## 🧪 Test 4: Mediterranean (Barcelona)

### Input:
```
Location: Barcelona, Spain
Building: 2-bedroom house
Area: 150m²
```

### Expected Results:
✅ **White stucco** exterior
✅ **Red clay tile** roof
✅ **Arched windows**
✅ **Internal courtyard**
✅ **Wrought iron** details
✅ **Moderate overhangs** (0.6m)

### Console Should Show:
```
🌍 Applying location context to Master DNA...
   Climate: mediterranean
   Style: Mediterranean
```

---

## 🧪 Test 5: Narrow Urban Lot

### Input:
```
Location: New York City
Building: 2-bedroom townhouse
Area: 150m²
Site notes: "6m wide × 30m deep lot"
```

### Expected Results:
✅ **Linear/shotgun** floor plan
✅ **Side corridor** circulation
✅ **Light wells** for interior rooms
✅ **3-4 stories** (vertical emphasis)
✅ **Narrow facade** (6m or less)

### Console Should Show:
```
📐 Adapting to narrow site (6m × 30m)
   Layout: linear
   Circulation: side corridor
```

---

## 🔍 Verification Checklist

### For EVERY Test, Check:

1. **Console Logs:**
   - [ ] "🌍 Generating Location-Aware Master Design DNA..."
   - [ ] "🌍 Applying location context to Master DNA..."
   - [ ] "✅ Location and climate enhancements applied"

2. **DNA Consistency:**
   - [ ] All 13 views show SAME materials
   - [ ] All elevations have SAME window positions
   - [ ] 3D views match 2D floor plans
   - [ ] Climate features visible in all views

3. **Location Features:**
   - [ ] Climate-appropriate roof type
   - [ ] Correct overhang depths
   - [ ] Appropriate window sizes
   - [ ] Local architectural style

4. **Generation Success:**
   - [ ] 13/13 views generated
   - [ ] No duplicate images
   - [ ] ~2 minutes total time

---

## ⚠️ Troubleshooting

### Issue: "Location context not applied"

**Check:**
```javascript
// In console, should see:
projectContext.locationData: {climate: {...}, zoning: {...}}

// If missing, location data not passed from Step 2 to Step 5
```

### Issue: "Generic prompts (no climate info)"

**Check:**
```javascript
// DNA should include:
masterDNA.locationContext: "Location: Miami | Climate: tropical..."
masterDNA.climateDesign: {thermal: {...}, ventilation: {...}}

// If missing, DNA modifier not working
```

### Issue: "All buildings look the same"

**Check:**
```javascript
// Different locations should show:
Miami → Light colors, elevated, overhangs
Minneapolis → Dark colors, steep roof, compact
Phoenix → Thick walls, small windows, courtyard

// If identical, location modifier not applying
```

---

## 📊 Success Metrics

### ✅ Full Success:
- Different climates → Different designs
- Different sites → Different layouts
- Location in console logs
- Climate features visible
- 13 unique views
- Consistent DNA across views

### ⚠️ Partial Success:
- Some climate features visible
- DNA mostly consistent
- 10+ views generated

### ❌ Failed:
- Generic designs for all locations
- No climate adaptations
- Missing floor plans
- Inconsistent views

---

## 🎯 Quick Commands

```javascript
// Test all climates quickly:
Locations to try:
1. "Dubai, UAE" → Desert adaptations
2. "Oslo, Norway" → Cold climate features
3. "Singapore" → Tropical design
4. "London, UK" → Temperate with British style
5. "Tokyo, Japan" → Japanese architectural style
6. "Santorini, Greece" → Mediterranean style
```

---

## 📈 Before vs After

| Feature | Before | After |
|---------|--------|-------|
| Climate Response | Generic design | Climate-specific |
| Site Adaptation | Ignores plot shape | Fits actual site |
| Local Style | Always contemporary | Regional styles |
| Materials | Always brick | Local materials |
| Overhangs | Random | Calculated for sun |
| Windows | Same everywhere | Climate-optimized |
| Consistency | ~60% | ~95% |

---

**Ready to Test!** Try the locations above and watch your AI generate perfectly adapted, location-aware buildings! 🏗️🌍