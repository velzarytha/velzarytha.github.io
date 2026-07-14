window.VelzarythaStore = (() => {
  const DATA_KEY = "velzarytha-fixed-assets-v3";
  const SETTINGS_KEY = "velzarytha-tax-settings-v3";
  const LEGACY_KEYS = ["velzarytha-fixed-assets-v2", "velzarytha-fixed-assets"];

  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const now = () => new Date().toISOString();

  function defaultState() {
    return {
      version: 3,
      activeTaxYear: "2026",
      theme: "dark",
      entities: [],
      assets: [],
      audit: [],
      preferences: { autoApplyMidQuarter: true, showAdvancedFields: false }
    };
  }

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function migrateLegacy(raw) {
    const next = defaultState();
    next.activeTaxYear = String(raw.activeTaxYear || "2026");
    next.theme = raw.theme || "dark";
    next.entities = (raw.entities || []).map(entity => ({
      ...entity,
      taxProfiles: entity.taxProfiles || {},
      createdAt: entity.createdAt || now(),
      updatedAt: entity.updatedAt || now()
    }));
    next.assets = (raw.assets || []).map(asset => ({
      ...asset,
      category: asset.category === "vehicle" ? "passengerVehicle" : asset.category,
      conventionOverride: asset.conventionOverride ?? false,
      section179Priority: Number(asset.section179Priority || 100),
      bonusEligibilityOverride: asset.bonusTreatment === "optout" ? "class-default" : "class-default",
      relatedParty: Boolean(asset.relatedParty),
      qipAttested: Boolean(asset.qipAttested),
      evidenceAvailable: Boolean(asset.evidenceAvailable || asset.mileageNotes),
      evidenceWritten: Boolean(asset.evidenceWritten || asset.mileageNotes),
      landValue: Number(asset.landValue || 0),
      priorFederalDepreciation: Number(asset.priorFederalDepreciation ?? asset.priorDepreciation ?? 0),
      priorBookDepreciation: Number(asset.priorBookDepreciation || 0),
      priorAdsDepreciation: Number(asset.priorAdsDepreciation || 0),
      bookLife: Number(asset.bookLife || VELZARYTHA_DATA.categories[asset.category]?.bookLife || asset.recoveryPeriod || 5),
      bookMethod: asset.bookMethod || "sl",
      bookConvention: asset.bookConvention || "full-month",
      bookSalvage: Number(asset.bookSalvage ?? asset.salvageValue ?? 0),
      adsLife: Number(asset.adsLife || VELZARYTHA_DATA.categories[asset.category]?.adsRecovery || asset.recoveryPeriod || 5),
      disposalExpenses: Number(asset.disposalExpenses || 0),
      createdAt: asset.createdAt || now(),
      updatedAt: asset.updatedAt || now()
    }));
    next.audit.push({ id: uid(), timestamp: now(), action: "migration", objectType: "system", objectId: "v3", summary: "Migrated data from an earlier Velzarytha version." });
    return next;
  }

  function loadState() {
    const current = loadJson(DATA_KEY, null);
    if (current?.version === 3) return current;
    for (const key of LEGACY_KEYS) {
      const legacy = loadJson(key, null);
      if (legacy) {
        const migrated = migrateLegacy(legacy);
        localStorage.setItem(DATA_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
    return defaultState();
  }

  function loadSettings() {
    const saved = loadJson(SETTINGS_KEY, null);
    return saved || clone(VELZARYTHA_DATA.suppliedSettings);
  }

  let state = loadState();
  let settings = loadSettings();

  function persist() {
    localStorage.setItem(DATA_KEY, JSON.stringify(state));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function audit(action, objectType, objectId, summary, before = null, after = null) {
    state.audit.unshift({ id: uid(), timestamp: now(), action, objectType, objectId, summary, before, after });
    state.audit = state.audit.slice(0, 1000);
  }

  function upsertEntity(entity) {
    const copy = clone(entity);
    const index = state.entities.findIndex(item => item.id === copy.id);
    if (index >= 0) {
      const before = clone(state.entities[index]);
      copy.updatedAt = now();
      state.entities[index] = copy;
      audit("update", "entity", copy.id, `Updated company ${copy.name}.`, before, clone(copy));
    } else {
      copy.id ||= uid();
      copy.taxProfiles ||= {};
      copy.createdAt = copy.createdAt || now();
      copy.updatedAt = now();
      state.entities.push(copy);
      audit("create", "entity", copy.id, `Created company ${copy.name}.`, null, clone(copy));
    }
    persist();
    return copy;
  }

  function deleteEntity(id) {
    const entity = state.entities.find(item => item.id === id);
    if (!entity) return false;
    state.entities = state.entities.filter(item => item.id !== id);
    audit("delete", "entity", id, `Deleted company ${entity.name}.`, clone(entity), null);
    persist();
    return true;
  }

  function upsertAsset(asset) {
    const copy = clone(asset);
    const index = state.assets.findIndex(item => item.id === copy.id);
    if (index >= 0) {
      const before = clone(state.assets[index]);
      copy.updatedAt = now();
      state.assets[index] = copy;
      audit("update", "asset", copy.id, `Updated asset ${copy.name}.`, before, clone(copy));
    } else {
      copy.id ||= uid();
      copy.createdAt = copy.createdAt || now();
      copy.updatedAt = now();
      state.assets.push(copy);
      audit("create", "asset", copy.id, `Created asset ${copy.name}.`, null, clone(copy));
    }
    persist();
    return copy;
  }

  function deleteAsset(id) {
    const asset = state.assets.find(item => item.id === id);
    if (!asset) return false;
    state.assets = state.assets.filter(item => item.id !== id);
    audit("delete", "asset", id, `Deleted asset ${asset.name}.`, clone(asset), null);
    persist();
    return true;
  }

  function updateEntityTaxProfile(entityId, year, profile) {
    const entity = state.entities.find(item => item.id === entityId);
    if (!entity) return null;
    const before = clone(entity.taxProfiles?.[year] || null);
    entity.taxProfiles ||= {};
    entity.taxProfiles[year] = clone(profile);
    entity.updatedAt = now();
    audit("update", "tax-profile", `${entityId}:${year}`, `Updated ${entity.name} tax profile for ${year}.`, before, clone(profile));
    persist();
    return entity.taxProfiles[year];
  }

  function saveSettings(nextSettings, summary = "Updated tax-year settings.") {
    const before = clone(settings);
    settings = clone(nextSettings);
    audit("update", "settings", "tax-years", summary, before, clone(settings));
    persist();
  }

  function replaceAll(nextState, nextSettings, summary = "Restored backup.") {
    const before = { state: clone(state), settings: clone(settings) };
    state = { ...defaultState(), ...clone(nextState), version: 3 };
    settings = clone(nextSettings || VELZARYTHA_DATA.suppliedSettings);
    audit("restore", "system", "database", summary, before, null);
    persist();
  }

  function importBatch(entities, assets, summary) {
    const beforeCounts = { entities: state.entities.length, assets: state.assets.length };
    entities.forEach(item => {
      if (!state.entities.some(existing => existing.id === item.id)) state.entities.push(clone(item));
    });
    assets.forEach(item => state.assets.push(clone(item)));
    audit("import", "system", "csv", summary, beforeCounts, { entities: state.entities.length, assets: state.assets.length });
    persist();
  }

  function undoLast() {
    const entry = state.audit.find(item => ["create","update","delete"].includes(item.action) && ["asset","entity"].includes(item.objectType));
    if (!entry) return { ok: false, message: "No reversible change found." };
    if (entry.objectType === "asset") {
      if (entry.action === "create") state.assets = state.assets.filter(item => item.id !== entry.objectId);
      if (entry.action === "delete" && entry.before) state.assets.push(clone(entry.before));
      if (entry.action === "update" && entry.before) {
        const index = state.assets.findIndex(item => item.id === entry.objectId);
        if (index >= 0) state.assets[index] = clone(entry.before);
      }
    }
    if (entry.objectType === "entity") {
      if (entry.action === "create") state.entities = state.entities.filter(item => item.id !== entry.objectId);
      if (entry.action === "delete" && entry.before) state.entities.push(clone(entry.before));
      if (entry.action === "update" && entry.before) {
        const index = state.entities.findIndex(item => item.id === entry.objectId);
        if (index >= 0) state.entities[index] = clone(entry.before);
      }
    }
    state.audit = state.audit.filter(item => item.id !== entry.id);
    audit("undo", entry.objectType, entry.objectId, `Undid: ${entry.summary}`);
    persist();
    return { ok: true, message: `Undid: ${entry.summary}` };
  }

  return {
    uid, now, clone,
    get state() { return state; },
    get settings() { return settings; },
    persist, audit, upsertEntity, deleteEntity, upsertAsset, deleteAsset,
    updateEntityTaxProfile, saveSettings, replaceAll, importBatch, undoLast
  };
})();
