window.ValidationEngine = (() => {
  function issue(severity, code, message, objectType, objectId, field = "") {
    return { id: `${objectType}:${objectId}:${code}:${field}`, severity, code, message, objectType, objectId, field };
  }

  function validateAsset(asset, entity, settings, entityResult) {
    const issues = [];
    const data = VELZARYTHA_DATA.categories[asset.category] || VELZARYTHA_DATA.categories.custom;
    const basis = DepreciationEngine.businessBasis({ ...asset, categoryData: data });
    if (!asset.name?.trim()) issues.push(issue("error", "missing-name", "Asset name is required.", "asset", asset.id, "name"));
    if (!asset.entityId || !entity) issues.push(issue("error", "missing-company", "Assign the asset to a company.", "asset", asset.id, "entityId"));
    if (!asset.placedDate) issues.push(issue("error", "missing-service-date", "Placed-in-service date is required.", "asset", asset.id, "placedDate"));
    if (asset.dateAcquired && asset.placedDate && asset.dateAcquired > asset.placedDate) issues.push(issue("warning", "acquired-after-service", "Acquisition date is after the placed-in-service date.", "asset", asset.id, "dateAcquired"));
    if (Number(asset.costBasis || 0) <= 0 && !data.nondepreciable) issues.push(issue("error", "invalid-cost", "Enter a positive cost basis.", "asset", asset.id, "costBasis"));
    if (Number(asset.landValue || 0) > Number(asset.costBasis || 0) + Number(asset.exchangeAdjustment || 0)) issues.push(issue("error", "land-over-cost", "Land or non-depreciable value exceeds total entered cost.", "asset", asset.id, "landValue"));
    if (Number(asset.businessUse) < 0 || Number(asset.businessUse) > 100) issues.push(issue("error", "business-use-range", "Business-use percentage must be from 0% to 100%.", "asset", asset.id, "businessUse"));
    if (Number(asset.priorFederalDepreciation || 0) > basis) issues.push(issue("error", "prior-dep-over-basis", "Prior federal depreciation exceeds business basis.", "asset", asset.id, "priorFederalDepreciation"));
    if (data.manualReview) issues.push(issue("warning", "custom-class", "Custom classification requires manual review of class life, method, and convention.", "asset", asset.id, "category"));
    if (data.qip && !asset.qipAttested) issues.push(issue("error", "qip-attestation", "Confirm QIP eligibility before applying the QIP preset.", "asset", asset.id, "qipAttested"));
    if (data.realProperty && asset.method !== "sl") issues.push(issue("error", "real-property-method", "Real property should use straight-line in this federal preset.", "asset", asset.id, "method"));
    if (data.realProperty && asset.conventionOverride && asset.convention !== "mid-month") issues.push(issue("error", "real-property-convention", "Real property requires the mid-month convention in this preset.", "asset", asset.id, "convention"));
    if (asset.listedProperty && Number(asset.businessUse || 0) <= 50 && Number(asset.section179Election || 0) > 0) issues.push(issue("error", "listed-179", "Section 179 is not allowed in this estimate when listed-property business use is 50% or less.", "asset", asset.id, "section179Election"));
    if (asset.listedProperty && !asset.evidenceAvailable) issues.push(issue("warning", "listed-evidence", "Record whether evidence supports the business-use percentage.", "asset", asset.id, "evidenceAvailable"));
    if (Number(asset.businessMiles || 0) > Number(asset.totalMiles || 0)) issues.push(issue("error", "mileage-over-total", "Business miles cannot exceed total miles.", "asset", asset.id, "businessMiles"));
    if (data.vehicle && !Number(asset.vehicleGvwr || 0)) issues.push(issue("warning", "missing-gvwr", "Enter GVWR to help distinguish passenger-auto and heavy-SUV limits.", "asset", asset.id, "vehicleGvwr"));
    if (asset.usedProperty && asset.usedPropertyEligible === null) issues.push(issue("warning", "used-property-eligibility", "Confirm whether used property meets the unrelated-party acquisition requirements.", "asset", asset.id, "usedPropertyEligible"));
    if (asset.relatedParty && Number(asset.section179Election || 0) > 0) issues.push(issue("warning", "related-party", "Related-party acquisitions can affect eligibility. Review the transaction.", "asset", asset.id, "relatedParty"));
    if (asset.disposalDate && asset.placedDate && asset.disposalDate < asset.placedDate) issues.push(issue("error", "disposal-before-service", "Disposal date is before the placed-in-service date.", "asset", asset.id, "disposalDate"));
    if (!asset.disposalDate && Number(asset.disposalProceeds || 0) > 0) issues.push(issue("warning", "proceeds-no-date", "Disposal proceeds were entered without a disposal date.", "asset", asset.id, "disposalDate"));
    if (asset.state === "CA" && entity?.taxProfiles) {
      const profile = entity.taxProfiles[String(DepreciationEngine.yearOf(asset.placedDate))] || {};
      if (!profile.stateProfileMode || profile.stateProfileMode === "federal") issues.push(issue("warning", "ca-state-profile", "Configure a California state depreciation profile instead of assuming full federal conformity.", "asset", asset.id, "state"));
    }
    const result = entityResult?.results?.find(item => item.asset.id === asset.id);
    (result?.federal?.warnings || []).forEach((message, index) => issues.push(issue("warning", `schedule-${index}`, message, "asset", asset.id)));
    return issues;
  }

  function validateEntity(entity, settings, entityResult, taxYear) {
    const issues = [];
    if (!entity.name?.trim()) issues.push(issue("error", "entity-name", "Company name is required.", "entity", entity.id, "name"));
    const profile = entity.taxProfiles?.[String(taxYear)] || {};
    const allocation = entityResult?.context?.section179ByYear?.[String(taxYear)];
    if (allocation && allocation.currentElected > 0 && !allocation.taxableIncomeEntered) issues.push(issue("warning", "taxable-income-missing", `Enter ${taxYear} business taxable income to calculate the Section 179 income limitation and carryforward.`, "entity", entity.id, "businessTaxableIncome"));
    if (profile.stateProfileMode === "custom" && (profile.stateBonusPercent === null || profile.stateBonusPercent === undefined || profile.state179Limit === null || profile.state179Limit === undefined)) issues.push(issue("error", "state-profile-incomplete", "Complete the custom state depreciation settings.", "entity", entity.id, "stateProfileMode"));
    if (!settings?.verifiedDate) issues.push(issue("warning", "settings-unverified", `Tax settings for ${taxYear} do not have a verification date.`, "settings", String(taxYear), "verifiedDate"));
    if ((settings?.autoCapsBonus || []).some(value => !Number(value))) issues.push(issue("warning", "auto-caps-blank", `Passenger-auto caps for ${taxYear} contain blank or zero values.`, "settings", String(taxYear), "autoCapsBonus"));
    return issues;
  }

  function validateDatabase(state, settings, taxYear) {
    const all = [];
    const tags = new Map();
    state.entities.forEach(entity => {
      const entityResult = DepreciationEngine.calculateEntity(entity, state.assets, settings, { autoApplyMidQuarter: state.preferences?.autoApplyMidQuarter !== false });
      all.push(...validateEntity(entity, settings[String(taxYear)], entityResult, taxYear));
      state.assets.filter(asset => asset.entityId === entity.id).forEach(asset => {
        all.push(...validateAsset(asset, entity, settings[String(DepreciationEngine.yearOf(asset.placedDate))], entityResult));
        if (asset.tag?.trim()) {
          const key = `${entity.id}:${asset.tag.trim().toLowerCase()}`;
          if (tags.has(key)) {
            all.push(issue("warning", "duplicate-tag", `Asset tag “${asset.tag}” is duplicated within ${entity.name}.`, "asset", asset.id, "tag"));
          } else tags.set(key, asset.id);
        }
      });
    });
    state.assets.filter(asset => !state.entities.some(entity => entity.id === asset.entityId)).forEach(asset => {
      all.push(issue("error", "orphan-asset", "Asset is assigned to a missing company.", "asset", asset.id, "entityId"));
    });
    const order = { error: 0, warning: 1, info: 2 };
    return all.sort((a, b) => order[a.severity] - order[b.severity] || a.message.localeCompare(b.message));
  }

  function counts(issues) {
    return issues.reduce((result, item) => {
      result[item.severity] = (result[item.severity] || 0) + 1;
      return result;
    }, { error: 0, warning: 0, info: 0 });
  }

  return { validateAsset, validateEntity, validateDatabase, counts };
})();
