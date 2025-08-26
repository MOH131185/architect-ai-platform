export const architecturalStylesDatabase = {
  uk: {
    DN: {
      primary: "Yorkshire Industrial Vernacular",
      alternatives: ["Victorian Terrace", "Gothic Revival", "Modern Industrial"],
      characteristics: [
        "Robust brickwork",
        "Slate roofs",
        "Large industrial windows",
        "Terraced housing formations"
      ],
      materials: ["Red brick", "Slate", "Yorkstone", "Steel"],
      historicalContext: "Rooted in the industrial revolution, Doncaster and Scunthorpe's architecture is heavily influenced by its history in coal mining, steel production, and railways. This resulted in practical, enduring structures, often with decorative brickwork to signify status."
    },
    YO: {
      primary: "Georgian and Medieval",
      alternatives: ["Roman", "Viking", "Tudor"],
      characteristics: [
        "Timber framing",
        "Narrow plots",
        "Overhanging upper floors",
        "Sash windows"
      ],
      materials: ["Limestone", "Yorkstone", "Timber", "Handmade brick"],
      historicalContext: "York's architecture is a rich tapestry of its Roman, Viking, and Medieval past. The Shambles provides a quintessential example of Medieval construction, while Georgian townhouses reflect its age of elegance and prosperity."
    },
    LS: {
      primary: "Victorian and Industrial",
      alternatives: ["Gothic Revival", "Art Deco", "Postmodern"],
      characteristics: [
        "Ornate terracotta facades",
        "Large mill buildings",
        "Back-to-back housing",
        "Grand civic architecture"
      ],
      materials: ["Red brick", "Terracotta", "Sandstone", "Slate"],
      historicalContext: "Leeds flourished during the industrial revolution as a center for wool and textiles. This wealth is expressed in its grand Victorian architecture, including the Corn Exchange and Kirkgate Market, alongside vast former industrial mills."
    },
    default: {
      primary: "Modern Vernacular",
      alternatives: ["Post-War Functional", "Suburban Neo-Georgian"],
      characteristics: ["Functional design", "Pebble-dashed walls", "Standardized layouts"],
      materials: ["Brick", "Concrete tile", "UPVC windows"],
      historicalContext: "Standardized post-war construction and modern housing developments define much of the generic UK landscape, focusing on efficiency and speed of construction."
    }
  },
  us: {
    "San Francisco": {
      primary: "Victorian/Edwardian",
      alternatives: ["Mission Revival", "Bay Area Regionalism", "Modern High-Rise"],
      characteristics: [
        "Ornate 'Painted Ladies' detailing",
        "Bay windows",
        "Decorative trim",
        "Earthquake-resistant retrofitting"
      ],
      materials: ["Redwood", "Stucco", "Large glass panes", "Steel frames (modern)"],
      historicalContext: "San Francisco's iconic architectural style was shaped by the Gold Rush boom and its subsequent rebuilding after the 1906 earthquake. The result is a unique blend of ornate Victorian and Edwardian houses, adapted for the city's hilly topography and seismic activity."
    },
    "New York": {
      primary: "Art Deco and Skyscraper",
      alternatives: ["Beaux-Arts", "Brownstone", "Postmodern"],
      characteristics: ["Vertical emphasis", "Setbacks on skyscrapers", "Decorative motifs", "Steel frame construction"],
      materials: ["Limestone", "Brick", "Steel", "Glass curtain walls"],
      historicalContext: "New York City is the birthplace of the modern skyscraper, with iconic Art Deco structures like the Empire State and Chrysler Buildings defining its skyline. Its residential architecture is famous for its dense brownstone townhouses."
    },
    "Chicago": {
      primary: "Chicago School/Prairie School",
      alternatives: ["Art Deco", "International Style", "Gothic Revival"],
      characteristics: ["Steel-frame construction", "Large plate-glass window areas", "Limited exterior ornamentation", "Horizontal lines (Prairie)"],
      materials: ["Steel", "Glass", "Terracotta", "Brick"],
      historicalContext: "Pioneering modern architecture, the Chicago School developed the first skyscrapers. Later, Frank Lloyd Wright's Prairie School emerged, emphasizing horizontal lines that evoke the Midwestern landscape."
    },
    default: {
      primary: "American Vernacular",
      alternatives: ["Craftsman", "Ranch-style", "Neocolonial"],
      characteristics: ["Wood-frame construction", "Pitched roofs", "Front porches", "Suburban layouts"],
      materials: ["Wood siding", "Asphalt shingles", "Brick veneer"],
      historicalContext: "A melting pot of styles, typical American architecture outside major urban centers often features wood-frame houses in styles like Craftsman and Ranch, reflecting a history of westward expansion and suburbanization."
    }
  },
  default: {
    primary: "Contemporary Global",
    alternatives: ["International Style", "Minimalist", "Sustainable"],
    characteristics: ["Clean lines", "Open floor plans", "Use of natural light", "Sustainable materials"],
    materials: ["Glass", "Steel", "Concrete", "Composite panels"],
    historicalContext: "Represents the current globalized standard of architecture, focusing on technology, sustainability, and functionalism. Often lacks deep regional character but is highly efficient."
  }
};
