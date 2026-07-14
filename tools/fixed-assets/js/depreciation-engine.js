window.DepreciationEngine = (() => {
  const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));
  const dateValue = value => value ? new Date(`${value}T00:00:00`) : null;
  const yearOf = value => dateValue(value)?.getFullYear() || 0;
  const monthOf = value => (dateValue(value)?.getMonth() ?? -1) + 1;
  const quarterOf = value => Math.ceil(monthOf(value) / 3);
  const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, 1);
  const isoMonth = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  function category(asset) {
    return asset.categoryData || VELZARYTHA_DATA.categories[asset.category] || VELZARYTHA_DATA.categories.custom;
  }

  function originalBasis(asset) {
    return round(Math.max(0,
      Number(asset.costBasis || 0) +
      Number(asset.exchangeAdjustment || 0) -
      Number(asset.landValue || 0)
    ));
  }

  function businessBasis(asset) {
    return round(originalBasis(asset) * clamp(asset.businessUse, 0, 100) / 100);
  }

  function bonusPercentForAsset(asset, settings, classElection = "default") {
    const data = category(asset);
    if (!data.bonus || data.nondepreciable || classElection === "optout") return 0;
    if (asset.relatedParty) return 0;
    if (asset.usedProperty && asset.usedPropertyEligible === false) return 0;
    if (asset.bonusEligibilityOverride === "ineligible") return 0;
    const acquired = asset.dateAcquired || asset.placedDate;
    const permanentAfter = settings.permanentBonusAcquiredAfter || "2025-01-19";
    if (acquired && acquired > permanentAfter) return Number(settings.permanentBonusPercent || 0);
    return Number(settings.transitionBonusPercent || 0);
  }

  function midQuarterTest(assets, taxYear, threshold = 40) {
    const tested = assets.filter(asset => {
      const data = category(asset);
      return data.tangiblePersonal && !data.realProperty && yearOf(asset.placedDate) === Number(taxYear);
    });
    const total = tested.reduce((sum, asset) => sum + businessBasis(asset), 0);
    const q4 = tested.filter(asset => quarterOf(asset.placedDate) === 4)
      .reduce((sum, asset) => sum + businessBasis(asset), 0);
    const percent = total ? q4 / total * 100 : 0;
    return { total: round(total), q4: round(q4), percent: round(percent), triggered: total > 0 && percent > Number(threshold || 40), count: tested.length };
  }

  function effectiveConvention(asset, midQuarterTriggered, autoApply = true) {
    const data = category(asset);
    if (asset.conventionOverride && asset.convention && asset.convention !== "auto") return asset.convention;
    if (data.realProperty) return "mid-month";
    if (data.intangible) return "full-month";
    if (autoApply && midQuarterTriggered && data.tangiblePersonal) return "mid-quarter";
    return data.convention || asset.convention || "half-year";
  }

  function classElection(profile, asset) {
    const key = category(asset).classKey || "custom";
    return profile?.bonusClassElections?.[key] || "default";
  }

  function section179Eligibility(asset) {
    const data = category(asset);
    const use = clamp(asset.businessUse, 0, 100);
    if (!data.section179 || data.nondepreciable) return { eligible: false, reason: "Category is not marked Section 179 eligible." };
    if (data.qip && !asset.qipAttested) return { eligible: false, reason: "QIP eligibility has not been attested." };
    if (asset.listedProperty && use <= 50) return { eligible: false, reason: "Listed-property business use is not more than 50%." };
    return { eligible: true, reason: "" };
  }

  function allocateSection179(assets, settings, profile = {}, options = {}) {
    const placedYear = Number(options.taxYear);
    const candidates = assets.filter(asset => yearOf(asset.placedDate) === placedYear);
    const qualifiedCost = candidates.reduce((sum, asset) => {
      return sum + (section179Eligibility(asset).eligible ? businessBasis(asset) : 0);
    }, 0);
    const phaseoutReduction = Math.max(0, qualifiedCost - Number(settings.section179Threshold || 0));
    const dollarLimit = Math.max(0, Number(settings.section179Limit || 0) - phaseoutReduction);
    const allocations = {};
    let available = dollarLimit;

    const sorted = [...candidates].sort((a, b) => Number(a.section179Priority || 100) - Number(b.section179Priority || 100));
    for (const asset of sorted) {
      const eligibility = section179Eligibility(asset);
      const requested = Math.max(0, Number(asset.section179Election || 0));
      let assetCap = businessBasis(asset);
      if (category(asset).heavySuv) assetCap = Math.min(assetCap, Number(settings.suvCap || 0));
      const eligibleRequest = eligibility.eligible ? Math.min(requested, assetCap) : 0;
      const elected = Math.min(eligibleRequest, available);
      allocations[asset.id] = {
        requested: round(requested), eligibleRequest: round(eligibleRequest), elected: round(elected),
        limited: round(Math.max(0, requested - elected)), eligibility
      };
      available = round(Math.max(0, available - elected));
    }

    const currentElected = round(Object.values(allocations).reduce((sum, item) => sum + item.elected, 0));
    const carryforwardIn = Math.max(0, Number(profile.section179CarryforwardIn || 0));
    const taxableIncomeEntered = profile.businessTaxableIncome !== null && profile.businessTaxableIncome !== undefined && profile.businessTaxableIncome !== "";
    const taxableIncome = taxableIncomeEntered ? Math.max(0, Number(profile.businessTaxableIncome || 0)) : null;
    const totalAvailable = round(currentElected + carryforwardIn);
    const allowedTotal = taxableIncomeEntered ? round(Math.min(totalAvailable, taxableIncome)) : currentElected;
    const allowedCarryforward = taxableIncomeEntered ? round(Math.min(carryforwardIn, allowedTotal)) : 0;
    const allowedCurrent = taxableIncomeEntered ? round(Math.max(0, allowedTotal - allowedCarryforward)) : currentElected;
    const carryforwardOut = taxableIncomeEntered ? round(totalAvailable - allowedTotal) : carryforwardIn;

    return {
      qualifiedCost: round(qualifiedCost), phaseoutReduction: round(phaseoutReduction), dollarLimit: round(dollarLimit),
      currentElected, carryforwardIn: round(carryforwardIn), taxableIncome, taxableIncomeEntered,
      allowedTotal, allowedCurrent, allowedCarryforward, carryforwardOut, allocations
    };
  }

  function straightLineMonthlySchedule({ basis, startDate, lifeYears, convention = "full-month", disposalDate = null }) {
    const rows = new Map();
    if (basis <= 0 || lifeYears <= 0 || !startDate) return [];
    const months = Math.round(lifeYears * 12);
    const monthly = basis / months;
    const start = dateValue(startDate);
    const disposal = dateValue(disposalDate);
    let allocated = 0;

    for (let index = 0; index < months; index += 1) {
      const month = addMonths(start, index);
      if (disposal && month > new Date(disposal.getFullYear(), disposal.getMonth(), 1)) break;
      let factor = 1;
      if (convention === "mid-month" && (index === 0 || index === months - 1)) factor = 0.5;
      const amount = Math.min(basis - allocated, monthly * factor);
      if (amount <= 0) break;
      const year = month.getFullYear();
      rows.set(year, round((rows.get(year) || 0) + amount));
      allocated += amount;
    }

    if (!disposal && allocated < basis - 0.01) {
      const finalDate = addMonths(start, months);
      rows.set(finalDate.getFullYear(), round((rows.get(finalDate.getFullYear()) || 0) + (basis - allocated)));
    }
    return [...rows.entries()].map(([year, regular]) => ({ year, regular }));
  }

  function tableMacrsSchedule(asset, basis, convention) {
    const key = `${Number(asset.recoveryPeriod)}|${asset.method}`;
    const rates = convention === "half-year" ? VELZARYTHA_DATA.macrsHalfYearRates[key] : null;
    if (!rates || !asset.placedDate) return null;
    const startYear = yearOf(asset.placedDate);
    let allocated = 0;
    return rates.map((rate, index) => {
      const amount = index === rates.length - 1 ? basis - allocated : round(basis * rate / 100);
      allocated = round(allocated + amount);
      return { year: startYear + index, regular: round(Math.max(0, amount)), rate: Number(rate), source: "table" };
    });
  }

  function genericMacrsSchedule(asset, basis, convention) {
    if (basis <= 0) return [];
    const recovery = Number(asset.recoveryPeriod || 0);
    const startYear = yearOf(asset.placedDate);
    const factor = asset.method === "200db" ? 2 : asset.method === "150db" ? 1.5 : 1;
    const firstFraction = convention === "half-year" ? 0.5 : convention === "mid-quarter"
      ? ({ 1: 0.875, 2: 0.625, 3: 0.375, 4: 0.125 }[quarterOf(asset.placedDate)] || 0.5)
      : 1;
    const rows = [];
    let remaining = basis;
    let elapsed = 0;
    let index = 0;
    const maxYears = Math.ceil(recovery) + 3;

    while (remaining > 0.01 && index < maxYears) {
      const fraction = index === 0 ? firstFraction : (index === Math.ceil(recovery) ? Math.max(0, 1 - firstFraction) : 1);
      const remainingLife = Math.max(0.001, recovery - elapsed);
      const db = remaining * factor / recovery * fraction;
      const sl = remaining / remainingLife * fraction;
      const amount = Math.min(remaining, Math.max(db, sl));
      rows.push({ year: startYear + index, regular: round(amount), rate: round(amount / basis * 100), source: "formula" });
      remaining = round(remaining - amount);
      elapsed += fraction;
      index += 1;
    }
    if (remaining > 0.01) rows.push({ year: startYear + index, regular: round(remaining), rate: round(remaining / basis * 100), source: "formula" });
    return rows;
  }

  function regularTaxSchedule(asset, basis, convention, methodOverride = null, recoveryOverride = null) {
    const data = category(asset);
    if (data.nondepreciable || basis <= 0) return [];
    const working = { ...asset, method: methodOverride || asset.method || data.method, recoveryPeriod: recoveryOverride || asset.recoveryPeriod || data.recovery };
    if (working.method === "amortization") {
      return straightLineMonthlySchedule({ basis, startDate: asset.placedDate, lifeYears: Number(working.recoveryPeriod), convention: "full-month", disposalDate: asset.disposalDate });
    }
    if (working.method === "sl" || working.method === "ads") {
      if (convention === "full-year") {
        const years = Math.ceil(Number(working.recoveryPeriod));
        const startYear = yearOf(asset.placedDate);
        let allocated = 0;
        return Array.from({ length: years }, (_, index) => {
          const amount = index === years - 1 ? basis - allocated : round(basis / Number(working.recoveryPeriod));
          allocated = round(allocated + amount);
          return { year: startYear + index, regular: round(amount), rate: round(amount / basis * 100), source: "formula" };
        });
      }
      const monthlyConvention = convention === "mid-month" ? "mid-month" : "full-month";
      return straightLineMonthlySchedule({ basis, startDate: asset.placedDate, lifeYears: Number(working.recoveryPeriod), convention: monthlyConvention, disposalDate: asset.disposalDate });
    }
    return tableMacrsSchedule(working, basis, convention) || genericMacrsSchedule(working, basis, convention);
  }

  function finalizeRows(asset, basis, special179, bonus, regularRows, priorDepreciation = 0, capSettings = null) {
    const map = new Map(regularRows.map(row => [row.year, { ...row }]));
    const startYear = yearOf(asset.placedDate);
    if (!map.has(startYear)) map.set(startYear, { year: startYear, regular: 0, rate: 0, source: "none" });
    const rows = [...map.values()].sort((a, b) => a.year - b.year);
    let accumulated = Math.max(0, Number(priorDepreciation || 0));
    let ending = Math.max(0, basis - accumulated);
    const warnings = [];
    const usePercent = clamp(asset.businessUse, 0, 100) / 100;

    rows.forEach((row, index) => {
      row.beginningBasis = round(ending);
      row.section179 = index === 0 ? round(special179) : 0;
      row.bonus = index === 0 ? round(bonus) : 0;
      let total = round(row.section179 + row.bonus + Number(row.regular || 0));
      if (category(asset).passengerAuto && capSettings) {
        const caps = bonus > 0 ? capSettings.autoCapsBonus : capSettings.autoCapsNoBonus;
        const cap = Number(caps?.[Math.min(index, 3)] || 0) * usePercent;
        if (cap > 0 && total > cap) {
          let availableCap = round(cap);
          row.section179 = round(Math.min(row.section179, availableCap));
          availableCap = round(Math.max(0, availableCap - row.section179));
          row.bonus = round(Math.min(row.bonus, availableCap));
          availableCap = round(Math.max(0, availableCap - row.bonus));
          row.regular = round(Math.min(Number(row.regular || 0), availableCap));
          total = round(row.section179 + row.bonus + row.regular);
          warnings.push(`Passenger-auto limit reduced the ${row.year} deduction to ${round(cap)}; unrecovered basis is extended to later years.`);
        }
      }
      if (total > ending + 0.01) {
        total = round(ending);
        const special = row.section179 + row.bonus;
        row.regular = round(Math.max(0, total - special));
      }
      row.total = total;
      accumulated = round(accumulated + total);
      ending = round(Math.max(0, ending - total));
      row.accumulated = accumulated;
      row.endingBasis = ending;
    });
    if (category(asset).passengerAuto && capSettings && ending > 0.01) {
      const caps = bonus > 0 ? capSettings.autoCapsBonus : capSettings.autoCapsNoBonus;
      const annualCap = Number(caps?.[3] || 0) * usePercent;
      let nextYear = (rows.at(-1)?.year || yearOf(asset.placedDate)) + 1;
      let guard = 0;
      while (ending > 0.01 && annualCap > 0 && guard < 30) {
        const amount = round(Math.min(ending, annualCap));
        const row = { year: nextYear, beginningBasis: round(ending), section179: 0, bonus: 0, regular: amount, total: amount };
        accumulated = round(accumulated + amount);
        ending = round(Math.max(0, ending - amount));
        row.accumulated = accumulated;
        row.endingBasis = ending;
        row.source = "vehicle-cap-extension";
        rows.push(row);
        nextYear += 1;
        guard += 1;
      }
    }
    return { rows, warnings };
  }

  function buildFederalAssetSchedule(asset, context) {
    const data = category(asset);
    const placedYear = yearOf(asset.placedDate);
    const settings = context.settingsByYear[String(placedYear)] || context.settingsByYear[placedYear];
    const profile = context.profileByYear[String(placedYear)] || {};
    const test = context.midQuarterByYear[String(placedYear)] || { triggered: false };
    const convention = effectiveConvention(asset, test.triggered, context.autoApplyMidQuarter !== false);
    const allocation = context.section179ByYear[String(placedYear)]?.allocations?.[asset.id];
    const elected179 = allocation?.elected || 0;
    const basis = businessBasis(asset);
    const classChoice = classElection(profile, asset);
    const bonusPercent = bonusPercentForAsset(asset, settings, classChoice);
    const bonusEligibleBasis = Math.max(0, basis - elected179);
    const bonus = round(bonusEligibleBasis * bonusPercent / 100);
    const regularBasis = round(Math.max(0, bonusEligibleBasis - bonus));
    const regularRows = regularTaxSchedule(asset, regularBasis, convention);
    const finalized = finalizeRows(asset, basis, elected179, bonus, regularRows, asset.priorFederalDepreciation, settings);
    const warnings = [...finalized.warnings];
    if (test.triggered && data.tangiblePersonal && asset.conventionOverride && asset.convention !== "mid-quarter") warnings.push("The entity-level mid-quarter test is triggered, but this asset has an override. Review the override.");
    if (regularRows.some(row => row.source === "formula")) warnings.push("This schedule uses the formula engine because a supplied percentage table was not available for the selected class or convention.");
    if (asset.disposalDate) warnings.push("Depreciation in the disposal year is an estimate; verify the applicable disposition convention.");
    return { system: "federal", basis, convention, elected179, bonus, bonusPercent, classChoice, ...finalized, warnings };
  }

  function buildBookSchedule(asset) {
    const data = category(asset);
    if (data.nondepreciable) return { system: "book", basis: originalBasis(asset), rows: [], warnings: [] };
    const basis = round(Math.max(0, originalBasis(asset) - Number(asset.bookSalvage || 0)));
    const life = Number(asset.bookLife || data.bookLife || asset.recoveryPeriod || 5);
    if (asset.bookMethod === "units") {
      return { system: "book", basis, rows: [], warnings: ["Units-of-production requires period production data and is not automatically scheduled."] };
    }
    const regularRows = straightLineMonthlySchedule({ basis, startDate: asset.placedDate, lifeYears: life, convention: asset.bookConvention || "full-month", disposalDate: asset.disposalDate });
    const finalized = finalizeRows(asset, basis, 0, 0, regularRows, asset.priorBookDepreciation, null);
    return { system: "book", basis, convention: asset.bookConvention || "full-month", ...finalized, warnings: [] };
  }

  function buildAdsSchedule(asset) {
    const data = category(asset);
    if (data.nondepreciable) return { system: "ads", basis: businessBasis(asset), rows: [], warnings: [] };
    const basis = businessBasis(asset);
    const life = Number(asset.adsLife || data.adsRecovery || asset.recoveryPeriod || 5);
    const convention = data.realProperty ? "mid-month" : data.intangible ? "full-month" : "half-year";
    const regularRows = regularTaxSchedule({ ...asset, method: "ads", recoveryPeriod: life }, basis, convention, "ads", life);
    const finalized = finalizeRows(asset, basis, 0, 0, regularRows, asset.priorAdsDepreciation, null);
    return { system: "ads", basis, convention, ...finalized, warnings: ["ADS comparison excludes Section 179 and bonus in this planning view."] };
  }

  function stateRules(profile, federalSettings) {
    const mode = profile.stateProfileMode || "federal";
    if (mode === "noBonus") return { ...federalSettings, permanentBonusPercent: 0, transitionBonusPercent: 0 };
    if (mode === "custom") return {
      ...federalSettings,
      section179Limit: Number(profile.state179Limit ?? federalSettings.section179Limit),
      section179Threshold: Number(profile.state179Threshold ?? federalSettings.section179Threshold),
      suvCap: Number(profile.stateSuvCap ?? federalSettings.suvCap),
      permanentBonusPercent: Number(profile.stateBonusPercent ?? 0),
      transitionBonusPercent: Number(profile.stateBonusPercent ?? 0)
    };
    return federalSettings;
  }

  function buildStateAssetSchedule(asset, context) {
    const placedYear = yearOf(asset.placedDate);
    const federalSettings = context.settingsByYear[String(placedYear)];
    const profile = context.profileByYear[String(placedYear)] || {};
    const settings = stateRules(profile, federalSettings);
    const stateProfile = {
      ...profile,
      businessTaxableIncome: profile.stateTaxableIncome,
      section179CarryforwardIn: profile.state179CarryforwardIn || 0
    };
    const stateAllocation = allocateSection179(context.assets, settings, stateProfile, { taxYear: placedYear });
    const stateContext = {
      ...context,
      settingsByYear: { ...context.settingsByYear, [String(placedYear)]: settings },
      section179ByYear: { ...context.section179ByYear, [String(placedYear)]: stateAllocation }
    };
    const result = buildFederalAssetSchedule(asset, stateContext);
    result.system = "state";
    if (profile.stateProfileMode === "custom" && (profile.state179Limit === null || profile.state179Limit === undefined)) result.warnings.push("Custom state profile is incomplete.");
    return result;
  }

  function disposalScreen(asset, federalSchedule) {
    if (!asset.disposalDate) return null;
    const disposalYear = yearOf(asset.disposalDate);
    const row = [...federalSchedule.rows].filter(item => item.year <= disposalYear).at(-1);
    const adjustedBasis = round(row?.endingBasis ?? federalSchedule.basis);
    const netProceeds = round(Math.max(0, Number(asset.disposalProceeds || 0) - Number(asset.disposalExpenses || 0)));
    const gainLoss = round(netProceeds - adjustedBasis);
    const depreciationTaken = round(row?.accumulated || Number(asset.priorFederalDepreciation || 0));
    const potential1245 = category(asset).realProperty ? 0 : round(Math.min(Math.max(0, gainLoss), depreciationTaken));
    return {
      disposalYear, adjustedBasis, grossProceeds: round(asset.disposalProceeds), disposalExpenses: round(asset.disposalExpenses),
      netProceeds, gainLoss, depreciationTaken, potential1245Recapture: potential1245,
      note: "Screening calculation only. Section 1245/1250 classification, unrecaptured Section 1250 gain, installment sales, and related-party rules require review."
    };
  }

  function buildContext(entity, assets, settingsByYear, options = {}) {
    const profileByYear = entity.taxProfiles || {};
    const years = new Set(assets.map(asset => String(yearOf(asset.placedDate))).filter(Boolean));
    const midQuarterByYear = {};
    const section179ByYear = {};
    years.forEach(year => {
      const settings = settingsByYear[year] || settingsByYear[String(options.activeTaxYear)] || {};
      midQuarterByYear[year] = midQuarterTest(assets, Number(year), settings.midQuarterThreshold || 40);
      section179ByYear[year] = allocateSection179(assets, settings, profileByYear[year] || {}, { taxYear: year });
    });
    return { entity, assets, settingsByYear, profileByYear, midQuarterByYear, section179ByYear, autoApplyMidQuarter: options.autoApplyMidQuarter !== false };
  }

  function calculateEntity(entity, allAssets, settingsByYear, options = {}) {
    const assets = allAssets.filter(asset => asset.entityId === entity.id).map(asset => ({ ...asset, categoryData: category(asset) }));
    const context = buildContext(entity, assets, settingsByYear, options);
    const results = assets.map(asset => {
      const federal = buildFederalAssetSchedule(asset, context);
      const book = buildBookSchedule(asset);
      const ads = buildAdsSchedule(asset);
      const state = buildStateAssetSchedule(asset, context);
      return { asset, federal, book, ads, state, disposal: disposalScreen(asset, federal) };
    });
    return { entity, assets, context, results };
  }

  function rowForYear(schedule, year) {
    return schedule.rows.find(row => row.year === Number(year)) || null;
  }

  function summarizeYear(entityResult, year) {
    const summary = {
      year: Number(year), federal: 0, book: 0, ads: 0, state: 0, section179: 0, bonus: 0, regular: 0,
      remainingFederalBasis: 0, disposals: [], assets: []
    };
    entityResult.results.forEach(item => {
      const federal = rowForYear(item.federal, year);
      const book = rowForYear(item.book, year);
      const ads = rowForYear(item.ads, year);
      const state = rowForYear(item.state, year);
      summary.federal += federal?.total || 0;
      summary.book += book?.total || 0;
      summary.ads += ads?.total || 0;
      summary.state += state?.total || 0;
      summary.section179 += federal?.section179 || 0;
      summary.bonus += federal?.bonus || 0;
      summary.regular += federal?.regular || 0;
      const latestFederalRow = [...item.federal.rows].filter(row => row.year <= Number(year)).at(-1);
      summary.remainingFederalBasis += latestFederalRow?.endingBasis ?? item.federal.basis ?? 0;
      if (item.disposal?.disposalYear === Number(year)) summary.disposals.push({ asset: item.asset, disposal: item.disposal });
      if (federal || book || ads || state) summary.assets.push({ ...item, federalRow: federal, bookRow: book, adsRow: ads, stateRow: state });
    });
    Object.keys(summary).forEach(key => { if (typeof summary[key] === "number") summary[key] = round(summary[key]); });
    return summary;
  }

  return {
    round, clamp, yearOf, monthOf, quarterOf, originalBasis, businessBasis,
    bonusPercentForAsset, midQuarterTest, effectiveConvention, section179Eligibility,
    allocateSection179, calculateEntity, summarizeYear, rowForYear, stateRules
  };
})();
