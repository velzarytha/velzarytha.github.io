(() => {
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const store = VelzarythaStore;
  const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const money2 = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
  const number = (value, digits = 2) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(value) || 0);
  let wizardStep = 1;
  let currentScheduleAssetId = null;
  let currentScheduleSystem = "federal";
  let currentReportRows = [];
  let currentReportName = "velzarytha-report.csv";
  let importPayload = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  }
  function categoryData(key) { return VELZARYTHA_DATA.categories[key] || VELZARYTHA_DATA.categories.custom; }
  function entityName(id) { return store.state.entities.find(entity => entity.id === id)?.name || "Unassigned"; }
  function entityById(id) { return store.state.entities.find(entity => entity.id === id); }
  function yearSettings(year = store.state.activeTaxYear) { return store.settings[String(year)] || {}; }
  function profileFor(entity, year) {
    return entity?.taxProfiles?.[String(year)] || {
      businessTaxableIncome: null,
      section179CarryforwardIn: 0,
      bonusClassElections: {},
      stateProfileMode: entity?.state === "CA" ? "noBonus" : "federal",
      stateTaxableIncome: null,
      state179Limit: null,
      state179Threshold: null,
      stateSuvCap: null,
      stateBonusPercent: null
    };
  }
  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    setTimeout(() => $("toast").classList.remove("show"), 2600);
  }
  function emptyRow(columns, message) { return `<tr><td colspan="${columns}" class="empty-cell">${escapeHtml(message)}</td></tr>`; }
  function setTheme(theme) {
    store.state.theme = theme;
    document.documentElement.dataset.theme = theme;
    store.persist();
  }
  function download(name, blob) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 600);
  }
  function csvDownload(name, rows) {
    const csv = rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    download(name, new Blob([csv], { type: "text/csv;charset=utf-8" }));
  }
  function safeFile(value) { return String(value || "report").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(); }

  function init() {
    populateStaticSelects();
    bindEvents();
    setTheme(store.state.theme || "dark");
    $("activeTaxYear").value = store.state.activeTaxYear;
    ["electionYear", "reportYear", "form4562Year", "settingsYear"].forEach(id => $(id).value = store.state.activeTaxYear);
    updateVerifiedStatus();
    renderAll();
    if (localStorage.getItem("velzarytha-disclaimer-dismissed")) $("disclaimerBanner").hidden = true;
  }

  function populateStaticSelects() {
    const years = Object.keys(store.settings).sort();
    ["activeTaxYear", "electionYear", "reportYear", "form4562Year", "settingsYear"].forEach(id => {
      $(id).innerHTML = years.map(year => `<option value="${year}">${year}</option>`).join("");
    });
    $("assetCategory").innerHTML = Object.entries(VELZARYTHA_DATA.categories).map(([key, value]) => `<option value="${key}">${escapeHtml(value.label)}</option>`).join("");
    $("method").innerHTML = Object.entries(VELZARYTHA_DATA.methods).map(([key, value]) => `<option value="${key}">${escapeHtml(value)}</option>`).join("");
    $("convention").innerHTML = Object.entries(VELZARYTHA_DATA.conventions).map(([key, value]) => `<option value="${key}">${escapeHtml(value)}</option>`).join("");
    const states = `<option value="">Select state</option>${VELZARYTHA_DATA.states.map(state => `<option value="${state}">${state}</option>`).join("")}`;
    $("entityState").innerHTML = states;
    $("assetState").innerHTML = states;
  }

  function bindEvents() {
    $$(".nav-item").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
    $$('[data-action="add-asset"]').forEach(button => button.addEventListener("click", () => openAssetDialog()));
    $$('[data-action="import-csv"]').forEach(button => button.addEventListener("click", openImportDialog));
    $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => $(button.dataset.closeDialog).close()));
    document.addEventListener("click", event => {
      const tip = event.target.closest(".tip");
      if (tip) alert(tip.dataset.tip);
      const action = event.target.closest("[data-row-action]");
      if (action) handleRowAction(action.dataset.rowAction, action.dataset.id);
      const issue = event.target.closest("[data-review-action]");
      if (issue) handleReviewAction(issue.dataset.reviewAction, issue.dataset.id);
    });

    $("themeToggle").addEventListener("click", () => setTheme(store.state.theme === "dark" ? "light" : "dark"));
    $("quickReview").addEventListener("click", () => showView("review"));
    $("dismissDisclaimer").addEventListener("click", () => { $("disclaimerBanner").hidden = true; localStorage.setItem("velzarytha-disclaimer-dismissed", "1"); });
    $("activeTaxYear").addEventListener("change", event => {
      store.state.activeTaxYear = event.target.value;
      ["electionYear", "reportYear", "form4562Year", "settingsYear"].forEach(id => $(id).value = event.target.value);
      store.persist();
      updateVerifiedStatus();
      renderAll();
    });

    $("addEntity").addEventListener("click", () => openEntityDialog());
    $("entityForm").addEventListener("submit", saveEntity);
    $("assetForm").addEventListener("submit", saveAsset);
    $("previousStep").addEventListener("click", () => { wizardStep = Math.max(1, wizardStep - 1); updateWizard(); });
    $("nextStep").addEventListener("click", nextWizardStep);
    $("assetCategory").addEventListener("change", applyCategoryDefaults);
    $("assetEntity").addEventListener("change", applyEntityDefaults);
    $("generateTag").addEventListener("click", generateAssetTag);
    $("placedDate").addEventListener("change", () => { if (!$("dateAcquired").value) $("dateAcquired").value = $("placedDate").value; renderMethodRecommendation(); });
    ["businessMiles", "totalMiles"].forEach(id => $(id).addEventListener("input", autoBusinessUseFromMileage));
    ["businessUse", "section179Election", "listedProperty", "usedProperty", "usedPropertyEligible", "relatedParty", "vehicleGvwr"].forEach(id => $(id).addEventListener("input", validateTaxStep));

    $("assetSearch").addEventListener("input", renderAssets);
    $("entityFilter").addEventListener("change", renderAssets);
    $("assetStatusFilter").addEventListener("change", renderAssets);
    $("exportAssetsCsv").addEventListener("click", exportAssetsCsv);
    $("downloadTemplate").addEventListener("click", downloadCsvTemplate);
    $("backupData").addEventListener("click", backupData);
    $("restoreData").addEventListener("change", restoreData);

    $("loadElectionProfile").addEventListener("click", loadElectionForm);
    $("electionForm").addEventListener("submit", saveElectionProfile);
    $("profileStateMode").addEventListener("change", toggleStateCustomFields);

    $("buildReport").addEventListener("click", buildReport);
    $("printReport").addEventListener("click", () => printHtml("Velzarytha report", $("reportOutput").innerHTML));
    $("exportReportCsv").addEventListener("click", () => currentReportRows.length ? csvDownload(currentReportName, currentReportRows) : toast("Build a report first"));

    $("buildForm4562").addEventListener("click", buildForm4562);
    $("downloadForm4562Pdf").addEventListener("click", downloadForm4562Pdf);
    $("printForm4562").addEventListener("click", () => printHtml("Form 4562 Preview", $("form4562Output").innerHTML));

    $("refreshReview").addEventListener("click", renderReview);
    $("reviewSeverity").addEventListener("change", renderReviewList);
    $("reviewSearch").addEventListener("input", renderReviewList);
    $("runSelfTests").addEventListener("click", runSelfTests);

    $("auditSearch").addEventListener("input", renderAudit);
    $("auditAction").addEventListener("change", renderAudit);
    $("undoLastChange").addEventListener("click", () => { const result = store.undoLast(); toast(result.message); renderAll(); });
    $("exportAuditCsv").addEventListener("click", exportAuditCsv);

    $("settingsYear").addEventListener("change", loadSettingsForm);
    $("settingsForm").addEventListener("submit", saveSettingsForm);
    $("resetSettings").addEventListener("click", resetSettings);

    $$("[data-schedule-system]").forEach(button => button.addEventListener("click", () => {
      currentScheduleSystem = button.dataset.scheduleSystem;
      $$("[data-schedule-system]").forEach(item => item.classList.toggle("active", item === button));
      renderScheduleRows();
    }));
    $("printSchedule").addEventListener("click", () => printHtml($("scheduleTitle").textContent, $("scheduleDialog").innerHTML));
    $("downloadSingleSchedule").addEventListener("click", exportSingleSchedule);

    $("csvImportFile").addEventListener("change", readCsvImport);
    $("confirmImport").addEventListener("click", confirmCsvImport);
  }

  function showView(name) {
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
    $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === name));
    if (name === "review") renderReview();
    if (name === "audit") renderAudit();
    if (name === "settings") loadSettingsForm();
    if (name === "elections") refreshEntitySelects();
  }

  function updateVerifiedStatus() {
    const settings = yearSettings();
    $("verifiedStatus").textContent = `Rates last verified: ${settings.verifiedDate || "not recorded"}`;
  }

  function renderAll() {
    refreshEntitySelects();
    renderDashboard();
    renderAssets();
    renderEntities();
    renderReview();
    renderAudit();
    loadSettingsForm();
  }

  function refreshEntitySelects() {
    const options = store.state.entities.map(entity => `<option value="${entity.id}">${escapeHtml(entity.name)}</option>`).join("");
    $("assetEntity").innerHTML = `<option value="">Select company</option>${options}`;
    ["electionEntity", "reportEntity", "form4562Entity"].forEach(id => {
      const old = $(id).value;
      $(id).innerHTML = `<option value="">Select company</option>${options}`;
      if (store.state.entities.some(entity => entity.id === old)) $(id).value = old;
    });
    const oldFilter = $("entityFilter").value;
    $("entityFilter").innerHTML = `<option value="">All companies</option>${options}`;
    if (store.state.entities.some(entity => entity.id === oldFilter)) $("entityFilter").value = oldFilter;
  }

  function allEntityResults() {
    return store.state.entities.map(entity => DepreciationEngine.calculateEntity(entity, store.state.assets, store.settings, { autoApplyMidQuarter: store.state.preferences?.autoApplyMidQuarter !== false }));
  }

  function renderDashboard() {
    const year = Number(store.state.activeTaxYear);
    const results = allEntityResults();
    let federal = 0;
    let basis = 0;
    results.forEach(result => {
      const summary = DepreciationEngine.summarizeYear(result, year);
      federal += summary.federal;
      basis += summary.remainingFederalBasis;
    });
    const issues = ValidationEngine.validateDatabase(store.state, store.settings, year);
    const counts = ValidationEngine.counts(issues);
    $("metricAssets").textContent = store.state.assets.length;
    $("metricDepreciation").textContent = money(federal);
    $("metricBasis").textContent = money(basis);
    $("metricIssues").textContent = counts.error + counts.warning;
    $("recentAssetsBody").innerHTML = [...store.state.assets].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 7).map(asset => recentAssetRow(asset, results, year)).join("") || emptyRow(5, "No assets yet. Create a company and add an asset.");
    renderSystemAlerts(results, issues, year);
    renderAutomationStatus(results, year);
  }

  function recentAssetRow(asset, results, year) {
    const result = results.find(item => item.entity.id === asset.entityId)?.results.find(item => item.asset.id === asset.id);
    const row = result ? DepreciationEngine.rowForYear(result.federal, year) : null;
    return `<tr data-row-action="schedule" data-id="${asset.id}"><td><strong>${escapeHtml(asset.name)}</strong></td><td>${escapeHtml(entityName(asset.entityId))}</td><td>${asset.placedDate || "—"}</td><td>${money(row?.total || 0)}</td><td><span class="status">${asset.disposalDate ? "Disposed" : "Active"}</span></td></tr>`;
  }

  function renderSystemAlerts(results, issues, year) {
    const alerts = [];
    results.forEach(result => {
      const test = result.context.midQuarterByYear[String(year)];
      if (test?.triggered) alerts.push(`<div class="alert danger"><strong>${escapeHtml(result.entity.name)}: mid-quarter test triggered.</strong> Q4 tested basis is ${money(test.q4)} of ${money(test.total)} (${number(test.percent)}%). Automatic mid-quarter is ${store.state.preferences?.autoApplyMidQuarter !== false ? "enabled" : "disabled"}.</div>`);
    });
    const counts = ValidationEngine.counts(issues);
    if (counts.error) alerts.push(`<div class="alert danger"><strong>${counts.error} blocking data error${counts.error === 1 ? "" : "s"}.</strong> Open Data Review before producing reports.</div>`);
    if (!store.state.entities.length) alerts.push(`<div class="alert info"><strong>Start here:</strong> create a company, enter its tax-year profile, and then add assets.</div>`);
    $("systemAlerts").innerHTML = alerts.join("");
  }

  function renderAutomationStatus(results, year) {
    const midQuarterCount = results.filter(result => result.context.midQuarterByYear[String(year)]?.triggered).length;
    const missingIncome = results.filter(result => {
      const allocation = result.context.section179ByYear[String(year)];
      return allocation?.currentElected > 0 && !allocation.taxableIncomeEntered;
    }).length;
    const classOptouts = store.state.entities.reduce((sum, entity) => sum + Object.values(profileFor(entity, year).bonusClassElections || {}).filter(value => value === "optout").length, 0);
    const items = [
      { ok: store.state.preferences?.autoApplyMidQuarter !== false, title: "Mid-quarter automation", detail: store.state.preferences?.autoApplyMidQuarter !== false ? `Enabled; ${midQuarterCount} compan${midQuarterCount === 1 ? "y" : "ies"} triggered.` : "Disabled — conventions require manual review." },
      { ok: missingIncome === 0, title: "Section 179 income limits", detail: missingIncome ? `${missingIncome} company profile${missingIncome === 1 ? " is" : "s are"} missing taxable income.` : "Taxable-income fields are complete for elected entities." },
      { ok: true, title: "Class-level bonus elections", detail: `${classOptouts} class opt-out${classOptouts === 1 ? "" : "s"} tracked for ${year}.` },
      { ok: true, title: "Local persistence", detail: "Automatic local save is active; JSON backup is recommended." }
    ];
    $("automationStatus").innerHTML = items.map(item => `<div class="status-item ${item.ok ? "" : "warn"}"><i>${item.ok ? "✓" : "!"}</i><div><strong>${item.title}</strong><small>${item.detail}</small></div></div>`).join("");
  }

  function renderAssets() {
    const query = ($("assetSearch").value || "").trim().toLowerCase();
    const entityFilter = $("entityFilter").value;
    const status = $("assetStatusFilter").value;
    const assets = store.state.assets.filter(asset => {
      const text = `${asset.name} ${asset.tag || ""} ${entityName(asset.entityId)} ${categoryData(asset.category).label}`.toLowerCase();
      return (!query || text.includes(query)) && (!entityFilter || asset.entityId === entityFilter) && (!status || (status === "disposed") === Boolean(asset.disposalDate));
    });
    $("assetsBody").innerHTML = assets.map(asset => assetRow(asset)).join("") || emptyRow(8, "No matching assets.");
  }

  function assetRow(asset) {
    const data = categoryData(asset.category);
    return `<tr><td><strong>${escapeHtml(asset.name)}</strong></td><td>${escapeHtml(asset.tag || "—")}</td><td>${escapeHtml(entityName(asset.entityId))}</td><td>${escapeHtml(data.label)}</td><td>${asset.placedDate || "—"}</td><td>${money(DepreciationEngine.businessBasis({ ...asset, categoryData: data }))}</td><td>${escapeHtml(VELZARYTHA_DATA.methods[asset.method] || asset.method)}</td><td class="row-actions"><button data-row-action="schedule" data-id="${asset.id}">Schedules</button><button data-row-action="edit" data-id="${asset.id}">Edit</button><button data-row-action="duplicate" data-id="${asset.id}">Duplicate</button><button data-row-action="delete" data-id="${asset.id}">Delete</button></td></tr>`;
  }

  function renderEntities() {
    $("entitiesGrid").innerHTML = store.state.entities.map(entity => {
      const count = store.state.assets.filter(asset => asset.entityId === entity.id).length;
      const profile = profileFor(entity, store.state.activeTaxYear);
      return `<article class="entity-card"><div><span>${escapeHtml(entity.state || "US")}</span><h3>${escapeHtml(entity.name)}</h3><p>${escapeHtml(entity.ein || "No EIN/reference saved")}</p></div><div><strong>${count} asset${count === 1 ? "" : "s"}</strong><p>${profile.businessTaxableIncome === null || profile.businessTaxableIncome === undefined ? "Taxable income not entered" : `Taxable income ${money(profile.businessTaxableIncome)}`}</p></div><div class="row-actions"><button data-row-action="profile" data-id="${entity.id}">Tax profile</button><button data-row-action="edit-entity" data-id="${entity.id}">Edit</button><button data-row-action="delete-entity" data-id="${entity.id}">Delete</button></div></article>`;
    }).join("") || `<div class="empty-state panel"><strong>No companies yet</strong><p>Create a company or client to organize assets and elections.</p></div>`;
  }

  function openEntityDialog(entity = null) {
    $("entityForm").reset();
    $("entityId").value = entity?.id || "";
    $("entityName").value = entity?.name || "";
    $("entityEin").value = entity?.ein || "";
    $("entityState").value = entity?.state || "";
    $("entityNotes").value = entity?.notes || "";
    $("entityDialogTitle").textContent = entity ? "Edit company" : "Add company";
    $("entityDialog").showModal();
  }

  function saveEntity(event) {
    event.preventDefault();
    const existing = entityById($("entityId").value);
    const entity = {
      ...(existing || {}),
      id: existing?.id || store.uid(),
      name: $("entityName").value.trim(),
      ein: $("entityEin").value.trim(),
      state: $("entityState").value,
      notes: $("entityNotes").value.trim(),
      taxProfiles: existing?.taxProfiles || {}
    };
    if (!entity.name) return toast("Enter a company name");
    store.upsertEntity(entity);
    $("entityDialog").close();
    renderAll();
    toast("Company saved");
  }

  function openAssetDialog(asset = null) {
    if (!store.state.entities.length) { toast("Create a company first"); showView("entities"); return; }
    $("assetForm").reset();
    wizardStep = 1;
    $("assetId").value = asset?.id || "";
    if (asset) fillAssetForm(asset);
    else {
      $("assetEntity").value = store.state.entities[0].id;
      $("placedDate").value = new Date().toISOString().slice(0, 10);
      $("dateAcquired").value = $("placedDate").value;
      $("businessUse").value = 100;
      $("section179Priority").value = 100;
      $("bookConvention").value = "full-month";
      applyEntityDefaults();
      applyCategoryDefaults();
    }
    $("assetDialogTitle").textContent = asset ? "Edit asset" : "Add asset";
    updateWizard();
    $("assetDialog").showModal();
  }

  function fillAssetForm(asset) {
    const map = {
      assetName: "name", assetTag: "tag", assetEntity: "entityId", assetCategory: "category", dateAcquired: "dateAcquired", placedDate: "placedDate",
      costBasis: "costBasis", exchangeAdjustment: "exchangeAdjustment", landValue: "landValue", businessUse: "businessUse",
      priorFederalDepreciation: "priorFederalDepreciation", assetState: "state", recoveryPeriod: "recoveryPeriod", method: "method", convention: "convention",
      adsLife: "adsLife", section179Election: "section179Election", section179Priority: "section179Priority", bonusEligibilityOverride: "bonusEligibilityOverride",
      vehicleGvwr: "vehicleGvwr", businessMiles: "businessMiles", totalMiles: "totalMiles", mileageNotes: "mileageNotes", bookMethod: "bookMethod",
      bookLife: "bookLife", bookSalvage: "bookSalvage", bookConvention: "bookConvention", priorBookDepreciation: "priorBookDepreciation",
      priorAdsDepreciation: "priorAdsDepreciation", disposalDate: "disposalDate", disposalProceeds: "disposalProceeds", disposalExpenses: "disposalExpenses", assetNotes: "notes"
    };
    Object.entries(map).forEach(([id, key]) => { $(id).value = asset[key] ?? ""; });
    const booleans = ["conventionOverride", "adsRequired", "qipAttested", "evidenceAvailable", "evidenceWritten"];
    booleans.forEach(id => $(id).checked = Boolean(asset[id]));
    ["listedProperty", "usedProperty", "relatedParty"].forEach(id => $(id).value = String(Boolean(asset[id])));
    $("usedPropertyEligible").value = asset.usedPropertyEligible === true ? "true" : asset.usedPropertyEligible === false ? "false" : "";
    renderMethodRecommendation();
    validateTaxStep();
  }

  function applyEntityDefaults() {
    const entity = entityById($("assetEntity").value);
    if (entity && !$("assetState").value) $("assetState").value = entity.state || "";
  }

  function applyCategoryDefaults() {
    const data = categoryData($("assetCategory").value);
    $("recoveryPeriod").value = data.recovery;
    $("method").value = data.method;
    $("convention").value = "auto";
    $("conventionOverride").checked = false;
    $("adsLife").value = data.adsRecovery;
    $("listedProperty").value = String(Boolean(data.listed));
    $("bookLife").value = data.bookLife;
    $("bookMethod").value = data.bookMethod;
    $("qipAttestationField").style.display = data.qip ? "flex" : "none";
    if (data.nondepreciable) { $("businessUse").value = 0; $("section179Election").value = 0; }
    renderMethodRecommendation();
    validateTaxStep();
  }

  function renderMethodRecommendation() {
    const key = $("assetCategory").value;
    const data = categoryData(key);
    const explanations = {
      furniture: "7-year, 200% declining balance. Half-year is the default unless the entity-level Q4 test requires mid-quarter.",
      computers: "5-year, 200% declining balance. Computers are not automatically treated as listed property in this preset.",
      passengerVehicle: "5-year property with listed-property substantiation and passenger-auto annual limits.",
      heavySuv: "5-year property. The heavy-SUV Section 179 cap is applied separately from the entity annual limit.",
      heavyTruck: "5-year property. Confirm whether passenger-auto limitations or vehicle exceptions apply.",
      machinery: "7-year, 200% declining balance, subject to the entity-level mid-quarter test.",
      landImprovement: "15-year, 150% declining balance. Confirm the amount is a depreciable improvement rather than land.",
      residential: "27.5-year straight-line with the mid-month convention.",
      nonresidential: "39-year straight-line with the mid-month convention.",
      qip: "15-year property in this preset. QIP eligibility must be confirmed before Section 179 or bonus treatment.",
      intangible197: "15-year straight-line amortization over 180 months beginning with the acquisition month.",
      software: "3-year property; Section 179 and bonus eligibility require the software to meet applicable requirements.",
      land: "Land is non-depreciable. Track it for asset records but no depreciation schedule is generated.",
      custom: "Manual classification required. Verify class life, method, convention, Section 179 eligibility, bonus eligibility, and ADS life."
    };
    $("methodRecommendation").innerHTML = `<strong>Suggested treatment</strong>${explanations[key] || explanations.custom}<br><small>Preset: ${escapeHtml(VELZARYTHA_DATA.methods[data.method])}, ${data.recovery || 0} years, ${escapeHtml(VELZARYTHA_DATA.conventions[data.convention])}.</small>`;
  }

  function generateAssetTag() {
    const prefix = ($("assetCategory").value || "ASSET").slice(0, 4).toUpperCase();
    const year = DepreciationEngine.yearOf($("placedDate").value) || new Date().getFullYear();
    const entity = $("assetEntity").value;
    const count = store.state.assets.filter(asset => asset.entityId === entity && DepreciationEngine.yearOf(asset.placedDate) === year).length + 1;
    $("assetTag").value = `${prefix}-${year}-${String(count).padStart(3, "0")}`;
  }

  function autoBusinessUseFromMileage() {
    const business = Number($("businessMiles").value || 0);
    const total = Number($("totalMiles").value || 0);
    if (total > 0 && business <= total) $("businessUse").value = (business / total * 100).toFixed(2);
    validateTaxStep();
  }

  function nextWizardStep() {
    if (!validateWizardStep()) return;
    wizardStep = Math.min(6, wizardStep + 1);
    if (wizardStep === 6) renderAssetReview();
    updateWizard();
  }

  function updateWizard() {
    $$(".wizard-step").forEach(step => step.classList.toggle("active", Number(step.dataset.step) === wizardStep));
    $("stepLabel").textContent = `Step ${wizardStep} of 6`;
    $("stepProgress").style.width = `${wizardStep / 6 * 100}%`;
    $("previousStep").disabled = wizardStep === 1;
    $("nextStep").hidden = wizardStep === 6;
    $("saveAsset").hidden = wizardStep !== 6;
  }

  function validateWizardStep() {
    const required = wizardStep === 1 ? ["assetName", "assetEntity", "assetCategory"] : wizardStep === 2 ? ["placedDate", "costBasis"] : wizardStep === 3 ? ["recoveryPeriod", "method"] : [];
    for (const id of required) {
      if (!$(id).value && $("assetCategory").value !== "land") { $(id).focus(); toast("Complete the required fields"); return false; }
    }
    if (wizardStep === 4 && !validateTaxStep()) return false;
    return true;
  }

  function validateTaxStep() {
    const data = categoryData($("assetCategory").value);
    const messages = [];
    const cost = Number($("costBasis").value || 0) + Number($("exchangeAdjustment").value || 0) - Number($("landValue").value || 0);
    const use = Number($("businessUse").value || 0);
    const election = Number($("section179Election").value || 0);
    const settings = yearSettings(DepreciationEngine.yearOf($("placedDate").value) || store.state.activeTaxYear);
    if (use < 0 || use > 100) messages.push("Business use must be from 0% to 100%.");
    if (election > Math.max(0, cost * use / 100)) messages.push("Section 179 elected cost exceeds the estimated business basis.");
    if (election > settings.section179Limit) messages.push(`Election exceeds the configured annual limit of ${money(settings.section179Limit)}.`);
    if (election > 0 && !data.section179) messages.push("The selected category is not marked Section 179 eligible.");
    if (data.heavySuv && election > settings.suvCap) messages.push(`Heavy-SUV elected cost exceeds the configured vehicle cap of ${money(settings.suvCap)}.`);
    if ($("listedProperty").value === "true" && use <= 50 && election > 0) messages.push("Listed-property business use must exceed 50% for Section 179 in this estimate.");
    if (data.qip && !$("qipAttested").checked) messages.push("QIP eligibility has not been confirmed.");
    if (Number($("businessMiles").value || 0) > Number($("totalMiles").value || 0)) messages.push("Business miles cannot exceed total miles.");
    $("taxValidation").hidden = !messages.length;
    $("taxValidation").innerHTML = messages.map(message => escapeHtml(message)).join("<br>");
    return !messages.some(message => message.includes("exceeds the estimated business basis") || message.includes("must be from"));
  }

  function readAssetForm() {
    const value = id => $(id).value;
    const boolSelect = id => value(id) === "true";
    const existing = store.state.assets.find(asset => asset.id === value("assetId"));
    return {
      ...(existing || {}), id: existing?.id || store.uid(),
      name: value("assetName").trim(), tag: value("assetTag").trim(), entityId: value("assetEntity"), category: value("assetCategory"),
      dateAcquired: value("dateAcquired"), placedDate: value("placedDate"), costBasis: Number(value("costBasis") || 0), exchangeAdjustment: Number(value("exchangeAdjustment") || 0),
      landValue: Number(value("landValue") || 0), businessUse: Number(value("businessUse") || 0), priorFederalDepreciation: Number(value("priorFederalDepreciation") || 0), state: value("assetState"),
      recoveryPeriod: Number(value("recoveryPeriod") || 0), method: value("method"), convention: value("convention"), conventionOverride: $("conventionOverride").checked,
      adsLife: Number(value("adsLife") || 0), adsRequired: $("adsRequired").checked, section179Election: Number(value("section179Election") || 0), section179Priority: Number(value("section179Priority") || 100),
      bonusEligibilityOverride: value("bonusEligibilityOverride"), listedProperty: boolSelect("listedProperty"), usedProperty: boolSelect("usedProperty"),
      usedPropertyEligible: value("usedPropertyEligible") === "true" ? true : value("usedPropertyEligible") === "false" ? false : null, relatedParty: boolSelect("relatedParty"), qipAttested: $("qipAttested").checked,
      vehicleGvwr: Number(value("vehicleGvwr") || 0), businessMiles: Number(value("businessMiles") || 0), totalMiles: Number(value("totalMiles") || 0),
      evidenceAvailable: $("evidenceAvailable").checked, evidenceWritten: $("evidenceWritten").checked, mileageNotes: value("mileageNotes").trim(),
      bookMethod: value("bookMethod"), bookLife: Number(value("bookLife") || 0), bookSalvage: Number(value("bookSalvage") || 0), bookConvention: value("bookConvention"),
      priorBookDepreciation: Number(value("priorBookDepreciation") || 0), priorAdsDepreciation: Number(value("priorAdsDepreciation") || 0),
      disposalDate: value("disposalDate"), disposalProceeds: Number(value("disposalProceeds") || 0), disposalExpenses: Number(value("disposalExpenses") || 0), notes: value("assetNotes").trim()
    };
  }

  function renderAssetReview() {
    const asset = readAssetForm();
    const data = categoryData(asset.category);
    const entity = entityById(asset.entityId);
    const tempState = { ...store.state, assets: [...store.state.assets.filter(item => item.id !== asset.id), asset] };
    const result = DepreciationEngine.calculateEntity(entity, tempState.assets, store.settings, { autoApplyMidQuarter: store.state.preferences?.autoApplyMidQuarter !== false });
    const item = result.results.find(row => row.asset.id === asset.id);
    const first = item?.federal.rows[0];
    $("assetReview").innerHTML = `<strong>Review before saving</strong><p>${escapeHtml(asset.name)} · ${escapeHtml(entityName(asset.entityId))} · ${escapeHtml(data.label)}</p><div class="report-kpis"><div><span>Business basis</span><strong>${money(item?.federal.basis || 0)}</strong></div><div><span>Effective convention</span><strong>${escapeHtml(VELZARYTHA_DATA.conventions[item?.federal.convention] || item?.federal.convention)}</strong></div><div><span>First-year §179</span><strong>${money(first?.section179 || 0)}</strong></div><div><span>First-year bonus</span><strong>${money(first?.bonus || 0)}</strong></div></div>`;
  }

  function saveAsset(event) {
    event.preventDefault();
    const asset = readAssetForm();
    if (!asset.name || !asset.entityId || !asset.placedDate) return toast("Complete the required fields");
    store.upsertAsset(asset);
    $("assetDialog").close();
    renderAll();
    toast("Asset saved");
  }

  function handleRowAction(action, id) {
    if (action === "schedule") openSchedule(id);
    if (action === "edit") openAssetDialog(store.state.assets.find(asset => asset.id === id));
    if (action === "duplicate") duplicateAsset(id);
    if (action === "delete") deleteAsset(id);
    if (action === "edit-entity") openEntityDialog(entityById(id));
    if (action === "delete-entity") deleteEntity(id);
    if (action === "profile") { $("electionEntity").value = id; $("electionYear").value = store.state.activeTaxYear; showView("elections"); loadElectionForm(); }
  }

  function duplicateAsset(id) {
    const source = store.state.assets.find(asset => asset.id === id);
    if (!source) return;
    const copy = { ...store.clone(source), id: store.uid(), name: `${source.name} — copy`, tag: source.tag ? `${source.tag}-COPY` : "", createdAt: undefined, updatedAt: undefined };
    store.upsertAsset(copy);
    renderAll();
    toast("Asset duplicated");
  }
  function deleteAsset(id) {
    const asset = store.state.assets.find(item => item.id === id);
    if (asset && confirm(`Delete ${asset.name}?`)) { store.deleteAsset(id); renderAll(); toast("Asset deleted"); }
  }
  function deleteEntity(id) {
    const entity = entityById(id);
    if (!entity) return;
    if (store.state.assets.some(asset => asset.entityId === id)) return toast("Move or delete this company's assets first");
    if (confirm(`Delete ${entity.name}?`)) { store.deleteEntity(id); renderAll(); toast("Company deleted"); }
  }

  function loadElectionForm() {
    const entity = entityById($("electionEntity").value);
    const year = $("electionYear").value;
    if (!entity) return toast("Select a company");
    const profile = profileFor(entity, year);
    $("electionForm").hidden = false;
    $("profileTaxableIncome").value = profile.businessTaxableIncome ?? "";
    $("profile179CarryIn").value = profile.section179CarryforwardIn || 0;
    $("profileStateMode").value = profile.stateProfileMode || (entity.state === "CA" ? "noBonus" : "federal");
    $("profileStateTaxableIncome").value = profile.stateTaxableIncome ?? "";
    $("profileState179Limit").value = profile.state179Limit ?? "";
    $("profileState179Threshold").value = profile.state179Threshold ?? "";
    $("profileStateSuvCap").value = profile.stateSuvCap ?? "";
    $("profileStateBonus").value = profile.stateBonusPercent ?? "";
    $("bonusClassGrid").innerHTML = VELZARYTHA_DATA.bonusClassKeys.map(key => `<label class="election-card"><strong>${escapeHtml(key)}</strong><select data-bonus-class="${key}"><option value="default">Use statutory default</option><option value="claim">Claim if eligible</option><option value="optout">Elect out for this class</option></select></label>`).join("");
    $$('[data-bonus-class]').forEach(select => select.value = profile.bonusClassElections?.[select.dataset.bonusClass] || "default");
    toggleStateCustomFields();
    renderElectionSummary(entity, year);
  }

  function renderElectionSummary(entity, year) {
    const result = ReportEngine.buildEntityResult(store.state, store.settings, entity.id);
    const allocation = result.context.section179ByYear[String(year)] || {};
    $("section179ProfileSummary").innerHTML = [
      ["Qualified cost", allocation.qualifiedCost], ["Dollar limit", allocation.dollarLimit], ["Current elected", allocation.currentElected], ["Allowed deduction", allocation.allowedTotal], ["Carryforward out", allocation.carryforwardOut]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${money(value || 0)}</strong></div>`).join("");
  }

  function toggleStateCustomFields() {
    const custom = $("profileStateMode").value === "custom";
    $$(".state-custom").forEach(field => field.classList.toggle("hidden", !custom));
  }

  function saveElectionProfile(event) {
    event.preventDefault();
    const entity = entityById($("electionEntity").value);
    const year = $("electionYear").value;
    if (!entity) return toast("Select a company");
    const bonusClassElections = {};
    $$('[data-bonus-class]').forEach(select => bonusClassElections[select.dataset.bonusClass] = select.value);
    const profile = {
      businessTaxableIncome: $("profileTaxableIncome").value === "" ? null : Number($("profileTaxableIncome").value),
      section179CarryforwardIn: Number($("profile179CarryIn").value || 0),
      bonusClassElections,
      stateProfileMode: $("profileStateMode").value,
      stateTaxableIncome: $("profileStateTaxableIncome").value === "" ? null : Number($("profileStateTaxableIncome").value),
      state179Limit: $("profileState179Limit").value === "" ? null : Number($("profileState179Limit").value),
      state179Threshold: $("profileState179Threshold").value === "" ? null : Number($("profileState179Threshold").value),
      stateSuvCap: $("profileStateSuvCap").value === "" ? null : Number($("profileStateSuvCap").value),
      stateBonusPercent: $("profileStateBonus").value === "" ? null : Number($("profileStateBonus").value)
    };
    store.updateEntityTaxProfile(entity.id, year, profile);
    renderElectionSummary(entity, year);
    renderAll();
    toast("Election profile saved");
  }

  function openSchedule(assetId) {
    const asset = store.state.assets.find(item => item.id === assetId);
    const entity = entityById(asset?.entityId);
    if (!asset || !entity) return;
    currentScheduleAssetId = assetId;
    currentScheduleSystem = "federal";
    $$("[data-schedule-system]").forEach(button => button.classList.toggle("active", button.dataset.scheduleSystem === "federal"));
    const entityResult = ReportEngine.buildEntityResult(store.state, store.settings, entity.id);
    const item = entityResult.results.find(result => result.asset.id === assetId);
    $("scheduleTitle").textContent = asset.name;
    $("scheduleDialog").dataset.entityId = entity.id;
    $("scheduleSummary").innerHTML = `<article class="metric"><span>Federal basis</span><strong>${money(item.federal.basis)}</strong></article><article class="metric"><span>Section 179 elected</span><strong>${money(item.federal.elected179)}</strong></article><article class="metric"><span>Bonus</span><strong>${money(item.federal.bonus)}</strong></article><article class="metric"><span>Federal convention</span><strong>${escapeHtml(VELZARYTHA_DATA.conventions[item.federal.convention] || item.federal.convention)}</strong></article>`;
    $("scheduleWarnings").innerHTML = [...new Set([...(item.federal.warnings || []), ...(item.state.warnings || [])])].map(message => `<div class="alert danger">${escapeHtml(message)}</div>`).join("");
    $("scheduleDialog").showModal();
    renderScheduleRows();
  }

  function currentScheduleItem() {
    const asset = store.state.assets.find(item => item.id === currentScheduleAssetId);
    const entity = entityById(asset?.entityId);
    if (!asset || !entity) return null;
    return ReportEngine.buildEntityResult(store.state, store.settings, entity.id).results.find(result => result.asset.id === asset.id);
  }

  function renderScheduleRows() {
    const item = currentScheduleItem();
    if (!item) return;
    const schedule = item[currentScheduleSystem];
    $("scheduleBody").innerHTML = schedule.rows.map(row => `<tr><td>${row.year}</td><td>${money2(row.beginningBasis)}</td><td>${money2(row.section179 || 0)}</td><td>${money2(row.bonus || 0)}</td><td>${money2(row.regular || 0)}</td><td>${money2(row.total || 0)}</td><td>${money2(row.accumulated || 0)}</td><td>${money2(row.endingBasis || 0)}</td></tr>`).join("") || emptyRow(8, "No schedule for this system.");
    $("disposalScreen").innerHTML = item.disposal ? `<div class="warning-box"><strong>Disposal screening</strong><p>Net proceeds ${money2(item.disposal.netProceeds)} · adjusted basis ${money2(item.disposal.adjustedBasis)} · gain/loss ${money2(item.disposal.gainLoss)} · potential Section 1245 recapture ${money2(item.disposal.potential1245Recapture)}.</p><small>${escapeHtml(item.disposal.note)}</small></div>` : "";
  }

  function exportSingleSchedule() {
    const item = currentScheduleItem();
    if (!item) return;
    const rows = [["Asset", "System", "Year", "Beginning basis", "Section 179", "Bonus", "Regular", "Total", "Accumulated", "Ending basis"], ...item[currentScheduleSystem].rows.map(row => [item.asset.name, currentScheduleSystem, row.year, row.beginningBasis, row.section179 || 0, row.bonus || 0, row.regular || 0, row.total || 0, row.accumulated || 0, row.endingBasis || 0])];
    csvDownload(`${safeFile(item.asset.name)}-${currentScheduleSystem}-schedule.csv`, rows);
  }

  function buildReport() {
    const entityId = $("reportEntity").value;
    const year = Number($("reportYear").value);
    const type = $("reportType").value;
    if (!entityId) return toast("Select a company");
    if (type === "current") renderCurrentReport(ReportEngine.currentYearSchedule(store.state, store.settings, entityId, year));
    if (type === "comparison") renderComparisonReport(ReportEngine.bookTaxComparison(store.state, store.settings, entityId, year));
    if (type === "disposals") renderDisposalReport(ReportEngine.disposalReport(store.state, store.settings, entityId, year));
    if (type === "rollforward") renderRollforwardReport(ReportEngine.rollforward(store.state, store.settings, entityId, year));
  }

  function reportHeader(entity, year, title) { return `<div class="report-header"><div><p>VELZARYTHA SUPPORTING SCHEDULE</p><h2>${escapeHtml(entity.name)}</h2></div><div><strong>${escapeHtml(title)}</strong><p>Tax year ${year}</p></div></div>`; }

  function renderCurrentReport(data) {
    if (!data) return;
    const s = data.summary;
    currentReportName = `${safeFile(data.entityResult.entity.name)}-${data.year}-depreciation.csv`;
    currentReportRows = [["Asset", "Category", "Placed in service", "Section 179", "Bonus", "Regular", "Federal total", "Ending basis"], ...s.assets.map(item => [item.asset.name, categoryData(item.asset.category).label, item.asset.placedDate, item.federalRow?.section179 || 0, item.federalRow?.bonus || 0, item.federalRow?.regular || 0, item.federalRow?.total || 0, item.federalRow?.endingBasis || 0])];
    $("reportOutput").innerHTML = `${reportHeader(data.entityResult.entity, data.year, "Current-year depreciation")}<div class="report-kpis"><div><span>Section 179</span><strong>${money2(s.section179)}</strong></div><div><span>Bonus</span><strong>${money2(s.bonus)}</strong></div><div><span>Regular</span><strong>${money2(s.regular)}</strong></div><div><span>Federal total</span><strong>${money2(s.federal)}</strong></div></div><div class="table-wrap"><table><thead><tr><th>Asset</th><th>Category</th><th>Placed</th><th>§179</th><th>Bonus</th><th>Regular</th><th>Total</th><th>Ending basis</th></tr></thead><tbody>${s.assets.map(item => `<tr><td>${escapeHtml(item.asset.name)}</td><td>${escapeHtml(categoryData(item.asset.category).label)}</td><td>${item.asset.placedDate}</td><td>${money2(item.federalRow?.section179 || 0)}</td><td>${money2(item.federalRow?.bonus || 0)}</td><td>${money2(item.federalRow?.regular || 0)}</td><td>${money2(item.federalRow?.total || 0)}</td><td>${money2(item.federalRow?.endingBasis || 0)}</td></tr>`).join("") || emptyRow(8, "No depreciation rows for this year.")}</tbody></table></div><p class="report-footnote">Supporting estimate only. Review eligibility, conventions, elections, limitations, and state adjustments before filing.</p>`;
  }

  function renderComparisonReport(data) {
    if (!data) return;
    currentReportName = `${safeFile(data.entityResult.entity.name)}-${data.year}-book-tax-comparison.csv`;
    currentReportRows = [["Asset", "Federal", "Book", "ADS", "State", "Book less federal"], ...data.rows.map(row => [row.asset.name, row.federal, row.book, row.ads, row.state, row.temporaryDifference])];
    const totals = data.rows.reduce((sum, row) => ({ federal: sum.federal + row.federal, book: sum.book + row.book, ads: sum.ads + row.ads, state: sum.state + row.state, diff: sum.diff + row.temporaryDifference }), { federal: 0, book: 0, ads: 0, state: 0, diff: 0 });
    $("reportOutput").innerHTML = `${reportHeader(data.entityResult.entity, data.year, "Book / tax comparison")}<div class="report-kpis"><div><span>Federal</span><strong>${money2(totals.federal)}</strong></div><div><span>Book</span><strong>${money2(totals.book)}</strong></div><div><span>ADS</span><strong>${money2(totals.ads)}</strong></div><div><span>State</span><strong>${money2(totals.state)}</strong></div></div><div class="table-wrap"><table><thead><tr><th>Asset</th><th>Federal</th><th>Book</th><th>ADS</th><th>State</th><th>Book less federal</th></tr></thead><tbody>${data.rows.map(row => `<tr><td>${escapeHtml(row.asset.name)}</td><td>${money2(row.federal)}</td><td>${money2(row.book)}</td><td>${money2(row.ads)}</td><td>${money2(row.state)}</td><td class="${row.temporaryDifference >= 0 ? "difference-positive" : "difference-negative"}">${money2(row.temporaryDifference)}</td></tr>`).join("") || emptyRow(6, "No comparison rows.")}</tbody></table></div><p class="report-footnote">Temporary differences are shown as book depreciation less federal depreciation. This is not a deferred-tax calculation.</p>`;
  }

  function renderDisposalReport(data) {
    if (!data) return;
    currentReportName = `${safeFile(data.entityResult.entity.name)}-${data.year}-disposals.csv`;
    currentReportRows = [["Asset", "Disposal date", "Net proceeds", "Adjusted basis", "Gain/loss", "Potential 1245 recapture"], ...data.rows.map(row => [row.asset.name, row.asset.disposalDate, row.disposal.netProceeds, row.disposal.adjustedBasis, row.disposal.gainLoss, row.disposal.potential1245Recapture])];
    $("reportOutput").innerHTML = `${reportHeader(data.entityResult.entity, data.year, "Disposal screening")}<div class="table-wrap"><table><thead><tr><th>Asset</th><th>Disposal date</th><th>Net proceeds</th><th>Adjusted basis</th><th>Gain/loss</th><th>Potential §1245 recapture</th></tr></thead><tbody>${data.rows.map(row => `<tr><td>${escapeHtml(row.asset.name)}</td><td>${row.asset.disposalDate}</td><td>${money2(row.disposal.netProceeds)}</td><td>${money2(row.disposal.adjustedBasis)}</td><td>${money2(row.disposal.gainLoss)}</td><td>${money2(row.disposal.potential1245Recapture)}</td></tr>`).join("") || emptyRow(6, "No disposals in this year.")}</tbody></table></div><p class="report-footnote">Form 4797 classification and Section 1245/1250 treatment require professional review.</p>`;
  }

  function renderRollforwardReport(data) {
    if (!data) return;
    const t = data.totals;
    currentReportName = `${safeFile(data.entityResult.entity.name)}-${data.year}-rollforward.csv`;
    currentReportRows = [["Beginning basis", "Additions", "Disposed adjusted basis", "Depreciation", "Ending basis"], [t.beginningBasis, t.additions, t.disposalsBasis, t.depreciation, t.endingBasis]];
    $("reportOutput").innerHTML = `${reportHeader(data.entityResult.entity, data.year, "Fixed asset rollforward")}<div class="report-kpis"><div><span>Beginning basis</span><strong>${money2(t.beginningBasis)}</strong></div><div><span>Additions</span><strong>${money2(t.additions)}</strong></div><div><span>Depreciation</span><strong>${money2(t.depreciation)}</strong></div><div><span>Ending basis</span><strong>${money2(t.endingBasis)}</strong></div></div><div class="form-part"><h3>Rollforward equation</h3><div class="form-line"><div class="line-no">A</div><div>Beginning basis plus additions, less disposed adjusted basis and depreciation</div><strong>${money2(t.endingBasis)}</strong></div></div><p class="report-footnote">This planning rollforward is based on the generated schedules and entered disposal data.</p>`;
  }

  function buildForm4562() {
    const entityId = $("form4562Entity").value;
    const year = $("form4562Year").value;
    if (!entityId) return toast("Select a company");
    const data = ReportEngine.form4562Data(store.state, store.settings, entityId, year);
    if (!data) return;
    const issues = ValidationEngine.validateDatabase(store.state, store.settings, Number(year)).filter(issue => issue.objectId === entityId || data.entityResult.assets.some(asset => asset.id === issue.objectId));
    $("form4562Output").innerHTML = renderForm4562Html(data, issues);
    toast("Form 4562 preview generated");
  }

  function formLine(numberValue, label, amount) {
    return `<div class="form-line"><div class="line-no">${numberValue}</div><div>${label}</div><strong>${amount === null ? "NOT ENTERED" : money2(amount)}</strong></div>`;
  }

  function renderForm4562Html(data, issues) {
    const line6Rows = data.currentAssets.filter(item => item.federalRow?.section179).map(item => `<tr><td>${escapeHtml(item.asset.name)}</td><td>${money2(item.federal.basis)}</td><td>${money2(item.federalRow.section179)}</td></tr>`).join("") || `<tr><td colspan="3">No current-year Section 179 elections.</td></tr>`;
    const classRows = Object.entries(data.classes).map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${money2(value.basis)}</td><td>${money2(value.deduction)}</td></tr>`).join("") || `<tr><td colspan="3">No current-year non-listed GDS property.</td></tr>`;
    const listedRows = data.listed.map(item => `<tr><td>${escapeHtml(item.asset.name)}</td><td>${item.asset.placedDate}</td><td>${number(item.asset.businessUse)}%</td><td>${money2(item.federal.basis)}</td><td>${money2(item.federalRow?.total || 0)}</td><td>${money2(item.federalRow?.section179 || 0)}</td></tr>`).join("") || `<tr><td colspan="6">No listed property.</td></tr>`;
    const amortRows = data.amortization.map(item => `<tr><td>${escapeHtml(item.asset.name)}</td><td>${item.asset.placedDate}</td><td>${money2(item.federal.basis)}</td><td>${item.asset.recoveryPeriod} years</td><td>${money2(item.federalRow?.regular || 0)}</td></tr>`).join("") || `<tr><td colspan="5">No amortization assets.</td></tr>`;
    return `<div class="form-watermark">PREVIEW — NOT FOR FILING</div><article class="form-document"><header class="form-document-header"><div><strong>Form 4562</strong><p>Depreciation and Amortization</p><p>Simplified preview</p></div><div class="form-title"><h2>Depreciation and Amortization</h2><p>Including Information on Listed Property</p><p>Velzarytha supporting worksheet</p></div><div><strong>${data.year}</strong><p>Tax-year preview</p><p>NOT FOR FILING</p></div></header><div class="form-meta"><div><span>Name shown on return</span><strong>${escapeHtml(data.entity.name)}</strong></div><div><span>Business/activity</span><strong>Fixed assets</strong></div><div><span>Identifying number</span><strong>${escapeHtml(data.entity.ein || "Not entered")}</strong></div></div>
    <section class="form-part"><h3>Part I — Election To Expense Certain Property Under Section 179</h3>${formLine(1,"Maximum amount",data.lines[1])}${formLine(2,"Total cost of Section 179 property",data.lines[2])}${formLine(3,"Threshold cost before reduction",data.lines[3])}${formLine(4,"Reduction in limitation",data.lines[4])}${formLine(5,"Dollar limitation",data.lines[5])}<table class="form-subtable"><thead><tr><th>Line 6 property</th><th>Business basis</th><th>Elected cost</th></tr></thead><tbody>${line6Rows}</tbody></table>${formLine(7,"Listed-property elected cost",data.lines[7])}${formLine(8,"Total elected cost",data.lines[8])}${formLine(9,"Tentative deduction",data.lines[9])}${formLine(10,"Carryover from prior year",data.lines[10])}${formLine(11,"Business income limitation",data.lines[11])}${formLine(12,"Section 179 expense deduction estimate",data.lines[12])}${formLine(13,"Carryover to next year",data.lines[13])}</section>
    <section class="form-part"><h3>Part II — Special Depreciation Allowance and Other Depreciation</h3>${formLine(14,"Special depreciation allowance — non-listed property",data.lines[14])}</section>
    <section class="form-part"><h3>Part III — MACRS Depreciation</h3>${formLine(17,"Prior-year MACRS property",data.lines[17])}<table class="form-subtable"><thead><tr><th>Class</th><th>Current-year basis</th><th>Regular depreciation</th></tr></thead><tbody>${classRows}</tbody></table></section>
    <section class="form-part"><h3>Part IV — Summary</h3>${formLine(21,"Listed property",data.lines[21])}${formLine(22,"Total depreciation and amortization estimate",data.lines[22])}</section>
    <section class="form-part"><h3>Part V — Listed Property</h3><table class="form-subtable"><thead><tr><th>Property</th><th>Placed</th><th>Business use</th><th>Basis</th><th>Deduction</th><th>§179</th></tr></thead><tbody>${listedRows}</tbody></table>${formLine(25,"Listed-property bonus estimate",data.lines[25])}</section>
    <section class="form-part"><h3>Part VI — Amortization</h3><table class="form-subtable"><thead><tr><th>Description</th><th>Begins</th><th>Amount</th><th>Period</th><th>Current amortization</th></tr></thead><tbody>${amortRows}</tbody></table>${formLine(44,"Amortization total",data.lines[44])}</section>
    <div class="form-preview-note">PREVIEW — NOT FOR FILING. ${issues.length} unresolved review issue${issues.length === 1 ? "" : "s"} are associated with this company/year. This worksheet does not replace the official form, instructions, required elections, or professional review.</div></article>`;
  }

  function downloadForm4562Pdf() {
    const entityId = $("form4562Entity").value;
    const year = $("form4562Year").value;
    if (!entityId) return toast("Select a company");
    const data = ReportEngine.form4562Data(store.state, store.settings, entityId, year);
    if (!data) return;
    const blob = PdfEngine.createTextPdf("VELZARYTHA FORM 4562 PREVIEW — NOT FOR FILING", ReportEngine.form4562PdfLines(data));
    download(`${safeFile(data.entity.name)}-form-4562-preview-${year}.pdf`, blob);
    toast("Preview PDF downloaded");
  }

  function renderReview() {
    const issues = ValidationEngine.validateDatabase(store.state, store.settings, Number(store.state.activeTaxYear));
    const counts = ValidationEngine.counts(issues);
    $("reviewMetrics").innerHTML = `<article class="metric"><span>Errors</span><strong>${counts.error}</strong><small>Resolve before reports</small></article><article class="metric"><span>Warnings</span><strong>${counts.warning}</strong><small>Review facts and assumptions</small></article><article class="metric"><span>Information</span><strong>${counts.info}</strong><small>Advisory items</small></article><article class="metric"><span>Total checks</span><strong>${issues.length}</strong><small>Selected year and database</small></article>`;
    $("reviewList").dataset.issues = JSON.stringify(issues);
    renderReviewList();
  }

  function renderReviewList() {
    const issues = JSON.parse($("reviewList").dataset.issues || "[]");
    const severity = $("reviewSeverity").value;
    const query = ($("reviewSearch").value || "").toLowerCase();
    const filtered = issues.filter(issue => (!severity || issue.severity === severity) && (!query || issue.message.toLowerCase().includes(query)));
    $("reviewList").innerHTML = filtered.map(issue => `<article class="issue-card ${issue.severity}"><div class="issue-icon">${issue.severity === "error" ? "×" : issue.severity === "warning" ? "!" : "i"}</div><div><h3>${escapeHtml(issue.message)}</h3><p>${escapeHtml(issue.objectType)} · ${escapeHtml(issue.field || issue.code)}</p></div>${issue.objectType === "asset" ? `<button class="button secondary" data-review-action="asset" data-id="${issue.objectId}">Edit asset</button>` : issue.objectType === "entity" ? `<button class="button secondary" data-review-action="entity" data-id="${issue.objectId}">Open profile</button>` : `<button class="button secondary" data-review-action="settings" data-id="${issue.objectId}">Settings</button>`}</article>`).join("") || `<div class="empty-state panel"><strong>No matching issues</strong><p>The selected filter has no review items.</p></div>`;
  }

  function handleReviewAction(action, id) {
    if (action === "asset") openAssetDialog(store.state.assets.find(asset => asset.id === id));
    if (action === "entity") { $("electionEntity").value = id; $("electionYear").value = store.state.activeTaxYear; showView("elections"); loadElectionForm(); }
    if (action === "settings") showView("settings");
  }

  function runSelfTests() {
    const result = VelzarythaSelfTests.run();
    $("selfTestOutput").innerHTML = `<div class="test-results"><strong>${result.passed} passed · ${result.failed} failed</strong><ul>${result.results.map(test => `<li class="${test.passed ? "test-pass" : "test-fail"}">${test.passed ? "✓" : "×"} ${escapeHtml(test.name)} — ${escapeHtml(test.detail)}</li>`).join("")}</ul></div>`;
  }

  function renderAudit() {
    const query = ($("auditSearch").value || "").toLowerCase();
    const action = $("auditAction").value;
    const rows = store.state.audit.filter(entry => (!action || entry.action === action) && (!query || `${entry.summary} ${entry.objectType} ${entry.action}`.toLowerCase().includes(query)));
    $("auditList").innerHTML = rows.map(entry => `<article class="audit-card"><time>${new Date(entry.timestamp).toLocaleString()}</time><div><h3><span class="audit-pill">${escapeHtml(entry.action)}</span>${escapeHtml(entry.summary)}</h3><p>${escapeHtml(entry.objectType)} · ${escapeHtml(entry.objectId)}</p></div></article>`).join("") || `<div class="empty-state panel"><strong>No audit entries</strong><p>Changes will appear here.</p></div>`;
  }

  function exportAuditCsv() {
    csvDownload("velzarytha-audit-log.csv", [["Timestamp", "Action", "Object type", "Object ID", "Summary"], ...store.state.audit.map(entry => [entry.timestamp, entry.action, entry.objectType, entry.objectId, entry.summary])]);
  }

  function loadSettingsForm() {
    const settings = yearSettings($("settingsYear").value);
    if (!settings) return;
    $("verifiedDate").value = settings.verifiedDate || "";
    $("section179Limit").value = settings.section179Limit || 0;
    $("section179Threshold").value = settings.section179Threshold || 0;
    $("suvCap").value = settings.suvCap || 0;
    $("transitionBonusPercent").value = settings.transitionBonusPercent || 0;
    $("permanentBonusPercent").value = settings.permanentBonusPercent || 0;
    $("permanentBonusAcquiredAfter").value = settings.permanentBonusAcquiredAfter || "";
    $("mileageRate").value = settings.mileageRate || 0;
    $("midQuarterThreshold").value = settings.midQuarterThreshold || 40;
    $("settingsSourceNote").value = settings.sourceNote || "";
    [1, 2, 3, 4].forEach((numberValue, index) => { $(`autoBonus${numberValue}`).value = settings.autoCapsBonus?.[index] || 0; $(`autoNoBonus${numberValue}`).value = settings.autoCapsNoBonus?.[index] || 0; });
    $("autoApplyMidQuarter").checked = store.state.preferences?.autoApplyMidQuarter !== false;
    $("showAdvancedFields").checked = Boolean(store.state.preferences?.showAdvancedFields);
  }

  function saveSettingsForm(event) {
    event.preventDefault();
    const year = $("settingsYear").value;
    const next = store.clone(store.settings);
    next[year] = {
      section179Limit: Number($("section179Limit").value || 0), section179Threshold: Number($("section179Threshold").value || 0), suvCap: Number($("suvCap").value || 0),
      transitionBonusPercent: Number($("transitionBonusPercent").value || 0), permanentBonusPercent: Number($("permanentBonusPercent").value || 0), permanentBonusAcquiredAfter: $("permanentBonusAcquiredAfter").value,
      mileageRate: Number($("mileageRate").value || 0), midQuarterThreshold: Number($("midQuarterThreshold").value || 40),
      autoCapsBonus: [1, 2, 3, 4].map(numberValue => Number($(`autoBonus${numberValue}`).value || 0)), autoCapsNoBonus: [1, 2, 3, 4].map(numberValue => Number($(`autoNoBonus${numberValue}`).value || 0)),
      verifiedDate: $("verifiedDate").value, sourceNote: $("settingsSourceNote").value.trim()
    };
    store.state.preferences = { autoApplyMidQuarter: $("autoApplyMidQuarter").checked, showAdvancedFields: $("showAdvancedFields").checked };
    store.saveSettings(next, `Updated ${year} tax settings.`);
    updateVerifiedStatus();
    renderAll();
    toast("Settings saved");
  }

  function resetSettings() {
    if (!confirm("Restore the supplied tax-year settings?")) return;
    store.saveSettings(store.clone(VELZARYTHA_DATA.suppliedSettings), "Restored supplied tax-year settings.");
    populateStaticSelects();
    $("settingsYear").value = store.state.activeTaxYear;
    loadSettingsForm();
    renderAll();
    toast("Supplied settings restored");
  }

  function exportAssetsCsv() {
    csvDownload("velzarytha-assets.csv", [["Company", "EIN", "Asset", "Tag", "Category", "Acquired", "Placed in service", "Cost", "Business use", "Recovery", "Method", "Convention", "Section 179", "State", "Disposed"], ...store.state.assets.map(asset => [entityName(asset.entityId), entityById(asset.entityId)?.ein || "", asset.name, asset.tag, asset.category, asset.dateAcquired, asset.placedDate, asset.costBasis, asset.businessUse, asset.recoveryPeriod, asset.method, asset.conventionOverride ? asset.convention : "auto", asset.section179Election, asset.state, asset.disposalDate])]);
  }

  function downloadCsvTemplate() {
    const headers = VELZARYTHA_DATA.csvColumns;
    const example = ["Example Company", "12-3456789", "CA", "Office computer", "COMP-001", "computers", "2026-02-01", "2026-02-01", "2500", "0", "0", "100", "5", "200db", "auto", "0", "100", "false", "0", "0", "0", "CA", "3", "0", "0", "Delete this example row before import"];
    csvDownload("velzarytha-asset-import-template.csv", [headers, example]);
  }

  function backupData() {
    const payload = { version: 3, exportedAt: new Date().toISOString(), state: store.state, settings: store.settings };
    download(`velzarytha-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  }

  function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!payload.state || !payload.settings) throw new Error("Missing state or settings");
        if (!confirm("Replace current browser data with this backup?")) return;
        store.replaceAll(payload.state, payload.settings, `Restored backup ${file.name}.`);
        populateStaticSelects();
        renderAll();
        toast("Backup restored");
      } catch (error) { alert(`Invalid Velzarytha backup: ${error.message}`); }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function openImportDialog() {
    importPayload = null;
    $("csvImportFile").value = "";
    $("importPreview").innerHTML = `<div class="empty-state">No file selected.</div>`;
    $("confirmImport").disabled = true;
    $("importDialog").showModal();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(field); field = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(field); field = "";
        if (row.some(value => value.trim() !== "")) rows.push(row);
        row = [];
      } else field += char;
    }
    row.push(field); if (row.some(value => value.trim() !== "")) rows.push(row);
    return rows;
  }

  function readCsvImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => previewCsvImport(parseCsv(reader.result), file.name);
    reader.readAsText(file);
  }

  function previewCsvImport(rows, fileName) {
    const headers = (rows.shift() || []).map(value => value.trim().toLowerCase());
    const missing = VELZARYTHA_DATA.csvColumns.filter(column => !headers.includes(column));
    const errors = missing.length ? [`Missing required template columns: ${missing.join(", ")}`] : [];
    const entities = [];
    const assets = [];
    const existingEntities = new Map(store.state.entities.map(entity => [entity.name.trim().toLowerCase(), entity]));
    rows.forEach((row, rowIndex) => {
      const data = Object.fromEntries(headers.map((header, index) => [header, (row[index] || "").trim()]));
      if (!data.asset_name || !data.company || !data.placed_in_service || !data.cost_basis) { errors.push(`Row ${rowIndex + 2}: company, asset_name, placed_in_service, and cost_basis are required.`); return; }
      let entity = existingEntities.get(data.company.toLowerCase()) || entities.find(item => item.name.toLowerCase() === data.company.toLowerCase());
      if (!entity) {
        entity = { id: store.uid(), name: data.company, ein: data.ein, state: data.company_state, notes: "Created by CSV import", taxProfiles: {}, createdAt: store.now(), updatedAt: store.now() };
        entities.push(entity);
      }
      let category = data.category;
      if (!VELZARYTHA_DATA.categories[category]) {
        const match = Object.entries(VELZARYTHA_DATA.categories).find(([, value]) => value.label.toLowerCase() === category.toLowerCase());
        category = match?.[0] || "custom";
      }
      const preset = categoryData(category);
      const asset = {
        id: store.uid(), entityId: entity.id, name: data.asset_name, tag: data.asset_tag, category,
        dateAcquired: data.date_acquired || data.placed_in_service, placedDate: data.placed_in_service, costBasis: Number(data.cost_basis || 0), exchangeAdjustment: Number(data.exchange_adjustment || 0), landValue: Number(data.land_value || 0),
        businessUse: Number(data.business_use_percent || 100), recoveryPeriod: Number(data.recovery_period || preset.recovery), method: data.method || preset.method, convention: data.convention || "auto", conventionOverride: data.convention && data.convention !== "auto",
        section179Election: Number(data.section179_election || 0), section179Priority: Number(data.section179_priority || 100), bonusEligibilityOverride: "class-default", listedProperty: data.listed_property === "true" || preset.listed,
        usedProperty: false, usedPropertyEligible: null, relatedParty: false, qipAttested: false, vehicleGvwr: Number(data.vehicle_gvwr || 0), businessMiles: Number(data.business_miles || 0), totalMiles: Number(data.total_miles || 0), evidenceAvailable: false, evidenceWritten: false,
        state: data.state || entity.state, adsLife: preset.adsRecovery, adsRequired: false, bookMethod: "sl", bookLife: Number(data.book_life || preset.bookLife), bookSalvage: Number(data.book_salvage || 0), bookConvention: "full-month", priorFederalDepreciation: Number(data.prior_federal_depreciation || 0), priorBookDepreciation: 0, priorAdsDepreciation: 0,
        disposalDate: "", disposalProceeds: 0, disposalExpenses: 0, notes: data.notes, createdAt: store.now(), updatedAt: store.now()
      };
      if (store.state.assets.some(item => item.entityId === entity.id && item.tag && item.tag.toLowerCase() === asset.tag.toLowerCase())) errors.push(`Row ${rowIndex + 2}: duplicate tag ${asset.tag}.`);
      else assets.push(asset);
    });
    importPayload = { entities, assets, errors, fileName };
    $("importPreview").innerHTML = `<div class="import-summary"><div><strong>${rows.length}</strong><span>Rows read</span></div><div><strong>${assets.length}</strong><span>Valid assets</span></div><div><strong>${errors.length}</strong><span>Errors</span></div></div>${errors.length ? `<div class="import-errors">${errors.map(error => `<p>${escapeHtml(error)}</p>`).join("")}</div>` : `<div class="alert info">Ready to import ${assets.length} assets and create ${entities.length} companies.</div>`}`;
    $("confirmImport").disabled = !assets.length || missing.length > 0;
  }

  function confirmCsvImport() {
    if (!importPayload?.assets.length) return;
    store.importBatch(importPayload.entities, importPayload.assets, `Imported ${importPayload.assets.length} assets from ${importPayload.fileName}.`);
    $("importDialog").close();
    renderAll();
    toast(`${importPayload.assets.length} assets imported`);
    importPayload = null;
  }

  function printHtml(title, content) {
    const popup = window.open("", "_blank", "width=1000,height=800");
    if (!popup) return toast("Allow pop-ups to print this report");
    popup.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>body{font:12px Arial;color:#111;margin:28px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:6px;text-align:left}.metric-grid,.report-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.metric,.report-kpis>div{border:1px solid #999;padding:10px}.form-watermark{position:fixed;top:45%;left:15%;transform:rotate(-25deg);font-size:60px;color:rgba(150,0,0,.12);font-weight:bold}.form-part{border:1px solid #111;margin-top:10px}.form-part h3{background:#222;color:#fff;padding:5px;margin:0}.form-line{display:grid;grid-template-columns:40px 1fr 140px;border-top:1px solid #999}.form-line>*{padding:5px;border-right:1px solid #999}.form-preview-note,.alert,.warning-box{border:1px solid #900;padding:10px;margin-top:10px}.button,.icon-button,.schedule-tabs{display:none}</style></head><body>${content}</body></html>`);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);
  }

  init();
})();
