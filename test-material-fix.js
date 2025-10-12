// Test script to verify material rendering fixes

const testCases = [
  // Test case 1: Material as string
  {
    name: "String material",
    material: "Concrete",
    expected: "Concrete"
  },

  // Test case 2: Material as object with material property
  {
    name: "Object with material property",
    material: { material: "Steel", rationale: "Strong and modern" },
    expected: "Steel"
  },

  // Test case 3: Material as object with name property
  {
    name: "Object with name property",
    material: { name: "Glass", description: "Transparent facade" },
    expected: "Glass"
  },

  // Test case 4: Array of mixed materials
  {
    name: "Array of mixed materials",
    materials: [
      "Wood",
      { material: "Stone", rationale: "Local material" },
      { name: "Brick" }
    ],
    expected: ["Wood", "Stone", "Brick"]
  }
];

// Simulate the normalizeMaterials function
const normalizeMaterials = (materialRecommendations) => {
  try {
    const toStringVal = (v) => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') {
        // Handle {material: "...", rationale: "..."} structure
        if (v.material && v.rationale) {
          return `${v.material} (${v.rationale})`;
        }
        if (v.material) return String(v.material);
        if (v.name) return String(v.name);
        if (v.label) return String(v.label);
        if (v.type) return String(v.type);
        // Last resort: extract first string value found
        const firstStringValue = Object.values(v).find(val => typeof val === 'string');
        if (firstStringValue) return String(firstStringValue);
        return String(v.material || v.name || 'Material');
      }
      return String(v);
    };

    const mr = materialRecommendations;

    if (Array.isArray(mr)) {
      return mr.map(toStringVal).map(s => s.trim()).filter(Boolean);
    }

    if (mr && typeof mr === 'object' && (mr.primary || mr.secondary)) {
      const primary = Array.isArray(mr.primary) ? mr.primary : (mr.primary ? [mr.primary] : []);
      const secondary = Array.isArray(mr.secondary) ? mr.secondary : (mr.secondary ? [mr.secondary] : []);
      return [...primary, ...secondary].map(toStringVal).map(s => s.trim()).filter(Boolean);
    }

    if (typeof mr === 'string') {
      return mr.split(',').map(s => s.trim()).filter(Boolean);
    }

    return [];
  } catch (_e) {
    return [];
  }
};

// Run tests
console.log('Testing material normalization fixes:');
console.log('=====================================\n');

testCases.forEach(test => {
  if (test.material) {
    const result = normalizeMaterials([test.material]);
    console.log(`Test: ${test.name}`);
    console.log(`Input:`, test.material);
    console.log(`Expected:`, test.expected);
    console.log(`Result:`, result[0]);
    console.log(`Pass:`, result[0].includes(test.expected) ? '✅' : '❌');
    console.log('---');
  } else if (test.materials) {
    const result = normalizeMaterials(test.materials);
    console.log(`Test: ${test.name}`);
    console.log(`Input:`, test.materials);
    console.log(`Expected:`, test.expected);
    console.log(`Result:`, result);
    console.log(`Pass:`, JSON.stringify(result.map(r => r.split(' ')[0])) === JSON.stringify(test.expected) ? '✅' : '❌');
    console.log('---');
  }
});

// Test the rendering safety check
console.log('\nTesting rendering safety check:');
console.log('================================\n');

const renderingTest = (materials) => {
  // Ensure materials is always an array
  const materialsArray = Array.isArray(materials)
    ? materials
    : (materials ? [materials] : ["Materials not available"]);

  return materialsArray.map((material) => {
    if (typeof material === 'object') {
      return material.material || material.name || "Material";
    }
    return String(material);
  });
};

const renderTestCases = [
  { input: ["Wood", "Steel"], expected: ["Wood", "Steel"] },
  { input: "Single Material", expected: ["Single Material"] },
  { input: null, expected: ["Materials not available"] },
  { input: [{ material: "Glass" }, { name: "Concrete" }], expected: ["Glass", "Concrete"] }
];

renderTestCases.forEach((test, idx) => {
  const result = renderingTest(test.input);
  console.log(`Render Test ${idx + 1}:`);
  console.log(`Input:`, test.input);
  console.log(`Expected:`, test.expected);
  console.log(`Result:`, result);
  console.log(`Pass:`, JSON.stringify(result) === JSON.stringify(test.expected) ? '✅' : '❌');
  console.log('---');
});

console.log('\nAll tests completed!');