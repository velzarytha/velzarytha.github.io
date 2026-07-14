window.ReportEngine = (() => {
  const round = DepreciationEngine.round;

  function buildEntityResult(state, settings, entityId) {
    const entity = state.entities.find(item => item.id === entityId);
    if (!entity) return null;
    return DepreciationEngine.calculateEntity(entity, state.assets, settings, { autoApplyMidQuarter: state.preferences?.autoApplyMidQuarter !== false });
  }

  function form4562Data(state, settings, entityId, year) {
    const entityResult = buildEntityResult(state, settings, entityId);
    if (!entityResult) return null;
    const taxYear = Number(year);
    const summary = DepreciationEngine.summarizeYear(entityResult, taxYear);
    const allocation = entityResult.context.section179ByYear[String(taxYear)] || {
      qualifiedCost: 0, dollarLimit: 0, phaseoutReduction: 0, currentElected: 0,
      carryforwardIn: 0, taxableIncome: null, taxableIncomeEntered: false,
      allowedTotal: 0, carryforwardOut: 0, allocations: {}
    };
    const yearSettings = settings[String(taxYear)] || {};
    const currentAssets = summary.assets.filter(item => DepreciationEngine.yearOf(item.asset.placedDate) === taxYear);
    const priorAssets = summary.assets.filter(item => DepreciationEngine.yearOf(item.asset.placedDate) < taxYear);
    const listed = summary.assets.filter(item => item.asset.listedProperty);
    const nonListed = summary.assets.filter(item => !item.asset.listedProperty);
    const gdsCurrent = currentAssets.filter(item => !item.asset.adsRequired && !item.asset.listedProperty && !VELZARYTHA_DATA.categories[item.asset.category]?.intangible);
    const adsCurrent = currentAssets.filter(item => item.asset.adsRequired && !item.asset.listedProperty);
    const amortization = summary.assets.filter(item => VELZARYTHA_DATA.categories[item.asset.category]?.intangible);
    const classes = {};
    gdsCurrent.forEach(item => {
      const key = VELZARYTHA_DATA.categories[item.asset.category]?.classKey || "custom";
      classes[key] ||= { basis: 0, deduction: 0, assets: [] };
      classes[key].basis += item.federal.basis;
      classes[key].deduction += item.federalRow?.regular || 0;
      classes[key].assets.push(item);
    });
    const listed179 = listed.reduce((sum, item) => sum + (item.federalRow?.section179 || 0), 0);
    const listedBonus = listed.reduce((sum, item) => sum + (item.federalRow?.bonus || 0), 0);
    const listedTotal = listed.reduce((sum, item) => sum + (item.federalRow?.total || 0), 0);
    const nonListedBonus = nonListed.reduce((sum, item) => sum + (item.federalRow?.bonus || 0), 0);
    const priorMacrs = priorAssets.filter(item => !item.asset.listedProperty && !VELZARYTHA_DATA.categories[item.asset.category]?.intangible)
      .reduce((sum, item) => sum + (item.federalRow?.regular || 0), 0);
    const amortizationTotal = amortization.reduce((sum, item) => sum + (item.federalRow?.regular || 0), 0);
    return {
      entity: entityResult.entity, entityResult, year: taxYear, settings: yearSettings, summary, allocation,
      currentAssets, priorAssets, listed, nonListed, gdsCurrent, adsCurrent, amortization, classes,
      lines: {
        1: yearSettings.section179Limit || 0,
        2: allocation.qualifiedCost,
        3: yearSettings.section179Threshold || 0,
        4: allocation.phaseoutReduction,
        5: allocation.dollarLimit,
        7: listed179,
        8: allocation.currentElected,
        9: Math.min(allocation.dollarLimit || 0, allocation.currentElected || 0),
        10: allocation.carryforwardIn,
        11: allocation.taxableIncomeEntered ? allocation.taxableIncome : null,
        12: allocation.allowedTotal,
        13: allocation.carryforwardOut,
        14: nonListedBonus,
        17: round(priorMacrs),
        21: round(listedTotal),
        22: round(summary.federal),
        25: round(listedBonus),
        44: round(amortizationTotal)
      }
    };
  }

  function currentYearSchedule(state, settings, entityId, year) {
    const entityResult = buildEntityResult(state, settings, entityId);
    if (!entityResult) return null;
    return { entityResult, summary: DepreciationEngine.summarizeYear(entityResult, year), year: Number(year) };
  }

  function bookTaxComparison(state, settings, entityId, year) {
    const data = currentYearSchedule(state, settings, entityId, year);
    if (!data) return null;
    const rows = data.summary.assets.map(item => ({
      asset: item.asset,
      federal: item.federalRow?.total || 0,
      book: item.bookRow?.total || 0,
      ads: item.adsRow?.total || 0,
      state: item.stateRow?.total || 0,
      temporaryDifference: round((item.bookRow?.total || 0) - (item.federalRow?.total || 0))
    }));
    return { ...data, rows };
  }

  function disposalReport(state, settings, entityId, year) {
    const data = currentYearSchedule(state, settings, entityId, year);
    if (!data) return null;
    return { ...data, rows: data.summary.disposals };
  }

  function rollforward(state, settings, entityId, year) {
    const data = currentYearSchedule(state, settings, entityId, year);
    if (!data) return null;
    let beginningBasis = 0, additions = 0, disposalsBasis = 0, depreciation = 0, endingBasis = 0;
    data.entityResult.results.forEach(item => {
      const row = DepreciationEngine.rowForYear(item.federal, year);
      if (!row) return;
      const placedThisYear = DepreciationEngine.yearOf(item.asset.placedDate) === Number(year);
      if (placedThisYear) additions += item.federal.basis;
      else beginningBasis += row.beginningBasis;
      if (item.disposal?.disposalYear === Number(year)) disposalsBasis += item.disposal.adjustedBasis;
      depreciation += row.total;
      endingBasis += row.endingBasis;
    });
    return { ...data, totals: { beginningBasis: round(beginningBasis), additions: round(additions), disposalsBasis: round(disposalsBasis), depreciation: round(depreciation), endingBasis: round(endingBasis) } };
  }

  function form4562PdfLines(data) {
    const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
    const lines = [
      "PREVIEW - NOT FOR FILING",
      `Tax year: ${data.year}`,
      `Name: ${data.entity.name}`,
      `Identifying number: ${data.entity.ein || "Not entered"}`,
      "",
      "PART I - SECTION 179",
      `Line 1 maximum amount: ${money(data.lines[1])}`,
      `Line 2 total cost of Section 179 property: ${money(data.lines[2])}`,
      `Line 3 phase-out threshold: ${money(data.lines[3])}`,
      `Line 4 reduction: ${money(data.lines[4])}`,
      `Line 5 dollar limitation: ${money(data.lines[5])}`,
      ...data.currentAssets.filter(item => item.federalRow?.section179).map(item => `Line 6 ${item.asset.name}: elected ${money(item.federalRow.section179)}`),
      `Line 7 listed property elected cost: ${money(data.lines[7])}`,
      `Line 8 total elected cost: ${money(data.lines[8])}`,
      `Line 9 tentative deduction: ${money(data.lines[9])}`,
      `Line 10 carryforward in: ${money(data.lines[10])}`,
      `Line 11 business income limitation: ${data.lines[11] === null ? "NOT ENTERED" : money(data.lines[11])}`,
      `Line 12 Section 179 deduction estimate: ${money(data.lines[12])}`,
      `Line 13 carryforward out: ${money(data.lines[13])}`,
      "",
      "PART II - SPECIAL DEPRECIATION",
      `Line 14 non-listed bonus depreciation: ${money(data.lines[14])}`,
      "",
      "PART III - MACRS",
      `Line 17 prior-year MACRS property: ${money(data.lines[17])}`,
      ...Object.entries(data.classes).map(([key, value]) => `${key}: basis ${money(value.basis)} | regular deduction ${money(value.deduction)}`),
      "",
      "PART IV - SUMMARY",
      `Line 21 listed property: ${money(data.lines[21])}`,
      `Line 22 total depreciation and amortization estimate: ${money(data.lines[22])}`,
      "",
      "PART V - LISTED PROPERTY",
      ...data.listed.map(item => `${item.asset.name}: ${item.asset.businessUse}% business use | ${money(item.federalRow?.total || 0)}`),
      `Line 25 listed-property bonus estimate: ${money(data.lines[25])}`,
      "",
      "PART VI - AMORTIZATION",
      ...data.amortization.map(item => `${item.asset.name}: ${money(item.federalRow?.regular || 0)}`),
      `Line 44 amortization total: ${money(data.lines[44])}`,
      "",
      "This is a simplified supporting preview. It is not the official IRS Form 4562 and must not be filed."
    ];
    return lines;
  }

  return { buildEntityResult, form4562Data, currentYearSchedule, bookTaxComparison, disposalReport, rollforward, form4562PdfLines };
})();
