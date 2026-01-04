/**
 * Cost Estimation Service
 * 
 * Calculates construction costs from DNA and metrics
 * Provides breakdown by system and exports to CSV/Excel
 */

class CostEstimationService {
  constructor() {
    this.defaultRates = {
      // UK construction cost rates (£/m²)
      residential: {
        substructure: 85,
        superstructure: 420,
        envelope: 380,
        finishes: 290,
        mep: 310,
        external: 95
      },
      commercial: {
        substructure: 95,
        superstructure: 480,
        envelope: 420,
        finishes: 340,
        mep: 380,
        external: 110
      },
      industrial: {
        substructure: 75,
        superstructure: 350,
        envelope: 280,
        finishes: 180,
        mep: 250,
        external: 85
      }
    };

    console.log('💰 Cost Estimation Service initialized');
  }

  /**
   * Estimate construction costs
   * 
   * @param {Object} designProject - Design project with DNA and metrics
   * @returns {Object} Cost report with breakdown
   */
  estimateCosts(designProject) {
    console.log('💰 Estimating construction costs...');

    const {
      masterDNA,
      dna,
      metrics,
      locationProfile,
      projectType = 'residential'
    } = designProject;

    const effectiveDNA = masterDNA || dna;
    const dimensions = effectiveDNA?.dimensions || {};
    const gia = metrics?.areas?.gia_m2 || (dimensions.length * dimensions.width * dimensions.floorCount) || 200;

    // Determine building category
    const category = this.categorizeBuildingType(projectType);
    const rates = this.defaultRates[category] || this.defaultRates.residential;

    // Apply location multiplier
    const locationMultiplier = this.getLocationMultiplier(locationProfile);

    // Calculate costs by system
    const breakdown = {
      substructure: {
        description: 'Foundations, basement, ground works',
        rate: rates.substructure * locationMultiplier,
        area: gia,
        cost: rates.substructure * locationMultiplier * gia
      },
      superstructure: {
        description: 'Frame, floors, stairs, roof structure',
        rate: rates.superstructure * locationMultiplier,
        area: gia,
        cost: rates.superstructure * locationMultiplier * gia
      },
      envelope: {
        description: 'External walls, windows, doors, roof covering',
        rate: rates.envelope * locationMultiplier,
        area: gia,
        cost: rates.envelope * locationMultiplier * gia
      },
      finishes: {
        description: 'Internal finishes, fixtures, fittings',
        rate: rates.finishes * locationMultiplier,
        area: gia,
        cost: rates.finishes * locationMultiplier * gia
      },
      mep: {
        description: 'Mechanical, electrical, plumbing systems',
        rate: rates.mep * locationMultiplier,
        area: gia,
        cost: rates.mep * locationMultiplier * gia
      },
      external: {
        description: 'External works, landscaping, drainage',
        rate: rates.external * locationMultiplier,
        area: gia,
        cost: rates.external * locationMultiplier * gia
      }
    };

    // Calculate subtotal
    const subtotal = Object.values(breakdown).reduce((sum, item) => sum + item.cost, 0);

    // Add soft costs and contingency
    const preliminaries = subtotal * 0.12; // 12% for site setup, management
    const design = subtotal * 0.08; // 8% for design fees
    const contingency = subtotal * 0.10; // 10% contingency

    const softCosts = preliminaries + design + contingency;
    const totalCost = subtotal + softCosts;

    // Calculate per m² rate
    const ratePerM2 = totalCost / gia;

    // Compare to market benchmarks
    const marketContext = locationProfile?.marketContext || {};
    const marketRate = marketContext.avgConstructionCost || ratePerM2;
    const variance = ((ratePerM2 - marketRate) / marketRate) * 100;

    console.log(`✅ Cost estimated: £${totalCost.toLocaleString()} (£${ratePerM2.toFixed(0)}/m²)`);
    console.log(`   Market rate: £${marketRate.toFixed(0)}/m², variance: ${variance > 0 ? '+' : ''}${variance.toFixed(1)}%`);

    return {
      currency: 'GBP',
      totalCost: Math.round(totalCost),
      subtotal: Math.round(subtotal),
      softCosts: Math.round(softCosts),
      breakdown,
      summary: {
        gia: gia.toFixed(1),
        ratePerM2: ratePerM2.toFixed(0),
        marketRate: marketRate.toFixed(0),
        variance: variance.toFixed(1),
        category,
        locationMultiplier: locationMultiplier.toFixed(2)
      },
      softCostBreakdown: {
        preliminaries: Math.round(preliminaries),
        design: Math.round(design),
        contingency: Math.round(contingency)
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Categorize building type for cost rates
   */
  categorizeBuildingType(projectType) {
    const type = (projectType || '').toLowerCase();

    if (type.includes('house') || type.includes('residential') || type.includes('apartment')) {
      return 'residential';
    }

    if (type.includes('office') || type.includes('retail') || type.includes('commercial') || type.includes('clinic')) {
      return 'commercial';
    }

    if (type.includes('warehouse') || type.includes('industrial') || type.includes('factory')) {
      return 'industrial';
    }

    return 'residential'; // Default
  }

  /**
   * Get location cost multiplier
   */
  getLocationMultiplier(locationProfile) {
    if (!locationProfile || !locationProfile.address) {
      return 1.0; // Default
    }

    const address = locationProfile.address.toLowerCase();

    // UK regional multipliers (London = 1.3, Southeast = 1.15, etc.)
    if (address.includes('london')) return 1.30;
    if (address.includes('surrey') || address.includes('berkshire')) return 1.20;
    if (address.includes('manchester') || address.includes('birmingham')) return 1.05;
    if (address.includes('scotland') || address.includes('wales')) return 0.95;
    if (address.includes('north')) return 0.90;

    return 1.0; // Default UK average
  }

  /**
   * Get cost summary for A1 sheet embedding
   */
  getCostSummaryForA1(costReport) {
    if (!costReport) {
      return { rows: [], totals: {} };
    }

    const rows = [
      { label: 'Substructure', cost: costReport.breakdown.substructure.cost },
      { label: 'Superstructure', cost: costReport.breakdown.superstructure.cost },
      { label: 'Envelope', cost: costReport.breakdown.envelope.cost },
      { label: 'Finishes', cost: costReport.breakdown.finishes.cost },
      { label: 'MEP Systems', cost: costReport.breakdown.mep.cost },
      { label: 'External Works', cost: costReport.breakdown.external.cost },
      { label: 'Soft Costs', cost: costReport.softCosts }
    ];

    const totals = {
      subtotal: costReport.subtotal,
      total: costReport.totalCost,
      currency: costReport.currency,
      ratePerM2: costReport.summary.ratePerM2
    };

    return { rows, totals };
  }

  /**
   * Export cost report to CSV
   */
  exportToCsv(costReport) {
    console.log('📊 Exporting cost report to CSV...');

    const lines = [
      'Item,Description,Rate (£/m²),Area (m²),Cost (£)',
      '',
      // Construction costs
      ...Object.entries(costReport.breakdown).map(([key, data]) => 
        `${key},${data.description},${data.rate.toFixed(2)},${data.area.toFixed(1)},${data.cost.toFixed(2)}`
      ),
      '',
      `Subtotal,,,${costReport.subtotal.toFixed(2)}`,
      '',
      // Soft costs
      `Preliminaries,Site setup & management,,,${costReport.softCostBreakdown.preliminaries.toFixed(2)}`,
      `Design Fees,Professional fees,,,${costReport.softCostBreakdown.design.toFixed(2)}`,
      `Contingency,Risk allowance,,,${costReport.softCostBreakdown.contingency.toFixed(2)}`,
      '',
      `TOTAL,,,${costReport.totalCost.toFixed(2)}`,
      '',
      `Rate per m²,,,${costReport.summary.ratePerM2}`,
      `Market benchmark,,,${costReport.summary.marketRate}`,
      `Variance,,,${costReport.summary.variance}%`
    ];

    return lines.join('\n');
  }

  /**
   * Export cost report to Excel (requires library)
   */
  exportToXlsx(costReport) {
    // Would require xlsx or exceljs library
    throw new Error('XLSX export requires additional library. Use CSV format.');
  }
}

// Singleton instance
const costEstimationService = new CostEstimationService();

export default costEstimationService;
export { costEstimationService, CostEstimationService };

