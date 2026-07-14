window.VelzarythaSelfTests = (() => {
  function close(actual, expected, tolerance = 0.02) { return Math.abs(actual - expected) <= tolerance; }
  function run() {
    const results = [];
    const test = (name, fn) => {
      try { const value = fn(); results.push({ name, passed: value === true, detail: value === true ? "Passed" : String(value) }); }
      catch (error) { results.push({ name, passed: false, detail: error.message }); }
    };
    const settings = JSON.parse(JSON.stringify(VELZARYTHA_DATA.suppliedSettings));
    const entity = { id: "e1", name: "Test", taxProfiles: { "2026": { businessTaxableIncome: 1000000, section179CarryforwardIn: 0, bonusClassElections: { "5-year": "optout" } } } };
    const asset = {
      id: "a1", entityId: "e1", name: "Test asset", category: "computers", dateAcquired: "2026-01-01", placedDate: "2026-01-01",
      costBasis: 10000, exchangeAdjustment: 0, landValue: 0, businessUse: 100, recoveryPeriod: 5, method: "200db", convention: "auto",
      conventionOverride: false, section179Election: 0, section179Priority: 100, listedProperty: false, priorFederalDepreciation: 0,
      bookLife: 5, bookMethod: "sl", bookConvention: "full-month", bookSalvage: 0, adsLife: 5
    };
    const calc = DepreciationEngine.calculateEntity(entity, [asset], settings, { autoApplyMidQuarter: true });
    test("5-year half-year first-year rate", () => close(calc.results[0].federal.rows[0].regular, 2000));
    test("5-year half-year total basis", () => close(calc.results[0].federal.rows.reduce((sum, row) => sum + row.total, 0), 10000));
    test("Class-level bonus opt-out", () => calc.results[0].federal.bonus === 0);
    test("2026 Section 179 limit", () => settings["2026"].section179Limit === 2560000);
    const q4 = { ...asset, id: "a2", placedDate: "2026-11-01", dateAcquired: "2026-11-01" };
    test("Mid-quarter test triggers over 40%", () => DepreciationEngine.midQuarterTest([asset, q4], 2026, 40).triggered === true);
    const bonusEntity = { ...entity, taxProfiles: { "2026": { businessTaxableIncome: 1000000, bonusClassElections: { "5-year": "default" } } } };
    const bonusCalc = DepreciationEngine.calculateEntity(bonusEntity, [asset], settings, {});
    test("Permanent bonus rule after Jan. 19, 2025", () => bonusCalc.results[0].federal.bonus === 10000);
    const limitedAsset = { ...asset, id: "a3", section179Election: 10000 };
    const limitedEntity = { ...entity, taxProfiles: { "2026": { businessTaxableIncome: 4000, section179CarryforwardIn: 1000, bonusClassElections: { "5-year": "optout" } } } };
    const limited = DepreciationEngine.calculateEntity(limitedEntity, [limitedAsset], settings, {});
    const allocation = limited.context.section179ByYear["2026"];
    test("Section 179 taxable-income limit", () => allocation.allowedTotal === 4000 && allocation.carryforwardOut === 7000);
    return { passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, results };
  }
  return { run };
})();
