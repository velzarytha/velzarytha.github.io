(() => {
  "use strict";

  const CAPITAL_GAINS_SCRIPT_URL =
    document.currentScript?.src || new URL("../js/capital-gains.js", window.location.href).href;
  const PDFJS_ASSET_BASE_URL = new URL("./", CAPITAL_GAINS_SCRIPT_URL).href;
  const PDFJS_MODULE_URL = new URL("./pdf.min.js", PDFJS_ASSET_BASE_URL).href;
  const PDFJS_WORKER_URL = new URL("./pdf.worker.min.js", PDFJS_ASSET_BASE_URL).href;
  /* Supporting PDF.js files were uploaded directly inside /js/. */
  const PDFJS_CMAP_URL = PDFJS_ASSET_BASE_URL;
  const PDFJS_STANDARD_FONT_URL = PDFJS_ASSET_BASE_URL;
  const PDFJS_WASM_URL = PDFJS_ASSET_BASE_URL;
  const PDFJS_ICC_URL = PDFJS_ASSET_BASE_URL;  const PDF_MAX_BYTES = 60 * 1024 * 1024;
  const PDF_MAX_PAGES = 500;
  let pdfJsModulePromise = null;

  const TESSERACT_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  const TESSERACT_LANGUAGE = "eng";

  const PDF_PAGE_TYPE_OPTIONS = [
    ["1099-b-transactions", "1099-B transaction details"],
    ["1099-b-continuation", "1099-B continuation"],
    ["1099-b-summary", "1099-B summary"],
    ["1099-da-transactions", "1099-DA digital asset transaction details"],
    ["1099-da-summary", "1099-DA digital asset summary"],
    ["1099-div", "1099-DIV"],
    ["1099-int", "1099-INT"],
    ["1099-oid", "1099-OID"],
    ["1099-misc", "1099-MISC / other tax form"],
    ["cover-summary", "Cover or statement summary"],
    ["supplemental", "Supplemental information"],
    ["scanned", "Scanned/image-only - OCR required"],
    ["blank", "Blank page"],
    ["unrecognized", "Unrecognized / needs review"]
  ];

  const DB_NAME = "velzarytha-capital-gains";
  const DB_VERSION = 1;
  const STORE_NAME = "workspace";
  const WORKSPACE_KEY = "current";
  const FALLBACK_KEY = "velzarytha.capitalGains.workspace.v1";
  const THEME_KEYS = ["velzarytha-theme", "velzarytha.theme", "theme"];

  const FEDERAL_CAPITAL_GAINS_RULES = {
    2025: {
      ordinaryBrackets: {
        single: [[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [626350, 0.35], [Infinity, 0.37]],
        mfj: [[23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24], [501050, 0.32], [751600, 0.35], [Infinity, 0.37]],
        mfs: [[11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24], [250525, 0.32], [375800, 0.35], [Infinity, 0.37]],
        hoh: [[17000, 0.10], [64850, 0.12], [103350, 0.22], [197300, 0.24], [250500, 0.32], [626350, 0.35], [Infinity, 0.37]],
        qss: [[23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24], [501050, 0.32], [751600, 0.35], [Infinity, 0.37]]
      },
      longTermThresholds: {
        single: { zero: 48350, fifteen: 533400 },
        mfj: { zero: 96700, fifteen: 600050 },
        mfs: { zero: 48350, fifteen: 300000 },
        hoh: { zero: 64750, fifteen: 566700 },
        qss: { zero: 96700, fifteen: 600050 }
      }
    },
    2026: {
      ordinaryBrackets: {
        single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
        mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
        mfs: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [384350, 0.35], [Infinity, 0.37]],
        hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
        qss: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]]
      },
      longTermThresholds: {
        single: { zero: 49450, fifteen: 545500 },
        mfj: { zero: 98900, fifteen: 613700 },
        mfs: { zero: 49450, fifteen: 306850 },
        hoh: { zero: 66200, fifteen: 579600 },
        qss: { zero: 98900, fifteen: 613700 }
      }
    }
  };

  const NIIT_THRESHOLDS = {
    single: 200000,
    mfj: 250000,
    mfs: 125000,
    hoh: 200000,
    qss: 250000
  };

  const FORM_8949_CATEGORIES = [
    "A", "B", "C", "G", "H", "I",
    "D", "E", "F", "J", "K", "L"
  ];

  const TRANSACTION_OWNER_OPTIONS = [
    ["taxpayer", "Taxpayer"],
    ["spouse", "Spouse"],
    ["joint", "Joint"]
  ];

  const ASSET_TYPE_OPTIONS = [
    ["stock", "Stock"],
    ["etf", "ETF"],
    ["mutual-fund", "Mutual fund"],
    ["digital-asset", "Digital asset"],
    ["other", "Other capital asset (not home/rental)"]
  ];

  const SOURCE_FORM_OPTIONS = [
    ["1099-b", "Form 1099-B / brokerage statement"],
    ["1099-da", "Form 1099-DA / digital asset statement"],
    ["manual", "No broker form / manual records"]
  ];

  const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const state = {
    transactions: [],
    importBatches: [],
    activeView: "overviewView",
    csvImport: null,
    pdfImport: null,
    importAudit: null,
    estimateSettings: defaultEstimateSettings(),
    importSetup: defaultImportSetup(),
    propertySales: [],
    propertySaleEditingId: "",
    currentReportTitle: "",
    currentReportHtml: "",
    ocrWorker: null,
    ocrScriptPromise: null,
    confirmAction: null,
    autoSaveTimer: null
  };

  const CSV_FIELDS = [
    { key: "description", label: "Description of property", required: true },
    { key: "owner", label: "Owner" },
    { key: "assetType", label: "Asset type" },
    { key: "sourceForm", label: "Source form" },
    { key: "symbol", label: "Symbol, CUSIP, or digital asset ID" },
    { key: "acquiredDate", label: "Date acquired" },
    { key: "soldDate", label: "Date sold", required: true },
    { key: "proceeds", label: "Proceeds", required: true },
    { key: "basis", label: "Cost basis" },
    { key: "fees", label: "Selling fees" },
    { key: "adjustmentCode", label: "Adjustment code" },
    { key: "adjustmentAmount", label: "Adjustment amount" },
    { key: "broker", label: "Broker name" },
    { key: "account", label: "Account label" },
    { key: "term", label: "Holding period" },
    { key: "basisReported", label: "Basis reporting status" }
  ];

  const CSV_ALIASES = {
    description: [
      "description",
      "securitydescription",
      "propertydescription",
      "assetdescription",
      "security",
      "name"
    ],
    owner: ["owner", "taxpayerowner", "transactionowner", "ownership", "taxpayerspouse"],
    assetType: ["assettype", "propertytype", "securitytype", "investmenttype", "assetclass"],
    sourceForm: ["sourceform", "taxform", "reportingform", "formtype", "source"],
    symbol: ["symbol", "ticker", "cusip", "symbolcusip", "assetid", "digitalassetid"],
    acquiredDate: [
      "dateacquired",
      "acquireddate",
      "acquisitiondate",
      "purchasedate",
      "buydate"
    ],
    soldDate: [
      "datesold",
      "solddate",
      "disposeddate",
      "dateofsale",
      "saledate",
      "datesoldordisposed"
    ],
    proceeds: [
      "proceeds",
      "salesproceeds",
      "saleproceeds",
      "salesprice",
      "grossproceeds",
      "amountreceived"
    ],
    basis: [
      "costbasis",
      "basis",
      "adjustedcostbasis",
      "costorotherbasis",
      "adjustedcost"
    ],
    fees: ["fees", "sellingfees", "commission", "commissions", "expenses"],
    adjustmentCode: ["adjustmentcode", "code", "form8949code"],
    adjustmentAmount: [
      "adjustmentamount",
      "adjustment",
      "washsale",
      "washsalelossdisallowed",
      "washsaleamount"
    ],
    broker: ["broker", "brokername", "financialinstitution", "institution"],
    account: ["account", "accountlabel", "accountname", "accountnumber"],
    term: ["term", "holdingperiod", "shortlong", "gainterm"],
    basisReported: [
      "basisreported",
      "basisreportedtoirs",
      "coveredstatus",
      "coverednoncovered",
      "reportingstatus"
    ]
  };

  const byId = (id) => document.getElementById(id);
  const on = (element, eventName, handler, options) => {
    if (element) {
      element.addEventListener(eventName, handler, options);
    }
  };

  const ui = {};

  document.addEventListener("DOMContentLoaded", init);

  window.addEventListener("error", (event) => {
    if (event?.error) {
      console.error("Capital Gains runtime error.", event.error);
    }
  });

  async function init() {
    cacheUi();

    // Optional workspaces must never prevent the core navigation and buttons
    // from receiving their event listeners.
    runInitializationStep("transaction metadata", ensureTransactionMetadataFields);
    runInitializationStep("review resolution", ensureReviewResolutionPanel);
    runInitializationStep("federal estimate", ensureEstimateWorkspace);
    runInitializationStep("import return setup", ensureImportReturnSetup);
    runInitializationStep("property sales", ensurePropertySalesWorkspace);

    if (ui.pdfFileSelection) ui.pdfFileSelection.textContent = "No PDF selected";

    runInitializationStep("theme", initTheme);
    runInitializationStep("event binding", bindEvents);
    runInitializationStep("current year", setCurrentYear);
    runInitializationStep("dependent fields", syncDependentFields);

    try {
      await loadWorkspace();
    } catch (error) {
      console.error("Capital Gains workspace load failed.", error);
    }

    runInitializationStep("workspace rendering", renderAll);

    // Final-report controls are intentionally initialized last. A report UI
    // problem must not disable Overview, Transactions, Import, Review,
    // Estimate, Property sales, theme, or navigation.
    runInitializationStep("final report controls", () => {
      ensureFinalReportControls();
      bindFinalReportControlEvents();
    });
  }

  function runInitializationStep(label, callback) {
    try {
      return callback();
    } catch (error) {
      console.error(`Capital Gains initialization step failed: ${label}.`, error);
      return null;
    }
  }

  function cacheUi() {
    const ids = [
      "transactionCount",
      "totalProceeds",
      "totalBasis",
      "netGainLoss",
      "shortTermTransactionCount",
      "shortTermProceeds",
      "shortTermBasis",
      "shortTermAdjustments",
      "shortTermGainLoss",
      "longTermTransactionCount",
      "longTermProceeds",
      "longTermBasis",
      "longTermAdjustments",
      "longTermGainLoss",
      "overviewChecksEmpty",
      "overviewIssueList",
      "transactionFormPanel",
      "transactionFormTitle",
      "transactionForm",
      "transactionId",
      "brokerName",
      "accountLabel",
      "assetDescription",
      "symbolCusip",
      "dateAcquired",
      "dateAcquiredVarious",
      "dateSold",
      "termOverride",
      "proceeds",
      "costBasis",
      "costBasisMissing",
      "fees",
      "adjustmentCode",
      "adjustmentAmount",
      "basisReported",
      "form8949Category",
      "transactionNotes",
      "transactionGainLossPreview",
      "transactionTermPreview",
      "transactionSearch",
      "termFilter",
      "categoryFilter",
      "transactionTableBody",
      "transactionEmptyState",
      "csvFileInput",
      "csvFileSelection",
      "pdfFileInput",
      "pdfFileSelection",
      "backupFileInput",
      "backupFileSelection",
      "importWorkspace",
      "importWorkspaceTitle",
      "importWorkspaceContent",
      "blockingIssueCount",
      "warningIssueCount",
      "duplicateIssueCount",
      "reviewEmptyState",
      "reviewIssueList",
      "form8949ReportButton",
      "scheduleDReportButton",
      "exportCsvButton",
      "printWorkspaceButton",
      "reportOutput",
      "saveWorkspaceButton",
      "backupButton",
      "confirmDialogBackdrop",
      "confirmDialogTitle",
      "confirmDialogMessage",
      "confirmDialogCancelButton",
      "confirmDialogConfirmButton",
      "toastRegion",
      "currentYear",
      "themeToggle"
    ];

    ids.forEach((id) => {
      ui[id] = byId(id);
    });
  }

  function ensureTransactionMetadataFields() {
    if (!ui.transactionForm) return;

    const existingOwner = byId("transactionOwner");
    if (existingOwner) {
      ui.transactionOwner = existingOwner;
      ui.transactionOwnerField = byId("transactionOwnerField");
      ui.assetType = byId("assetType");
      ui.sourceForm = byId("sourceForm");
      ensureForm8949CategoryOptions();
      ensureCategoryFilterOptions();
      updateBasisReportingOptionLabels();
      syncOwnerFieldVisibility();
      return;
    }

    const anchorField =
      ui.brokerName?.closest(".form-field") ||
      ui.brokerName?.closest("label") ||
      ui.brokerName?.parentElement;
    const container = anchorField?.parentElement || ui.transactionForm;

    const createSelectField = ({ fieldId, selectId, label, options, help }) => {
      const field = document.createElement("div");
      field.className = "form-field";
      field.id = fieldId;
      field.innerHTML = `
        <label for="${selectId}">${escapeHtml(label)}</label>
        <select id="${selectId}">
          ${options.map(([value, optionLabel]) => `<option value="${escapeHtml(value)}">${escapeHtml(optionLabel)}</option>`).join("")}
        </select>
        ${help ? `<small class="field-help">${escapeHtml(help)}</small>` : ""}
      `;
      return field;
    };

    const ownerField = createSelectField({
      fieldId: "transactionOwnerField",
      selectId: "transactionOwner",
      label: "Owner",
      options: TRANSACTION_OWNER_OPTIONS,
      help: "Shown for married filing statuses. Joint is the default for new married-return imports."
    });

    const assetField = createSelectField({
      fieldId: "assetTypeField",
      selectId: "assetType",
      label: "Asset type",
      options: ASSET_TYPE_OPTIONS,
      help: "Digital assets use Form 8949 categories G through L. Main-home and rental/business property sales remain separate pending modules."
    });

    const sourceField = createSelectField({
      fieldId: "sourceFormField",
      selectId: "sourceForm",
      label: "Reporting source",
      options: SOURCE_FORM_OPTIONS,
      help: "This records the statement type; it does not replace the saved import filename or PDF page."
    });

    [ownerField, assetField, sourceField].forEach((field) => {
      if (anchorField && anchorField.parentElement === container) {
        container.insertBefore(field, anchorField);
      } else {
        container.insertBefore(field, container.firstChild);
      }
    });

    ui.transactionOwnerField = ownerField;
    ui.transactionOwner = byId("transactionOwner");
    ui.assetType = byId("assetType");
    ui.sourceForm = byId("sourceForm");

    ensureForm8949CategoryOptions();
    ensureCategoryFilterOptions();
    updateBasisReportingOptionLabels();
    syncOwnerFieldVisibility();
  }

  function ensureForm8949CategoryOptions() {
    const select = ui.form8949Category;
    if (!select) return;

    const labels = {
      G: "G — Short-term digital asset, basis reported",
      H: "H — Short-term digital asset, basis not reported",
      I: "I — Short-term digital asset, no 1099-DA",
      J: "J — Long-term digital asset, basis reported",
      K: "K — Long-term digital asset, basis not reported",
      L: "L — Long-term digital asset, no 1099-DA"
    };

    ["G", "H", "I", "J", "K", "L"].forEach((category) => {
      if (select.querySelector(`option[value="${category}"]`)) return;
      const option = document.createElement("option");
      option.value = category;
      option.textContent = labels[category];
      select.appendChild(option);
    });
  }

  function ensureCategoryFilterOptions() {
    const select = ui.categoryFilter;
    if (!select) return;
    ["G", "H", "I", "J", "K", "L"].forEach((category) => {
      if (select.querySelector(`option[value="${category}"]`)) return;
      const option = document.createElement("option");
      option.value = category;
      option.textContent = `Category ${category}`;
      select.appendChild(option);
    });
  }

  function updateBasisReportingOptionLabels() {
    const select = ui.basisReported;
    if (!select) return;
    const noForm = select.querySelector('option[value="no-1099b"]');
    if (noForm) noForm.textContent = "No Form 1099-B or 1099-DA received";
  }

  function ensureReviewResolutionPanel() {
    const existing = byId("reviewResolutionSummary");
    if (existing) {
      ui.reviewResolutionSummary = existing;
      ui.reviewVerifiedTransactionCount = byId("reviewVerifiedTransactionCount");
      ui.reviewBlockingTransactionCount = byId("reviewBlockingTransactionCount");
      ui.reviewAdvisoryIssueCount = byId("reviewAdvisoryIssueCount");
      ui.reviewReportStatus = byId("reviewReportStatus");
      ui.reviewReadinessMessage = byId("reviewReadinessMessage");
      return;
    }

    const anchor = ui.reviewEmptyState || ui.reviewIssueList;
    if (!anchor?.parentElement) return;

    const panel = document.createElement("section");
    panel.id = "reviewResolutionSummary";
    panel.className = "panel";
    panel.style.marginBottom = "1rem";
    panel.innerHTML = `
      <div class="section-heading">
        <div>
          <span class="eyebrow">Resolution status</span>
          <h3>Report readiness</h3>
          <p>Blocking issues must be resolved before Form 8949 and Schedule D-style reports are enabled.</p>
        </div>
      </div>
      <div class="review-summary">
        <article class="review-card">
          <span class="review-card__label">Verified transactions</span>
          <strong id="reviewVerifiedTransactionCount">0</strong>
          <small>Included in verified gain/loss</small>
        </article>
        <article class="review-card">
          <span class="review-card__label">Blocking transactions</span>
          <strong id="reviewBlockingTransactionCount">0</strong>
          <small>Must be corrected</small>
        </article>
        <article class="review-card">
          <span class="review-card__label">Warnings and matches</span>
          <strong id="reviewAdvisoryIssueCount">0</strong>
          <small>Review recommended</small>
        </article>
        <article class="review-card">
          <span class="review-card__label">Reports</span>
          <strong id="reviewReportStatus">Not ready</strong>
          <small>Based on blocking issues</small>
        </article>
      </div>
      <div id="reviewReadinessMessage" role="status" style="margin-top:1rem;padding:0.85rem 1rem;border:1px solid var(--cg-border);border-radius:0.75rem;background:var(--cg-surface-soft);">
        Add or import transactions to begin review.
      </div>
    `;

    anchor.parentElement.insertBefore(panel, anchor);
    ui.reviewResolutionSummary = panel;
    ui.reviewVerifiedTransactionCount = byId("reviewVerifiedTransactionCount");
    ui.reviewBlockingTransactionCount = byId("reviewBlockingTransactionCount");
    ui.reviewAdvisoryIssueCount = byId("reviewAdvisoryIssueCount");
    ui.reviewReportStatus = byId("reviewReportStatus");
    ui.reviewReadinessMessage = byId("reviewReadinessMessage");
  }


  function ensureFinalReportControls() {
    const anchor = ui.form8949ReportButton?.parentElement;
    if (!anchor) return;

    let completeButton = byId("completePlanningReportButton");
    if (!completeButton) {
      completeButton = document.createElement("button");
      completeButton.id = "completePlanningReportButton";
      completeButton.type = "button";
      completeButton.className = "button button--secondary";
      completeButton.textContent = "Complete planning report";
      anchor.appendChild(completeButton);
    }

    let downloadButton = byId("downloadCurrentReportButton");
    if (!downloadButton) {
      downloadButton = document.createElement("button");
      downloadButton.id = "downloadCurrentReportButton";
      downloadButton.type = "button";
      downloadButton.className = "button button--secondary";
      downloadButton.textContent = "Download current report";
      downloadButton.disabled = true;
      anchor.appendChild(downloadButton);
    }

    let note = byId("reportOwnershipNote");
    if (!note) {
      note = document.createElement("p");
      note.id = "reportOwnershipNote";
      note.className = "field-hint";
      note.style.marginTop = "0.75rem";
      anchor.insertAdjacentElement("afterend", note);
    }

    ui.completePlanningReportButton = completeButton;
    ui.downloadCurrentReportButton = downloadButton;
    ui.reportOwnershipNote = note;
    updateReportOwnershipNote();
  }

  function bindFinalReportControlEvents() {
    const bindings = [
      [ui.completePlanningReportButton, generateCompletePlanningReport],
      [ui.downloadCurrentReportButton, downloadCurrentReport]
    ];

    bindings.forEach(([button, handler]) => {
      if (!button || button.dataset.cgReportBound === "true") return;
      button.addEventListener("click", handler);
      button.dataset.cgReportBound = "true";
    });
  }

  function updateReportOwnershipNote() {
    if (!ui.reportOwnershipNote) return;
    const status = normalizeEstimateSettings(state.estimateSettings).filingStatus;
    ui.reportOwnershipNote.textContent = status === "mfj"
      ? "Married filing jointly reports include 100% of Taxpayer, Spouse, and Joint transactions. Joint amounts are not divided by 50%."
      : status === "mfs"
        ? "Married filing separately reports include the transactions currently assigned to this workspace. Review Joint items before using the result."
        : "Reports use all verified transactions in this workspace.";
  }

  function bindEvents() {
    on(ui.themeToggle, "click", handleThemeToggle, { capture: true });

    document.querySelectorAll(".workspace-nav__item").forEach((button) => {
      on(button, "click", () => openView(button.dataset.viewTarget));
    });

    [
      byId("overviewAddTransactionButton"),
      byId("addTransactionButton"),
      byId("emptyStateAddTransactionButton")
    ].forEach((button) => {
      on(button, "click", () => openTransactionForm());
    });

    on(byId("closeTransactionFormButton"), "click", closeTransactionForm);
    on(byId("cancelTransactionButton"), "click", closeTransactionForm);
    on(ui.transactionForm, "submit", handleTransactionSubmit);
    on(ui.transactionForm, "input", updateTransactionPreview);
    on(ui.transactionForm, "change", updateTransactionPreview);

    on(ui.dateAcquiredVarious, "change", syncDependentFields);
    on(ui.costBasisMissing, "change", syncDependentFields);
    on(ui.assetType, "change", () => {
      syncAssetAndSourceFields("asset");
      updateTransactionPreview();
    });
    on(ui.sourceForm, "change", () => {
      syncAssetAndSourceFields("source");
      updateTransactionPreview();
    });

    on(ui.transactionSearch, "input", renderTransactionTable);
    on(ui.termFilter, "change", renderTransactionTable);
    on(ui.categoryFilter, "change", renderTransactionTable);

    on(ui.transactionTableBody, "click", handleTransactionTableClick);
    on(ui.overviewIssueList, "click", handleIssueAction);
    on(ui.reviewIssueList, "click", handleIssueAction);

    on(ui.saveWorkspaceButton, "click", async () => {
      const saved = await saveWorkspace();
      showToast(
        saved ? "Workspace saved in this browser." : "Could not save the workspace.",
        saved ? "success" : "error"
      );
    });

    on(ui.backupButton, "click", downloadBackup);
    on(ui.backupFileInput, "change", handleBackupRestore);
    on(ui.csvFileInput, "change", handleCsvFile);
    on(ui.pdfFileInput, "change", handlePdfFile);
    on(ui.importWorkspaceContent, "change", handleImportWorkspaceChange);
    on(ui.importWorkspaceContent, "click", handleImportWorkspaceClick);

    on(ui.form8949ReportButton, "click", generateForm8949Worksheet);
    on(ui.scheduleDReportButton, "click", generateScheduleDSummary);
    on(ui.exportCsvButton, "click", exportTransactionsCsv);
    on(ui.printWorkspaceButton, "click", () => window.print());

    [
      ui.estimateTaxYear,
      ui.estimateFilingStatus,
      ui.estimateOrdinaryTaxableIncome,
      ui.estimateShortCarryover,
      ui.estimateLongCarryover,
      ui.estimateCapitalGainDistributions,
      ui.estimateMagiBeforeGains,
      ui.estimateOtherNetInvestmentIncome,
      ui.estimateIncludeNiit
    ].forEach((field) => {
      on(field, "input", handleEstimateInput);
      on(field, "change", handleEstimateInput);
    });
    on(ui.estimateCalculateButton, "click", handleEstimateCalculate);
    on(ui.estimateResetButton, "click", handleEstimateReset);

    on(ui.importSetupFilingStatus, "change", handleImportSetupChange);
    on(ui.importSetupDefaultOwner, "change", handleImportSetupChange);
    on(ui.propertySaleForm, "submit", handlePropertySaleSubmit);
    on(ui.propertySaleForm, "input", renderPropertySalePreview);
    on(ui.propertySaleForm, "change", handlePropertySaleFormChange);
    on(ui.propertySaleResetButton, "click", resetPropertySaleForm);
    on(ui.propertySalesList, "click", handlePropertySalesListClick);

    on(ui.confirmDialogCancelButton, "click", hideConfirmDialog);
    on(ui.confirmDialogConfirmButton, "click", confirmDialogAction);
    on(ui.confirmDialogBackdrop, "click", (event) => {
      if (event.target === ui.confirmDialogBackdrop) {
        hideConfirmDialog();
      }
    });

    on(document, "keydown", (event) => {
      if (event.key === "Escape") {
        if (ui.confirmDialogBackdrop && !ui.confirmDialogBackdrop.hidden) {
          hideConfirmDialog();
        } else if (ui.transactionFormPanel && !ui.transactionFormPanel.hidden) {
          closeTransactionForm();
        }
      }
    });

    on(window, "pagehide", () => {
      saveWorkspaceFallbackSync();
    });

    on(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        saveWorkspaceFallbackSync();
      }
    });
  }

  function setCurrentYear() {
    if (ui.currentYear) {
      ui.currentYear.textContent = String(new Date().getFullYear());
    }
  }

  function readStoredTheme() {
    for (const key of THEME_KEYS) {
      try {
        const value = localStorage.getItem(key);
        if (value === "light" || value === "dark") return value;
      } catch (error) {
        console.warn("Theme preference could not be read.", error);
        break;
      }
    }

    return "";
  }

  function initTheme() {
    const rootTheme = document.documentElement.dataset.theme;
    const bodyTheme = document.body.dataset.theme;
    const savedTheme = readStoredTheme();
    const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

    const initialTheme = [rootTheme, bodyTheme, savedTheme, systemTheme].find(
      (value) => value === "light" || value === "dark"
    );

    applyTheme(initialTheme || "light", false);
  }

  function handleThemeToggle(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const currentTheme = document.documentElement.dataset.theme === "dark"
      || document.body.dataset.theme === "dark"
      ? "dark"
      : "light";

    applyTheme(currentTheme === "dark" ? "light" : "dark", true);
  }

  function applyTheme(theme, persist) {
    const resolvedTheme = theme === "dark" ? "dark" : "light";
    const darkMode = resolvedTheme === "dark";

    document.documentElement.dataset.theme = resolvedTheme;
    document.body.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;

    if (ui.themeToggle) {
      ui.themeToggle.setAttribute("aria-pressed", String(darkMode));
      ui.themeToggle.setAttribute(
        "aria-label",
        darkMode ? "Switch to light theme" : "Switch to dark theme"
      );
      ui.themeToggle.title = darkMode ? "Switch to light theme" : "Switch to dark theme";

      const label = ui.themeToggle.querySelector(".theme-button__text");
      if (label) label.textContent = darkMode ? "Light" : "Dark";
    }

    if (!persist) return;

    THEME_KEYS.forEach((key) => {
      try {
        localStorage.setItem(key, resolvedTheme);
      } catch (error) {
        console.warn("Theme preference could not be saved.", error);
      }
    });
  }

  function openView(viewId) {
    const target = byId(viewId);
    if (!target) return;

    state.activeView = viewId;

    document.querySelectorAll(".workspace-view").forEach((view) => {
      const isActive = view.id === viewId;
      view.hidden = !isActive;
      view.classList.toggle("is-active", isActive);
    });

    document.querySelectorAll(".workspace-nav__item").forEach((button) => {
      const isActive = button.dataset.viewTarget === viewId;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    if (viewId === "estimateView") renderEstimateWorkspace();
    if (viewId === "propertySalesView") renderPropertySalesWorkspace();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openTransactionForm(transactionId = "", options = {}) {
    openView("transactionsView");
    clearFormErrors();

    const transaction = transactionId
      ? state.transactions.find((item) => item.id === transactionId)
      : null;

    if (transaction) {
      populateTransactionForm(transaction);
      ui.transactionFormTitle.textContent = "Edit transaction";
    } else {
      ui.transactionForm.reset();
      ui.transactionForm.dataset.acquiredSpecial = "";
      ui.transactionId.value = "";
      if (ui.transactionOwner) ui.transactionOwner.value = defaultTransactionOwner();
      if (ui.assetType) ui.assetType.value = "stock";
      if (ui.sourceForm) ui.sourceForm.value = "manual";
      ui.termOverride.value = "auto";
      ui.basisReported.value = "no-1099b";
      ui.form8949Category.value = "auto";
      ui.transactionFormTitle.textContent = "Add transaction";
    }

    if (transaction && options.focus === "basis" && ui.costBasisMissing) {
      ui.costBasisMissing.checked = false;
    }

    syncDependentFields();
    updateTransactionPreview();
    ui.transactionFormPanel.hidden = false;

    requestAnimationFrame(() => {
      ui.transactionFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      focusTransactionResolutionField(options.focus);
    });
  }

  function focusTransactionResolutionField(focusTarget = "") {
    const fieldMap = {
      basis: ui.costBasis,
      term: ui.termOverride,
      category: ui.form8949Category,
      dates: ui.dateAcquired || ui.dateSold,
      amounts: ui.proceeds,
      adjustment: ui.adjustmentCode
    };
    const target = fieldMap[focusTarget] || ui.assetDescription;
    target?.focus();
    if (typeof target?.select === "function" && ["basis", "amounts"].includes(focusTarget)) {
      target.select();
    }
  }

  function closeTransactionForm() {
    if (!ui.transactionFormPanel) return;
    ui.transactionFormPanel.hidden = true;
    ui.transactionForm.reset();
    ui.transactionForm.dataset.acquiredSpecial = "";
    ui.transactionId.value = "";
    clearFormErrors();
    syncDependentFields();
    updateTransactionPreview();
  }

  function populateTransactionForm(transaction) {
    ui.transactionForm.dataset.acquiredSpecial = transaction.dateAcquiredSpecial || "";
    ui.transactionId.value = transaction.id;
    if (ui.transactionOwner) ui.transactionOwner.value = transaction.owner || "taxpayer";
    if (ui.assetType) ui.assetType.value = transaction.assetType || "stock";
    if (ui.sourceForm) ui.sourceForm.value = transaction.sourceForm || "manual";
    ui.brokerName.value = transaction.brokerName || "";
    ui.accountLabel.value = transaction.accountLabel || "";
    ui.assetDescription.value = transaction.assetDescription || "";
    ui.symbolCusip.value = transaction.symbolCusip || "";
    ui.dateAcquired.value = transaction.dateAcquired || "";
    ui.dateAcquiredVarious.checked = Boolean(transaction.dateAcquiredVarious);
    ui.dateSold.value = transaction.dateSold || "";
    ui.termOverride.value = transaction.termOverride || "auto";
    ui.proceeds.value = formatInputMoney(transaction.proceeds);
    ui.costBasis.value = transaction.costBasisMissing
      ? ""
      : formatInputMoney(transaction.costBasis);
    ui.costBasisMissing.checked = Boolean(transaction.costBasisMissing);
    ui.fees.value = formatInputMoney(transaction.fees);
    ui.adjustmentCode.value = transaction.adjustmentCode || "";
    ui.adjustmentAmount.value = formatInputMoney(transaction.adjustmentAmount);
    ui.basisReported.value = transaction.basisReported || "unknown";
    ui.form8949Category.value = transaction.form8949Category || "auto";
    ui.transactionNotes.value = transaction.transactionNotes || "";
  }

  function syncDependentFields() {
    syncOwnerFieldVisibility();
    syncAssetAndSourceFields("");

    if (ui.dateAcquired) {
      ui.dateAcquired.disabled = Boolean(ui.dateAcquiredVarious?.checked);
      if (ui.dateAcquiredVarious?.checked) {
        ui.dateAcquired.value = "";
      }
    }

    if (ui.costBasis) {
      ui.costBasis.disabled = Boolean(ui.costBasisMissing?.checked);
      if (ui.costBasisMissing?.checked) {
        ui.costBasis.value = "";
      }
    }

    updateTransactionPreview();
  }

  function isMarriedFilingStatus(status = state.estimateSettings?.filingStatus) {
    return status === "mfj" || status === "mfs";
  }

  function defaultTransactionOwner() {
    if (!isMarriedFilingStatus()) return "taxpayer";
    const configured = normalizeTransactionOwner(state.importSetup?.defaultOwner || "joint");
    return configured || "joint";
  }

  function syncOwnerFieldVisibility() {
    if (!ui.transactionOwnerField || !ui.transactionOwner) return;
    const married = isMarriedFilingStatus();
    ui.transactionOwnerField.hidden = !married;
    if (!married && !["taxpayer", "spouse", "joint"].includes(ui.transactionOwner.value)) {
      ui.transactionOwner.value = "taxpayer";
    }
  }

  function syncAssetAndSourceFields(changedField = "") {
    if (!ui.assetType || !ui.sourceForm || !ui.basisReported) return;

    if (changedField === "asset") {
      if (ui.assetType.value === "digital-asset") {
        ui.sourceForm.value = "1099-da";
        if (ui.basisReported.value === "no-1099b") ui.basisReported.value = "not-reported";
      } else if (ui.assetType.value !== "digital-asset" && ui.sourceForm.value === "1099-da") {
        ui.sourceForm.value = "1099-b";
        if (ui.basisReported.value === "no-1099b" || ui.basisReported.value === "not-reported") {
          ui.basisReported.value = "reported";
        }
      }
    }

    if (changedField === "source" && ui.sourceForm.value === "1099-da") {
      ui.assetType.value = "digital-asset";
    }

    const noBrokerForm = ui.sourceForm.value === "manual";
    if (noBrokerForm) {
      ui.basisReported.value = "no-1099b";
    } else if (changedField === "source" && ui.basisReported.value === "no-1099b") {
      ui.basisReported.value = "reported";
    }

    ui.basisReported.disabled = noBrokerForm;
    ui.basisReported.title = noBrokerForm
      ? "No broker form was selected, so this transaction is categorized as not reported on Form 1099-B or 1099-DA."
      : "";
  }

  function normalizeTransactionOwner(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["taxpayer", "spouse", "joint"].includes(normalized)) return normalized;
    if (["primary", "self", "taxpayer only", "taxpayer-only"].includes(normalized)) return "taxpayer";
    if (["wife", "husband", "spouse only", "spouse-only"].includes(normalized)) return "spouse";
    if (["both", "jointly", "shared"].includes(normalized)) return "joint";
    return "taxpayer";
  }

  function normalizeAssetType(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
    if (["stock", "stocks", "equity", "security", "securities"].includes(normalized)) return "stock";
    if (["etf", "exchange-traded-fund", "exchange-traded-funds"].includes(normalized)) return "etf";
    if (["mutual-fund", "mutual-funds", "fund"].includes(normalized)) return "mutual-fund";
    if (["digital-asset", "digital-assets", "crypto", "cryptocurrency", "bitcoin", "virtual-currency"].includes(normalized)) return "digital-asset";
    if (normalized === "other") return "other";
    return "stock";
  }

  function normalizeSourceForm(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
    if (["1099-b", "form-1099-b", "1099b", "broker", "brokerage"].includes(normalized)) return "1099-b";
    if (["1099-da", "form-1099-da", "1099da", "digital-asset-statement"].includes(normalized)) return "1099-da";
    if (["manual", "none", "no-form", "records"].includes(normalized)) return "manual";
    return "";
  }

  function ownerLabel(value) {
    return value === "spouse" ? "Spouse" : value === "joint" ? "Joint" : "Taxpayer";
  }

  function assetTypeLabel(value) {
    if (value === "etf") return "ETF";
    if (value === "mutual-fund") return "Mutual fund";
    if (value === "digital-asset") return "Digital asset";
    if (value === "other") return "Other capital asset";
    return "Stock";
  }

  function sourceFormLabel(value) {
    if (value === "1099-da") return "1099-DA";
    if (value === "1099-b") return "1099-B";
    return "Manual records";
  }

  function isDigitalAssetTransaction(transactionOrAssetType, sourceForm = "") {
    if (transactionOrAssetType && typeof transactionOrAssetType === "object") {
      return transactionOrAssetType.assetType === "digital-asset" ||
        transactionOrAssetType.sourceForm === "1099-da";
    }
    return transactionOrAssetType === "digital-asset" || sourceForm === "1099-da";
  }

  function updateTransactionPreview() {
    if (!ui.transactionGainLossPreview || !ui.transactionTermPreview) return;

    const proceeds = parseMoney(ui.proceeds?.value);
    const basisMissing = Boolean(ui.costBasisMissing?.checked);
    const basis = basisMissing ? NaN : parseMoney(ui.costBasis?.value);
    const fees = parseMoney(ui.fees?.value);
    const adjustment = parseMoney(ui.adjustmentAmount?.value);

    const safeProceeds = Number.isFinite(proceeds) ? proceeds : 0;
    const safeFees = Number.isFinite(fees) ? fees : 0;
    const safeAdjustment = Number.isFinite(adjustment) ? adjustment : 0;

    const term = determineTerm({
      dateAcquired: ui.dateAcquired?.value || "",
      dateAcquiredVarious: Boolean(ui.dateAcquiredVarious?.checked),
      dateAcquiredSpecial: ui.dateAcquiredVarious?.checked ? "various" : "",
      dateSold: ui.dateSold?.value || "",
      termOverride: ui.termOverride?.value || "auto"
    });

    if (basisMissing || !Number.isFinite(basis)) {
      ui.transactionGainLossPreview.textContent = "Unresolved";
      ui.transactionGainLossPreview.className = "";
      ui.transactionTermPreview.textContent = `${termLabel(term)} · Cost basis is required for a verified gain/loss`;
      return;
    }

    const gainLoss = safeProceeds - safeFees - basis + safeAdjustment;
    ui.transactionGainLossPreview.textContent = formatCurrency(gainLoss);
    applyAmountClass(ui.transactionGainLossPreview, gainLoss);
    ui.transactionTermPreview.textContent = termLabel(term);
  }

  function handleTransactionSubmit(event) {
    event.preventDefault();
    clearFormErrors();

    const formResult = readTransactionForm();
    if (!formResult.valid) {
      showToast("Review the highlighted transaction fields.", "error");
      focusFirstInvalidField();
      return;
    }

    const now = new Date().toISOString();
    const existingIndex = state.transactions.findIndex(
      (item) => item.id === formResult.transaction.id
    );

    if (existingIndex >= 0) {
      const existing = state.transactions[existingIndex];
      state.transactions[existingIndex] = {
        ...existing,
        ...formResult.transaction,
        reviewResolution: recordReviewFormCorrections(existing, formResult.transaction, now),
        updatedAt: now
      };
      showToast("Transaction updated and review status recalculated.", "success");
    } else {
      state.transactions.push({
        ...formResult.transaction,
        id: createId(),
        source: { type: "manual" },
        createdAt: now,
        updatedAt: now
      });
      showToast("Transaction added.", "success");
    }

    closeTransactionForm();
    renderAll();
    queueAutoSave();
  }

  function recordReviewFormCorrections(existing, updated, timestamp) {
    const resolution = normalizeReviewResolution(existing.reviewResolution);
    const history = [...resolution.history];

    const addEntry = (action, detail, beforeValue, afterValue) => {
      history.push({
        action,
        detail,
        beforeValue: beforeValue === undefined ? "" : String(beforeValue),
        afterValue: afterValue === undefined ? "" : String(afterValue),
        resolvedAt: timestamp
      });
    };

    if (existing.costBasisMissing && !updated.costBasisMissing && Number.isFinite(updated.costBasis)) {
      addEntry("basis-entered", "Missing cost basis entered during review", "Missing", updated.costBasis.toFixed(2));
    } else if (!updated.costBasisMissing && Number(existing.costBasis) !== Number(updated.costBasis)) {
      addEntry("basis-updated", "Cost basis updated during review", existing.costBasis, updated.costBasis);
    }

    if (existing.computedTerm !== updated.computedTerm || existing.termOverride !== updated.termOverride) {
      addEntry("term-confirmed", "Holding period updated during review", existing.computedTerm, updated.computedTerm);
    }

    if (existing.resolvedCategory !== updated.resolvedCategory || existing.form8949Category !== updated.form8949Category) {
      addEntry("category-updated", "Form 8949 category updated during review", existing.resolvedCategory, updated.resolvedCategory);
    }

    if (existing.owner !== updated.owner) {
      addEntry("owner-updated", "Transaction owner updated", ownerLabel(existing.owner), ownerLabel(updated.owner));
    }

    if (existing.assetType !== updated.assetType || existing.sourceForm !== updated.sourceForm) {
      addEntry(
        "asset-source-updated",
        "Asset type or reporting source updated",
        `${assetTypeLabel(existing.assetType)} / ${sourceFormLabel(existing.sourceForm)}`,
        `${assetTypeLabel(updated.assetType)} / ${sourceFormLabel(updated.sourceForm)}`
      );
    }

    const amountContextChanged = ["proceeds", "costBasis", "fees", "adjustmentAmount", "adjustmentCode"]
      .some((key) => String(existing[key] ?? "") !== String(updated[key] ?? ""));
    const categoryContextChanged = ["computedTerm", "termOverride", "basisReported", "form8949Category", "resolvedCategory", "assetType", "sourceForm"]
      .some((key) => String(existing[key] ?? "") !== String(updated[key] ?? ""));

    return {
      ...resolution,
      history: history.slice(-50),
      lastResolvedAt: history.length > resolution.history.length ? timestamp : resolution.lastResolvedAt,
      categoryConflictConfirmation: categoryContextChanged ? null : resolution.categoryConflictConfirmation,
      amountDifferenceConfirmation: amountContextChanged ? null : resolution.amountDifferenceConfirmation
    };
  }

  function readTransactionForm() {
    const errors = {};

    const owner = normalizeTransactionOwner(ui.transactionOwner?.value || defaultTransactionOwner());
    const assetType = normalizeAssetType(ui.assetType?.value || "stock");
    const sourceForm = normalizeSourceForm(ui.sourceForm?.value) || (assetType === "digital-asset" ? "1099-da" : "manual");
    const assetDescription = ui.assetDescription.value.trim();
    const dateSold = ui.dateSold.value;
    const dateAcquiredVarious = ui.dateAcquiredVarious.checked;
    const preservedSpecial = ui.transactionForm.dataset.acquiredSpecial || "";
    const dateAcquired = dateAcquiredVarious ? "" : ui.dateAcquired.value;
    const dateAcquiredSpecial = dateAcquiredVarious
      ? "various"
      : !dateAcquired && preservedSpecial === "inherited"
        ? "inherited"
        : "";
    const proceeds = parseMoney(ui.proceeds.value);
    const costBasisMissing = ui.costBasisMissing.checked;
    const costBasis = costBasisMissing ? 0 : parseMoney(ui.costBasis.value);
    const fees = parseMoney(ui.fees.value);
    const adjustmentAmount = parseMoney(ui.adjustmentAmount.value);

    if (!assetDescription) errors.assetDescription = "Enter a description of the property sold.";
    if (!dateSold) errors.dateSold = "Enter the sale or disposition date.";

    if (!ui.proceeds.value.trim()) {
      errors.proceeds = "Enter the sale proceeds.";
    } else if (!Number.isFinite(proceeds)) {
      errors.proceeds = "Enter a valid proceeds amount.";
    }

    if (!costBasisMissing && !ui.costBasis.value.trim()) {
      errors.costBasis = "Enter the cost basis or mark it as missing.";
    } else if (!costBasisMissing && !Number.isFinite(costBasis)) {
      errors.costBasis = "Enter a valid cost basis amount.";
    }
    if (ui.fees.value.trim() && !Number.isFinite(fees)) errors.fees = "Enter a valid fee amount.";
    if (ui.adjustmentAmount.value.trim() && !Number.isFinite(adjustmentAmount)) {
      errors.adjustmentAmount = "Enter a valid adjustment amount.";
    }
    if (dateAcquired && dateSold && compareIsoDates(dateSold, dateAcquired) < 0) {
      errors.dateSold = "The sale date cannot be earlier than the acquisition date.";
    }

    Object.entries(errors).forEach(([field, message]) => setFieldError(field, message));
    if (Object.keys(errors).length > 0) return { valid: false, transaction: null };

    const termOverride = ui.termOverride.value;
    const computedTerm = determineTerm({
      dateAcquired,
      dateAcquiredVarious,
      dateAcquiredSpecial,
      dateSold,
      termOverride
    });
    const basisReported = ui.basisReported.value;
    const selectedCategory = ui.form8949Category.value;
    const derivedCategory = deriveForm8949Category(
      computedTerm,
      basisReported,
      assetType,
      sourceForm
    );
    const resolvedCategory = selectedCategory === "auto" ? derivedCategory : selectedCategory;
    const safeBasis = Number.isFinite(costBasis) ? costBasis : 0;
    const safeFees = Number.isFinite(fees) ? fees : 0;
    const safeAdjustment = Number.isFinite(adjustmentAmount) ? adjustmentAmount : 0;

    return {
      valid: true,
      transaction: {
        id: ui.transactionId.value || "",
        owner,
        assetType,
        sourceForm,
        brokerName: ui.brokerName.value.trim(),
        accountLabel: maskAccountLabel(ui.accountLabel.value.trim()),
        assetDescription,
        symbolCusip: ui.symbolCusip.value.trim().toUpperCase(),
        dateAcquired,
        dateAcquiredVarious,
        dateAcquiredSpecial,
        dateSold,
        termOverride,
        computedTerm,
        proceeds,
        costBasis: safeBasis,
        costBasisMissing,
        fees: safeFees,
        adjustmentCode: ui.adjustmentCode.value,
        adjustmentAmount: safeAdjustment,
        basisReported,
        form8949Category: selectedCategory,
        resolvedCategory,
        transactionNotes: ui.transactionNotes.value.trim(),
        termSource: termOverride === "auto" ? "dates" : "user-override",
        termConfirmed: computedTerm === "short" || computedTerm === "long"
      }
    };
  }

  function setFieldError(field, message) {
    const input = ui[field];
    const error = byId(`${field}Error`);

    if (input) {
      input.classList.add("is-invalid");
      input.setAttribute("aria-invalid", "true");
    }

    if (error) {
      error.textContent = message;
    }
  }

  function clearFormErrors() {
    if (!ui.transactionForm) return;

    ui.transactionForm.querySelectorAll(".is-invalid").forEach((element) => {
      element.classList.remove("is-invalid");
      element.removeAttribute("aria-invalid");
    });

    ui.transactionForm.querySelectorAll(".field-error").forEach((element) => {
      element.textContent = "";
    });
  }

  function focusFirstInvalidField() {
    ui.transactionForm?.querySelector(".is-invalid")?.focus();
  }

  function handleTransactionTableClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const transactionId = button.dataset.id;
    const action = button.dataset.action;

    if (action === "edit") {
      openTransactionForm(transactionId);
      return;
    }

    if (action === "delete") {
      const transaction = state.transactions.find((item) => item.id === transactionId);
      if (!transaction) return;

      showConfirmDialog({
        title: "Delete transaction?",
        message: `Delete “${transaction.assetDescription}”? This action cannot be undone.`,
        confirmLabel: "Delete",
        onConfirm: () => deleteTransaction(transactionId)
      });
    }
  }

  function deleteTransaction(transactionId) {
    state.transactions = state.transactions.filter((item) => item.id !== transactionId);
    renderAll();
    queueAutoSave();
    showToast("Transaction deleted.", "success");
  }

  function renderAll() {
    state.transactions = state.transactions.map(normalizeTransaction);
    state.importBatches = state.importBatches.map(normalizeImportBatch);
    state.propertySales = state.propertySales.map(normalizePropertySale);
    ensureImportBatchHistory();
    renderSummary();
    renderTransactionTable();
    renderValidation();
    renderEstimateWorkspace();
    syncImportSetupInputs();
    renderPropertySalesWorkspace();
    if (!state.csvImport && !state.pdfImport) {
      renderImportBatchManager();
    }
    updateReportOwnershipNote();
  }

  function renderSummary() {
    const totals = summarizeTransactions(state.transactions);

    ui.transactionCount.textContent = String(state.transactions.length);
    ui.totalProceeds.textContent = formatCurrency(totals.all.proceeds);
    ui.totalBasis.textContent = formatCurrency(totals.all.basis);
    ui.netGainLoss.textContent = formatCurrency(totals.all.gainLoss);
    applyAmountClass(ui.netGainLoss, totals.all.gainLoss);

    const basisCard = ui.totalBasis.closest(".status-card");
    if (basisCard) {
      const label = basisCard.querySelector("span");
      const note = basisCard.querySelector("small");
      if (label) label.textContent = "Known cost basis";
      if (note) note.textContent = totals.all.unresolvedCount
        ? `Excludes ${totals.all.unresolvedCount} missing or unresolved basis item${totals.all.unresolvedCount === 1 ? "" : "s"}`
        : "Recorded cost or other basis";
    }

    const gainCard = ui.netGainLoss.closest(".status-card");
    if (gainCard) {
      const label = gainCard.querySelector("span");
      const note = gainCard.querySelector("small");
      if (label) label.textContent = "Verified gain/loss";
      if (note) note.textContent = totals.all.unresolvedCount
        ? `Excludes ${totals.all.unresolvedCount} unresolved transaction${totals.all.unresolvedCount === 1 ? "" : "s"}`
        : "Calculated from reviewed values";
    }

    renderVerificationComparison(totals.all);
    renderTermSummary("shortTerm", totals.short);
    renderTermSummary("longTerm", totals.long);
  }


  function ensureVerificationComparisonPanel() {
    let panel = byId("verificationComparisonPanel");
    if (panel) return panel;

    const overview = byId("overviewView");
    const summaryGrid = overview?.querySelector(".summary-grid");
    if (!overview || !summaryGrid) return null;

    panel = document.createElement("article");
    panel.className = "panel";
    panel.id = "verificationComparisonPanel";
    panel.innerHTML = `
      <div class="panel__heading">
        <div>
          <h3>Statement and verified comparison</h3>
          <p>Broker-reported gain/loss is retained for reconciliation. Verified gain/loss excludes transactions that still need basis, term, or category review.</p>
        </div>
      </div>
      <dl class="summary-list">
        <div>
          <dt>Broker statement-reported gain/loss</dt>
          <dd id="overviewStatementGainLoss">Not available</dd>
        </div>
        <div>
          <dt>Transactions with broker-reported amounts</dt>
          <dd id="overviewStatementCoverage">0 of 0</dd>
        </div>
        <div>
          <dt>Verified calculated gain/loss</dt>
          <dd id="overviewVerifiedGainLoss">$0.00</dd>
        </div>
        <div>
          <dt>Broker-reported amount still unresolved</dt>
          <dd id="overviewUnresolvedStatementGainLoss">$0.00</dd>
        </div>
        <div class="summary-list__total">
          <dt>Unresolved transactions</dt>
          <dd id="overviewUnresolvedTransactionCount">0</dd>
        </div>
      </dl>
    `;

    overview.insertBefore(panel, summaryGrid);
    return panel;
  }

  function renderVerificationComparison(totals) {
    const panel = ensureVerificationComparisonPanel();
    if (!panel) return;

    panel.hidden = totals.count === 0;

    const statementValue = byId("overviewStatementGainLoss");
    const coverageValue = byId("overviewStatementCoverage");
    const verifiedValue = byId("overviewVerifiedGainLoss");
    const unresolvedValue = byId("overviewUnresolvedStatementGainLoss");
    const unresolvedCount = byId("overviewUnresolvedTransactionCount");

    if (statementValue) {
      statementValue.textContent = totals.brokerReportedCount
        ? formatCurrency(totals.brokerReportedGainLoss)
        : "Not available";
      applyAmountClass(statementValue, totals.brokerReportedGainLoss);
    }

    if (coverageValue) {
      coverageValue.textContent = `${totals.brokerReportedCount} of ${totals.count}`;
    }

    if (verifiedValue) {
      verifiedValue.textContent = formatCurrency(totals.gainLoss);
      applyAmountClass(verifiedValue, totals.gainLoss);
    }

    if (unresolvedValue) {
      unresolvedValue.textContent = formatCurrency(totals.unresolvedStatementGainLoss);
      applyAmountClass(unresolvedValue, totals.unresolvedStatementGainLoss);
    }

    if (unresolvedCount) {
      unresolvedCount.textContent = String(totals.unresolvedCount);
    }
  }

  function renderTermSummary(prefix, totals) {
    const unresolvedText = totals.unresolvedCount
      ? ` · ${totals.unresolvedCount} unresolved`
      : "";
    ui[`${prefix}TransactionCount`].textContent = `${totals.count} ${
      totals.count === 1 ? "transaction" : "transactions"
    }${unresolvedText}`;
    ui[`${prefix}Proceeds`].textContent = formatCurrency(totals.proceeds);
    ui[`${prefix}Basis`].textContent = formatCurrency(totals.basis);
    ui[`${prefix}Adjustments`].textContent = formatCurrency(totals.adjustments);
    ui[`${prefix}GainLoss`].textContent = formatCurrency(totals.gainLoss);
    applyAmountClass(ui[`${prefix}GainLoss`], totals.gainLoss);
    ui[`${prefix}GainLoss`].title = totals.unresolvedCount
      ? `Verified amount only. ${totals.unresolvedCount} transaction${totals.unresolvedCount === 1 ? " is" : "s are"} unresolved.`
      : "Verified amount";
  }

  function summarizeTransactions(transactions) {
    const empty = () => ({
      count: 0,
      verifiedCount: 0,
      unresolvedCount: 0,
      proceeds: 0,
      basis: 0,
      fees: 0,
      adjustments: 0,
      gainLoss: 0,
      statementGainLoss: 0,
      brokerReportedGainLoss: 0,
      brokerReportedCount: 0,
      unresolvedStatementGainLoss: 0
    });

    const totals = { all: empty(), short: empty(), long: empty(), unknown: empty() };

    transactions.forEach((transaction) => {
      const bucket = transaction.computedTerm === "short"
        ? totals.short
        : transaction.computedTerm === "long"
          ? totals.long
          : totals.unknown;
      const verified = isTransactionCalculationReady(transaction);
      const statementAmount = getStatementReportedGainLoss(transaction);

      [totals.all, bucket].forEach((target) => {
        target.count += 1;
        target.proceeds += transaction.proceeds;
        target.basis += transaction.costBasisMissing ? 0 : transaction.costBasis;
        target.fees += transaction.fees;
        target.adjustments += transaction.adjustmentAmount;

        if (Number.isFinite(statementAmount)) {
          target.statementGainLoss += statementAmount;
          target.brokerReportedGainLoss += statementAmount;
          target.brokerReportedCount += 1;
        } else if (verified && Number.isFinite(transaction.calculatedGainLoss)) {
          // Reconciliation fallback for sources that do not print gain/loss.
          target.statementGainLoss += transaction.calculatedGainLoss;
        }

        if (verified) {
          target.verifiedCount += 1;
          target.gainLoss += transaction.calculatedGainLoss;
        } else {
          target.unresolvedCount += 1;
          if (Number.isFinite(statementAmount)) {
            target.unresolvedStatementGainLoss += statementAmount;
          }
        }
      });
    });

    return totals;
  }

  function renderTransactionTable() {
    if (!ui.transactionTableBody || !ui.transactionEmptyState) return;

    const query = (ui.transactionSearch?.value || "").trim().toLowerCase();
    const termFilter = ui.termFilter?.value || "all";
    const categoryFilter = ui.categoryFilter?.value || "all";

    const filtered = state.transactions.filter((transaction) => {
      const searchable = [
        transaction.assetDescription,
        transaction.symbolCusip,
        transaction.brokerName,
        transaction.accountLabel,
        ownerLabel(transaction.owner),
        assetTypeLabel(transaction.assetType),
        sourceFormLabel(transaction.sourceForm)
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = !query || searchable.includes(query);
      const matchesTerm = termFilter === "all" || transaction.computedTerm === termFilter;
      const matchesCategory =
        categoryFilter === "all" || transaction.resolvedCategory === categoryFilter;

      return matchesQuery && matchesTerm && matchesCategory;
    });

    ui.transactionTableBody.innerHTML = filtered
      .map((transaction) => transactionRowHtml(transaction))
      .join("");

    const tableWrap = ui.transactionTableBody.closest(".table-wrap");
    const heading = ui.transactionEmptyState.querySelector("h3");
    const paragraph = ui.transactionEmptyState.querySelector("p");
    const addButton = byId("emptyStateAddTransactionButton");

    if (state.transactions.length === 0) {
      tableWrap.hidden = true;
      ui.transactionEmptyState.hidden = false;
      heading.textContent = "No transactions yet";
      paragraph.textContent = "Add an individual transaction or import a brokerage CSV file.";
      addButton.hidden = false;
    } else if (filtered.length === 0) {
      tableWrap.hidden = true;
      ui.transactionEmptyState.hidden = false;
      heading.textContent = "No matching transactions";
      paragraph.textContent = "Change the search text or filters to see other transactions.";
      addButton.hidden = true;
    } else {
      tableWrap.hidden = false;
      ui.transactionEmptyState.hidden = true;
    }
  }

  function transactionRowHtml(transaction) {
    const sourceMeta = transaction.source?.type === "csv"
      ? [transaction.source.fileName, transaction.source.rowNumber ? `row ${transaction.source.rowNumber}` : ""].filter(Boolean).join(", ")
      : transaction.source?.type === "pdf"
        ? [
            transaction.source.fileName,
            Array.isArray(transaction.source.pageNumbers) && transaction.source.pageNumbers.length
              ? `page${transaction.source.pageNumbers.length === 1 ? "" : "s"} ${transaction.source.pageNumbers.join(", ")}`
              : transaction.source.pageNumber ? `page ${transaction.source.pageNumber}` : "",
            transaction.source.transactionId || ""
          ].filter(Boolean).join(", ")
        : "";

    const descriptionMeta = [
      ownerLabel(transaction.owner),
      assetTypeLabel(transaction.assetType),
      sourceFormLabel(transaction.sourceForm),
      transaction.symbolCusip,
      transaction.brokerName,
      sourceMeta
    ]
      .filter(Boolean).map(escapeHtml).join(" · ");
    const acquired = transaction.dateAcquiredSpecial === "inherited"
      ? "Inherited"
      : transaction.dateAcquiredVarious || transaction.dateAcquiredSpecial === "various"
        ? "Various"
        : formatDate(transaction.dateAcquired);
    const verified = isTransactionCalculationReady(transaction);
    const statementAmount = getStatementReportedGainLoss(transaction);
    const gainCell = verified
      ? `<span class="${amountClass(transaction.calculatedGainLoss)}">${formatCurrency(transaction.calculatedGainLoss)}</span>`
      : `<strong style="display:block;color:var(--cg-warning);">Unresolved</strong>${Number.isFinite(statementAmount) ? `<small style="display:block;color:var(--cg-text-muted);">Broker reported ${formatCurrency(statementAmount)}</small>` : ""}`;

    return `
      <tr>
        <td class="transaction-description">
          <strong>${escapeHtml(transaction.assetDescription)}</strong>
          ${descriptionMeta ? `<small>${descriptionMeta}</small>` : ""}
        </td>
        <td>${escapeHtml(acquired || "—")}</td>
        <td>${escapeHtml(formatDate(transaction.dateSold) || "—")}</td>
        <td>
          <span class="term-badge term-badge--${escapeHtml(transaction.computedTerm)}">${escapeHtml(shortTermLabel(transaction.computedTerm))}</span>
          <small style="display:block;margin-top:3px;color:var(--cg-text-muted);">${escapeHtml(termSourceLabel(transaction.termSource))}</small>
        </td>
        <td><span class="category-badge">${escapeHtml(transaction.resolvedCategory === "review" ? "?" : transaction.resolvedCategory)}</span></td>
        <td>${formatCurrency(transaction.proceeds)}</td>
        <td>${transaction.costBasisMissing ? "Missing" : formatCurrency(transaction.costBasis)}</td>
        <td>${formatCurrency(transaction.adjustmentAmount)}</td>
        <td>${gainCell}</td>
        <td><div class="transaction-actions">
          <button class="table-action" type="button" data-action="edit" data-id="${escapeHtml(transaction.id)}">Edit</button>
          <button class="table-action table-action--danger" type="button" data-action="delete" data-id="${escapeHtml(transaction.id)}">Delete</button>
        </div></td>
      </tr>`;
  }

  function renderValidation() {
    const issues = collectIssues(state.transactions);
    const blocking = issues.filter((issue) => issue.type === "error");
    const warnings = issues.filter((issue) => issue.type === "warning");
    const duplicates = issues.filter((issue) => issue.type === "duplicate");

    ui.blockingIssueCount.textContent = String(blocking.length);
    ui.warningIssueCount.textContent = String(warnings.length);
    ui.duplicateIssueCount.textContent = String(duplicates.length);

    const allIssues = [...blocking, ...warnings, ...duplicates];

    if (state.transactions.length === 0) {
      ui.overviewChecksEmpty.hidden = false;
      ui.overviewChecksEmpty.querySelector("h4").textContent = "No transactions entered";
      ui.overviewChecksEmpty.querySelector("p").textContent =
        "Add a transaction or import brokerage information to begin validation.";
      ui.overviewIssueList.hidden = true;
      ui.reviewEmptyState.hidden = false;
      ui.reviewIssueList.hidden = true;
    } else if (allIssues.length === 0) {
      ui.overviewChecksEmpty.hidden = false;
      ui.overviewChecksEmpty.querySelector("h4").textContent = "No review issues found";
      ui.overviewChecksEmpty.querySelector("p").textContent =
        "The current transactions passed the available workspace checks.";
      ui.overviewIssueList.hidden = true;

      ui.reviewEmptyState.hidden = false;
      ui.reviewEmptyState.querySelector("h3").textContent = "No review issues found";
      ui.reviewEmptyState.querySelector("p").textContent =
        "The current transactions passed the available workspace checks.";
      ui.reviewIssueList.hidden = true;
    } else {
      ui.overviewChecksEmpty.hidden = true;
      ui.overviewIssueList.hidden = false;
      ui.overviewIssueList.innerHTML = allIssues.slice(0, 5).map(issueHtml).join("");

      ui.reviewEmptyState.hidden = true;
      ui.reviewIssueList.hidden = false;
      ui.reviewIssueList.innerHTML = allIssues.map(issueHtml).join("");
    }

    const hasTransactions = state.transactions.length > 0;
    const reportsBlocked = blocking.length > 0;

    renderReviewReadiness({ blocking, warnings, duplicates });

    ui.form8949ReportButton.disabled = !hasTransactions || reportsBlocked;
    ui.scheduleDReportButton.disabled = !hasTransactions || reportsBlocked;
    ui.exportCsvButton.disabled = !hasTransactions;
    ui.printWorkspaceButton.disabled = !hasTransactions;

    const reportTitle = !hasTransactions
      ? "Add or import transactions before generating reports."
      : reportsBlocked
        ? `Resolve ${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"} before generating reports.`
        : "All blocking issues are resolved. Reports are ready.";
    ui.form8949ReportButton.title = reportTitle;
    ui.scheduleDReportButton.title = reportTitle;
  }

  function renderReviewReadiness({ blocking, warnings, duplicates }) {
    if (!ui.reviewResolutionSummary) return;

    const blockedTransactionIds = new Set(blocking.map((issue) => issue.transactionId).filter(Boolean));
    const verifiedCount = state.transactions.filter(isTransactionCalculationReady).length;
    const advisoryCount = warnings.length + duplicates.length;
    const reportReady = state.transactions.length > 0 && blocking.length === 0;

    ui.reviewVerifiedTransactionCount.textContent = String(verifiedCount);
    ui.reviewBlockingTransactionCount.textContent = String(blockedTransactionIds.size || blocking.length);
    ui.reviewAdvisoryIssueCount.textContent = String(advisoryCount);
    ui.reviewReportStatus.textContent = reportReady ? "Ready" : "Blocked";

    if (state.transactions.length === 0) {
      ui.reviewReadinessMessage.textContent = "Add a transaction or import brokerage information to begin review.";
      return;
    }

    if (blocking.length > 0) {
      ui.reviewReadinessMessage.textContent = `${blocking.length} blocking issue${blocking.length === 1 ? " remains" : "s remain"}. Use the action buttons below to enter missing basis, confirm holding period, or resolve the Form 8949 category.`;
      return;
    }

    ui.reviewReadinessMessage.textContent = advisoryCount > 0
      ? `All ${verifiedCount} transaction${verifiedCount === 1 ? " is" : "s are"} calculation-ready. ${advisoryCount} warning or possible-match item${advisoryCount === 1 ? " remains" : "s remain"} for review, but reports are enabled.`
      : `All ${verifiedCount} transaction${verifiedCount === 1 ? " is" : "s are"} verified and the reports are ready.`;
  }

  function collectIssues(transactions) {
    const issues = [];

    transactions.forEach((transaction) => {
      const statementAmount = getStatementReportedGainLoss(transaction);

      if (transaction.costBasisMissing) {
        issues.push({
          type: "error",
          title: "Cost basis is missing",
          message: `${transaction.assetDescription} was preserved and may reconcile to the broker statement, but its gain/loss is excluded from verified totals until basis is entered.${Number.isFinite(statementAmount) ? ` Broker-reported gain/loss: ${formatCurrency(statementAmount)}.` : ""}`,
          transactionId: transaction.id,
          actions: [{ action: "edit-basis", label: "Enter basis" }]
        });
      }

      if (transaction.computedTerm === "unknown") {
        issues.push({
          type: "error",
          title: "Holding period needs review",
          message: `${transaction.assetDescription} is not classified as short-term or long-term. Confirm the term from the broker statement or acquisition records.`,
          transactionId: transaction.id,
          actions: transaction.dateAcquiredSpecial === "inherited"
            ? [{ action: "set-term", value: "long", label: "Set long-term" }]
            : [
                { action: "set-term", value: "short", label: "Set short-term" },
                { action: "set-term", value: "long", label: "Set long-term" },
                { action: "edit-term", label: "Edit details" }
              ]
        });
      }

      if (transaction.resolvedCategory === "review") {
        issues.push({
          type: "error",
          title: "Form 8949 category needs review",
          message: `${transaction.assetDescription} could not be assigned to a Form 8949 category.`,
          transactionId: transaction.id,
          actions: FORM_8949_CATEGORIES.includes(deriveForm8949Category(transaction.computedTerm, transaction.basisReported, transaction.assetType, transaction.sourceForm))
            ? [
                {
                  action: "use-category",
                  value: deriveForm8949Category(transaction.computedTerm, transaction.basisReported, transaction.assetType, transaction.sourceForm),
                  label: `Use category ${deriveForm8949Category(transaction.computedTerm, transaction.basisReported, transaction.assetType, transaction.sourceForm)}`
                },
                { action: "edit-category", label: "Choose category" }
              ]
            : [{ action: "edit-category", label: "Choose category" }]
        });
      }

      if (transaction.dateAcquired && transaction.dateSold && compareIsoDates(transaction.dateSold, transaction.dateAcquired) < 0) {
        issues.push({
          type: "error",
          title: "Sale date is earlier than acquisition date",
          message: `${transaction.assetDescription} has inconsistent transaction dates.`,
          transactionId: transaction.id,
          actions: [{ action: "edit-dates", label: "Correct dates" }]
        });
      }

      if (transaction.dateAcquiredSpecial === "inherited" && transaction.computedTerm !== "long") {
        issues.push({
          type: "error",
          title: "Inherited property must be reviewed as long-term",
          message: `${transaction.assetDescription} is marked Inherited but is not classified as long-term.`,
          transactionId: transaction.id,
          actions: [{ action: "set-term", value: "long", label: "Set long-term" }]
        });
      }

      const derivedCategory = deriveForm8949Category(transaction.computedTerm, transaction.basisReported, transaction.assetType, transaction.sourceForm);
      if (
        transaction.form8949Category !== "auto" &&
        transaction.form8949Category !== "review" &&
        derivedCategory !== "review" &&
        transaction.form8949Category !== derivedCategory &&
        !isCategoryConflictConfirmed(transaction, derivedCategory)
      ) {
        issues.push({
          type: "warning",
          title: "Category conflicts with transaction details",
          message: `${transaction.assetDescription} is set to category ${transaction.form8949Category}, but its term and basis status suggest category ${derivedCategory}.`,
          transactionId: transaction.id,
          actions: [
            { action: "use-category", value: derivedCategory, label: `Use category ${derivedCategory}` },
            { action: "confirm-category", value: transaction.form8949Category, label: `Keep category ${transaction.form8949Category}` }
          ]
        });
      }

      if (transaction.adjustmentAmount !== 0 && !transaction.adjustmentCode) {
        issues.push({ type: "warning", title: "Adjustment amount has no code", message: `${transaction.assetDescription} includes an adjustment amount without an adjustment code.`, transactionId: transaction.id, actions: [{ action: "edit-adjustment", label: "Review adjustment" }] });
      }
      if (transaction.adjustmentCode && transaction.adjustmentAmount === 0) {
        issues.push({ type: "warning", title: "Adjustment code has no amount", message: `${transaction.assetDescription} includes code ${transaction.adjustmentCode} but no adjustment amount.`, transactionId: transaction.id, actions: [{ action: "edit-adjustment", label: "Review adjustment" }] });
      }

      if (
        isTransactionCalculationReady(transaction) &&
        Number.isFinite(statementAmount) &&
        Math.abs(statementAmount - transaction.calculatedGainLoss) >= 0.01 &&
        !isAmountDifferenceConfirmed(transaction, statementAmount)
      ) {
        issues.push({
          type: "warning",
          title: "Calculated amount differs from broker statement",
          message: `${transaction.assetDescription} calculates to ${formatCurrency(transaction.calculatedGainLoss)}, while the broker statement reports ${formatCurrency(statementAmount)}. Review basis, fees, and adjustments.`,
          transactionId: transaction.id,
          actions: [
            { action: "edit-amounts", label: "Review amounts" },
            { action: "confirm-amount", label: "Mark reviewed" }
          ]
        });
      }
    });

    findDuplicateGroups(transactions).forEach((group) => {
      const names = group.map((item) => item.assetDescription).join(", ");
      issues.push({
        type: "duplicate",
        title: "Possible duplicate transactions",
        message: `${group.length} transactions have matching broker/account, security, dates, proceeds, basis, fees, and adjustment values: ${names}. They may still be separate tax lots, so no row was removed automatically.`,
        transactionId: group[0].id
      });
    });

    if (state.importAudit?.legacySkippedDuplicateRows > 0) {
      const count = state.importAudit.legacySkippedDuplicateRows;
      const fileName = state.importAudit.fileName || "an earlier CSV import";
      issues.push({ type: "warning", title: "Earlier-version import skipped possible duplicates", message: `${count} row${count === 1 ? " was" : "s were"} skipped by an older version while importing ${fileName}. Re-import the source file with the current version if those rows may represent separate tax lots.`, action: "dismissImportAudit" });
    }
    if (state.importAudit?.invalidRows > 0) {
      const count = state.importAudit.invalidRows;
      const fileName = state.importAudit.fileName || "the last CSV";
      issues.push({ type: "warning", title: "CSV rows were skipped during validation", message: `${count} invalid row${count === 1 ? " was" : "s were"} not imported from ${fileName}. Check the source CSV for invalid or incomplete values.`, action: "dismissImportAudit" });
    }

    if (state.estimateSettings?.filingStatus === "mfs") {
      const jointCount = transactions.filter((transaction) => transaction.owner === "joint").length;
      if (jointCount > 0) {
        issues.push({
          type: "warning",
          title: "Joint transactions need allocation for separate returns",
          message: `${jointCount} joint transaction${jointCount === 1 ? " is" : "s are"} included in this workspace. Before filing Married Filing Separately returns, determine the amount reportable by each spouse under the applicable ownership rules.`
        });
      }
    }

    return issues;
  }

  function isCategoryConflictConfirmed(transaction, derivedCategory) {
    const confirmation = transaction.reviewResolution?.categoryConflictConfirmation;
    return Boolean(
      confirmation &&
      confirmation.category === transaction.form8949Category &&
      confirmation.derivedCategory === derivedCategory &&
      confirmation.term === transaction.computedTerm &&
      confirmation.basisReported === transaction.basisReported &&
      confirmation.assetType === transaction.assetType &&
      confirmation.sourceForm === transaction.sourceForm
    );
  }

  function isAmountDifferenceConfirmed(transaction, statementAmount) {
    const confirmation = transaction.reviewResolution?.amountDifferenceConfirmation;
    return Boolean(
      confirmation &&
      Math.abs(Number(confirmation.statementAmount) - Number(statementAmount)) < 0.005 &&
      Math.abs(Number(confirmation.calculatedAmount) - Number(transaction.calculatedGainLoss)) < 0.005
    );
  }

  function issueHtml(issue) {
    const styleType = issue.type === "duplicate" ? "info" : issue.type;
    const badgeLabel =
      issue.type === "error" ? "Required" : issue.type === "warning" ? "Review" : "Duplicate";
    const actions = Array.isArray(issue.actions) && issue.actions.length
      ? issue.actions
      : issue.transactionId
        ? [{ action: "edit", label: "Edit" }]
        : [];
    const actionButtons = actions.map((action) => `
      <button
        class="table-action"
        type="button"
        data-review-action="${escapeHtml(action.action)}"
        data-transaction-id="${escapeHtml(issue.transactionId || "")}"
        ${action.value === undefined ? "" : `data-review-value="${escapeHtml(action.value)}"`}
      >${escapeHtml(action.label)}</button>
    `).join("");

    return `
      <article class="issue-item issue-item--${styleType}">
        <div class="issue-item__content">
          <h4>${escapeHtml(issue.title)}</h4>
          <p>${escapeHtml(issue.message)}</p>
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:0.4rem;">
          <span class="issue-badge issue-badge--${styleType}">${badgeLabel}</span>
          ${actionButtons}
          ${
            issue.action === "dismissImportAudit"
              ? `<button class="table-action" type="button" data-dismiss-import-audit="true">Dismiss</button>`
              : ""
          }
        </div>
      </article>
    `;
  }

  async function handleIssueAction(event) {
    const actionButton = event.target.closest("button[data-review-action]");
    if (actionButton) {
      const action = actionButton.dataset.reviewAction;
      const transactionId = actionButton.dataset.transactionId;
      const value = actionButton.dataset.reviewValue || "";

      if (action === "edit") openTransactionForm(transactionId);
      if (action === "edit-basis") openTransactionForm(transactionId, { focus: "basis" });
      if (action === "edit-term") openTransactionForm(transactionId, { focus: "term" });
      if (action === "edit-category") openTransactionForm(transactionId, { focus: "category" });
      if (action === "edit-dates") openTransactionForm(transactionId, { focus: "dates" });
      if (action === "edit-amounts") openTransactionForm(transactionId, { focus: "amounts" });
      if (action === "edit-adjustment") openTransactionForm(transactionId, { focus: "adjustment" });
      if (action === "set-term") await resolveTransactionTerm(transactionId, value);
      if (action === "use-category") await resolveTransactionCategory(transactionId, value);
      if (action === "confirm-category") await confirmTransactionCategoryConflict(transactionId);
      if (action === "confirm-amount") await confirmTransactionAmountDifference(transactionId);
      return;
    }

    const dismissButton = event.target.closest("button[data-dismiss-import-audit]");
    if (dismissButton) {
      state.importAudit = null;
      renderValidation();
      queueAutoSave();
      showToast("Import review notice dismissed.", "success");
    }
  }

  async function applyTransactionResolution(transactionId, updater, successMessage) {
    const index = state.transactions.findIndex((transaction) => transaction.id === transactionId);
    if (index < 0) return;

    const current = state.transactions[index];
    const updated = updater(current);
    if (!updated) return;

    state.transactions[index] = normalizeTransaction(updated);
    renderAll();
    const saved = await saveWorkspace();
    showToast(
      saved ? `${successMessage} Saved in this browser.` : `${successMessage} Download a backup because browser storage failed.`,
      saved ? "success" : "error"
    );
  }

  function addResolutionHistory(transaction, action, detail, extraResolution = {}) {
    const now = new Date().toISOString();
    const resolution = normalizeReviewResolution(transaction.reviewResolution);
    return {
      ...transaction,
      reviewResolution: {
        ...resolution,
        ...extraResolution,
        history: [
          ...resolution.history,
          { action, detail, beforeValue: "", afterValue: "", resolvedAt: now }
        ].slice(-50),
        lastResolvedAt: now
      },
      updatedAt: now
    };
  }

  async function resolveTransactionTerm(transactionId, term) {
    if (!['short', 'long'].includes(term)) return;
    const transaction = state.transactions.find((item) => item.id === transactionId);
    if (!transaction) return;
    if (transaction.dateAcquiredSpecial === "inherited" && term !== "long") {
      showToast("Inherited property must remain long-term.", "error");
      return;
    }

    await applyTransactionResolution(transactionId, (current) => {
      const next = {
        ...current,
        termOverride: term,
        termSource: "user-override",
        termConfirmed: true,
        form8949Category: current.form8949Category === "review" ? "auto" : current.form8949Category
      };
      return addResolutionHistory(
        next,
        "term-confirmed",
        `Holding period confirmed as ${term === "short" ? "short-term" : "long-term"}`,
        { categoryConflictConfirmation: null }
      );
    }, `Holding period set to ${term === "short" ? "short-term" : "long-term"}.`);
  }

  async function resolveTransactionCategory(transactionId, category) {
    if (!FORM_8949_CATEGORIES.includes(category)) return;
    await applyTransactionResolution(transactionId, (current) => addResolutionHistory(
      {
        ...current,
        form8949Category: category
      },
      "category-updated",
      `Form 8949 category set to ${category}`,
      { categoryConflictConfirmation: null }
    ), `Form 8949 category set to ${category}.`);
  }

  async function confirmTransactionCategoryConflict(transactionId) {
    await applyTransactionResolution(transactionId, (current) => {
      const derivedCategory = deriveForm8949Category(current.computedTerm, current.basisReported, current.assetType, current.sourceForm);
      return addResolutionHistory(
        current,
        "category-conflict-reviewed",
        `Category ${current.form8949Category} retained after review; suggested category was ${derivedCategory}`,
        {
          categoryConflictConfirmation: {
            category: current.form8949Category,
            derivedCategory,
            term: current.computedTerm,
            basisReported: current.basisReported,
            assetType: current.assetType,
            sourceForm: current.sourceForm,
            confirmedAt: new Date().toISOString()
          }
        }
      );
    }, "Category choice marked as reviewed.");
  }

  async function confirmTransactionAmountDifference(transactionId) {
    await applyTransactionResolution(transactionId, (current) => {
      const statementAmount = getStatementReportedGainLoss(current);
      if (!Number.isFinite(statementAmount) || !Number.isFinite(current.calculatedGainLoss)) return null;
      return addResolutionHistory(
        current,
        "amount-difference-reviewed",
        "Difference between calculated and broker-reported gain/loss reviewed",
        {
          amountDifferenceConfirmation: {
            statementAmount,
            calculatedAmount: current.calculatedGainLoss,
            confirmedAt: new Date().toISOString()
          }
        }
      );
    }, "Amount difference marked as reviewed.");
  }

  function normalizeTransaction(transaction) {
    const source = transaction.source && typeof transaction.source === "object"
      ? transaction.source
      : { type: "manual" };
    const incomingSpecial = String(transaction.dateAcquiredSpecial || "").toLowerCase();
    const sourceAcquiredText = String(source?.originalValues?.acquiredDate || "").trim().toLowerCase();
    const dateAcquiredSpecial = ["various", "inherited"].includes(incomingSpecial)
      ? incomingSpecial
      : transaction.dateAcquiredVarious || sourceAcquiredText === "various"
        ? "various"
        : sourceAcquiredText === "inherited"
          ? "inherited"
          : "";
    const originalPrinted = source?.originalValues?.printedGain;
    const explicitStatementAmount = transaction.statementReportedGainLoss;
    const parsedStatementAmount = explicitStatementAmount === null || explicitStatementAmount === undefined || explicitStatementAmount === ""
      ? Number(originalPrinted)
      : Number(explicitStatementAmount);

    const normalized = {
      id: transaction.id || createId(),
      owner: normalizeTransactionOwner(transaction.owner),
      assetType: normalizeAssetType(
        transaction.assetType ||
        (String(transaction.sourceForm || "").toLowerCase().includes("1099-da") ||
        ["G", "H", "I", "J", "K", "L"].includes(String(transaction.form8949Category || "").toUpperCase())
          ? "digital-asset"
          : "stock")
      ),
      sourceForm: normalizeSourceForm(transaction.sourceForm) ||
        (String(transaction.sourceForm || "").toLowerCase().includes("1099-da") ||
        ["G", "H", "I", "J", "K", "L"].includes(String(transaction.form8949Category || "").toUpperCase())
          ? "1099-da"
          : transaction.source?.type === "pdf" ||
            transaction.source?.type === "csv" ||
            ["reported", "not-reported"].includes(String(transaction.basisReported || "")) ||
            ["A", "B", "D", "E"].includes(String(transaction.form8949Category || "").toUpperCase())
            ? "1099-b"
            : "manual"),
      brokerName: String(transaction.brokerName || "").trim(),
      accountLabel: maskAccountLabel(String(transaction.accountLabel || "").trim()),
      assetDescription: String(transaction.assetDescription || "Unnamed transaction").trim(),
      symbolCusip: String(transaction.symbolCusip || "").trim().toUpperCase(),
      dateAcquired: normalizeIsoDate(transaction.dateAcquired),
      dateAcquiredVarious: dateAcquiredSpecial === "various",
      dateAcquiredSpecial,
      dateSold: normalizeIsoDate(transaction.dateSold),
      termOverride: ["auto", "short", "long", "unknown"].includes(transaction.termOverride) ? transaction.termOverride : "auto",
      proceeds: finiteNumber(transaction.proceeds),
      costBasis: finiteNumber(transaction.costBasis),
      costBasisMissing: Boolean(transaction.costBasisMissing),
      fees: finiteNumber(transaction.fees),
      adjustmentCode: String(transaction.adjustmentCode || "").trim().toUpperCase(),
      adjustmentAmount: finiteNumber(transaction.adjustmentAmount),
      basisReported: ["reported", "not-reported", "no-1099b", "unknown"].includes(transaction.basisReported) ? transaction.basisReported : "unknown",
      form8949Category: ["auto", ...FORM_8949_CATEGORIES, "review"].includes(transaction.form8949Category) ? transaction.form8949Category : "auto",
      transactionNotes: String(transaction.transactionNotes || "").trim(),
      reviewResolution: normalizeReviewResolution(transaction.reviewResolution),
      source,
      statementReportedGainLoss: Number.isFinite(parsedStatementAmount) ? parsedStatementAmount : null,
      createdAt: transaction.createdAt || new Date().toISOString(),
      updatedAt: transaction.updatedAt || new Date().toISOString()
    };

    if (normalized.assetType === "digital-asset" && normalized.sourceForm === "1099-b" && transaction.sourceForm === undefined) {
      normalized.sourceForm = "1099-da";
    }
    if (normalized.sourceForm === "1099-da") normalized.assetType = "digital-asset";
    if (normalized.sourceForm === "manual") normalized.basisReported = "no-1099b";

    if (normalized.dateAcquiredSpecial) normalized.dateAcquired = "";
    normalized.computedTerm = determineTerm(normalized);
    const derivedCategory = deriveForm8949Category(
      normalized.computedTerm,
      normalized.basisReported,
      normalized.assetType,
      normalized.sourceForm
    );
    normalized.resolvedCategory = normalized.form8949Category === "auto" ? derivedCategory : normalized.form8949Category;
    normalized.termSource = inferTermSource(transaction, normalized);
    normalized.termConfirmed = normalized.computedTerm === "short" || normalized.computedTerm === "long";
    normalized.calculatedGainLoss = normalized.costBasisMissing
      ? null
      : normalized.proceeds - normalized.fees - normalized.costBasis + normalized.adjustmentAmount;
    normalized.calculationStatus = transactionCalculationStatus(normalized);
    // Legacy field remains for compatibility, but unresolved rows contribute zero to verified totals.
    normalized.gainLoss = normalized.calculationStatus === "verified" ? normalized.calculatedGainLoss : 0;

    return normalized;
  }

  function normalizeReviewResolution(value) {
    const input = value && typeof value === "object" ? value : {};
    const history = Array.isArray(input.history)
      ? input.history.slice(-50).map((entry) => ({
          action: String(entry?.action || "review-update"),
          detail: String(entry?.detail || "Review information updated"),
          beforeValue: String(entry?.beforeValue || ""),
          afterValue: String(entry?.afterValue || ""),
          resolvedAt: String(entry?.resolvedAt || "")
        }))
      : [];

    const category = input.categoryConflictConfirmation;
    const amount = input.amountDifferenceConfirmation;

    return {
      history,
      lastResolvedAt: String(input.lastResolvedAt || ""),
      categoryConflictConfirmation: category && typeof category === "object"
        ? {
            category: String(category.category || ""),
            derivedCategory: String(category.derivedCategory || ""),
            term: String(category.term || ""),
            basisReported: String(category.basisReported || ""),
            assetType: normalizeAssetType(
              category.assetType ||
              (["G", "H", "I", "J", "K", "L"].includes(String(category.category || "").toUpperCase())
                ? "digital-asset"
                : "stock")
            ),
            sourceForm: normalizeSourceForm(category.sourceForm) ||
              (["G", "H", "I", "J", "K", "L"].includes(String(category.category || "").toUpperCase())
                ? "1099-da"
                : "1099-b"),
            confirmedAt: String(category.confirmedAt || "")
          }
        : null,
      amountDifferenceConfirmation: amount && typeof amount === "object" && Number.isFinite(Number(amount.statementAmount)) && Number.isFinite(Number(amount.calculatedAmount))
        ? {
            statementAmount: Number(amount.statementAmount),
            calculatedAmount: Number(amount.calculatedAmount),
            confirmedAt: String(amount.confirmedAt || "")
          }
        : null
    };
  }

  function inferTermSource(original, normalized) {
    const explicit = String(original.termSource || "");
    if (["dates", "broker-category", "broker-column", "user-override", "inherited-rule", "unresolved"].includes(explicit)) return explicit;
    if (normalized.dateAcquiredSpecial === "inherited") return "inherited-rule";
    if (normalized.source?.type === "pdf" && ["short", "long"].includes(normalized.termOverride)) return "broker-category";
    if (normalized.source?.type === "csv" && normalized.source?.originalValues?.term && ["short", "long"].includes(normalized.termOverride)) return "broker-column";
    if (["short", "long"].includes(normalized.termOverride)) return "user-override";
    if (normalized.dateAcquired && normalized.dateSold && ["short", "long"].includes(normalized.computedTerm)) return "dates";
    return "unresolved";
  }

  function transactionCalculationStatus(transaction) {
    if (transaction.costBasisMissing) return "missing-basis";
    if (transaction.computedTerm !== "short" && transaction.computedTerm !== "long") return "term-review";
    if (!FORM_8949_CATEGORIES.includes(transaction.resolvedCategory)) return "category-review";
    if (transaction.dateAcquired && transaction.dateSold && compareIsoDates(transaction.dateSold, transaction.dateAcquired) < 0) return "date-error";
    if (!Number.isFinite(transaction.calculatedGainLoss)) return "amount-review";
    return "verified";
  }

  function isTransactionCalculationReady(transaction) {
    return transaction?.calculationStatus === "verified" && Number.isFinite(transaction.calculatedGainLoss);
  }

  function getStatementReportedGainLoss(transaction) {
    const raw = transaction?.statementReportedGainLoss;
    if (raw === null || raw === undefined || raw === "") return NaN;
    const value = Number(raw);
    return Number.isFinite(value) ? value : NaN;
  }

  function termSourceLabel(source) {
    if (source === "broker-category") return "Broker category";
    if (source === "broker-column") return "Broker column";
    if (source === "inherited-rule") return "Inherited rule";
    if (source === "user-override") return "User confirmed";
    if (source === "dates") return "Calculated from dates";
    return "Needs review";
  }

  function determineTerm(transaction) {
    if (["short", "long", "unknown"].includes(transaction.termOverride)) return transaction.termOverride;
    if (transaction.dateAcquiredSpecial === "inherited") return "long";
    if (transaction.dateAcquiredVarious || transaction.dateAcquiredSpecial === "various" || !transaction.dateAcquired || !transaction.dateSold) return "unknown";

    const acquired = parseIsoDateUtc(transaction.dateAcquired);
    const sold = parseIsoDateUtc(transaction.dateSold);
    if (!acquired || !sold || sold < acquired) return "unknown";

    const anniversary = new Date(acquired.getTime());
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    return sold > anniversary ? "long" : "short";
  }

  function deriveForm8949Category(term, basisReported, assetType = "stock", sourceForm = "") {
    const digitalAsset = isDigitalAssetTransaction(assetType, sourceForm);

    if (term === "short") {
      if (basisReported === "reported") return digitalAsset ? "G" : "A";
      if (basisReported === "not-reported") return digitalAsset ? "H" : "B";
      if (basisReported === "no-1099b") return digitalAsset ? "I" : "C";
    }

    if (term === "long") {
      if (basisReported === "reported") return digitalAsset ? "J" : "D";
      if (basisReported === "not-reported") return digitalAsset ? "K" : "E";
      if (basisReported === "no-1099b") return digitalAsset ? "L" : "F";
    }

    return "review";
  }

  function normalizeImportAudit(value) {
    if (!value || typeof value !== "object") return null;

    const legacySkippedDuplicateRows = Math.max(
      0,
      Math.trunc(
        finiteNumber(value.legacySkippedDuplicateRows ?? value.duplicateRows)
      )
    );
    const invalidRows = Math.max(0, Math.trunc(finiteNumber(value.invalidRows)));

    if (legacySkippedDuplicateRows === 0 && invalidRows === 0) return null;

    return {
      fileName: String(value.fileName || "").trim(),
      legacySkippedDuplicateRows,
      invalidRows,
      importedAt: String(value.importedAt || "")
    };
  }

  function findDuplicateGroups(transactions) {
    const groups = new Map();

    transactions.forEach((transaction) => {
      const fingerprint = transactionFingerprint(transaction);
      if (!groups.has(fingerprint)) {
        groups.set(fingerprint, []);
      }
      groups.get(fingerprint).push(transaction);
    });

    return [...groups.values()].filter((group) => group.length > 1);
  }

  function transactionFingerprint(transaction) {
    return [
      normalizeFingerprintText(transaction.owner),
      normalizeFingerprintText(transaction.assetType),
      normalizeFingerprintText(transaction.sourceForm),
      normalizeFingerprintText(transaction.brokerName),
      normalizeFingerprintText(transaction.accountLabel),
      normalizeFingerprintText(
        transaction.symbolCusip || transaction.assetDescription
      ),
      normalizeFingerprintText(transaction.assetDescription),
      transaction.dateAcquiredSpecial || (transaction.dateAcquiredVarious ? "various" : transaction.dateAcquired),
      transaction.dateSold,
      transaction.proceeds.toFixed(2),
      transaction.costBasisMissing ? "missing" : transaction.costBasis.toFixed(2),
      transaction.fees.toFixed(2),
      normalizeFingerprintText(transaction.adjustmentCode),
      transaction.adjustmentAmount.toFixed(2),
      normalizeFingerprintText(transaction.basisReported)
    ].join("|");
  }

  function normalizeFingerprintText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }


  function defaultImportSetup() {
    return {
      filingStatus: "single",
      defaultOwner: "taxpayer",
      updatedAt: ""
    };
  }

  function normalizeImportSetup(value, filingStatus = state.estimateSettings?.filingStatus) {
    const source = value && typeof value === "object" ? value : {};
    const status = ["single", "mfj", "mfs", "hoh", "qss"].includes(String(source.filingStatus || filingStatus || ""))
      ? String(source.filingStatus || filingStatus)
      : "single";
    const married = isMarriedFilingStatus(status);
    return {
      filingStatus: status,
      defaultOwner: married ? normalizeTransactionOwner(source.defaultOwner || "joint") : "taxpayer",
      updatedAt: String(source.updatedAt || "")
    };
  }

  function ensureImportReturnSetup() {
    const view = byId("importView");
    if (!view) return null;

    let panel = byId("importReturnSetupPanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "importReturnSetupPanel";
      panel.className = "panel";
      panel.style.marginBottom = "1rem";
      panel.innerHTML = `
        <div class="panel__heading">
          <div>
            <span class="eyebrow">Return setup</span>
            <h3>Who owns the imported transactions?</h3>
            <p>Choose this once before uploading. The same filing status stays synchronized with the Estimate page.</p>
          </div>
        </div>
        <div class="form-grid">
          <label class="form-field">
            <span>Filing status</span>
            <select id="importSetupFilingStatus">
              <option value="single">Single</option>
              <option value="mfj">Married filing jointly</option>
              <option value="mfs">Married filing separately</option>
              <option value="hoh">Head of household</option>
              <option value="qss">Qualifying surviving spouse</option>
            </select>
            <small>This controls the estimator and whether taxpayer/spouse ownership is available.</small>
          </label>
          <label class="form-field" id="importSetupOwnerField">
            <span>Default owner for this import</span>
            <select id="importSetupDefaultOwner">
              <option value="taxpayer">Taxpayer</option>
              <option value="spouse">Spouse</option>
              <option value="joint">Joint</option>
            </select>
            <small>Applied to PDF rows and to CSV rows that do not contain an Owner column.</small>
          </label>
        </div>
        <div id="importSetupMessage" role="status" style="margin-top:0.85rem;padding:0.75rem 0.9rem;border:1px solid var(--cg-border);border-radius:0.75rem;background:var(--cg-surface-soft);"></div>
      `;
      const anchor = [...view.children].find(
        (child) => child.contains(ui.csvFileInput) || child.contains(ui.pdfFileInput)
      );
      anchor ? view.insertBefore(panel, anchor) : view.append(panel);
    }

    ui.importSetupFilingStatus = byId("importSetupFilingStatus");
    ui.importSetupDefaultOwner = byId("importSetupDefaultOwner");
    ui.importSetupOwnerField = byId("importSetupOwnerField");
    ui.importSetupMessage = byId("importSetupMessage");
    syncImportSetupInputs();
    return panel;
  }

  function syncImportSetupInputs() {
    state.importSetup = normalizeImportSetup(state.importSetup, state.estimateSettings?.filingStatus);
    state.importSetup.filingStatus = state.estimateSettings?.filingStatus || state.importSetup.filingStatus;
    if (ui.importSetupFilingStatus) ui.importSetupFilingStatus.value = state.importSetup.filingStatus;
    const married = isMarriedFilingStatus(state.importSetup.filingStatus);
    if (!married) state.importSetup.defaultOwner = "taxpayer";
    if (ui.importSetupDefaultOwner) ui.importSetupDefaultOwner.value = state.importSetup.defaultOwner;
    if (ui.importSetupOwnerField) ui.importSetupOwnerField.hidden = !married;
    if (ui.importSetupMessage) {
      ui.importSetupMessage.innerHTML = married
        ? `<strong>${escapeHtml(filingStatusLabel(state.importSetup.filingStatus))}</strong> · New imported rows default to <strong>${escapeHtml(ownerLabel(state.importSetup.defaultOwner))}</strong>. You can edit ownership later.`
        : `<strong>${escapeHtml(filingStatusLabel(state.importSetup.filingStatus))}</strong> · New imported rows are assigned to <strong>Taxpayer</strong>.`;
    }
  }

  function handleImportSetupChange() {
    const previousStatus = state.estimateSettings?.filingStatus || "single";
    const nextStatus = String(ui.importSetupFilingStatus?.value || previousStatus);
    state.estimateSettings = normalizeEstimateSettings({
      ...state.estimateSettings,
      filingStatus: nextStatus
    });

    let owner = normalizeTransactionOwner(ui.importSetupDefaultOwner?.value || state.importSetup?.defaultOwner || "joint");
    if (!isMarriedFilingStatus(nextStatus)) owner = "taxpayer";
    else if (!isMarriedFilingStatus(previousStatus) && owner === "taxpayer") owner = "joint";

    state.importSetup = normalizeImportSetup({
      filingStatus: nextStatus,
      defaultOwner: owner,
      updatedAt: new Date().toISOString()
    }, nextStatus);
    syncEstimateInputsFromState();
    syncImportSetupInputs();
    renderValidation();
    renderEstimateWorkspace();
    queueAutoSave();
  }

  function syncImportSetupFromEstimate(previousStatus = "") {
    const nextStatus = state.estimateSettings?.filingStatus || "single";
    let owner = state.importSetup?.defaultOwner || "taxpayer";
    if (!isMarriedFilingStatus(nextStatus)) owner = "taxpayer";
    else if (previousStatus && !isMarriedFilingStatus(previousStatus)) owner = "joint";
    state.importSetup = normalizeImportSetup({
      ...state.importSetup,
      filingStatus: nextStatus,
      defaultOwner: owner,
      updatedAt: new Date().toISOString()
    }, nextStatus);
    syncImportSetupInputs();
  }

  const PROPERTY_TYPE_OPTIONS = [
    ["main-home", "Main home"],
    ["residential-rental", "Residential rental real estate (section 1250)"],
    ["other-real-property", "Other depreciable real property (section 1250)"],
    ["section-1245", "Equipment, vehicle, or other section 1245 property"],
    ["investment-land", "Investment land or other nondepreciable real estate"]
  ];

  function defaultPropertySale() {
    return {
      id: "",
      label: "",
      owner: defaultTransactionOwner(),
      propertyType: "main-home",
      dateAcquired: "",
      dateSold: "",
      sellingPrice: 0,
      sellingExpenses: 0,
      originalCost: 0,
      improvements: 0,
      otherBasisIncreases: 0,
      basisReductions: 0,
      depreciation: 0,
      additionalDepreciation: 0,
      received1099S: false,
      qualifiesFullHomeExclusion: false,
      jointHomeExclusionConfirmed: false,
      partialHomeExclusion: 0,
      notes: "",
      createdAt: "",
      updatedAt: ""
    };
  }

  function normalizePropertySale(value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = defaultPropertySale();
    const propertyType = PROPERTY_TYPE_OPTIONS.some(([option]) => option === source.propertyType)
      ? source.propertyType
      : defaults.propertyType;
    return {
      id: String(source.id || createId()),
      label: String(source.label || "").trim().slice(0, 160),
      owner: normalizeTransactionOwner(source.owner || defaultTransactionOwner()),
      propertyType,
      dateAcquired: parseFlexibleDate(source.dateAcquired) || "",
      dateSold: parseFlexibleDate(source.dateSold) || "",
      sellingPrice: nonNegativeNumber(source.sellingPrice),
      sellingExpenses: nonNegativeNumber(source.sellingExpenses),
      originalCost: nonNegativeNumber(source.originalCost),
      improvements: nonNegativeNumber(source.improvements),
      otherBasisIncreases: nonNegativeNumber(source.otherBasisIncreases),
      basisReductions: nonNegativeNumber(source.basisReductions),
      depreciation: nonNegativeNumber(source.depreciation),
      additionalDepreciation: nonNegativeNumber(source.additionalDepreciation),
      received1099S: Boolean(source.received1099S),
      qualifiesFullHomeExclusion: Boolean(source.qualifiesFullHomeExclusion),
      jointHomeExclusionConfirmed: Boolean(source.jointHomeExclusionConfirmed),
      partialHomeExclusion: nonNegativeNumber(source.partialHomeExclusion),
      notes: String(source.notes || "").trim().slice(0, 2000),
      createdAt: String(source.createdAt || new Date().toISOString()),
      updatedAt: String(source.updatedAt || source.createdAt || new Date().toISOString())
    };
  }

  function propertyTypeLabel(value) {
    return PROPERTY_TYPE_OPTIONS.find(([option]) => option === value)?.[1] || "Property sale";
  }

  function calculatePropertySale(value) {
    const sale = normalizePropertySale(value);
    const amountRealized = sale.sellingPrice - sale.sellingExpenses;
    const adjustedBasis = sale.originalCost + sale.improvements + sale.otherBasisIncreases - sale.basisReductions - sale.depreciation;
    const totalGainLoss = amountRealized - adjustedBasis;
    const gain = Math.max(0, totalGainLoss);
    const loss = Math.min(0, totalGainLoss);
    const result = {
      sale,
      amountRealized,
      adjustedBasis,
      totalGainLoss,
      ordinaryRecapture: 0,
      unrecaptured1250: 0,
      remainingSection1231: 0,
      capitalGainLoss: 0,
      homeExclusion: 0,
      taxableHomeGain: 0,
      nondeductibleHomeLoss: 0,
      depreciationRelatedHomeGain: 0,
      reportForm: "",
      warnings: []
    };

    if (!sale.label) result.warnings.push("Add a property label or description.");
    if (!sale.dateAcquired || !sale.dateSold) result.warnings.push("Acquisition and sale dates are required for a complete worksheet.");
    if (sale.dateAcquired && sale.dateSold && compareIsoDates(sale.dateSold, sale.dateAcquired) < 0) {
      result.warnings.push("The sale date is earlier than the acquisition date.");
    }
    if (sale.sellingPrice <= 0) result.warnings.push("Enter the gross selling price.");
    if (sale.originalCost <= 0) result.warnings.push("Enter original cost or other starting basis.");
    if (adjustedBasis < 0) result.warnings.push("Adjusted basis is below zero. Review basis reductions and depreciation.");

    if (sale.propertyType === "main-home") {
      const depreciationGain = Math.min(gain, sale.depreciation);
      const gainEligibleForExclusion = Math.max(0, gain - depreciationGain);
      let exclusionLimit = 0;
      if (sale.qualifiesFullHomeExclusion) {
        exclusionLimit = state.estimateSettings?.filingStatus === "mfj" && sale.jointHomeExclusionConfirmed
          ? 500000
          : 250000;
      } else {
        exclusionLimit = sale.partialHomeExclusion;
      }
      result.depreciationRelatedHomeGain = depreciationGain;
      result.homeExclusion = Math.min(gainEligibleForExclusion, exclusionLimit);
      result.taxableHomeGain = Math.max(0, gain - result.homeExclusion);
      result.nondeductibleHomeLoss = loss;
      result.unrecaptured1250 = depreciationGain;
      result.capitalGainLoss = result.taxableHomeGain;
      result.reportForm = sale.received1099S || result.taxableHomeGain > 0 ? "Form 8949 / Schedule D review" : "May not require reporting if all gain is excluded and no Form 1099-S was received";
      if (sale.depreciation > 0) result.warnings.push("Gain attributable to depreciation after May 6, 1997 is not excludable and may be unrecaptured section 1250 gain.");
      if (loss < 0) result.warnings.push("A loss on a personal main home is generally nondeductible.");
      if (state.estimateSettings?.filingStatus === "mfj" && sale.qualifiesFullHomeExclusion && !sale.jointHomeExclusionConfirmed) {
        result.warnings.push("The worksheet uses the $250,000 limit until joint-return $500,000 eligibility is confirmed.");
      }
    } else if (sale.propertyType === "section-1245") {
      result.ordinaryRecapture = Math.min(gain, sale.depreciation);
      result.remainingSection1231 = totalGainLoss >= 0 ? gain - result.ordinaryRecapture : totalGainLoss;
      result.reportForm = "Form 4797 planning worksheet";
    } else if (["residential-rental", "other-real-property"].includes(sale.propertyType)) {
      result.ordinaryRecapture = Math.min(gain, Math.min(sale.additionalDepreciation, sale.depreciation));
      result.remainingSection1231 = totalGainLoss >= 0
        ? Math.max(0, gain - result.ordinaryRecapture)
        : totalGainLoss;
      result.unrecaptured1250 = Math.min(
        Math.max(0, result.remainingSection1231),
        Math.max(0, sale.depreciation - result.ordinaryRecapture)
      );
      result.reportForm = "Form 4797 and Schedule D planning worksheet";
      result.warnings.push("Final section 1231 treatment can depend on prior-year section 1231 losses and other property dispositions.");
    } else {
      result.capitalGainLoss = totalGainLoss;
      result.reportForm = "Form 8949 / Schedule D planning worksheet";
    }

    return result;
  }

  function ensurePropertySalesWorkspace() {
    const nav = document.querySelector(".workspace-nav");
    const reportsButton = document.querySelector('[data-view-target="reportsView"]');
    if (nav && !document.querySelector('[data-view-target="propertySalesView"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "workspace-nav__item";
      button.dataset.viewTarget = "propertySalesView";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", "false");
      button.innerHTML = `<span aria-hidden="true">⌂</span><span>Property sales</span>`;
      if (reportsButton) nav.insertBefore(button, reportsButton);
      else nav.appendChild(button);
      on(button, "click", () => openView("propertySalesView"));
    }

    let view = byId("propertySalesView");
    if (!view) {
      const reportsView = byId("reportsView");
      const parent = reportsView?.parentElement || document.querySelector("main") || document.body;
      view = document.createElement("section");
      view.id = "propertySalesView";
      view.className = "workspace-view";
      view.hidden = true;
      view.innerHTML = `
        <div class="section-heading">
          <div>
            <span class="eyebrow">Separate worksheet</span>
            <h2>Home, rental, and business-property sales</h2>
            <p>Keep property-sale rules separate from normal stock and digital-asset rows. Results are planning worksheets and are not silently added to the brokerage estimate.</p>
          </div>
        </div>
        <section class="panel">
          <div class="notice notice--important" style="margin-bottom:1rem;">
            <div class="notice__icon" aria-hidden="true">!</div>
            <div><h3>Property sales may require other forms</h3><p>Main-home exclusions, Form 4797, section 1231 lookback, installment sales, like-kind exchanges, and depreciation rules can change final reporting. Review the worksheet against source records.</p></div>
          </div>
          <form id="propertySaleForm" novalidate>
            <input id="propertySaleId" type="hidden">
            <div class="form-grid">
              <label class="form-field"><span>Property label</span><input id="propertySaleLabel" type="text" maxlength="160" placeholder="Example: Main home or Oak Street rental"></label>
              <label class="form-field" id="propertySaleOwnerField"><span>Owner</span><select id="propertySaleOwner">${TRANSACTION_OWNER_OPTIONS.map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
              <label class="form-field"><span>Property type</span><select id="propertySaleType">${PROPERTY_TYPE_OPTIONS.map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
              <label class="form-field"><span>Date acquired</span><input id="propertySaleDateAcquired" type="date"></label>
              <label class="form-field"><span>Date sold</span><input id="propertySaleDateSold" type="date"></label>
              <label class="form-field"><span>Gross selling price</span><input id="propertySaleSellingPrice" type="number" min="0" step="0.01" value="0"></label>
              <label class="form-field"><span>Selling expenses</span><input id="propertySaleSellingExpenses" type="number" min="0" step="0.01" value="0"></label>
              <label class="form-field"><span>Original cost or starting basis</span><input id="propertySaleOriginalCost" type="number" min="0" step="0.01" value="0"></label>
              <label class="form-field"><span>Capital improvements</span><input id="propertySaleImprovements" type="number" min="0" step="0.01" value="0"></label>
              <label class="form-field"><span>Other basis increases</span><input id="propertySaleOtherBasisIncreases" type="number" min="0" step="0.01" value="0"></label>
              <label class="form-field"><span>Basis reductions other than depreciation</span><input id="propertySaleBasisReductions" type="number" min="0" step="0.01" value="0"></label>
              <label class="form-field"><span id="propertySaleDepreciationLabel">Depreciation allowed or allowable</span><input id="propertySaleDepreciation" type="number" min="0" step="0.01" value="0"><small id="propertySaleDepreciationHelp">Use the total depreciation that reduced basis, including allowable amounts.</small></label>
              <label class="form-field" id="propertySaleAdditionalDepreciationField"><span>Additional depreciation beyond straight line</span><input id="propertySaleAdditionalDepreciation" type="number" min="0" step="0.01" value="0"><small>Relevant to possible ordinary section 1250 recapture; often zero for post-1986 straight-line real property.</small></label>
            </div>
            <div id="propertySaleHomeFields" style="margin-top:1rem;">
              <div class="form-grid">
                <label class="form-field"><span>Partial exclusion amount, when full test is not met</span><input id="propertySalePartialExclusion" type="number" min="0" step="0.01" value="0"><small>Enter zero unless a reduced exclusion has been determined.</small></label>
              </div>
              <label class="checkbox-row"><input id="propertySaleReceived1099S" type="checkbox"><span>Form 1099-S was received</span></label>
              <label class="checkbox-row"><input id="propertySaleFullExclusion" type="checkbox"><span>Full main-home ownership, use, and lookback tests are confirmed</span></label>
              <label class="checkbox-row" id="propertySaleJointExclusionRow"><input id="propertySaleJointExclusion" type="checkbox"><span>Joint-return requirements for the $500,000 maximum exclusion are confirmed</span></label>
            </div>
            <label class="form-field" style="margin-top:1rem;"><span>Notes</span><textarea id="propertySaleNotes" rows="3" maxlength="2000" placeholder="Optional records or review notes"></textarea></label>
            <div id="propertySalePreview" style="margin-top:1rem;" aria-live="polite"></div>
            <div class="form-actions" style="margin-top:1rem;"><button class="button button--primary" type="submit">Save property worksheet</button><button id="propertySaleResetButton" class="button button--secondary" type="button">Clear form</button></div>
          </form>
        </section>
        <section class="panel" style="margin-top:1rem;">
          <div class="panel__heading"><div><h3>Saved property worksheets</h3><p>These stay separate from brokerage transactions and the ordinary capital-gains estimate.</p></div></div>
          <div id="propertySalesList"></div>
        </section>
      `;
      if (reportsView) parent.insertBefore(view, reportsView);
      else parent.appendChild(view);
    }

    [
      "propertySaleForm", "propertySaleId", "propertySaleLabel", "propertySaleOwner", "propertySaleOwnerField",
      "propertySaleType", "propertySaleDateAcquired", "propertySaleDateSold", "propertySaleSellingPrice",
      "propertySaleSellingExpenses", "propertySaleOriginalCost", "propertySaleImprovements",
      "propertySaleOtherBasisIncreases", "propertySaleBasisReductions", "propertySaleDepreciation",
      "propertySaleDepreciationLabel", "propertySaleDepreciationHelp", "propertySaleAdditionalDepreciation", "propertySaleAdditionalDepreciationField", "propertySaleHomeFields",
      "propertySalePartialExclusion", "propertySaleReceived1099S", "propertySaleFullExclusion",
      "propertySaleJointExclusion", "propertySaleJointExclusionRow", "propertySaleNotes", "propertySalePreview",
      "propertySaleResetButton", "propertySalesList"
    ].forEach((id) => { ui[id] = byId(id); });

    resetPropertySaleForm(false);
    renderPropertySalesWorkspace();
    return view;
  }

  function readPropertySaleForm() {
    return normalizePropertySale({
      id: ui.propertySaleId?.value || createId(),
      label: ui.propertySaleLabel?.value,
      owner: ui.propertySaleOwner?.value || defaultTransactionOwner(),
      propertyType: ui.propertySaleType?.value,
      dateAcquired: ui.propertySaleDateAcquired?.value,
      dateSold: ui.propertySaleDateSold?.value,
      sellingPrice: ui.propertySaleSellingPrice?.value,
      sellingExpenses: ui.propertySaleSellingExpenses?.value,
      originalCost: ui.propertySaleOriginalCost?.value,
      improvements: ui.propertySaleImprovements?.value,
      otherBasisIncreases: ui.propertySaleOtherBasisIncreases?.value,
      basisReductions: ui.propertySaleBasisReductions?.value,
      depreciation: ui.propertySaleDepreciation?.value,
      additionalDepreciation: ui.propertySaleAdditionalDepreciation?.value,
      received1099S: ui.propertySaleReceived1099S?.checked,
      qualifiesFullHomeExclusion: ui.propertySaleFullExclusion?.checked,
      jointHomeExclusionConfirmed: ui.propertySaleJointExclusion?.checked,
      partialHomeExclusion: ui.propertySalePartialExclusion?.value,
      notes: ui.propertySaleNotes?.value,
      createdAt: state.propertySales.find((item) => item.id === ui.propertySaleId?.value)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  function populatePropertySaleForm(value) {
    const sale = normalizePropertySale(value);
    ui.propertySaleId.value = sale.id;
    ui.propertySaleLabel.value = sale.label;
    ui.propertySaleOwner.value = sale.owner;
    ui.propertySaleType.value = sale.propertyType;
    ui.propertySaleDateAcquired.value = sale.dateAcquired;
    ui.propertySaleDateSold.value = sale.dateSold;
    ui.propertySaleSellingPrice.value = String(sale.sellingPrice);
    ui.propertySaleSellingExpenses.value = String(sale.sellingExpenses);
    ui.propertySaleOriginalCost.value = String(sale.originalCost);
    ui.propertySaleImprovements.value = String(sale.improvements);
    ui.propertySaleOtherBasisIncreases.value = String(sale.otherBasisIncreases);
    ui.propertySaleBasisReductions.value = String(sale.basisReductions);
    ui.propertySaleDepreciation.value = String(sale.depreciation);
    ui.propertySaleAdditionalDepreciation.value = String(sale.additionalDepreciation);
    ui.propertySaleReceived1099S.checked = sale.received1099S;
    ui.propertySaleFullExclusion.checked = sale.qualifiesFullHomeExclusion;
    ui.propertySaleJointExclusion.checked = sale.jointHomeExclusionConfirmed;
    ui.propertySalePartialExclusion.value = String(sale.partialHomeExclusion);
    ui.propertySaleNotes.value = sale.notes;
    syncPropertySaleFields();
    renderPropertySalePreview();
  }

  function resetPropertySaleForm(render = true) {
    if (!ui.propertySaleForm) return;
    const sale = defaultPropertySale();
    sale.id = createId();
    sale.owner = defaultTransactionOwner();
    populatePropertySaleForm(sale);
    state.propertySaleEditingId = "";
    if (render) renderPropertySalesWorkspace();
  }

  function syncPropertySaleFields() {
    const type = ui.propertySaleType?.value || "main-home";
    const home = type === "main-home";
    const realDepreciable = ["residential-rental", "other-real-property"].includes(type);
    if (ui.propertySaleHomeFields) ui.propertySaleHomeFields.hidden = !home;
    if (ui.propertySaleDepreciationLabel) {
      ui.propertySaleDepreciationLabel.textContent = home
        ? "Depreciation after May 6, 1997"
        : "Depreciation allowed or allowable";
    }
    if (ui.propertySaleDepreciationHelp) {
      ui.propertySaleDepreciationHelp.textContent = home
        ? "Enter depreciation claimed or allowable for business or rental use after May 6, 1997. This portion generally cannot be excluded as main-home gain."
        : "Use the total depreciation that reduced basis, including allowable amounts.";
    }
    if (ui.propertySaleAdditionalDepreciationField) ui.propertySaleAdditionalDepreciationField.hidden = !realDepreciable;
    if (ui.propertySaleOwnerField) ui.propertySaleOwnerField.hidden = !isMarriedFilingStatus();
    if (ui.propertySaleJointExclusionRow) ui.propertySaleJointExclusionRow.hidden = !(home && state.estimateSettings?.filingStatus === "mfj");
    if (!home) {
      if (ui.propertySaleReceived1099S) ui.propertySaleReceived1099S.checked = false;
      if (ui.propertySaleFullExclusion) ui.propertySaleFullExclusion.checked = false;
      if (ui.propertySaleJointExclusion) ui.propertySaleJointExclusion.checked = false;
      if (ui.propertySalePartialExclusion) ui.propertySalePartialExclusion.value = "0";
    }
    if (!realDepreciable && ui.propertySaleAdditionalDepreciation) ui.propertySaleAdditionalDepreciation.value = "0";
  }

  function handlePropertySaleFormChange() {
    syncPropertySaleFields();
    renderPropertySalePreview();
  }

  function renderPropertySalePreview() {
    if (!ui.propertySalePreview || !ui.propertySaleForm) return;
    const result = calculatePropertySale(readPropertySaleForm());
    const warningHtml = result.warnings.length
      ? `<div class="notice notice--important" style="margin-top:0.8rem;"><div class="notice__icon" aria-hidden="true">!</div><div><h3>Review needed</h3><p>${result.warnings.map(escapeHtml).join(" ")}</p></div></div>`
      : `<div class="notice notice--info" style="margin-top:0.8rem;"><div class="notice__icon" aria-hidden="true">i</div><div><h3>Worksheet ready to save</h3><p>Compare every amount with closing statements, depreciation schedules, and basis records.</p></div></div>`;

    let treatmentRows = "";
    if (result.sale.propertyType === "main-home") {
      treatmentRows = `
        <tr><td>Potential home-sale exclusion</td><td>${formatCurrency(result.homeExclusion)}</td></tr>
        <tr><td>Gain attributable to depreciation</td><td>${formatCurrency(result.depreciationRelatedHomeGain)}</td></tr>
        <tr><td>Estimated taxable home-sale gain</td><td>${formatCurrency(result.taxableHomeGain)}</td></tr>
        <tr><td>Nondeductible personal-home loss</td><td>${formatCurrency(result.nondeductibleHomeLoss)}</td></tr>`;
    } else if (result.sale.propertyType === "section-1245") {
      treatmentRows = `<tr><td>Potential ordinary section 1245 recapture</td><td>${formatCurrency(result.ordinaryRecapture)}</td></tr><tr><td>Remaining section 1231 amount before netting</td><td>${formatCurrency(result.remainingSection1231)}</td></tr>`;
    } else if (["residential-rental", "other-real-property"].includes(result.sale.propertyType)) {
      treatmentRows = `<tr><td>Potential ordinary section 1250 recapture</td><td>${formatCurrency(result.ordinaryRecapture)}</td></tr><tr><td>Potential unrecaptured section 1250 portion</td><td>${formatCurrency(result.unrecaptured1250)}</td></tr><tr><td>Section 1231 gain/loss before lookback and netting</td><td>${formatCurrency(result.remainingSection1231)}</td></tr>`;
    } else {
      treatmentRows = `<tr><td>Capital gain/loss planning amount</td><td>${formatCurrency(result.capitalGainLoss)}</td></tr>`;
    }

    ui.propertySalePreview.innerHTML = `
      <div class="table-wrap"><table><tbody>
        <tr><td>Amount realized</td><td>${formatCurrency(result.amountRealized)}</td></tr>
        <tr><td>Adjusted basis</td><td>${formatCurrency(result.adjustedBasis)}</td></tr>
        <tr><td>Total gain/loss before special treatment</td><td>${formatCurrency(result.totalGainLoss)}</td></tr>
        ${treatmentRows}
        <tr><td>Likely reporting path</td><td>${escapeHtml(result.reportForm || "Needs review")}</td></tr>
      </tbody></table></div>${warningHtml}`;
  }

  async function handlePropertySaleSubmit(event) {
    event.preventDefault();
    const sale = readPropertySaleForm();
    const result = calculatePropertySale(sale);
    const blocking = result.warnings.some((warning) => /required|earlier than|below zero/i.test(warning));
    if (blocking) {
      renderPropertySalePreview();
      showToast("Correct the property worksheet errors before saving.", "error");
      return;
    }
    const index = state.propertySales.findIndex((item) => item.id === sale.id);
    if (index >= 0) state.propertySales[index] = sale;
    else state.propertySales.push(sale);
    const saved = await saveWorkspace();
    renderPropertySalesWorkspace();
    resetPropertySaleForm(false);
    showToast(saved ? "Property worksheet saved in this browser." : "Property worksheet saved on screen, but browser storage could not be confirmed.", saved ? "success" : "warning");
  }

  function handlePropertySalesListClick(event) {
    const button = event.target.closest("button[data-property-action]");
    if (!button) return;
    const sale = state.propertySales.find((item) => item.id === button.dataset.propertyId);
    if (!sale) return;
    if (button.dataset.propertyAction === "edit") {
      populatePropertySaleForm(sale);
      state.propertySaleEditingId = sale.id;
      ui.propertySaleForm?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (button.dataset.propertyAction === "delete") {
      showConfirmDialog({
        title: "Delete property worksheet?",
        message: `Delete ${sale.label || propertyTypeLabel(sale.propertyType)}?`,
        confirmLabel: "Delete",
        onConfirm: async () => {
          state.propertySales = state.propertySales.filter((item) => item.id !== sale.id);
          await saveWorkspace();
          renderPropertySalesWorkspace();
          showToast("Property worksheet deleted.", "success");
        }
      });
    }
  }

  function renderPropertySalesWorkspace() {
    if (!ui.propertySalesList) return;
    syncPropertySaleFields();
    renderPropertySalePreview();
    if (!state.propertySales.length) {
      ui.propertySalesList.innerHTML = `<div class="empty-state"><h3>No property worksheets saved</h3><p>Use the form above for a main home, rental property, business property, equipment, or investment land sale.</p></div>`;
      return;
    }
    ui.propertySalesList.innerHTML = `<div class="issue-list">${state.propertySales.map((saleValue) => {
      const result = calculatePropertySale(saleValue);
      const sale = result.sale;
      return `<article class="issue-item issue-item--${result.warnings.length ? "warning" : "info"}"><div class="issue-item__content"><div class="issue-item__heading"><strong>${escapeHtml(sale.label || propertyTypeLabel(sale.propertyType))}</strong><span class="issue-badge issue-badge--info">${escapeHtml(propertyTypeLabel(sale.propertyType))}</span></div><p>${escapeHtml(ownerLabel(sale.owner))} · Sold ${escapeHtml(formatDate(sale.dateSold) || "date not entered")} · Gain/loss ${escapeHtml(formatCurrency(result.totalGainLoss))}</p><p><strong>${escapeHtml(result.reportForm)}</strong></p></div><div class="issue-item__actions"><button class="button button--secondary" type="button" data-property-action="edit" data-property-id="${escapeHtml(sale.id)}">Edit</button><button class="button button--secondary" type="button" data-property-action="delete" data-property-id="${escapeHtml(sale.id)}">Delete</button></div></article>`;
    }).join("")}</div>`;
  }

  function defaultEstimateSettings() {
    return {
      taxYear: 2025,
      filingStatus: "single",
      ordinaryTaxableIncome: 0,
      shortTermLossCarryover: 0,
      longTermLossCarryover: 0,
      capitalGainDistributions: 0,
      magiBeforeGains: "",
      otherNetInvestmentIncome: 0,
      includeNiit: false,
      lastCalculatedAt: ""
    };
  }

  function normalizeEstimateSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = defaultEstimateSettings();
    const taxYear = Number(source.taxYear);
    const filingStatus = String(source.filingStatus || "");
    const magiRaw = source.magiBeforeGains;
    const magiNumber = Number(magiRaw);

    return {
      taxYear: FEDERAL_CAPITAL_GAINS_RULES[taxYear] ? taxYear : defaults.taxYear,
      filingStatus: ["single", "mfj", "mfs", "hoh", "qss"].includes(filingStatus)
        ? filingStatus
        : defaults.filingStatus,
      ordinaryTaxableIncome: nonNegativeNumber(source.ordinaryTaxableIncome),
      shortTermLossCarryover: nonNegativeNumber(source.shortTermLossCarryover),
      longTermLossCarryover: nonNegativeNumber(source.longTermLossCarryover),
      capitalGainDistributions: nonNegativeNumber(source.capitalGainDistributions),
      magiBeforeGains: magiRaw === "" || magiRaw === null || magiRaw === undefined || !Number.isFinite(magiNumber)
        ? ""
        : Math.max(0, magiNumber),
      otherNetInvestmentIncome: nonNegativeNumber(source.otherNetInvestmentIncome),
      includeNiit: Boolean(source.includeNiit),
      lastCalculatedAt: String(source.lastCalculatedAt || "")
    };
  }

  function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
  }

  function ensureEstimateWorkspace() {
    const view = byId("estimateView");
    if (!view) return null;

    let workspace = byId("capitalGainsEstimateWorkspace");
    if (!workspace) {
      view.querySelectorAll(".empty-state").forEach((element) => {
        const text = String(element.textContent || "").toLowerCase();
        if (text.includes("coming soon") || text.includes("estimate")) element.hidden = true;
      });

      workspace = document.createElement("div");
      workspace.id = "capitalGainsEstimateWorkspace";
      workspace.innerHTML = `
        <section class="panel" aria-labelledby="capitalGainsEstimateHeading">
          <div class="panel__heading">
            <div>
              <h3 id="capitalGainsEstimateHeading">Federal capital gains planning estimate</h3>
              <p>Estimate the incremental federal income-tax effect of verified transactions. This is not a final tax return calculation.</p>
            </div>
          </div>

          <div id="estimateReadinessMessage" role="status" style="margin-bottom:1rem;padding:0.9rem 1rem;border:1px solid var(--cg-border);border-radius:0.75rem;background:var(--cg-surface-soft);"></div>

          <div class="form-grid">
            <label class="form-field">
              <span>Tax year</span>
              <select id="estimateTaxYear">
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
              <small>Uses the selected year’s federal ordinary and long-term capital-gain thresholds.</small>
            </label>

            <label class="form-field">
              <span>Filing status</span>
              <select id="estimateFilingStatus">
                <option value="single">Single</option>
                <option value="mfj">Married filing jointly</option>
                <option value="mfs">Married filing separately</option>
                <option value="hoh">Head of household</option>
                <option value="qss">Qualifying surviving spouse</option>
              </select>
            </label>

            <label class="form-field">
              <span>Other taxable income before capital gains</span>
              <input id="estimateOrdinaryTaxableIncome" type="number" min="0" step="0.01" inputmode="decimal" value="0">
              <small>Enter taxable income after deductions, excluding the gains and losses organized in this workspace.</small>
            </label>

            <label class="form-field">
              <span>Short-term capital-loss carryover</span>
              <input id="estimateShortCarryover" type="number" min="0" step="0.01" inputmode="decimal" value="0">
              <small>Enter the prior-year short-term loss as a positive amount.</small>
            </label>

            <label class="form-field">
              <span>Long-term capital-loss carryover</span>
              <input id="estimateLongCarryover" type="number" min="0" step="0.01" inputmode="decimal" value="0">
              <small>Enter the prior-year long-term loss as a positive amount.</small>
            </label>

            <label class="form-field">
              <span>Other long-term capital-gain distributions</span>
              <input id="estimateCapitalGainDistributions" type="number" min="0" step="0.01" inputmode="decimal" value="0">
              <small>Optional amount not already included in the transaction list.</small>
            </label>
          </div>

          <details style="margin-top:1rem;">
            <summary><strong>Optional Net Investment Income Tax estimate</strong></summary>
            <div style="margin-top:1rem;">
              <label style="display:flex;align-items:flex-start;gap:0.65rem;margin-bottom:1rem;">
                <input id="estimateIncludeNiit" type="checkbox" style="margin-top:0.2rem;">
                <span>
                  <strong>Estimate possible 3.8% NIIT impact</strong><br>
                  <small>This simplified check requires MAGI and other net investment income. It does not replace Form 8960.</small>
                </span>
              </label>
              <div class="form-grid">
                <label class="form-field">
                  <span>MAGI before these capital gains</span>
                  <input id="estimateMagiBeforeGains" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Required for NIIT estimate">
                </label>
                <label class="form-field">
                  <span>Other net investment income</span>
                  <input id="estimateOtherNetInvestmentIncome" type="number" min="0" step="0.01" inputmode="decimal" value="0">
                  <small>Interest, dividends, rents, and other NII already included in MAGI, as applicable.</small>
                </label>
              </div>
            </div>
          </details>

          <div class="form-actions" style="margin-top:1.25rem;">
            <button id="estimateCalculateButton" class="button button--primary" type="button">Calculate estimate</button>
            <button id="estimateResetButton" class="button button--secondary" type="button">Reset estimate inputs</button>
          </div>
        </section>

        <section id="estimateResults" class="panel" style="margin-top:1rem;" aria-live="polite"></section>
      `;
      view.appendChild(workspace);
    }

    [
      "estimateTaxYear",
      "estimateFilingStatus",
      "estimateOrdinaryTaxableIncome",
      "estimateShortCarryover",
      "estimateLongCarryover",
      "estimateCapitalGainDistributions",
      "estimateMagiBeforeGains",
      "estimateOtherNetInvestmentIncome",
      "estimateIncludeNiit",
      "estimateCalculateButton",
      "estimateResetButton",
      "estimateReadinessMessage",
      "estimateResults"
    ].forEach((id) => {
      ui[id] = byId(id);
    });

    syncEstimateInputsFromState();
    return workspace;
  }

  function syncEstimateInputsFromState() {
    const settings = normalizeEstimateSettings(state.estimateSettings);
    state.estimateSettings = settings;
    if (ui.estimateTaxYear) ui.estimateTaxYear.value = String(settings.taxYear);
    if (ui.estimateFilingStatus) ui.estimateFilingStatus.value = settings.filingStatus;
    if (ui.estimateOrdinaryTaxableIncome) ui.estimateOrdinaryTaxableIncome.value = String(settings.ordinaryTaxableIncome);
    if (ui.estimateShortCarryover) ui.estimateShortCarryover.value = String(settings.shortTermLossCarryover);
    if (ui.estimateLongCarryover) ui.estimateLongCarryover.value = String(settings.longTermLossCarryover);
    if (ui.estimateCapitalGainDistributions) ui.estimateCapitalGainDistributions.value = String(settings.capitalGainDistributions);
    if (ui.estimateMagiBeforeGains) ui.estimateMagiBeforeGains.value = settings.magiBeforeGains === "" ? "" : String(settings.magiBeforeGains);
    if (ui.estimateOtherNetInvestmentIncome) ui.estimateOtherNetInvestmentIncome.value = String(settings.otherNetInvestmentIncome);
    if (ui.estimateIncludeNiit) ui.estimateIncludeNiit.checked = settings.includeNiit;
    syncOwnerFieldVisibility();
    syncImportSetupInputs();
    syncPropertySaleFields();
  }

  function readEstimateSettingsFromInputs() {
    return normalizeEstimateSettings({
      taxYear: ui.estimateTaxYear?.value,
      filingStatus: ui.estimateFilingStatus?.value,
      ordinaryTaxableIncome: ui.estimateOrdinaryTaxableIncome?.value,
      shortTermLossCarryover: ui.estimateShortCarryover?.value,
      longTermLossCarryover: ui.estimateLongCarryover?.value,
      capitalGainDistributions: ui.estimateCapitalGainDistributions?.value,
      magiBeforeGains: ui.estimateMagiBeforeGains?.value ?? "",
      otherNetInvestmentIncome: ui.estimateOtherNetInvestmentIncome?.value,
      includeNiit: ui.estimateIncludeNiit?.checked,
      lastCalculatedAt: state.estimateSettings?.lastCalculatedAt || ""
    });
  }

  function handleEstimateInput() {
    const previousStatus = state.estimateSettings?.filingStatus || "single";
    state.estimateSettings = readEstimateSettingsFromInputs();
    syncImportSetupFromEstimate(previousStatus);
    syncOwnerFieldVisibility();
    renderValidation();
    renderEstimateWorkspace();
    queueAutoSave();
  }

  async function handleEstimateCalculate() {
    state.estimateSettings = {
      ...readEstimateSettingsFromInputs(),
      lastCalculatedAt: new Date().toISOString()
    };
    renderEstimateWorkspace();
    const saved = await saveWorkspace();
    showToast(
      saved ? "Estimate inputs and results saved in this browser." : "Estimate calculated, but browser storage could not be confirmed.",
      saved ? "success" : "warning"
    );
  }

  async function handleEstimateReset() {
    const previousStatus = state.estimateSettings?.filingStatus || "single";
    state.estimateSettings = defaultEstimateSettings();
    syncImportSetupFromEstimate(previousStatus);
    syncEstimateInputsFromState();
    renderValidation();
    renderEstimateWorkspace();
    const saved = await saveWorkspace();
    showToast(saved ? "Estimate inputs reset." : "Estimate inputs reset, but browser storage could not be confirmed.", saved ? "success" : "warning");
  }

  function renderEstimateWorkspace() {
    if (!ensureEstimateWorkspace() || !ui.estimateResults || !ui.estimateReadinessMessage) return;

    const issues = collectIssues(state.transactions);
    const blockingIssues = issues.filter((issue) => issue.type === "error");
    const totals = summarizeTransactions(state.transactions);
    const verifiedTransactions = totals.all.verifiedCount;
    const settings = normalizeEstimateSettings(state.estimateSettings);
    const result = calculateFederalCapitalGainsEstimate(settings, totals);

    if (blockingIssues.length > 0) {
      ui.estimateReadinessMessage.innerHTML = `<strong>Estimate blocked.</strong> Resolve ${blockingIssues.length} transaction issue${blockingIssues.length === 1 ? "" : "s"} in Review first. Broker-reported amounts are not substituted for missing verified values.`;
    } else if (verifiedTransactions === 0 && settings.capitalGainDistributions === 0 && settings.shortTermLossCarryover === 0 && settings.longTermLossCarryover === 0) {
      ui.estimateReadinessMessage.innerHTML = `<strong>No verified capital-gain amounts yet.</strong> Add or import transactions, or enter applicable carryovers/distributions.`;
    } else {
      ui.estimateReadinessMessage.innerHTML = `<strong>Ready for a planning estimate.</strong> Using ${verifiedTransactions} verified transaction${verifiedTransactions === 1 ? "" : "s"} and ${settings.taxYear} federal thresholds.`;
    }

    if (ui.estimateCalculateButton) {
      ui.estimateCalculateButton.disabled = blockingIssues.length > 0;
      ui.estimateCalculateButton.title = blockingIssues.length > 0
        ? "Resolve blocking transaction issues before calculating."
        : "Calculate and save the planning estimate.";
    }

    ui.estimateResults.innerHTML = estimateResultsHtml(result, settings, blockingIssues);
  }

  function calculateFederalCapitalGainsEstimate(settings, totals) {
    const rules = FEDERAL_CAPITAL_GAINS_RULES[settings.taxYear];
    const status = settings.filingStatus;
    const ordinaryBrackets = rules.ordinaryBrackets[status];
    const longTermThresholds = rules.longTermThresholds[status];

    const verifiedShort = totals.short.gainLoss;
    const verifiedLong = totals.long.gainLoss;
    const shortBeforeNetting = verifiedShort - settings.shortTermLossCarryover;
    const longBeforeNetting = verifiedLong + settings.capitalGainDistributions - settings.longTermLossCarryover;

    let netShort = shortBeforeNetting;
    let netLong = longBeforeNetting;
    if (netShort > 0 && netLong < 0) {
      const offset = Math.min(netShort, Math.abs(netLong));
      netShort -= offset;
      netLong += offset;
    } else if (netShort < 0 && netLong > 0) {
      const offset = Math.min(Math.abs(netShort), netLong);
      netShort += offset;
      netLong -= offset;
    }

    const combinedNet = shortBeforeNetting + longBeforeNetting;
    const lossLimit = status === "mfs" ? 1500 : 3000;
    const deductibleCapitalLoss = combinedNet < 0 ? Math.min(Math.abs(combinedNet), lossLimit) : 0;
    const estimatedFutureCarryover = combinedNet < 0 ? Math.max(0, Math.abs(combinedNet) - deductibleCapitalLoss) : 0;
    const taxableShortGain = combinedNet > 0 ? Math.max(0, netShort) : 0;
    const taxableLongGain = combinedNet > 0 ? Math.max(0, netLong) : 0;

    const baselineOrdinaryIncome = settings.ordinaryTaxableIncome;
    const ordinaryIncomeWithCapital = Math.max(0, baselineOrdinaryIncome + taxableShortGain - deductibleCapitalLoss);
    const baselineRegularTax = calculateOrdinaryIncomeTax(baselineOrdinaryIncome, ordinaryBrackets);
    const ordinaryTaxWithCapital = calculateOrdinaryIncomeTax(ordinaryIncomeWithCapital, ordinaryBrackets);
    const longTermTax = calculateStackedLongTermCapitalGainsTax(
      ordinaryIncomeWithCapital,
      taxableLongGain,
      longTermThresholds
    );
    const regularTaxWithCapital = ordinaryTaxWithCapital + longTermTax.total;
    const incrementalRegularTax = regularTaxWithCapital - baselineRegularTax;

    const niit = calculateIncrementalNiit(settings, taxableShortGain + taxableLongGain);
    const incrementalFederalImpact = incrementalRegularTax + niit.incremental;
    const positiveNetGain = taxableShortGain + taxableLongGain;

    return {
      verifiedShort,
      verifiedLong,
      shortBeforeNetting,
      longBeforeNetting,
      netShort,
      netLong,
      combinedNet,
      taxableShortGain,
      taxableLongGain,
      deductibleCapitalLoss,
      estimatedFutureCarryover,
      lossLimit,
      baselineOrdinaryIncome,
      ordinaryIncomeWithCapital,
      baselineRegularTax,
      ordinaryTaxWithCapital,
      longTermTax,
      regularTaxWithCapital,
      incrementalRegularTax,
      niit,
      incrementalFederalImpact,
      effectiveRate: positiveNetGain > 0 ? incrementalFederalImpact / positiveNetGain : null,
      unresolvedCount: totals.all.unresolvedCount,
      verifiedCount: totals.all.verifiedCount
    };
  }

  function calculateOrdinaryIncomeTax(income, brackets) {
    let remaining = Math.max(0, Number(income) || 0);
    let lower = 0;
    let tax = 0;

    for (const [upper, rate] of brackets) {
      if (remaining <= 0) break;
      const width = upper === Infinity ? remaining : Math.max(0, upper - lower);
      const amount = Math.min(remaining, width);
      tax += amount * rate;
      remaining -= amount;
      lower = upper;
    }

    return tax;
  }

  function calculateStackedLongTermCapitalGainsTax(ordinaryIncome, longTermGain, thresholds) {
    let remaining = Math.max(0, Number(longTermGain) || 0);
    const ordinary = Math.max(0, Number(ordinaryIncome) || 0);
    const zeroCapacity = Math.max(0, thresholds.zero - ordinary);
    const atZero = Math.min(remaining, zeroCapacity);
    remaining -= atZero;

    const stackedAfterZero = ordinary + atZero;
    const fifteenCapacity = Math.max(0, thresholds.fifteen - stackedAfterZero);
    const atFifteen = Math.min(remaining, fifteenCapacity);
    remaining -= atFifteen;

    const atTwenty = Math.max(0, remaining);
    return {
      atZero,
      atFifteen,
      atTwenty,
      total: atFifteen * 0.15 + atTwenty * 0.20
    };
  }

  function calculateIncrementalNiit(settings, positiveCapitalGain) {
    if (!settings.includeNiit) {
      return { enabled: false, available: false, baseline: 0, current: 0, incremental: 0, threshold: NIIT_THRESHOLDS[settings.filingStatus] };
    }

    if (settings.magiBeforeGains === "") {
      return { enabled: true, available: false, baseline: 0, current: 0, incremental: 0, threshold: NIIT_THRESHOLDS[settings.filingStatus] };
    }

    const threshold = NIIT_THRESHOLDS[settings.filingStatus];
    const baseMagi = Number(settings.magiBeforeGains);
    const capitalGain = Math.max(0, positiveCapitalGain);
    const baseNii = settings.otherNetInvestmentIncome;
    const currentMagi = baseMagi + capitalGain;
    const currentNii = baseNii + capitalGain;
    const baseline = 0.038 * Math.min(baseNii, Math.max(0, baseMagi - threshold));
    const current = 0.038 * Math.min(currentNii, Math.max(0, currentMagi - threshold));

    return {
      enabled: true,
      available: true,
      threshold,
      baseline,
      current,
      incremental: current - baseline,
      currentMagi,
      currentNii
    };
  }

  function estimateResultsHtml(result, settings, blockingIssues) {
    const blocked = blockingIssues.length > 0;
    const statusLabel = filingStatusLabel(settings.filingStatus);
    const impactLabel = result.incrementalFederalImpact >= 0
      ? "Estimated incremental federal tax"
      : "Estimated federal tax reduction";
    const impactAmount = Math.abs(result.incrementalFederalImpact);
    const niitText = !settings.includeNiit
      ? "Not selected"
      : !result.niit.available
        ? "MAGI required"
        : formatCurrency(result.niit.incremental);

    return `
      <div class="panel__heading">
        <div>
          <h3>Estimate results</h3>
          <p>${escapeHtml(String(settings.taxYear))} · ${escapeHtml(statusLabel)} · verified transactions only</p>
        </div>
      </div>

      ${blocked ? `<div class="issue-item issue-item--error" style="margin-bottom:1rem;"><div class="issue-item__content"><strong>Calculation unavailable</strong><p>Resolve blocking items in Review. The figures below show netting inputs only and are not a completed tax estimate.</p></div></div>` : ""}

      <div class="summary-grid">
        <article class="status-card">
          <span>Verified short-term gain/loss</span>
          <strong class="${amountClass(result.verifiedShort)}">${formatCurrency(result.verifiedShort)}</strong>
          <small>Before short-term carryover</small>
        </article>
        <article class="status-card">
          <span>Verified long-term gain/loss</span>
          <strong class="${amountClass(result.verifiedLong)}">${formatCurrency(result.verifiedLong)}</strong>
          <small>Before distributions and carryover</small>
        </article>
        <article class="status-card">
          <span>Net capital result</span>
          <strong class="${amountClass(result.combinedNet)}">${formatCurrency(result.combinedNet)}</strong>
          <small>After carryovers and short/long netting</small>
        </article>
        <article class="status-card">
          <span>${escapeHtml(impactLabel)}</span>
          <strong class="${result.incrementalFederalImpact < 0 ? "amount--negative" : "amount--positive"}">${blocked ? "Blocked" : formatCurrency(impactAmount)}</strong>
          <small>Regular tax plus selected NIIT estimate</small>
        </article>
      </div>

      <div class="table-wrap" style="margin-top:1rem;">
        <table>
          <thead>
            <tr><th>Calculation step</th><th>Amount</th><th>Treatment</th></tr>
          </thead>
          <tbody>
            <tr><td>Short-term after carryover</td><td>${formatCurrency(result.shortBeforeNetting)}</td><td>Ordinary-rate side before cross-netting</td></tr>
            <tr><td>Long-term after distributions/carryover</td><td>${formatCurrency(result.longBeforeNetting)}</td><td>Preferential-rate side before cross-netting</td></tr>
            <tr><td>Taxable short-term gain after netting</td><td>${formatCurrency(result.taxableShortGain)}</td><td>Added to ordinary taxable income</td></tr>
            <tr><td>Taxable long-term gain after netting</td><td>${formatCurrency(result.taxableLongGain)}</td><td>Stacked through 0%, 15%, and 20% bands</td></tr>
            <tr><td>Current-year capital-loss deduction</td><td>${formatCurrency(result.deductibleCapitalLoss)}</td><td>Limited to ${formatCurrency(result.lossLimit)}</td></tr>
            <tr><td>Estimated unused loss carried forward</td><td>${formatCurrency(result.estimatedFutureCarryover)}</td><td>Exact short/long character requires the Schedule D carryover worksheet</td></tr>
            <tr><td>Long-term amount at 0%</td><td>${formatCurrency(result.longTermTax.atZero)}</td><td>Based on taxable-income stacking</td></tr>
            <tr><td>Long-term amount at 15%</td><td>${formatCurrency(result.longTermTax.atFifteen)}</td><td>Based on taxable-income stacking</td></tr>
            <tr><td>Long-term amount at 20%</td><td>${formatCurrency(result.longTermTax.atTwenty)}</td><td>Based on taxable-income stacking</td></tr>
            <tr><td>Incremental regular federal tax</td><td>${blocked ? "Blocked" : formatCurrency(result.incrementalRegularTax)}</td><td>Tax with organized gains minus tax without them</td></tr>
            <tr><td>Incremental NIIT estimate</td><td>${blocked ? "Blocked" : escapeHtml(niitText)}</td><td>${settings.includeNiit ? "Simplified Form 8960 screening estimate" : "Not included"}</td></tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top:1rem;padding:1rem;border:1px solid var(--cg-border);border-radius:0.75rem;background:var(--cg-surface-soft);">
        <strong>Planning limitations</strong>
        <p style="margin:0.4rem 0 0;">This estimate assumes the entered “other taxable income” is already after deductions. It does not calculate the complete Form 1040, standard or itemized deductions, qualified dividends, collectibles or 28% rate gain, unrecaptured section 1250 gain, section 1202 exclusions, AMT, state tax, credits, or every Form 8960 adjustment.</p>
      </div>
    `;
  }

  function filingStatusLabel(status) {
    if (status === "mfj") return "Married filing jointly";
    if (status === "mfs") return "Married filing separately";
    if (status === "hoh") return "Head of household";
    if (status === "qss") return "Qualifying surviving spouse";
    return "Single";
  }

  async function loadWorkspace() {
    let indexedData = null;
    let fallbackData = null;

    try {
      const database = await openDatabase();
      const record = await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(WORKSPACE_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (record?.data?.transactions && Array.isArray(record.data.transactions)) {
        indexedData = record.data;
      }
    } catch (error) {
      console.warn("IndexedDB workspace load failed.", error);
    }

    try {
      const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || "null");
      if (parsed?.transactions && Array.isArray(parsed.transactions)) fallbackData = parsed;
    } catch (error) {
      console.warn("Fallback workspace load failed.", error);
    }

    const candidates = [indexedData, fallbackData].filter(Boolean);
    if (!candidates.length) return;
    const selected = candidates.sort((a, b) => {
      const aTime = new Date(a.savedAt || 0).getTime() || 0;
      const bTime = new Date(b.savedAt || 0).getTime() || 0;
      return bTime - aTime;
    })[0];

    state.transactions = selected.transactions.map(normalizeTransaction);
    state.importBatches = Array.isArray(selected.importBatches)
      ? selected.importBatches.map(normalizeImportBatch)
      : [];
    state.importAudit = normalizeImportAudit(selected.importAudit);
    state.estimateSettings = normalizeEstimateSettings(selected.estimateSettings);
    state.importSetup = normalizeImportSetup(selected.importSetup, state.estimateSettings.filingStatus);
    state.propertySales = Array.isArray(selected.propertySales)
      ? selected.propertySales.map(normalizePropertySale)
      : [];
    syncEstimateInputsFromState();
    syncImportSetupInputs();
    ensureImportBatchHistory();
    renderPropertySalesWorkspace();
  }

  function buildWorkspaceData() {
    return {
      version: 8,
      savedAt: new Date().toISOString(),
      transactions: state.transactions.map(normalizeTransaction),
      importBatches: state.importBatches.map(normalizeImportBatch),
      importAudit: normalizeImportAudit(state.importAudit),
      estimateSettings: normalizeEstimateSettings(state.estimateSettings),
      importSetup: normalizeImportSetup(state.importSetup, state.estimateSettings?.filingStatus),
      propertySales: state.propertySales.map(normalizePropertySale)
    };
  }

  function saveWorkspaceFallbackSync(data = buildWorkspaceData()) {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn("Fallback workspace save failed.", error);
      return false;
    }
  }

  async function saveWorkspace() {
    const data = buildWorkspaceData();

    // Write the synchronous fallback first so a rapid refresh cannot lose
    // a newly imported batch while IndexedDB is still completing.
    const fallbackSaved = saveWorkspaceFallbackSync(data);
    let indexedDbSaved = false;

    try {
      const database = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB save was aborted."));
        transaction.objectStore(STORE_NAME).put({ key: WORKSPACE_KEY, data });
      });
      indexedDbSaved = true;
    } catch (error) {
      console.warn("IndexedDB workspace save failed.", error);
    }

    return fallbackSaved || indexedDbSaved;
  }

  function queueAutoSave() {
    window.clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = window.setTimeout(() => {
      void saveWorkspace();
    }, 350);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function downloadBackup() {
    const payload = {
      application: "Velzarytha Capital Gains Estimator",
      version: 4,
      exportedAt: new Date().toISOString(),
      transactions: state.transactions.map(normalizeTransaction),
      importBatches: state.importBatches.map(normalizeImportBatch),
      importAudit: normalizeImportAudit(state.importAudit),
      estimateSettings: normalizeEstimateSettings(state.estimateSettings),
      importSetup: normalizeImportSetup(state.importSetup, state.estimateSettings?.filingStatus),
      propertySales: state.propertySales.map(normalizePropertySale)
    };

    downloadTextFile(
      `velzarytha-capital-gains-backup-${dateStamp()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );

    showToast("Workspace backup downloaded.", "success");
  }

  async function handleBackupRestore() {
    const file = ui.backupFileInput.files?.[0];
    if (!file) return;

    ui.backupFileSelection.textContent = file.name;

    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.transactions)) {
        throw new Error("The backup does not contain a transaction list.");
      }

      const restored = parsed.transactions.map(normalizeTransaction);
      const restoredBatches = Array.isArray(parsed.importBatches)
        ? parsed.importBatches.map(normalizeImportBatch)
        : [];
      const restoredImportAudit = normalizeImportAudit(parsed.importAudit);
      const restoredEstimateSettings = normalizeEstimateSettings(parsed.estimateSettings);
      const restoredImportSetup = normalizeImportSetup(parsed.importSetup, restoredEstimateSettings.filingStatus);
      const restoredPropertySales = Array.isArray(parsed.propertySales)
        ? parsed.propertySales.map(normalizePropertySale)
        : [];

      showConfirmDialog({
        title: "Restore workspace?",
        message: `Replace the current workspace with ${restored.length} restored transaction${
          restored.length === 1 ? "" : "s"
        }?`,
        confirmLabel: "Restore",
        onConfirm: () => {
          state.transactions = restored;
          state.importBatches = restoredBatches;
          state.importAudit = restoredImportAudit;
          state.estimateSettings = restoredEstimateSettings;
          state.importSetup = restoredImportSetup;
          state.propertySales = restoredPropertySales;
          syncEstimateInputsFromState();
          syncImportSetupInputs();
          ensureImportBatchHistory();
          renderAll();
          renderPropertySalesWorkspace();
          queueAutoSave();
          ui.backupFileInput.value = "";
          showToast("Workspace restored.", "success");
        }
      });
    } catch (error) {
      console.error(error);
      showToast("This file is not a valid Velzarytha backup.", "error");
      ui.backupFileInput.value = "";
    }
  }

  async function handleCsvFile() {
    const file = ui.csvFileInput.files?.[0];
    if (!file) return;

    ui.csvFileSelection.textContent = file.name;

    try {
      const text = await file.text();
      const fileHash = await createFileHash(text);
      const existingBatch = state.importBatches.find(
        (batch) => batch.fileHash && batch.fileHash === fileHash
      );

      const continueLoading = () => {
        try {
          prepareCsvImport(file, text, fileHash);
        } catch (error) {
          console.error(error);
          showToast(error.message || "The CSV could not be read.", "error");
          ui.csvFileInput.value = "";
          ui.csvFileSelection.textContent = "No CSV selected";
        }
      };

      if (existingBatch) {
        showConfirmDialog({
          title: "This file appears to have been imported already",
          message: `${file.name} matches an import from ${formatDateTime(
            existingBatch.importedAt
          )}. Loading it again may create duplicate transactions. Continue only after checking the import history.`,
          confirmLabel: "Load anyway",
          onConfirm: continueLoading
        });
        return;
      }

      continueLoading();
    } catch (error) {
      console.error(error);
      showToast(error.message || "The CSV could not be read.", "error");
      ui.csvFileInput.value = "";
      ui.csvFileSelection.textContent = "No CSV selected";
    }
  }

  function prepareCsvImport(file, text, fileHash) {
    const parsedRows = parseCsv(text);

    if (parsedRows.length < 2) {
      throw new Error("The CSV must contain a header row and at least one data row.");
    }

    const headers = makeUniqueHeaders(parsedRows[0]);
    const rows = parsedRows
      .slice(1)
      .filter((row) => row.some((value) => String(value).trim() !== ""))
      .map((row) => headers.map((_, index) => String(row[index] ?? "").trim()));

    if (rows.length === 0) {
      throw new Error("No transaction rows were found.");
    }

    state.pdfImport = null;
    state.csvImport = {
      batchId: createId(),
      fileName: file.name,
      fileSize: Number(file.size) || 0,
      fileLastModified: Number(file.lastModified) || 0,
      fileHash,
      headers,
      rows,
      mapping: suggestCsvMapping(headers),
      pendingTransactions: [],
      validationErrors: [],
      possibleDuplicates: []
    };

    renderCsvMappingWorkspace();
    openView("importView");
    showToast("CSV loaded. Review the column mapping.", "success");
  }

  function renderCsvMappingWorkspace() {
    const csv = state.csvImport;
    if (!csv) return;

    ui.importWorkspace.hidden = false;
    ui.importWorkspaceTitle.textContent = `Map ${csv.fileName}`;

    const mappingRows = CSV_FIELDS.map((field) => {
      const selectedIndex = csv.mapping[field.key];
      const options = [
        `<option value="">Not mapped</option>`,
        ...csv.headers.map(
          (header, index) =>
            `<option value="${index}" ${Number(selectedIndex) === index ? "selected" : ""}>${escapeHtml(
              header
            )}</option>`
        )
      ].join("");

      return `
        <div class="form-field">
          <label for="csv-map-${field.key}">
            ${escapeHtml(field.label)}${field.required ? " *" : ""}
          </label>
          <select id="csv-map-${field.key}" data-csv-map="${field.key}">
            ${options}
          </select>
        </div>
      `;
    }).join("");

    const previewRows = csv.rows
      .slice(0, 8)
      .map(
        (row) => `
          <tr>
            ${csv.headers
              .map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`)
              .join("")}
          </tr>
        `
      )
      .join("");

    ui.importWorkspaceContent.innerHTML = `
      <div class="notice notice--info">
        <div class="notice__icon" aria-hidden="true">i</div>
        <div>
          <h3>Confirm the broker column mapping</h3>
          <p>Required fields are description, date sold, and proceeds. Review dates and amounts before importing.</p>
        </div>
      </div>

      <div class="form-section">
        <div class="form-grid">
          ${mappingRows}
        </div>
      </div>

      <div class="table-wrap">
        <table class="transaction-table">
          <thead>
            <tr>${csv.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>${previewRows}</tbody>
        </table>
      </div>

      <p class="field-hint">Showing the first ${Math.min(8, csv.rows.length)} of ${csv.rows.length} rows.</p>

      <div class="form-actions">
        <button class="button button--secondary" type="button" data-csv-action="cancel">Cancel</button>
        <button class="button button--primary" type="button" data-csv-action="validate">Validate CSV</button>
      </div>
    `;
  }

  function handleImportWorkspaceChange(event) {
    const mappingField = event.target.closest("[data-pdf-map-field]");
    if (mappingField && state.pdfImport?.extractionStage === "mapping") {
      updatePdfMappingRowFromField(mappingField);
      return;
    }

    const candidateField = event.target.closest("[data-pdf-candidate-field]");
    if (candidateField && state.pdfImport?.extractionStage === "transactions") {
      updatePdfCandidateFromField(candidateField);
      return;
    }

    const candidateSelected = event.target.closest("input[data-pdf-candidate-selected]");
    if (candidateSelected && state.pdfImport?.extractionStage === "transactions") {
      const candidate = state.pdfImport.candidates.find(
        (item) => item.id === candidateSelected.dataset.pdfCandidateSelected
      );
      if (candidate) {
        candidate.selected = candidateSelected.checked;
        validateAllPdfCandidates();
        renderPdfTransactionReviewWorkspace();
      }
      return;
    }

    const pdfTypeSelect = event.target.closest("select[data-pdf-page-type]");
    if (pdfTypeSelect && state.pdfImport) {
      const page = state.pdfImport.pages.find(
        (item) => item.pageNumber === Number(pdfTypeSelect.dataset.pdfPageType)
      );
      if (page) {
        page.overrideType = pdfTypeSelect.value;
        page.selectedFor1099B = isPdf1099BType(effectivePdfPageType(page));
        const card = pdfTypeSelect.closest("[data-pdf-page-card]");
        const checkbox = card?.querySelector("input[data-pdf-page-selected]");
        const heading = card?.querySelector("[data-pdf-page-heading]");
        if (checkbox) checkbox.checked = page.selectedFor1099B;
        if (heading) {
          heading.textContent = `Page ${page.pageNumber}: ${pdfPageTypeLabel(
            effectivePdfPageType(page)
          )}`;
        }
        updatePdfReviewSummary();
      }
      return;
    }

    const pdfCheckbox = event.target.closest("input[data-pdf-page-selected]");
    if (pdfCheckbox && state.pdfImport) {
      const page = state.pdfImport.pages.find(
        (item) => item.pageNumber === Number(pdfCheckbox.dataset.pdfPageSelected)
      );
      if (page) {
        page.selectedFor1099B = pdfCheckbox.checked;
        updatePdfReviewSummary();
      }
      return;
    }

    const select = event.target.closest("select[data-csv-map]");
    if (!select || !state.csvImport) return;

    state.csvImport.mapping[select.dataset.csvMap] =
      select.value === "" ? null : Number(select.value);
  }

  function handleImportWorkspaceClick(event) {
    const pdfButton = event.target.closest("button[data-pdf-action]");
    if (pdfButton) {
      handlePdfWorkspaceAction(pdfButton.dataset.pdfAction, pdfButton);
      return;
    }

    const batchButton = event.target.closest("button[data-batch-action]");
    if (batchButton) {
      handleImportBatchAction(batchButton);
      return;
    }

    const button = event.target.closest("button[data-csv-action]");
    if (!button) return;

    if (button.dataset.csvAction === "cancel") {
      clearCsvImport();
      return;
    }

    if (button.dataset.csvAction === "validate") {
      validateCsvImport();
      return;
    }

    if (button.dataset.csvAction === "import") {
      void importValidatedCsvRows();
      return;
    }

    if (button.dataset.csvAction === "back") {
      renderCsvMappingWorkspace();
    }
  }

  function validateCsvImport() {
    const csv = state.csvImport;
    if (!csv) return;

    const missingRequired = CSV_FIELDS.filter(
      (field) => field.required && !Number.isInteger(csv.mapping[field.key])
    );

    if (missingRequired.length > 0) {
      showToast(
        `Map the required field${missingRequired.length === 1 ? "" : "s"}: ${missingRequired
          .map((field) => field.label)
          .join(", ")}.`,
        "error"
      );
      return;
    }

    const batchId = csv.batchId || createId();
    csv.batchId = batchId;
    const valid = [];
    const errors = [];

    csv.rows.forEach((row, rowIndex) => {
      const result = csvRowToTransaction(row, rowIndex + 2, batchId);

      if (!result.valid) {
        errors.push(...result.errors.map((error) => ({ ...error, kind: "invalid" })));
        return;
      }

      valid.push(result.transaction);
    });

    const fingerprintCounts = new Map();
    [...state.transactions, ...valid].forEach((transaction) => {
      const fingerprint = transactionFingerprint(transaction);
      fingerprintCounts.set(fingerprint, (fingerprintCounts.get(fingerprint) || 0) + 1);
    });

    const possibleDuplicates = valid
      .filter(
        (transaction) =>
          (fingerprintCounts.get(transactionFingerprint(transaction)) || 0) > 1
      )
      .map((transaction) => ({
        rowNumber: transaction.source?.rowNumber || "?",
        message:
          "This row closely matches another transaction. It will be imported and flagged for review because it may represent a separate tax lot."
      }));

    csv.pendingTransactions = valid;
    csv.validationErrors = errors;
    csv.possibleDuplicates = possibleDuplicates;
    renderCsvValidationResult();
  }

  function csvRowToTransaction(row, rowNumber, batchId) {
    const csv = state.csvImport;
    const value = (field) => {
      const index = csv.mapping[field];
      return Number.isInteger(index) ? String(row[index] ?? "").trim() : "";
    };

    const errors = [];
    const description = value("description");
    const owner = normalizeTransactionOwner(value("owner") || defaultTransactionOwner());
    const assetType = normalizeAssetType(value("assetType") || "stock");
    const mappedSourceForm = normalizeSourceForm(value("sourceForm"));
    const sourceForm = mappedSourceForm || (assetType === "digital-asset" ? "1099-da" : "1099-b");
    const soldDate = parseFlexibleDate(value("soldDate"));
    const proceeds = parseMoney(value("proceeds"));
    const acquiredRaw = value("acquiredDate");
    const acquiredVarious = /various/i.test(acquiredRaw);
    const acquiredDate = acquiredVarious ? "" : parseFlexibleDate(acquiredRaw);
    const basisRaw = value("basis");
    const basis = parseMoney(basisRaw);
    const fees = parseMoney(value("fees"));
    const adjustmentAmount = parseMoney(value("adjustmentAmount"));

    if (!description) {
      errors.push({ rowNumber, message: "Description is missing." });
    }

    if (!soldDate) {
      errors.push({ rowNumber, message: "Sale date is missing or invalid." });
    }

    if (!Number.isFinite(proceeds)) {
      errors.push({ rowNumber, message: "Proceeds are missing or invalid." });
    }

    if (acquiredRaw && !acquiredVarious && !acquiredDate) {
      errors.push({ rowNumber, message: "Acquisition date is invalid." });
    }

    if (basisRaw && !Number.isFinite(basis)) {
      errors.push({ rowNumber, message: "Cost basis is invalid." });
    }

    if (value("fees") && !Number.isFinite(fees)) {
      errors.push({ rowNumber, message: "Selling fees are invalid." });
    }

    if (value("adjustmentAmount") && !Number.isFinite(adjustmentAmount)) {
      errors.push({ rowNumber, message: "Adjustment amount is invalid." });
    }

    if (acquiredDate && soldDate && compareIsoDates(soldDate, acquiredDate) < 0) {
      errors.push({ rowNumber, message: "Sale date is earlier than acquisition date." });
    }

    if (errors.length > 0) {
      return { valid: false, errors, transaction: null };
    }

    const termOverride = parseTermValue(value("term"));
    const basisReported = parseBasisReportedValue(value("basisReported"));
    const costBasisMissing = !basisRaw;

    const transaction = normalizeTransaction({
      id: createId(),
      owner,
      assetType,
      sourceForm,
      brokerName: value("broker"),
      accountLabel: maskAccountLabel(value("account")),
      assetDescription: description,
      symbolCusip: value("symbol"),
      dateAcquired: acquiredDate,
      dateAcquiredVarious: acquiredVarious,
      dateSold: soldDate,
      termOverride,
      proceeds,
      costBasis: costBasisMissing ? 0 : basis,
      costBasisMissing,
      fees: Number.isFinite(fees) ? fees : 0,
      adjustmentCode: value("adjustmentCode").toUpperCase(),
      adjustmentAmount: Number.isFinite(adjustmentAmount) ? adjustmentAmount : 0,
      basisReported,
      form8949Category: "auto",
      transactionNotes: `Imported from ${csv.fileName}, row ${rowNumber}.`,
      source: {
        type: "csv",
        fileName: csv.fileName,
        fileHash: csv.fileHash || "",
        batchId,
        rowNumber,
        originalValues: {
          description: value("description"),
          owner: value("owner"),
          assetType: value("assetType"),
          sourceForm: value("sourceForm"),
          symbol: value("symbol"),
          acquiredDate: value("acquiredDate"),
          soldDate: value("soldDate"),
          proceeds: value("proceeds"),
          basis: value("basis"),
          fees: value("fees"),
          adjustmentCode: value("adjustmentCode"),
          adjustmentAmount: value("adjustmentAmount"),
          broker: value("broker"),
          account: maskAccountLabel(value("account")),
          term: value("term"),
          basisReported: value("basisReported")
        }
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return { valid: true, errors: [], transaction };
  }

  function renderCsvValidationResult() {
    const csv = state.csvImport;
    if (!csv) return;

    const invalidRowsHtml = csv.validationErrors.length
      ? `
        <div class="issue-list">
          ${csv.validationErrors
            .slice(0, 50)
            .map(
              (error) => `
                <article class="issue-item issue-item--warning">
                  <div class="issue-item__content">
                    <h4>CSV row ${error.rowNumber}</h4>
                    <p>${escapeHtml(error.message)}</p>
                  </div>
                  <span class="issue-badge issue-badge--warning">Skipped</span>
                </article>
              `
            )
            .join("")}
        </div>
        ${
          csv.validationErrors.length > 50
            ? `<p class="field-hint">Only the first 50 skipped-row issues are shown.</p>`
            : ""
        }
      `
      : "";

    const possibleDuplicates = Array.isArray(csv.possibleDuplicates)
      ? csv.possibleDuplicates
      : [];
    const duplicateWarningsHtml = possibleDuplicates.length
      ? `
        <div class="notice notice--info">
          <div class="notice__icon">i</div>
          <div>
            <h3>Possible duplicates will still be imported</h3>
            <p>Matching rows are not deleted or skipped automatically. Review them against the brokerage statement because identical values can represent separate tax lots.</p>
          </div>
        </div>
        <div class="issue-list">
          ${possibleDuplicates
            .slice(0, 50)
            .map(
              (warning) => `
                <article class="issue-item issue-item--info">
                  <div class="issue-item__content">
                    <h4>CSV row ${warning.rowNumber}</h4>
                    <p>${escapeHtml(warning.message)}</p>
                  </div>
                  <span class="issue-badge issue-badge--info">Review</span>
                </article>
              `
            )
            .join("")}
        </div>
        ${
          possibleDuplicates.length > 50
            ? `<p class="field-hint">Only the first 50 possible-duplicate warnings are shown.</p>`
            : ""
        }
      `
      : "";

    const validationDetailsHtml =
      invalidRowsHtml || duplicateWarningsHtml
        ? `${invalidRowsHtml}${duplicateWarningsHtml}`
        : `<div class="notice notice--info"><div class="notice__icon">✓</div><div><h3>No row errors found</h3><p>All parsed rows are ready for import.</p></div></div>`;

    ui.importWorkspaceTitle.textContent = "CSV validation results";
    ui.importWorkspaceContent.innerHTML = `
      <div class="review-summary">
        <article class="review-card">
          <span class="review-card__label">Ready to import</span>
          <strong>${csv.pendingTransactions.length}</strong>
          <small>All valid rows, including possible matches</small>
        </article>
        <article class="review-card">
          <span class="review-card__label">Possible duplicates</span>
          <strong>${possibleDuplicates.length}</strong>
          <small>Imported but flagged for review</small>
        </article>
        <article class="review-card">
          <span class="review-card__label">Invalid rows</span>
          <strong>${csv.validationErrors.length}</strong>
          <small>Skipped with a stated reason</small>
        </article>
      </div>

      ${validationDetailsHtml}

      <p class="field-hint">
        Total CSV rows reviewed: ${csv.rows.length}. Invalid rows are skipped. Possible duplicate rows remain in the import and are never removed automatically.
      </p>

      <div class="form-actions">
        <button class="button button--secondary" type="button" data-csv-action="back">Back to mapping</button>
        <button class="button button--primary" type="button" data-csv-action="import" ${
          csv.pendingTransactions.length === 0 ? "disabled" : ""
        }>
          Import ${csv.pendingTransactions.length} transaction${
            csv.pendingTransactions.length === 1 ? "" : "s"
          }
        </button>
      </div>
    `;
  }

  async function importValidatedCsvRows() {
    const csv = state.csvImport;
    if (!csv || csv.pendingTransactions.length === 0) return;

    const invalidRows = csv.validationErrors.length;
    const possibleDuplicateRows = Array.isArray(csv.possibleDuplicates)
      ? csv.possibleDuplicates.length
      : 0;
    const importedAt = new Date().toISOString();
    const batchId = csv.batchId || createId();

    const transactions = csv.pendingTransactions.map((transaction) =>
      normalizeTransaction({
        ...transaction,
        source: {
          ...(transaction.source || {}),
          batchId,
          importedAt
        }
      })
    );

    const batch = normalizeImportBatch({
      id: batchId,
      type: "csv",
      fileName: csv.fileName,
      fileHash: csv.fileHash || "",
      fileSize: csv.fileSize || 0,
      fileLastModified: csv.fileLastModified || 0,
      importedAt,
      rowCount: csv.rows.length,
      importedCount: transactions.length,
      invalidRows,
      possibleDuplicateRows,
      skippedRows: csv.validationErrors.slice(0, 100),
      statementTotals: {
        proceeds: null,
        basis: null,
        adjustments: null,
        gainLoss: null
      }
    });

    state.importBatches.push(batch);
    state.importAudit =
      invalidRows > 0
        ? {
            fileName: csv.fileName,
            legacySkippedDuplicateRows: 0,
            invalidRows,
            importedAt
          }
        : null;

    state.transactions.push(...transactions);
    const importedCount = transactions.length;
    clearCsvImport();
    renderAll();
    openView("importView");

    const saved = await saveWorkspace();

    let message = `${importedCount} transaction${importedCount === 1 ? "" : "s"} imported.`;
    if (possibleDuplicateRows > 0) {
      message += ` ${possibleDuplicateRows} possible duplicate row${possibleDuplicateRows === 1 ? " was" : "s were"} imported and flagged for review.`;
    }
    if (invalidRows > 0) {
      message += ` ${invalidRows} invalid row${invalidRows === 1 ? " was" : "s were"} skipped.`;
    }

    if (!saved) {
      message += " The import is visible now, but browser storage could not confirm the save. Download a backup before refreshing.";
    }

    showToast(
      message,
      !saved || possibleDuplicateRows > 0 || invalidRows > 0 ? "warning" : "success"
    );
  }

  function clearCsvImport() {
    state.csvImport = null;
    ui.csvFileInput.value = "";
    ui.csvFileSelection.textContent = "No CSV selected";
    renderImportBatchManager();
  }

  function normalizeImportBatch(value) {
    const batch = value && typeof value === "object" ? value : {};
    const totals = batch.statementTotals && typeof batch.statementTotals === "object"
      ? batch.statementTotals
      : {};

    return {
      id: String(batch.id || batch.batchId || createId()),
      type: String(batch.type || "csv"),
      fileName: String(batch.fileName || "Imported transactions").trim(),
      fileHash: String(batch.fileHash || ""),
      fileSize: Math.max(0, Math.trunc(finiteNumber(batch.fileSize))),
      fileLastModified: Math.max(0, Math.trunc(finiteNumber(batch.fileLastModified))),
      importedAt: String(batch.importedAt || new Date().toISOString()),
      rowCount: Math.max(0, Math.trunc(finiteNumber(batch.rowCount))),
      importedCount: Math.max(0, Math.trunc(finiteNumber(batch.importedCount))),
      invalidRows: Math.max(0, Math.trunc(finiteNumber(batch.invalidRows))),
      possibleDuplicateRows: Math.max(
        0,
        Math.trunc(finiteNumber(batch.possibleDuplicateRows))
      ),
      skippedRows: Array.isArray(batch.skippedRows)
        ? batch.skippedRows.slice(0, 100).map((item) => ({
            rowNumber: String(item?.rowNumber ?? ""),
            pageNumber: String(item?.pageNumber ?? ""),
            transactionId: String(item?.transactionId ?? ""),
            message: String(item?.message || "Row was not imported.")
          }))
        : [],
      statementTotals: {
        proceeds: nullableFiniteNumber(totals.proceeds),
        basis: nullableFiniteNumber(totals.basis),
        adjustments: nullableFiniteNumber(totals.adjustments),
        gainLoss: nullableFiniteNumber(totals.gainLoss)
      }
    };
  }

  function nullableFiniteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function ensureImportBatchHistory() {
    const knownIds = new Set(state.importBatches.map((batch) => batch.id));
    const grouped = new Map();

    state.transactions.forEach((transaction) => {
      const source = transaction.source;
      if (source?.type !== "csv" || !source.batchId || knownIds.has(source.batchId)) {
        return;
      }
      if (!grouped.has(source.batchId)) grouped.set(source.batchId, []);
      grouped.get(source.batchId).push(transaction);
    });

    grouped.forEach((transactions, batchId) => {
      const first = transactions[0];
      state.importBatches.push(
        normalizeImportBatch({
          id: batchId,
          type: "csv",
          fileName: first.source?.fileName || "Earlier CSV import",
          fileHash: first.source?.fileHash || "",
          importedAt:
            first.source?.importedAt ||
            first.createdAt ||
            new Date().toISOString(),
          rowCount: transactions.length,
          importedCount: transactions.length,
          invalidRows: 0,
          possibleDuplicateRows: 0
        })
      );
      knownIds.add(batchId);
    });
  }

  function calculateBatchTotals(batchId) {
    const transactions = state.transactions.filter((transaction) => transaction.source?.batchId === batchId);
    const summary = summarizeTransactions(transactions).all;
    return {
      count: transactions.length,
      proceeds: summary.proceeds,
      basis: summary.basis,
      fees: summary.fees,
      adjustments: summary.adjustments,
      // Used for statement reconciliation: broker-reported when available.
      gainLoss: summary.statementGainLoss,
      statementGainLoss: summary.statementGainLoss,
      verifiedGainLoss: summary.gainLoss,
      unresolvedCount: summary.unresolvedCount,
      unresolvedStatementGainLoss: summary.unresolvedStatementGainLoss
    };
  }

  function renderImportBatchManager() {
    if (
      !ui.importWorkspace ||
      !ui.importWorkspaceContent ||
      state.csvImport ||
      state.pdfImport
    ) {
      return;
    }

    ensureImportBatchHistory();

    if (state.importBatches.length === 0) {
      ui.importWorkspace.hidden = true;
      ui.importWorkspaceContent.innerHTML = "";
      return;
    }

    const batches = [...state.importBatches].sort(
      (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
    );
    const latestBatch = batches[0];

    ui.importWorkspace.hidden = false;
    ui.importWorkspaceTitle.textContent = "Import history and reconciliation";
    ui.importWorkspaceContent.innerHTML = `
      <div class="notice notice--info">
        <div class="notice__icon" aria-hidden="true">i</div>
        <div>
          <h3>Each import remains traceable and reversible</h3>
          <p>Transactions retain their source filename, CSV row number or PDF page, and import batch. Enter statement totals below to reconcile the imported data.</p>
        </div>
      </div>

      <div class="form-actions">
        <button
          class="button button--secondary"
          type="button"
          data-batch-action="undo-last"
          data-batch-id="${escapeHtml(latestBatch.id)}"
        >Undo last import</button>
      </div>

      <div class="issue-list">
        ${batches.map(importBatchCardHtml).join("")}
      </div>
    `;
  }

  function importBatchCardHtml(batch) {
    const current = calculateBatchTotals(batch.id);
    const statement = batch.statementTotals;
    const reconciliation = reconciliationStatus(current, statement);
    const differenceRows = [["Proceeds", "proceeds"], ["Cost basis", "basis"], ["Adjustments", "adjustments"], ["Statement-reported gain/loss", "gainLoss"]];

    const skippedHtml = batch.skippedRows.length
      ? `<details><summary>${batch.skippedRows.length} saved skipped-row issue${batch.skippedRows.length === 1 ? "" : "s"}</summary><div class="issue-list">${batch.skippedRows.map((issue) => `<article class="issue-item issue-item--warning"><div class="issue-item__content"><h4>${batch.type === "pdf" ? `PDF page ${escapeHtml(issue.pageNumber || issue.rowNumber || "?")}` : `CSV row ${escapeHtml(issue.rowNumber || "?")}`}</h4><p>${escapeHtml(issue.message)}</p></div></article>`).join("")}</div></details>`
      : "";

    return `
      <article class="panel" data-import-batch-card="${escapeHtml(batch.id)}">
        <div class="panel__heading"><div><h3>${escapeHtml(batch.fileName)}</h3><p>Imported ${escapeHtml(formatDateTime(batch.importedAt))} · Batch ${escapeHtml(shortId(batch.id))}</p></div><span class="issue-badge issue-badge--${reconciliation.style}">${escapeHtml(reconciliation.label)}</span></div>
        <div class="review-summary">
          <article class="review-card"><span class="review-card__label">${batch.type === "pdf" ? "PDF candidates" : "CSV rows"}</span><strong>${batch.rowCount}</strong><small>${batch.type === "pdf" ? `${batch.skippedRows.length} candidate${batch.skippedRows.length === 1 ? "" : "s"} deselected` : `${batch.invalidRows} invalid row${batch.invalidRows === 1 ? "" : "s"} skipped`}</small></article>
          <article class="review-card"><span class="review-card__label">Current transactions</span><strong>${current.count}</strong><small>${current.unresolvedCount} unresolved · ${batch.possibleDuplicateRows} possible match${batch.possibleDuplicateRows === 1 ? "" : "es"}</small></article>
          <article class="review-card"><span class="review-card__label">Verified gain/loss</span><strong class="${amountClass(current.verifiedGainLoss)}">${formatCurrency(current.verifiedGainLoss)}</strong><small>Excludes unresolved transactions</small></article>
        </div>
        ${current.unresolvedCount ? `<div class="notice notice--important"><div class="notice__icon" aria-hidden="true">!</div><div><h3>${current.unresolvedCount} unresolved transaction${current.unresolvedCount === 1 ? "" : "s"}</h3><p>Broker-reported unresolved gain/loss retained for reconciliation: ${formatCurrency(current.unresolvedStatementGainLoss)}. It is not included in verified calculations.</p></div></div>` : ""}
        <div class="form-section"><h4>Statement reconciliation</h4><p class="field-hint">This compares extracted or current statement-level values with totals printed by the broker. Verified gain/loss is shown separately above.</p><div class="form-grid">
          ${differenceRows.map(([label, key]) => { const storedValue = statement[key]; const currentValue = current[key]; const difference = storedValue === null ? null : currentValue - storedValue; return `<div class="form-field"><label for="batch-${escapeHtml(batch.id)}-${key}">${label}</label><div class="money-input"><span aria-hidden="true">$</span><input id="batch-${escapeHtml(batch.id)}-${key}" type="text" inputmode="decimal" value="${storedValue === null ? "" : escapeHtml(formatInputMoney(storedValue))}" placeholder="Statement total" data-batch-statement-field="${key}"></div><p class="field-hint">Extracted/current statement amount: ${formatCurrency(currentValue)}</p><p class="field-hint">Difference: ${difference === null ? "Not compared" : formatCurrency(difference)}</p></div>`; }).join("")}
        </div></div>
        ${skippedHtml}
        <div class="form-actions"><button class="button button--secondary" type="button" data-batch-action="save-reconciliation" data-batch-id="${escapeHtml(batch.id)}">Save statement totals</button><button class="button button--danger" type="button" data-batch-action="delete" data-batch-id="${escapeHtml(batch.id)}">Delete import batch</button></div>
      </article>`;
  }

  function reconciliationStatus(current, statement) {
    const keys = ["proceeds", "basis", "adjustments", "gainLoss"];
    const compared = keys.filter((key) => statement[key] !== null);
    if (compared.length === 0) {
      return { label: "Not reconciled", style: "info" };
    }

    const matches = compared.every(
      (key) => Math.abs(current[key] - statement[key]) < 0.01
    );
    return matches
      ? { label: "Totals match", style: "info" }
      : { label: "Difference found", style: "warning" };
  }

  function handleImportBatchAction(button) {
    const action = button.dataset.batchAction;
    const batchId = button.dataset.batchId;

    if (action === "undo-last") {
      const batch = state.importBatches.find((item) => item.id === batchId);
      if (!batch) return;
      showConfirmDialog({
        title: "Undo the last import?",
        message: `Remove every transaction currently linked to ${batch.fileName} and remove its import history?`,
        confirmLabel: "Undo import",
        onConfirm: () => deleteImportBatch(batchId, "Last import undone.")
      });
      return;
    }

    if (action === "delete") {
      const batch = state.importBatches.find((item) => item.id === batchId);
      if (!batch) return;
      const linkedCount = calculateBatchTotals(batchId).count;
      showConfirmDialog({
        title: "Delete import batch?",
        message: `Delete ${linkedCount} transaction${linkedCount === 1 ? "" : "s"} linked to ${batch.fileName}, including any corrections made after import?`,
        confirmLabel: "Delete batch",
        onConfirm: () => deleteImportBatch(batchId, "Import batch deleted.")
      });
      return;
    }

    if (action === "save-reconciliation") {
      saveBatchReconciliation(batchId, button.closest("[data-import-batch-card]"));
    }
  }

  function saveBatchReconciliation(batchId, card) {
    const batchIndex = state.importBatches.findIndex((batch) => batch.id === batchId);
    if (batchIndex < 0 || !card) return;

    const values = {};
    let invalid = false;
    card.querySelectorAll("[data-batch-statement-field]").forEach((input) => {
      const key = input.dataset.batchStatementField;
      const raw = input.value.trim();
      if (!raw) {
        values[key] = null;
        input.classList.remove("is-invalid");
        return;
      }
      const parsed = parseMoney(raw);
      if (!Number.isFinite(parsed)) {
        invalid = true;
        input.classList.add("is-invalid");
      } else {
        values[key] = parsed;
        input.classList.remove("is-invalid");
      }
    });

    if (invalid) {
      showToast("Review the highlighted statement totals.", "error");
      return;
    }

    state.importBatches[batchIndex] = normalizeImportBatch({
      ...state.importBatches[batchIndex],
      statementTotals: values
    });
    renderImportBatchManager();
    queueAutoSave();
    showToast("Statement totals saved.", "success");
  }

  function deleteImportBatch(batchId, message) {
    const removedBatch = state.importBatches.find((batch) => batch.id === batchId);
    state.transactions = state.transactions.filter(
      (transaction) => transaction.source?.batchId !== batchId
    );
    state.importBatches = state.importBatches.filter((batch) => batch.id !== batchId);
    if (removedBatch && state.importAudit?.fileName === removedBatch.fileName) {
      state.importAudit = null;
    }
    renderAll();
    queueAutoSave();
    showToast(message, "success");
  }

  async function createFileHash(text) {
    try {
      if (window.crypto?.subtle) {
        const data = new TextEncoder().encode(text);
        const digest = await window.crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }
    } catch (error) {
      console.warn("Secure file hashing was unavailable.", error);
    }

    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fallback-${(hash >>> 0).toString(16)}-${text.length}`;
  }

  async function createByteHash(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    try {
      if (window.crypto?.subtle) {
        const digest = await window.crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }
    } catch (error) {
      console.warn("Secure PDF hashing was unavailable.", error);
    }

    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 1) {
      hash ^= data[index];
      hash = Math.imul(hash, 16777619);
    }
    return `fallback-bytes-${(hash >>> 0).toString(16)}-${data.length}`;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "unknown date";
    return new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function shortId(value) {
    const text = String(value || "");
    return text.length > 8 ? text.slice(0, 8) : text;
  }

  async function handlePdfFile() {
    const file = ui.pdfFileInput.files?.[0];
    if (!file) return;

    state.csvImport = null;
    state.pdfImport = null;
    ui.csvFileInput.value = "";
    ui.csvFileSelection.textContent = "No CSV selected";

    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      ui.pdfFileInput.value = "";
      ui.pdfFileSelection.textContent = "No PDF selected";
      showToast("Choose a PDF file.", "error");
      return;
    }

    if (file.size > PDF_MAX_BYTES) {
      ui.pdfFileInput.value = "";
      ui.pdfFileSelection.textContent = "No PDF selected";
      showToast("This PDF is larger than the 60 MB review limit.", "error");
      return;
    }

    state.pdfImport = {
      status: "loading",
      fileName: file.name,
      fileSize: Number(file.size) || 0,
      pageCount: 0,
      pages: [],
      processedPages: 0,
      startedAt: new Date().toISOString()
    };

    ui.pdfFileSelection.textContent = `${file.name} - preparing local review...`;
    openView("importView");
    renderPdfProgressWorkspace();

    let pdfDocument = null;
    let loadingTask = null;
    let passwordProtected = false;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const retainedBytes = bytes.slice();
      const fileHash = await createByteHash(bytes);
      const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
      if (!signature.startsWith("%PDF-")) {
        throw new Error("The selected file does not contain a valid PDF header.");
      }

      const pdfjsLib = await loadPdfJsModule();
      loadingTask = pdfjsLib.getDocument({
        data: bytes,
        cMapUrl: PDFJS_CMAP_URL,
        cMapPacked: true,
        standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
        wasmUrl: PDFJS_WASM_URL,
        iccUrl: PDFJS_ICC_URL,
        isEvalSupported: false
      });

      loadingTask.onPassword = () => {
        passwordProtected = true;
        loadingTask.destroy();
      };

      loadingTask.onProgress = ({ loaded, total }) => {
        if (!state.pdfImport || state.pdfImport.status !== "loading") return;
        if (Number.isFinite(total) && total > 0) {
          const percent = Math.min(100, Math.round((loaded / total) * 100));
          ui.pdfFileSelection.textContent = `${file.name} - loading ${percent}%`;
        }
      };

      pdfDocument = await loadingTask.promise;
      if (passwordProtected) {
        throw new Error("Password-protected PDFs must be unlocked before review.");
      }

      if (pdfDocument.numPages > PDF_MAX_PAGES) {
        throw new Error(`This PDF has ${pdfDocument.numPages} pages. The review limit is ${PDF_MAX_PAGES}.`);
      }

      state.pdfImport.pageCount = pdfDocument.numPages;
      renderPdfProgressWorkspace();

      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        if (!state.pdfImport) return;
        state.pdfImport.processedPages = pageNumber - 1;
        renderPdfProgressWorkspace();
        pages.push(await extractPdfPage(pdfDocument, pageNumber, pdfjsLib));
      }

      refinePdfPageClassifications(pages);
      pages.forEach((page) => {
        page.selectedFor1099B = isPdf1099BType(effectivePdfPageType(page));
      });

      state.pdfImport = {
        status: "ready",
        fileName: file.name,
        fileSize: Number(file.size) || 0,
        fileLastModified: Number(file.lastModified) || 0,
        fileHash,
        pdfBytes: retainedBytes,
        pageCount: pdfDocument.numPages,
        pages,
        processedPages: pdfDocument.numPages,
        extractionStage: "pages",
        candidates: [],
        summaryTotals: null,
        extractionProfile: "",
        brokerName: detectPdfBrokerName(pages),
        accountLabel: detectPdfAccountLabel(pages),
        completedAt: new Date().toISOString()
      };

      ui.pdfFileSelection.textContent = `${file.name} - ${pdfDocument.numPages} page${
        pdfDocument.numPages === 1 ? "" : "s"
      } reviewed locally`;
      renderPdfReviewWorkspace();
      showToast("PDF page detection is ready for review.", "success");
    } catch (error) {
      console.error(error);
      const message = passwordProtected
        ? "Password-protected PDFs must be unlocked before review."
        : error?.message || "The PDF could not be read.";
      state.pdfImport = null;
      ui.pdfFileSelection.textContent = "No PDF selected";
      renderImportBatchManager();
      showToast(message, "error");
    } finally {
      try {
        await pdfDocument?.cleanup?.();
        await loadingTask?.destroy?.();
      } catch (error) {
        console.warn("PDF document cleanup failed.", error);
      }
      ui.pdfFileInput.value = "";
    }
  }

  async function loadPdfJsModule() {
    if (!pdfJsModulePromise) {
      pdfJsModulePromise = import(PDFJS_MODULE_URL).then((pdfjsLib) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return pdfjsLib;
      });
    }
    return pdfJsModulePromise;
  }

  function renderPdfProgressWorkspace() {
    const pdf = state.pdfImport;
    if (!pdf || pdf.status !== "loading") return;

    const total = Math.max(0, pdf.pageCount || 0);
    const processed = Math.max(0, pdf.processedPages || 0);
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

    ui.importWorkspace.hidden = false;
    ui.importWorkspaceTitle.textContent = `Reviewing ${pdf.fileName}`;
    ui.importWorkspaceContent.innerHTML = `
      <div class="notice notice--info">
        <div class="notice__icon" aria-hidden="true">i</div>
        <div>
          <h3>Reading this PDF locally</h3>
          <p>The file remains in this browser. No PDF pages or extracted text are uploaded by this tool.</p>
        </div>
      </div>
      <article class="panel">
        <div class="panel__heading">
          <div>
            <h3>${escapeHtml(pdf.fileName)}</h3>
            <p>${escapeHtml(formatFileSize(pdf.fileSize))}</p>
          </div>
          <span class="issue-badge issue-badge--info">${total ? `${processed} / ${total} pages` : "Opening"}</span>
        </div>
        <div
          role="progressbar"
          aria-label="PDF page review progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${percent}"
          style="height:12px;border-radius:999px;overflow:hidden;background:var(--cg-surface-muted);"
        >
          <div style="height:100%;width:${percent}%;background:var(--cg-brand);transition:width 160ms ease;"></div>
        </div>
        <p class="field-hint" style="margin-top:10px;">Large statements may take a moment. Image-only pages can be OCR-processed from the page-review screen; the OCR engine is downloaded when first used.</p>
      </article>
    `;
  }

  async function extractPdfPage(pdfDocument, pageNumber, pdfjsLib) {
    const page = await pdfDocument.getPage(pageNumber);
    let textContent = { items: [] };
    let operatorList = null;

    try {
      textContent = await page.getTextContent({
        includeMarkedContent: false,
        disableNormalization: false
      });
    } catch (error) {
      console.warn(`Text extraction failed on PDF page ${pageNumber}.`, error);
    }

    const text = reconstructPdfPageText(textContent.items || []);
    const compactText = text.replace(/\s+/g, " ").trim();
    let hasImage = false;

    if (compactText.length < 40) {
      try {
        operatorList = await page.getOperatorList();
        const imageOperations = new Set(
          [
            pdfjsLib.OPS?.paintImageXObject,
            pdfjsLib.OPS?.paintJpegXObject,
            pdfjsLib.OPS?.paintInlineImageXObject,
            pdfjsLib.OPS?.paintImageMaskXObject
          ].filter(Number.isFinite)
        );
        hasImage = operatorList.fnArray.some((operation) => imageOperations.has(operation));
      } catch (error) {
        console.warn(`Image detection failed on PDF page ${pageNumber}.`, error);
      }
    }

    const textStatus = compactText.length >= 40
      ? "selectable"
      : hasImage
        ? "scanned"
        : compactText.length > 0
          ? "sparse"
          : "blank";
    const classification = classifyPdfPage(compactText, textStatus);

    try {
      page.cleanup();
    } catch (error) {
      console.warn(`PDF page ${pageNumber} cleanup failed.`, error);
    }

    return {
      pageNumber,
      text: text.slice(0, 30000),
      charCount: compactText.length,
      itemCount: (textContent.items || []).filter((item) => typeof item?.str === "string").length,
      hasImage,
      textStatus,
      detectedType: classification.type,
      overrideType: "",
      confidence: classification.confidence,
      reasons: classification.reasons,
      dateCount: classification.dateCount,
      moneyCount: classification.moneyCount,
      selectedFor1099B: false
    };
  }

  function reconstructPdfPageText(items) {
    const positioned = items
      .filter((item) => typeof item?.str === "string" && item.str.trim())
      .map((item) => ({
        text: item.str.trim(),
        x: Number(item.transform?.[4]) || 0,
        y: Number(item.transform?.[5]) || 0,
        width: Math.max(0, Number(item.width) || 0),
        height: Math.max(1, Number(item.height) || 10)
      }))
      .sort((a, b) => {
        if (Math.abs(b.y - a.y) > 2) return b.y - a.y;
        return a.x - b.x;
      });

    const lines = [];
    positioned.forEach((item) => {
      let line = lines.find(
        (candidate) => Math.abs(candidate.y - item.y) <= Math.max(2.2, item.height * 0.35)
      );
      if (!line) {
        line = { y: item.y, items: [] };
        lines.push(line);
      }
      line.items.push(item);
    });

    return lines
      .sort((a, b) => b.y - a.y)
      .map((line) => {
        const parts = line.items.sort((a, b) => a.x - b.x);
        let output = "";
        let previousEnd = null;
        parts.forEach((part) => {
          const gap = previousEnd === null ? 0 : part.x - previousEnd;
          const separator = previousEnd === null ? "" : gap > 10 ? "  " : " ";
          output += `${separator}${part.text}`;
          previousEnd = Math.max(part.x + part.width, part.x);
        });
        return output.trim();
      })
      .filter(Boolean)
      .join("\n");
  }

  function classifyPdfPage(text, textStatus) {
    if (textStatus === "scanned") {
      return {
        type: "scanned",
        confidence: "high",
        reasons: ["No meaningful selectable text was found, but image content is present."],
        dateCount: 0,
        moneyCount: 0
      };
    }
    if (textStatus === "blank") {
      return {
        type: "blank",
        confidence: "high",
        reasons: ["No selectable text or image content was detected."],
        dateCount: 0,
        moneyCount: 0
      };
    }

    const lower = text.toLowerCase();
    const dateCount = (text.match(/\b(?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-](?:19|20)\d{2}\b/g) || []).length;
    const moneyCount = (text.match(/(?:\$\s*)?\(?-?\d[\d,]*(?:\.\d{2})\)?/g) || []).length;
    const reasons = [];
    const has = (...terms) => terms.some((term) => lower.includes(term));
    const hitCount = (terms) => terms.reduce((count, term) => count + (lower.includes(term) ? 1 : 0), 0);

    const bHeading = hitCount([
      "form 1099-b",
      "1099-b totals",
      "broker transaction detail",
      "proceeds from broker and barter exchange transactions",
      "realized gain/loss",
      "realized gain loss"
    ]);
    const transactionHeaders = hitCount([
      "date acquired",
      "date sold",
      "acquired",
      "sold",
      "proceeds",
      "cost basis",
      "basis",
      "gain/loss",
      "gain or loss",
      "wash sale",
      "transaction id",
      "security"
    ]);
    const termSignals = hitCount([
      "short-term",
      "short term",
      "long-term",
      "long term",
      "basis reported to the irs",
      "basis not reported to the irs",
      "covered",
      "noncovered"
    ]);
    const summarySignals = hitCount([
      "summary",
      "totals",
      "count",
      "category a",
      "category b",
      "category d",
      "category e",
      "cat.",
      "cat "
    ]);
    const coverHeading = has(
      "consolidated tax statement",
      "year-end tax reporting package",
      "statement contents"
    );
    const formHeadingCount = hitCount([
      "form 1099-int",
      "form 1099-div",
      "form 1099-b",
      "form 1099-da",
      "form 1099-oid",
      "form 1099-misc"
    ]);

    const daHeading = hitCount([
      "form 1099-da",
      "digital asset proceeds from broker transactions",
      "applicable checkbox on form 8949",
      "code for digital asset",
      "name of digital asset"
    ]);
    const daTransactionSignals = hitCount([
      "number of units",
      "date acquired",
      "date sold or disposed",
      "cost or other basis",
      "basis reported to irs",
      "gain or loss",
      "noncovered security"
    ]);

    if (daHeading >= 1 && daTransactionSignals >= 3 && moneyCount >= 1) {
      reasons.push("Form 1099-DA digital-asset transaction fields were detected.");
      return { type: "1099-da-transactions", confidence: daHeading >= 2 ? "high" : "medium", reasons, dateCount, moneyCount };
    }

    if (daHeading >= 1) {
      reasons.push("Form 1099-DA terminology was detected, but detailed values may need review.");
      return { type: "1099-da-summary", confidence: "medium", reasons, dateCount, moneyCount };
    }

    if (
      bHeading > 0 &&
      summarySignals >= 2 &&
      transactionHeaders >= 2 &&
      dateCount < 2
    ) {
      reasons.push("The page contains 1099-B summary headings and category totals.");
      return { type: "1099-b-summary", confidence: "high", reasons, dateCount, moneyCount };
    }

    if (
      (bHeading > 0 && transactionHeaders >= 3) ||
      (transactionHeaders >= 5 && termSignals >= 1) ||
      (dateCount >= 2 && moneyCount >= 4 && (termSignals >= 1 || transactionHeaders >= 3))
    ) {
      reasons.push("The page contains transaction columns, dates, amounts, or holding-period headings.");
      return {
        type: "1099-b-transactions",
        confidence: bHeading > 0 || transactionHeaders >= 5 ? "high" : "medium",
        reasons,
        dateCount,
        moneyCount
      };
    }

    if (coverHeading && formHeadingCount >= 2) {
      reasons.push("A consolidated-statement cover contains multiple tax-form sections.");
      return { type: "cover-summary", confidence: "high", reasons, dateCount, moneyCount };
    }

    if (has("form 1099-div", "1099-div", "dividends and distributions") || hitCount([
      "ordinary dividends",
      "qualified dividends",
      "capital gain distributions",
      "foreign tax paid"
    ]) >= 2) {
      reasons.push("Dividend form terminology was detected.");
      return { type: "1099-div", confidence: "high", reasons, dateCount, moneyCount };
    }

    if (has("form 1099-int", "1099-int") || hitCount([
      "interest income",
      "savings bonds",
      "treasury obligations"
    ]) >= 2) {
      reasons.push("Interest-income form terminology was detected.");
      return { type: "1099-int", confidence: "high", reasons, dateCount, moneyCount };
    }

    if (has("form 1099-oid", "1099-oid", "original issue discount")) {
      reasons.push("Original issue discount form terminology was detected.");
      return { type: "1099-oid", confidence: "high", reasons, dateCount, moneyCount };
    }

    if (has("form 1099-misc", "1099-misc", "miscellaneous information")) {
      reasons.push("1099-MISC or other tax-form terminology was detected.");
      return { type: "1099-misc", confidence: "high", reasons, dateCount, moneyCount };
    }

    if (has("supplemental tax notes", "supplemental information", "supplemental notes")) {
      reasons.push("Supplemental statement wording was detected.");
      return { type: "supplemental", confidence: "high", reasons, dateCount, moneyCount };
    }

    if (coverHeading) {
      reasons.push("A consolidated-statement cover or contents heading was detected.");
      return { type: "cover-summary", confidence: "medium", reasons, dateCount, moneyCount };
    }

    if (bHeading > 0 || (summarySignals >= 2 && transactionHeaders >= 2)) {
      reasons.push("Some 1099-B terminology was detected, but the layout is uncertain.");
      return { type: "1099-b-summary", confidence: "medium", reasons, dateCount, moneyCount };
    }

    return {
      type: "unrecognized",
      confidence: textStatus === "sparse" ? "low" : "medium",
      reasons: ["No page type matched confidently. Review the extracted text."],
      dateCount,
      moneyCount
    };
  }

  function refinePdfPageClassifications(pages) {
    pages.forEach((page, index) => {
      if (page.detectedType !== "unrecognized") return;
      const previous = pages[index - 1];
      const next = pages[index + 1];
      const neighboringTransaction = [previous, next].find(
        (item) => item && isPdf1099BType(item.detectedType)
      );

      if (neighboringTransaction && page.dateCount >= 1 && page.moneyCount >= 3) {
        page.detectedType = String(neighboringTransaction.detectedType || "").startsWith("1099-da")
          ? "1099-da-transactions"
          : "1099-b-continuation";
        page.confidence = "medium";
        page.reasons = [
          "The page resembles transaction continuation data and is adjacent to a detected 1099-B page."
        ];
      }
    });
  }

  function renderPdfReviewWorkspace() {
    const pdf = state.pdfImport;
    if (!pdf || pdf.status !== "ready") return;

    ui.importWorkspace.hidden = false;
    ui.importWorkspaceTitle.textContent = `Review PDF sections - ${pdf.fileName}`;
    ui.importWorkspaceContent.innerHTML = `
      <div class="notice notice--important">
        <div class="notice__icon" aria-hidden="true">!</div>
        <div>
          <h3>Page detection only - no transactions have been imported</h3>
          <p>Broker formats vary. Confirm the page classifications and compare extracted text with the original PDF before transaction extraction is enabled.</p>
        </div>
      </div>

      <div class="review-summary">
        <article class="review-card">
          <span class="review-card__label">PDF pages</span>
          <strong>${pdf.pageCount}</strong>
          <small>${escapeHtml(formatFileSize(pdf.fileSize))}</small>
        </article>
        <article class="review-card">
          <span class="review-card__label">Transaction pages</span>
          <strong id="pdfCandidatePageCount">${countSelectedPdfPages()}</strong>
          <small>1099-B or 1099-DA pages selected</small>
        </article>
        <article class="review-card">
          <span class="review-card__label">OCR required</span>
          <strong id="pdfOcrPageCount">${pdf.pages.filter((page) => effectivePdfPageType(page) === "scanned").length}</strong>
          <small>Run browser OCR, then review every value</small>
        </article>
      </div>

      <div class="form-actions" style="flex-wrap:wrap;margin-bottom:18px;">
        <button class="button button--secondary" type="button" data-pdf-action="select-detected">Select detected transaction pages</button>
        ${pdf.pages.some((page) => page.textStatus === "scanned") ? '<button class="button button--secondary" type="button" data-pdf-action="run-ocr">Run OCR on selected scanned pages</button>' : ""}
        <button class="button button--secondary" type="button" data-pdf-action="download-text">Download extracted text</button>
        <button class="button button--secondary" type="button" data-pdf-action="clear">Close PDF review</button>
      </div>

      <div class="issue-list">
        ${pdf.pages.map(pdfPageCardHtml).join("")}
      </div>

      <div class="notice notice--info" style="margin-top:18px;">
        <div class="notice__icon" aria-hidden="true">i</div>
        <div>
          <h3>Transaction extraction</h3>
          <p>The selected text-based 1099-B or 1099-DA pages can now be converted into reviewable candidates. OCR results are never trusted automatically; nothing enters the workspace until you confirm each row.</p>
        </div>
      </div>

      <div class="form-actions">
        <button class="button button--primary" type="button" data-pdf-action="continue">Continue to transaction extraction</button>
      </div>
    `;
  }

  function pdfPageCardHtml(page) {
    const type = effectivePdfPageType(page);
    const typeLabel = pdfPageTypeLabel(type);
    const confidenceStyle = page.confidence === "high"
      ? "info"
      : page.confidence === "medium"
        ? "warning"
        : "error";
    const textStatusLabel = page.textStatus === "selectable"
      ? "Selectable text"
      : page.textStatus === "ocr"
        ? `OCR text${Number.isFinite(page.ocrConfidence) ? ` · ${Math.round(page.ocrConfidence)}% confidence` : ""}`
        : page.textStatus === "scanned"
          ? "Image-only / OCR needed"
        : page.textStatus === "blank"
          ? "Blank"
          : "Sparse text";
    const options = PDF_PAGE_TYPE_OPTIONS.map(
      ([value, label]) => `<option value="${value}" ${type === value ? "selected" : ""}>${escapeHtml(label)}</option>`
    ).join("");
    const preview = page.text || "No selectable text was extracted from this page.";

    return `
      <article class="panel" data-pdf-page-card="${page.pageNumber}">
        <div class="panel__heading">
          <div>
            <h3 data-pdf-page-heading>Page ${page.pageNumber}: ${escapeHtml(typeLabel)}</h3>
            <p>${escapeHtml(textStatusLabel)} · ${page.charCount.toLocaleString("en-US")} text characters</p>
          </div>
          <span class="issue-badge issue-badge--${confidenceStyle}">${escapeHtml(page.confidence)} confidence</span>
        </div>

        <div class="form-grid">
          <div class="form-field">
            <label for="pdf-page-type-${page.pageNumber}">Page classification</label>
            <select id="pdf-page-type-${page.pageNumber}" data-pdf-page-type="${page.pageNumber}">
              ${options}
            </select>
          </div>
          <div class="form-field">
            <label>Transaction extraction candidate</label>
            <label class="checkbox-row" style="margin-top:10px;">
              <input
                type="checkbox"
                data-pdf-page-selected="${page.pageNumber}"
                ${page.selectedFor1099B ? "checked" : ""}
              >
              <span>Use this page in the next transaction-extraction stage</span>
            </label>
          </div>
        </div>

        <p class="field-hint" style="margin-top:12px;">${escapeHtml(page.reasons.join(" "))}</p>

        <details style="margin-top:14px;">
          <summary style="cursor:pointer;font-weight:750;color:var(--cg-text-primary);">View extracted page text</summary>
          <pre style="max-height:340px;overflow:auto;margin:12px 0 0;padding:14px;border:1px solid var(--cg-border);border-radius:var(--cg-radius-small);background:var(--cg-surface-soft);color:var(--cg-text-secondary);white-space:pre-wrap;word-break:break-word;font:0.78rem/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;">${escapeHtml(preview)}</pre>
        </details>
      </article>
    `;
  }

  function handlePdfWorkspaceAction(action, button = null) {
    const pdf = state.pdfImport;
    if (!pdf) return;

    if (action === "clear") {
      clearPdfReview();
      return;
    }

    if (action === "download-text") {
      downloadPdfTextReview();
      return;
    }

    if (action === "select-detected") {
      pdf.pages.forEach((page) => {
        page.selectedFor1099B = isPdf1099BType(effectivePdfPageType(page));
      });
      renderPdfReviewWorkspace();
      showToast("Detected 1099-B and 1099-DA transaction pages selected.", "success");
      return;
    }

    if (action === "run-ocr") {
      void runOcrOnSelectedPdfPages();
      return;
    }

    if (action === "continue") {
      const selected = countSelectedPdfPages();
      if (selected === 0) {
        showToast("Select at least one 1099-B page before continuing.", "warning");
        return;
      }
      preparePdfTransactionExtraction();
      return;
    }

    if (action === "back-pages") {
      pdf.extractionStage = "pages";
      renderPdfReviewWorkspace();
      return;
    }

    if (action === "add-mapping-row") {
      const pageNumber = pdf.pages.find((page) => page.selectedFor1099B)?.pageNumber || 1;
      pdf.mappingRows = Array.isArray(pdf.mappingRows) ? pdf.mappingRows : [];
      pdf.mappingRows.push(blankPdfMappingRow(pageNumber));
      renderPdfFallbackMappingWorkspace();
      requestAnimationFrame(() => {
        ui.importWorkspaceContent
          ?.querySelector(`[data-pdf-map-card="${pdf.mappingRows.at(-1)?.id || ""}"] input[data-pdf-map-field="description"]`)
          ?.focus();
      });
      return;
    }

    if (action === "remove-mapping-row") {
      const rowId = button?.dataset.pdfMapRowId || "";
      pdf.mappingRows = (pdf.mappingRows || []).filter((row) => row.id !== rowId);
      if (!pdf.mappingRows.length) pdf.mappingRows.push(blankPdfMappingRow(1));
      renderPdfFallbackMappingWorkspace();
      return;
    }

    if (action === "select-all-mapping" || action === "clear-mapping") {
      const selected = action === "select-all-mapping";
      (pdf.mappingRows || []).forEach((row) => {
        row.selected = selected;
      });
      renderPdfFallbackMappingWorkspace();
      return;
    }

    if (action === "apply-mapping") {
      applyPdfFallbackMapping();
      return;
    }

    if (action === "select-all-candidates" || action === "clear-candidates") {
      const selected = action === "select-all-candidates";
      pdf.candidates.forEach((candidate) => {
        candidate.selected = selected;
      });
      validateAllPdfCandidates();
      renderPdfTransactionReviewWorkspace();
      return;
    }

    if (action === "revalidate-candidates") {
      validateAllPdfCandidates();
      renderPdfTransactionReviewWorkspace();
      showToast("PDF transaction candidates revalidated.", "success");
      return;
    }

    if (action === "import-candidates") {
      void importValidatedPdfCandidates();
    }
  }



  async function loadTesseractLibrary() {
    if (window.Tesseract?.createWorker) return window.Tesseract;
    if (!state.ocrScriptPromise) {
      state.ocrScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${TESSERACT_SCRIPT_URL}"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve(window.Tesseract), { once: true });
          existing.addEventListener("error", () => reject(new Error("The OCR engine could not be downloaded.")), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = TESSERACT_SCRIPT_URL;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve(window.Tesseract);
        script.onerror = () => reject(new Error("The OCR engine could not be downloaded. Check the internet connection and try again."));
        document.head.appendChild(script);
      });
    }
    const library = await state.ocrScriptPromise;
    if (!library?.createWorker) throw new Error("The OCR engine loaded without its worker API.");
    return library;
  }

  async function getOcrWorker() {
    if (state.ocrWorker) return state.ocrWorker;
    const Tesseract = await loadTesseractLibrary();
    state.ocrWorker = await Tesseract.createWorker(TESSERACT_LANGUAGE, 1, {
      logger: (message) => {
        if (!state.pdfImport || message.status !== "recognizing text") return;
        state.pdfImport.ocrProgress = Number(message.progress) || 0;
        renderPdfOcrProgress();
      }
    });
    return state.ocrWorker;
  }

  function renderPdfOcrProgress() {
    const pdf = state.pdfImport;
    if (!pdf?.ocrRunning) return;
    const pageLabel = pdf.ocrCurrentPage ? `page ${pdf.ocrCurrentPage}` : "selected pages";
    const percent = Math.round((Number(pdf.ocrProgress) || 0) * 100);
    ui.importWorkspace.hidden = false;
    ui.importWorkspaceTitle.textContent = `Running OCR - ${pdf.fileName}`;
    ui.importWorkspaceContent.innerHTML = `
      <div class="notice notice--important"><div class="notice__icon" aria-hidden="true">!</div><div><h3>Browser OCR is reading ${escapeHtml(pageLabel)}</h3><p>The OCR engine and English language data are downloaded when first used. Page images remain in this browser and are not uploaded by Velzarytha.</p></div></div>
      <article class="panel"><div class="panel__heading"><div><h3>${escapeHtml(pdf.fileName)}</h3><p>OCR is assistive. Every date and amount must be compared with the PDF.</p></div><span class="issue-badge issue-badge--info">${percent}%</span></div><div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" style="height:12px;border-radius:999px;overflow:hidden;background:var(--cg-surface-muted);"><div style="height:100%;width:${percent}%;background:var(--cg-brand);"></div></div></article>`;
  }

  async function runOcrOnSelectedPdfPages() {
    const pdf = state.pdfImport;
    if (!pdf || !pdf.pdfBytes) {
      showToast("Re-select the PDF before running OCR.", "error");
      return;
    }
    let pages = pdf.pages.filter((page) => page.selectedFor1099B && page.textStatus === "scanned");
    if (!pages.length) {
      pages = pdf.pages.filter((page) => page.textStatus === "scanned");
    }
    if (!pages.length) {
      showToast("No image-only pages are available for OCR.", "warning");
      return;
    }

    let documentHandle = null;
    let loadingTask = null;
    pdf.ocrRunning = true;
    pdf.ocrProgress = 0;
    renderPdfOcrProgress();
    try {
      const worker = await getOcrWorker();
      const pdfjsLib = await loadPdfJsModule();
      loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdf.pdfBytes).slice(),
        cMapUrl: PDFJS_CMAP_URL,
        cMapPacked: true,
        standardFontDataUrl: PDFJS_STANDARD_FONT_URL,
        wasmUrl: PDFJS_WASM_URL,
        iccUrl: PDFJS_ICC_URL,
        isEvalSupported: false
      });
      documentHandle = await loadingTask.promise;

      for (const pageRecord of pages) {
        pdf.ocrCurrentPage = pageRecord.pageNumber;
        pdf.ocrProgress = 0;
        renderPdfOcrProgress();
        const page = await documentHandle.getPage(pageRecord.pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.5, Math.max(1.8, 2400 / Math.max(baseViewport.width, 1)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        await page.render({ canvasContext: context, viewport, background: "white" }).promise;
        const result = await worker.recognize(canvas);
        const ocrText = String(result?.data?.text || "").trim();
        const compactText = ocrText.replace(/\s+/g, " ").trim();
        const classification = classifyPdfPage(compactText, compactText.length >= 25 ? "selectable" : "sparse");
        pageRecord.text = ocrText.slice(0, 30000);
        pageRecord.charCount = compactText.length;
        pageRecord.itemCount = Number(result?.data?.words?.length) || 0;
        pageRecord.textStatus = compactText.length >= 25 ? "ocr" : "scanned";
        pageRecord.ocrConfidence = Number(result?.data?.confidence);
        pageRecord.detectedType = compactText.length >= 25 ? classification.type : "scanned";
        pageRecord.overrideType = "";
        pageRecord.confidence = compactText.length >= 25
          ? (Number(result?.data?.confidence) >= 80 ? "high" : "medium")
          : "low";
        pageRecord.reasons = compactText.length >= 25
          ? [`OCR produced ${compactText.length.toLocaleString("en-US")} characters.`, ...classification.reasons]
          : ["OCR did not produce enough readable text. Try a clearer scan or enter the transaction manually."];
        pageRecord.dateCount = classification.dateCount;
        pageRecord.moneyCount = classification.moneyCount;
        pageRecord.selectedFor1099B = compactText.length >= 25 && isPdf1099BType(pageRecord.detectedType);
        try { page.cleanup(); } catch (error) { console.warn("OCR page cleanup failed.", error); }
      }
      refinePdfPageClassifications(pdf.pages);
      showToast(`${pages.length} page${pages.length === 1 ? "" : "s"} processed by OCR. Review all extracted text before continuing.`, "success");
    } catch (error) {
      console.error(error);
      showToast(error?.message || "OCR could not be completed.", "error");
    } finally {
      pdf.ocrRunning = false;
      pdf.ocrCurrentPage = 0;
      pdf.ocrProgress = 0;
      try { await documentHandle?.cleanup?.(); await loadingTask?.destroy?.(); } catch (error) { console.warn("OCR PDF cleanup failed.", error); }
      renderPdfReviewWorkspace();
    }
  }

  const PDF_MONEY_TOKEN_PATTERN = /\(?\$\s*[\d,]+(?:\.\d{2})?\)?/g;
  const PDF_DATE_TOKEN_SOURCE = "(?:\\d{1,2}[\\/-]\\d{1,2}[\\/-](?:\\d{4}|\\d{2}))";

  function preparePdfTransactionExtraction() {
    const pdf = state.pdfImport;
    if (!pdf) return;

    const selectedPages = pdf.pages.filter(
      (page) => page.selectedFor1099B && page.textStatus !== "scanned" && page.text
    );
    const scannedSelected = pdf.pages.filter(
      (page) => page.selectedFor1099B && page.textStatus === "scanned"
    ).length;

    if (selectedPages.length === 0) {
      showToast(
        scannedSelected > 0
          ? "The selected pages require OCR. Run OCR or select at least one readable transaction page."
          : "No readable 1099-B or 1099-DA transaction pages are selected.",
        "warning"
      );
      return;
    }

    const lineRecords = pdfLinesWithPages(selectedPages);
    const includes1099Da = selectedPages.some((page) => String(effectivePdfPageType(page)).startsWith("1099-da"));
    let rawCandidates = includes1099Da ? parsePdf1099DaCandidates(lineRecords) : [];
    let profile = includes1099Da ? "Form 1099-DA digital asset fields" : "Multi-line transaction blocks";

    if (rawCandidates.length === 0) {
      rawCandidates = parsePdfMultilineCandidates(lineRecords);
      profile = "Multi-line transaction blocks";
    }

    if (rawCandidates.length === 0) {
      rawCandidates = parsePdfRowCandidates(lineRecords);
      profile = "Table or continuation-page rows";
    }

    pdf.summaryTotals = parsePdfSummaryTotals(pdf.pages);
    pdf.extractionProfile = profile;
    pdf.candidates = rawCandidates.map((candidate) => buildPdfCandidate(candidate, pdf));
    pdf.extractionStage = "transactions";
    validateAllPdfCandidates();

    if (pdf.candidates.length === 0) {
      initializePdfFallbackMapping(selectedPages, lineRecords, scannedSelected);
      showToast(
        `${pdf.mappingRows.length} OCR mapping row${pdf.mappingRows.length === 1 ? "" : "s"} prepared. Review the fields before creating transaction candidates.`,
        "warning"
      );
      return;
    }

    renderPdfTransactionReviewWorkspace();
    showToast(
      `${pdf.candidates.length} PDF transaction candidate${pdf.candidates.length === 1 ? "" : "s"} extracted for review.`,
      "success"
    );
  }

  function pdfLinesWithPages(pages) {
    const records = [];
    pages.forEach((page) => {
      String(page.text || "")
        .split(/\r?\n/)
        .forEach((rawLine) => {
          const text = rawLine.replace(/\u00a0/g, " ").trim();
          if (text) records.push({ text, pageNumber: page.pageNumber });
        });
    });
    return records;
  }

  function inferPdfCategory(line, currentCategory = "review") {
    const lower = String(line || "").toLowerCase();
    const explicit = lower.match(
      /(?:group|category|reporting class|applicable checkbox on form 8949)\s*[:\-]?\s*([a-l])\b/
    );
    if (explicit) return explicit[1].toUpperCase();

    const shortTerm =
      lower.includes("short-term") || lower.includes("short term") || /\bst\b/.test(lower);
    const longTerm =
      lower.includes("long-term") || lower.includes("long term") || /\blt\b/.test(lower);
    const notReported =
      lower.includes("basis not reported") ||
      lower.includes("not reported to the irs") ||
      lower.includes("noncovered") ||
      lower.includes("non-covered");
    const reported =
      (lower.includes("basis reported") ||
        lower.includes("reported to the irs") ||
        lower.includes("covered")) &&
      !notReported;

    if (shortTerm && notReported) return "B";
    if (shortTerm && reported) return "A";
    if (longTerm && notReported) return "E";
    if (longTerm && reported) return "D";
    return currentCategory;
  }


  function parsePdf1099DaCandidates(lines) {
    const candidates = [];
    const pageGroups = new Map();
    lines.forEach((line) => {
      if (!pageGroups.has(line.pageNumber)) pageGroups.set(line.pageNumber, []);
      pageGroups.get(line.pageNumber).push(line.text);
    });

    const valueAfterLabel = (text, patterns) => {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return String(match[1]).trim();
      }
      return "";
    };

    for (const [pageNumber, pageLines] of pageGroups.entries()) {
      const text = pageLines.join("\n");
      if (!/(1099-da|digital asset proceeds|code for digital asset|name of digital asset)/i.test(text)) continue;

      const blocks = text.split(/(?=\b(?:Transaction|Reference|Trade)\s*(?:ID|#|:))/i);
      const usableBlocks = blocks.length > 1 ? blocks : [text];
      usableBlocks.forEach((block, blockIndex) => {
        const category = (valueAfterLabel(block, [
          /Applicable checkbox on Form 8949\s*[:\-]?\s*([G-L])/i,
          /(?:Category|Box)\s*[:\-]?\s*([G-L])\b/i
        ]) || inferPdfCategory(block, "review")).toUpperCase();
        const code = valueAfterLabel(block, [
          /(?:1a\s*)?Code for digital asset\s*[:\-]?\s*([^\n]+)/i,
          /Digital asset code\s*[:\-]?\s*([^\n]+)/i
        ]).split(/\s{2,}|\n/)[0];
        const name = valueAfterLabel(block, [
          /(?:1b\s*)?Name of digital asset\s*[:\-]?\s*([^\n]+)/i,
          /Digital asset name\s*[:\-]?\s*([^\n]+)/i
        ]).split(/\s{2,}|\n/)[0];
        const units = valueAfterLabel(block, [
          /(?:1c\s*)?Number of units\s*[:\-]?\s*([\d,.]+)/i,
          /Units\s*[:\-]?\s*([\d,.]+)/i
        ]);
        const acquired = valueAfterLabel(block, [
          new RegExp(`(?:1d\\s*)?Date acquired\\s*[:\\-]?\\s*(Various|Inherited|${PDF_DATE_TOKEN_SOURCE})`, "i")
        ]);
        const sold = valueAfterLabel(block, [
          new RegExp(`(?:1e\\s*)?Date sold or disposed\\s*[:\\-]?\\s*(${PDF_DATE_TOKEN_SOURCE})`, "i"),
          new RegExp(`Date disposed\\s*[:\\-]?\\s*(${PDF_DATE_TOKEN_SOURCE})`, "i")
        ]);
        const proceedsRaw = valueAfterLabel(block, [
          /(?:1f\s*)?Proceeds\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
          /Gross proceeds\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i
        ]);
        const basisRaw = valueAfterLabel(block, [
          /(?:1g\s*)?Cost or other basis\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i,
          /Cost basis\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i
        ]);
        const washRaw = valueAfterLabel(block, [
          /(?:1i\s*)?Wash sale loss disallowed\s*[:\-]?\s*(\(?\$?[\d,]+(?:\.\d{2})?\)?)/i
        ]);
        const transactionId = valueAfterLabel(block, [
          /(?:Transaction|Reference|Trade)\s*(?:ID|#|:)\s*[:\-]?\s*([A-Z0-9_-]+)/i,
          /Account number\s*[:\-]?\s*([^\n]+)/i
        ]);
        const term = /\bLong-term\b/i.test(block) && !/\bShort-term\b/i.test(block)
          ? "long"
          : /\bShort-term\b/i.test(block) && !/\bLong-term\b/i.test(block)
            ? "short"
            : pdfCategoryTerm(category);
        const basisReported = /(?:box 2|basis reported)\s*(?:is|:)?\s*(?:checked|yes)/i.test(block)
          ? true
          : /noncovered security|basis not reported/i.test(block)
            ? false
            : ["G", "J"].includes(category);
        let resolvedCategory = category;
        if (!FORM_8949_CATEGORIES.includes(resolvedCategory) || !/[G-L]/.test(resolvedCategory)) {
          if (term === "short") resolvedCategory = basisReported ? "G" : "H";
          else if (term === "long") resolvedCategory = basisReported ? "J" : "K";
          else resolvedCategory = "review";
        }

        const rowPattern = new RegExp(`^(?:([A-Z0-9._:-]+)\\s+)?(.+?)\\s+(Various|Inherited|${PDF_DATE_TOKEN_SOURCE})\\s+(${PDF_DATE_TOKEN_SOURCE})\\s+(\\(?\\$?[\\d,]+(?:\\.\\d{2})?\\)?)\\s+(NOT PROVIDED|\\(?\\$?[\\d,]+(?:\\.\\d{2})?\\)?)\\s+([G-L])$`, "i");
        let rowMatch = null;
        for (const row of pageLines) {
          rowMatch = row.match(rowPattern);
          if (rowMatch) break;
        }

        const description = name || rowMatch?.[2] || (code ? `Digital asset ${code}` : "");
        const finalCode = code || rowMatch?.[1] || "";
        const finalAcquired = acquired || rowMatch?.[3] || "";
        const finalSold = sold || rowMatch?.[4] || "";
        const finalProceedsRaw = proceedsRaw || rowMatch?.[5] || "";
        const finalBasisRaw = basisRaw || (rowMatch && !/NOT PROVIDED/i.test(rowMatch[6]) ? rowMatch[6] : "");
        if (!description || !finalSold || !finalProceedsRaw) return;

        candidates.push({
          transactionId: transactionId || `DA-P${pageNumber}-${blockIndex + 1}`,
          description: units ? `${description} (${units} units)` : description,
          symbol: finalCode,
          acquiredRaw: finalAcquired,
          soldRaw: finalSold,
          proceeds: parseMoney(finalProceedsRaw),
          basisMissing: !finalBasisRaw,
          basis: finalBasisRaw ? parseMoney(finalBasisRaw) : 0,
          adjustmentCode: washRaw ? "W" : "",
          adjustmentAmount: washRaw ? parseMoney(washRaw) : 0,
          printedGain: NaN,
          category: rowMatch?.[7]?.toUpperCase() || resolvedCategory,
          pageNumbers: [pageNumber],
          originalText: block,
          profile: "1099-da",
          assetType: "digital-asset",
          sourceForm: "1099-da",
          units
        });
      });
    }

    return candidates;
  }

  function parsePdfMultilineCandidates(lines) {
    const candidates = [];
    let category = "review";

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].text;
      category = inferPdfCategory(line, category);
      if (!/Reference:\s*TX-/i.test(line)) continue;

      const header = line.match(
        /^(.*?)\s*\(([^()]+)\)\s+Reference:\s*(TX-[A-Z0-9-]+)/i
      );
      if (!header) continue;

      let endIndex = index + 1;
      while (
        endIndex < lines.length &&
        !/Reference:\s*TX-/i.test(lines[endIndex].text)
      ) {
        endIndex += 1;
      }

      const block = lines.slice(index, endIndex);
      const blockText = block.map((item) => item.text).join("\n");
      const dateMatch = blockText.match(
        new RegExp(
          `Bought\\s*\\/\\s*acquired:\\s*(Various|Inherited|${PDF_DATE_TOKEN_SOURCE})\\s+Sold\\s*\\/\\s*closed:\\s*(${PDF_DATE_TOKEN_SOURCE})`,
          "i"
        )
      );
      const classMatch = blockText.match(
        /Reporting class:\s*([A-F])\s*-\s*(Not reported|Reported)/i
      );
      const salesMatch = blockText.match(
        /Sales amount\s*(\(?\$[\d,]+(?:\.\d{2})?\)?)\s+Original cost\s*(NOT PROVIDED|\(?\$[\d,]+(?:\.\d{2})?\)?)/i
      );
      const adjustmentMatch = blockText.match(
        /Adjustment\s+(?:-|([A-Z])\s*(\(?\$[\d,]+(?:\.\d{2})?\)?))/i
      );
      const gainMatch = blockText.match(
        /Net result\s*(\(?\$[\d,]+(?:\.\d{2})?\)?)/i
      );

      candidates.push({
        transactionId: header[3],
        description: header[1].trim(),
        symbol: header[2].trim(),
        acquiredRaw: dateMatch?.[1] || "",
        soldRaw: dateMatch?.[2] || "",
        proceeds: salesMatch ? parseMoney(salesMatch[1]) : NaN,
        basisMissing: !salesMatch || /NOT PROVIDED/i.test(salesMatch[2]),
        basis:
          salesMatch && !/NOT PROVIDED/i.test(salesMatch[2])
            ? parseMoney(salesMatch[2])
            : 0,
        adjustmentCode: adjustmentMatch?.[1] || "",
        adjustmentAmount: adjustmentMatch?.[2]
          ? parseMoney(adjustmentMatch[2])
          : 0,
        printedGain: gainMatch ? parseMoney(gainMatch[1]) : NaN,
        category: classMatch?.[1] || category,
        pageNumbers: [...new Set(block.map((item) => item.pageNumber))],
        originalText: blockText,
        profile: "multiline"
      });

      index = endIndex - 1;
    }

    return candidates;
  }

  function isPdfContinuationValueLine(text) {
    const lower = String(text || "").toLowerCase();
    return (
      !/^tx-/i.test(text) &&
      !/(transaction id|date acquired|date sold|proceeds|cost basis|gain\/loss|gain or loss|synthetic test document|page \d+|short-term|long-term|group [a-f]|covered|noncovered|brokerage proceeds detail|detailed realized)/i.test(
        lower
      ) &&
      !(text.match(PDF_MONEY_TOKEN_PATTERN) || []).length &&
      !new RegExp(PDF_DATE_TOKEN_SOURCE).test(text)
    );
  }

  function splitPdfSecurityPrefix(prefix, nextLine) {
    const text = String(prefix || "").trim();
    let symbol = "";
    let description = "";

    let match = text.match(/^(CUSIP\s+\d+)(?:\s+(.+))?$/i);
    if (match) {
      symbol = match[1].toUpperCase();
      description = String(match[2] || "").trim();
      if (!description && nextLine && isPdfContinuationValueLine(nextLine)) {
        description = nextLine.trim();
      }
      return { symbol, description };
    }

    match = text.match(/^([A-Z][A-Z0-9.:-]{0,24})\s+(.+)$/);
    if (match) {
      symbol = match[1].toUpperCase();
      description = match[2].trim();
      return { symbol, description };
    }

    if (/^(?:CUSIP\s+\d+|[A-Z][A-Z0-9.:-]{0,24})$/i.test(text)) {
      symbol = text.toUpperCase();
      if (nextLine && isPdfContinuationValueLine(nextLine)) {
        description = nextLine.trim();
      }
      return { symbol, description };
    }

    description = text;
    if (nextLine && isPdfContinuationValueLine(nextLine)) {
      symbol = nextLine.trim().toUpperCase();
    }
    return { symbol, description };
  }

  function parsePdfRowCandidates(lines) {
    const candidates = [];
    let category = "review";
    const rowPattern = new RegExp(
      `^(TX-[A-Z0-9-]+)\\s+(.+?)\\s+(Various|Inherited|${PDF_DATE_TOKEN_SOURCE})\\s+(${PDF_DATE_TOKEN_SOURCE})\\s+(.+)$`,
      "i"
    );

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].text;
      category = inferPdfCategory(line, category);
      if (/Reference:\s*TX-/i.test(line)) continue;

      const match = line.match(rowPattern);
      if (!match) continue;

      const nextLine = lines[index + 1]?.text || "";
      const security = splitPdfSecurityPrefix(match[2], nextLine);
      const suffix = match[5];
      const moneyTokens = suffix.match(PDF_MONEY_TOKEN_PATTERN) || [];
      if (moneyTokens.length < 2) continue;

      const adjustmentCode =
        (suffix.match(/(?:^|\s)([BOWT])(?=\s|$)/) || [])[1] || "";
      const proceeds = parseMoney(moneyTokens[0]);
      const printedGain = parseMoney(moneyTokens[moneyTokens.length - 1]);
      const basisMissing = moneyTokens.length === 2;
      const basis = basisMissing ? 0 : parseMoney(moneyTokens[1]);
      const adjustmentAmount =
        adjustmentCode && moneyTokens.length >= 4
          ? parseMoney(moneyTokens[moneyTokens.length - 2])
          : 0;

      const blockLines = [line];
      const startingPage = lines[index].pageNumber;
      if (nextLine && isPdfContinuationValueLine(nextLine)) {
        blockLines.push(nextLine);
        index += 1;
      }
      const endingPage = lines[index].pageNumber;

      candidates.push({
        transactionId: match[1],
        description: security.description,
        symbol: security.symbol,
        acquiredRaw: match[3],
        soldRaw: match[4],
        proceeds,
        basisMissing,
        basis,
        adjustmentCode,
        adjustmentAmount,
        printedGain,
        category,
        pageNumbers: [...new Set([startingPage, endingPage].filter(Boolean))],
        originalText: blockLines.join("\n"),
        profile: "row"
      });
    }

    return candidates;
  }

  function parsePdfSummaryTotals(pages) {
    const result = { categories: {}, total: null };

    pages.forEach((page) => {
      String(page.text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const categoryMatch = line.match(/^([ABDE])\s+/);
          const moneyTokens = line.match(PDF_MONEY_TOKEN_PATTERN) || [];

          if (categoryMatch && moneyTokens.length >= 4) {
            const beforeMoney = line.slice(0, line.indexOf(moneyTokens[0]));
            const countTokens = beforeMoney.match(/\b\d+\b/g) || [];
            result.categories[categoryMatch[1]] = {
              count: Number(countTokens[countTokens.length - 1] || 0),
              proceeds: parseMoney(moneyTokens[0]),
              basis: parseMoney(moneyTokens[1]),
              adjustments: parseMoney(moneyTokens[2]),
              gainLoss: parseMoney(moneyTokens[3])
            };
          }

          if ((/^TOTAL\b/i.test(line) || /\sTOTAL\s/.test(line)) && moneyTokens.length >= 4) {
            const beforeMoney = line.slice(0, line.indexOf(moneyTokens[0]));
            const countTokens = beforeMoney.match(/\b\d+\b/g) || [];
            result.total = {
              count: Number(countTokens[countTokens.length - 1] || 0),
              proceeds: parseMoney(moneyTokens[0]),
              basis: parseMoney(moneyTokens[1]),
              adjustments: parseMoney(moneyTokens[2]),
              gainLoss: parseMoney(moneyTokens[3])
            };
          }
        });
    });

    if (!result.total && Object.keys(result.categories).length > 0) {
      result.total = Object.values(result.categories).reduce(
        (totals, category) => ({
          count: totals.count + category.count,
          proceeds: totals.proceeds + category.proceeds,
          basis: totals.basis + category.basis,
          adjustments: totals.adjustments + category.adjustments,
          gainLoss: totals.gainLoss + category.gainLoss
        }),
        { count: 0, proceeds: 0, basis: 0, adjustments: 0, gainLoss: 0 }
      );
    }

    return result;
  }

  function detectPdfBrokerName(pages) {
    const lines = pdfLinesWithPages(pages.slice(0, 2)).map((item) => item.text);
    const statementIndex = lines.findIndex((line) => /consolidated tax statement/i.test(line));
    if (statementIndex >= 0) {
      const candidate = lines[statementIndex + 1] || "";
      if (candidate && !/(recipient|payer|statement information)/i.test(candidate)) {
        return candidate.slice(0, 100);
      }
    }

    const knownLine = lines.find(
      (line) => /(?:brokerage|investing|securities|financial)/i.test(line) && line.length < 100
    );
    return knownLine || "";
  }

  function detectPdfAccountLabel(pages) {
    const combined = pages
      .slice(0, 3)
      .map((page) => page.text || "")
      .join("\n");
    const match = combined.match(/Account\s*:\s*([^\n]+)/i);
    return maskAccountLabel(String(match?.[1] || "").trim().slice(0, 60));
  }

  function buildPdfCandidate(raw, pdf) {
    const acquiredRaw = String(raw.acquiredRaw || "").trim();
    const soldRaw = String(raw.soldRaw || "").trim();
    const category = FORM_8949_CATEGORIES.includes(raw.category)
      ? raw.category
      : "review";

    const candidate = {
      id: createId(),
      selected: true,
      transactionId: String(raw.transactionId || "").trim(),
      description: String(raw.description || "").trim(),
      symbol: String(raw.symbol || "").trim().toUpperCase(),
      acquiredRaw,
      soldRaw,
      proceeds: Number(raw.proceeds),
      basisMissing: Boolean(raw.basisMissing),
      basis: Number(raw.basis),
      fees: 0,
      adjustmentCode: String(raw.adjustmentCode || "").trim().toUpperCase(),
      adjustmentAmount: Number(raw.adjustmentAmount) || 0,
      category,
      assetType: normalizeAssetType(raw.assetType || (/[G-L]/.test(category) ? "digital-asset" : "stock")),
      sourceForm: normalizeSourceForm(raw.sourceForm || (/[G-L]/.test(category) ? "1099-da" : "1099-b")),
      units: String(raw.units || "").trim(),
      printedGain: Number(raw.printedGain),
      pageNumbers: Array.isArray(raw.pageNumbers) ? raw.pageNumbers : [],
      originalText: String(raw.originalText || "").slice(0, 6000),
      profile: String(raw.profile || pdf.extractionProfile || "generic"),
      issues: []
    };

    candidate.calculatedGain = calculatePdfCandidateGain(candidate);
    return candidate;
  }

  function calculatePdfCandidateGain(candidate) {
    const proceeds = Number(candidate.proceeds);
    const basis = Number(candidate.basis);
    const fees = Number(candidate.fees) || 0;
    const adjustment = Number(candidate.adjustmentAmount) || 0;
    if (candidate.basisMissing || !Number.isFinite(proceeds) || !Number.isFinite(basis)) return NaN;
    return proceeds - basis - fees + adjustment;
  }

  function pdfCategoryTerm(category) {
    if (["A", "B", "C", "G", "H", "I"].includes(category)) return "short";
    if (["D", "E", "F", "J", "K", "L"].includes(category)) return "long";
    return "unknown";
  }

  function pdfCategoryBasisStatus(category) {
    if (["A", "D", "G", "J"].includes(category)) return "reported";
    if (["B", "E", "H", "K"].includes(category)) return "not-reported";
    if (["C", "F", "I", "L"].includes(category)) return "no-1099b";
    return "unknown";
  }

  function validatePdfCandidate(candidate) {
    const issues = [];
    const acquiredRaw = String(candidate.acquiredRaw || "").trim();
    const soldDate = parseFlexibleDate(candidate.soldRaw);
    const isVarious = /^various$/i.test(acquiredRaw);
    const isInherited = /^inherited$/i.test(acquiredRaw);
    const acquiredDate = isVarious || isInherited ? "" : parseFlexibleDate(acquiredRaw);
    const categoryTerm = pdfCategoryTerm(candidate.category);

    if (!candidate.description) issues.push({ level: "error", message: "Description is missing." });
    if (!soldDate) issues.push({ level: "error", message: "Sale date is missing or invalid." });
    if (!Number.isFinite(Number(candidate.proceeds))) issues.push({ level: "error", message: "Proceeds are missing or invalid." });
    if (!acquiredRaw) issues.push({ level: "warning", message: "Acquisition date is missing." });
    else if (!isVarious && !isInherited && !acquiredDate) issues.push({ level: "error", message: "Acquisition date is invalid." });
    if (acquiredDate && soldDate && compareIsoDates(soldDate, acquiredDate) < 0) issues.push({ level: "error", message: "Sale date is earlier than acquisition date." });

    if (candidate.category === "review") issues.push({ level: "error", message: "Form 8949 reporting category needs review." });
    const digitalCandidate = candidate.assetType === "digital-asset" || candidate.sourceForm === "1099-da";
    if (digitalCandidate && !["G", "H", "I", "J", "K", "L", "review"].includes(candidate.category)) {
      issues.push({ level: "error", message: "A Form 1099-DA digital-asset row must use category G through L." });
    }
    if (!digitalCandidate && ["G", "H", "I", "J", "K", "L"].includes(candidate.category)) {
      issues.push({ level: "error", message: "Category G through L is reserved for digital-asset transactions." });
    }

    if (isVarious) {
      if (categoryTerm === "short" || categoryTerm === "long") issues.push({ level: "info", message: `Broker reports Various; ${categoryTerm === "short" ? "short-term" : "long-term"} treatment is accepted from the reporting category.` });
      else issues.push({ level: "error", message: "Broker reports Various but no short-term or long-term category was detected." });
    }

    if (isInherited) {
      if (categoryTerm === "short") issues.push({ level: "error", message: "Inherited property is shown in a short-term category. Review the statement classification." });
      else issues.push({ level: "info", message: "Broker reports Inherited; the transaction is treated as long-term, while basis must still be verified." });
    }

    if (acquiredDate && soldDate && (categoryTerm === "short" || categoryTerm === "long")) {
      const dateTerm = determineTerm({ dateAcquired: acquiredDate, dateSold: soldDate, dateAcquiredSpecial: "", termOverride: "auto" });
      if (dateTerm !== "unknown" && dateTerm !== categoryTerm) issues.push({ level: "warning", message: `Dates suggest ${dateTerm === "short" ? "short-term" : "long-term"}, but the broker category indicates ${categoryTerm === "short" ? "short-term" : "long-term"}.` });
    }

    if (candidate.basisMissing) issues.push({ level: "warning", message: "Cost basis is missing. The row may be imported for traceability, but its gain/loss will remain blocked and excluded from verified totals." });
    else if (!Number.isFinite(Number(candidate.basis))) issues.push({ level: "error", message: "Cost basis is invalid." });
    if (!Number.isFinite(Number(candidate.adjustmentAmount))) issues.push({ level: "error", message: "Adjustment amount is invalid." });
    if (candidate.adjustmentCode && Number(candidate.adjustmentAmount) === 0) issues.push({ level: "warning", message: `Adjustment code ${candidate.adjustmentCode} has no amount.` });
    if (!candidate.adjustmentCode && Number(candidate.adjustmentAmount) !== 0) issues.push({ level: "warning", message: "Adjustment amount has no adjustment code." });
    if (!candidate.transactionId) issues.push({ level: "warning", message: "No broker transaction ID was extracted." });
    if (Number.isFinite(candidate.printedGain) && Number.isFinite(candidate.calculatedGain) && Math.abs(candidate.printedGain - candidate.calculatedGain) >= 0.01) issues.push({ level: "warning", message: `Calculated gain/loss ${formatCurrency(candidate.calculatedGain)} does not match the printed amount ${formatCurrency(candidate.printedGain)}.` });
    return issues;
  }

  function validateAllPdfCandidates() {
    const pdf = state.pdfImport;
    if (!pdf) return;

    const idCounts = new Map();
    pdf.candidates.forEach((candidate) => {
      candidate.calculatedGain = calculatePdfCandidateGain(candidate);
      candidate.issues = validatePdfCandidate(candidate);
      const key = candidate.transactionId.toUpperCase();
      if (key) idCounts.set(key, (idCounts.get(key) || 0) + 1);
    });

    pdf.candidates.forEach((candidate) => {
      const key = candidate.transactionId.toUpperCase();
      if (key && (idCounts.get(key) || 0) > 1) {
        candidate.issues.push({
          level: "warning",
          message: "The same broker transaction ID appears more than once in this extraction. Review both rows before importing."
        });
      }
    });
  }

  function updatePdfCandidateFromField(field) {
    const pdf = state.pdfImport;
    if (!pdf) return;
    const candidate = pdf.candidates.find(
      (item) => item.id === field.dataset.pdfCandidateId
    );
    if (!candidate) return;

    const key = field.dataset.pdfCandidateField;
    if (key === "basisMissing") {
      candidate.basisMissing = field.checked;
    } else if (["proceeds", "basis", "fees", "adjustmentAmount"].includes(key)) {
      const rawValue = field.value.trim();
      if (!rawValue) {
        candidate[key] = ["fees", "adjustmentAmount"].includes(key) ? 0 : NaN;
      } else {
        const parsed = parseMoney(rawValue);
        candidate[key] = Number.isFinite(parsed) ? parsed : NaN;
      }
    } else {
      candidate[key] = field.value;
    }

    if (key === "category") candidate.category = field.value;
    if (key === "adjustmentCode") candidate.adjustmentCode = field.value.toUpperCase();
    if (key === "symbol") candidate.symbol = field.value.toUpperCase();

    validateAllPdfCandidates();
    renderPdfTransactionReviewWorkspace();
  }

  function pdfCandidateTotals(candidates) {
    return candidates.reduce((totals, candidate) => {
      if (!candidate.selected) return totals;
      totals.count += 1;
      totals.proceeds += Number.isFinite(candidate.proceeds) ? candidate.proceeds : 0;
      totals.basis += candidate.basisMissing || !Number.isFinite(candidate.basis) ? 0 : candidate.basis;
      totals.adjustments += Number.isFinite(candidate.adjustmentAmount) ? candidate.adjustmentAmount : 0;
      const statementAmount = Number.isFinite(candidate.printedGain) ? candidate.printedGain : candidate.calculatedGain;
      if (Number.isFinite(statementAmount)) totals.gainLoss += statementAmount;
      if (Number.isFinite(candidate.calculatedGain)) totals.verifiedGainLoss += candidate.calculatedGain;
      else {
        totals.unresolvedCount += 1;
        if (Number.isFinite(statementAmount)) totals.unresolvedStatementGainLoss += statementAmount;
      }
      return totals;
    }, { count: 0, proceeds: 0, basis: 0, adjustments: 0, gainLoss: 0, verifiedGainLoss: 0, unresolvedCount: 0, unresolvedStatementGainLoss: 0 });
  }

  function renderPdfTransactionReviewWorkspace() {
    const pdf = state.pdfImport;
    if (!pdf || pdf.extractionStage !== "transactions") return;

    const selectedCandidates = pdf.candidates.filter((candidate) => candidate.selected);
    const selectedIssues = selectedCandidates.flatMap((candidate) => candidate.issues);
    const blockingCount = selectedIssues.filter((issue) => issue.level === "error").length;
    const warningCount = selectedIssues.filter((issue) => issue.level === "warning").length;
    const infoCount = selectedIssues.filter((issue) => issue.level === "info").length;
    const totals = pdfCandidateTotals(pdf.candidates);
    const statement = pdf.summaryTotals?.total || null;
    const difference = statement ? { count: totals.count - statement.count, proceeds: totals.proceeds - statement.proceeds, basis: totals.basis - statement.basis, adjustments: totals.adjustments - statement.adjustments, gainLoss: totals.gainLoss - statement.gainLoss } : null;
    const totalsMatch = difference && difference.count === 0 && ["proceeds", "basis", "adjustments", "gainLoss"].every((key) => Math.abs(difference[key]) < 0.01);

    ui.importWorkspace.hidden = false;
    ui.importWorkspaceTitle.textContent = `Review PDF transactions - ${pdf.fileName}`;
    ui.importWorkspaceContent.innerHTML = `
      <div class="notice notice--important"><div class="notice__icon" aria-hidden="true">!</div><div><h3>Review every extracted transaction</h3><p>Statement reconciliation and verified calculation are separate. Missing-basis rows may reconcile to the broker statement but remain excluded from verified gain/loss.</p></div></div>
      <div class="review-summary">
        <article class="review-card"><span class="review-card__label">Selected candidates</span><strong>${selectedCandidates.length}</strong><small>${pdf.candidates.length} extracted using ${escapeHtml(pdf.extractionProfile)}</small></article>
        <article class="review-card"><span class="review-card__label">Blocking issues</span><strong>${blockingCount}</strong><small>Selected rows must be corrected or deselected</small></article>
        <article class="review-card"><span class="review-card__label">Statement reconciliation</span><strong>${statement ? (totalsMatch ? "Match" : "Difference") : "No summary"}</strong><small>${statement ? `Statement gain/loss difference ${formatCurrency(difference.gainLoss)}` : "Enter totals later in Import History"}</small></article>
      </div>
      ${pdfReconciliationHtml(totals, statement, difference, totalsMatch)}
      <div class="form-actions" style="flex-wrap:wrap;margin-bottom:18px;"><button class="button button--secondary" type="button" data-pdf-action="back-pages">Back to page selection</button><button class="button button--secondary" type="button" data-pdf-action="select-all-candidates">Select all</button><button class="button button--secondary" type="button" data-pdf-action="clear-candidates">Clear selection</button><button class="button button--secondary" type="button" data-pdf-action="revalidate-candidates">Revalidate</button></div>
      <div class="issue-list">${pdf.candidates.map(pdfCandidateCardHtml).join("")}</div>
      <div class="notice notice--info" style="margin-top:18px;"><div class="notice__icon" aria-hidden="true">i</div><div><h3>${warningCount} review warning${warningCount === 1 ? "" : "s"} · ${infoCount} information note${infoCount === 1 ? "" : "s"}</h3><p>Various is accepted when a broker short-term/long-term category is detected. Missing basis remains blocked after import. Inherited entries are treated as long-term and still require basis review.</p></div></div>
      <div class="form-actions"><button class="button button--primary" type="button" data-pdf-action="import-candidates" ${selectedCandidates.length === 0 || blockingCount > 0 ? "disabled" : ""}>Import ${selectedCandidates.length} transaction${selectedCandidates.length === 1 ? "" : "s"}</button></div>`;
  }

  function pdfReconciliationHtml(totals, statement, difference, totalsMatch) {
    const rows = [["Transactions", "count", false], ["Proceeds", "proceeds", true], ["Cost basis", "basis", true], ["Adjustments", "adjustments", true], ["Statement-reported gain/loss", "gainLoss", true]];
    return `
      <article class="panel">
        <div class="panel__heading"><div><h3>Statement reconciliation</h3><p>Uses broker-printed gain/loss when available. This verifies extraction, not calculation readiness.</p></div><span class="issue-badge issue-badge--${statement && !totalsMatch ? "warning" : "info"}">${statement ? (totalsMatch ? "Totals match" : "Review difference") : "Summary not detected"}</span></div>
        <div class="table-wrap"><table class="transaction-table"><thead><tr><th>Measure</th><th>Extracted</th><th>Statement</th><th>Difference</th></tr></thead><tbody>${rows.map(([label, key, money]) => `<tr><td>${label}</td><td>${money ? formatCurrency(totals[key]) : totals[key]}</td><td>${statement ? (money ? formatCurrency(statement[key]) : statement[key]) : "Not detected"}</td><td>${statement ? (money ? formatCurrency(difference[key]) : difference[key]) : "Not compared"}</td></tr>`).join("")}</tbody></table></div>
        <div class="review-summary" style="margin-top:18px;margin-bottom:0;"><article class="review-card"><span class="review-card__label">Verified calculated gain/loss</span><strong class="${amountClass(totals.verifiedGainLoss)}">${formatCurrency(totals.verifiedGainLoss)}</strong><small>Uses rows with a usable basis and valid classification</small></article><article class="review-card"><span class="review-card__label">Unresolved transactions</span><strong>${totals.unresolvedCount}</strong><small>Excluded from verified gain/loss</small></article><article class="review-card"><span class="review-card__label">Unresolved broker amount</span><strong class="${amountClass(totals.unresolvedStatementGainLoss)}">${formatCurrency(totals.unresolvedStatementGainLoss)}</strong><small>Retained only for statement reconciliation</small></article></div>
      </article>`;
  }

  function pdfCandidateCardHtml(candidate, index) {
    const blocking = candidate.issues.filter((issue) => issue.level === "error").length;
    const warnings = candidate.issues.filter((issue) => issue.level === "warning").length;
    const badgeStyle = blocking > 0 ? "error" : warnings > 0 ? "warning" : "info";
    const badgeLabel = blocking > 0 ? "Blocked" : warnings > 0 ? "Review" : "Ready";
    const candidateCategories = candidate.assetType === "digital-asset" || candidate.sourceForm === "1099-da"
      ? ["G", "H", "I", "J", "K", "L", "review"]
      : ["A", "B", "C", "D", "E", "F", "review"];
    const categoryOptions = candidateCategories.map((category) => `<option value="${category}" ${candidate.category === category ? "selected" : ""}>${category === "review" ? "Needs review" : `Category ${category}`}</option>`).join("");
    const issuesHtml = candidate.issues.length ? `<div class="issue-list" style="margin-top:14px;">${candidate.issues.map((issue) => `<article class="issue-item issue-item--${issue.level === "error" ? "error" : issue.level === "warning" ? "warning" : "info"}"><div class="issue-item__content"><p>${escapeHtml(issue.message)}</p></div></article>`).join("")}</div>` : "";
    const calculatedHtml = Number.isFinite(candidate.calculatedGain)
      ? `<strong class="${amountClass(candidate.calculatedGain)}">${formatCurrency(candidate.calculatedGain)}</strong>`
      : `<strong style="color:var(--cg-warning);">Unresolved</strong>`;

    return `
      <article class="panel" data-pdf-candidate-card="${escapeHtml(candidate.id)}">
        <div class="panel__heading"><div><h3>${index + 1}. ${escapeHtml(candidate.description || "Unnamed transaction")}</h3><p>${escapeHtml(candidate.transactionId || "No transaction ID")} · ${escapeHtml(sourceFormLabel(candidate.sourceForm))} · Page${candidate.pageNumbers.length === 1 ? "" : "s"} ${escapeHtml(candidate.pageNumbers.join(", ") || "?")}</p></div><span class="issue-badge issue-badge--${badgeStyle}">${badgeLabel}</span></div>
        <label class="checkbox-row" style="margin:0 0 15px;"><input type="checkbox" data-pdf-candidate-selected="${escapeHtml(candidate.id)}" ${candidate.selected ? "checked" : ""}><span>Include this transaction in the PDF import</span></label>
        <div class="form-grid">
          ${pdfCandidateTextField(candidate, "description", "Description")}${pdfCandidateTextField(candidate, "symbol", "Symbol or CUSIP")}${pdfCandidateTextField(candidate, "acquiredRaw", "Date acquired / special value")}${pdfCandidateTextField(candidate, "soldRaw", "Date sold")}${pdfCandidateMoneyField(candidate, "proceeds", "Proceeds")}${pdfCandidateMoneyField(candidate, "basis", "Cost basis", candidate.basisMissing)}
          <div class="form-field"><label for="pdf-candidate-${escapeHtml(candidate.id)}-basis-missing">Basis status</label><label class="checkbox-row"><input id="pdf-candidate-${escapeHtml(candidate.id)}-basis-missing" type="checkbox" data-pdf-candidate-id="${escapeHtml(candidate.id)}" data-pdf-candidate-field="basisMissing" ${candidate.basisMissing ? "checked" : ""}><span>Cost basis is missing</span></label></div>
          <div class="form-field"><label for="pdf-candidate-${escapeHtml(candidate.id)}-category">Form 8949 category</label><select id="pdf-candidate-${escapeHtml(candidate.id)}-category" data-pdf-candidate-id="${escapeHtml(candidate.id)}" data-pdf-candidate-field="category">${categoryOptions}</select></div>
          <div class="form-field"><label for="pdf-candidate-${escapeHtml(candidate.id)}-adjustment-code">Adjustment code</label><input id="pdf-candidate-${escapeHtml(candidate.id)}-adjustment-code" type="text" maxlength="10" value="${escapeHtml(candidate.adjustmentCode)}" data-pdf-candidate-id="${escapeHtml(candidate.id)}" data-pdf-candidate-field="adjustmentCode"></div>${pdfCandidateMoneyField(candidate, "adjustmentAmount", "Adjustment amount")}
        </div>
        <div class="calculation-preview" style="margin-top:16px;"><span>Verified calculated gain/loss</span>${calculatedHtml}<small>Broker printed: ${Number.isFinite(candidate.printedGain) ? formatCurrency(candidate.printedGain) : "Not extracted"}</small></div>
        ${issuesHtml}
        <details style="margin-top:14px;"><summary style="cursor:pointer;font-weight:750;color:var(--cg-text-primary);">View original extracted text</summary><pre style="max-height:240px;overflow:auto;margin:12px 0 0;padding:14px;border:1px solid var(--cg-border);border-radius:var(--cg-radius-small);background:var(--cg-surface-soft);color:var(--cg-text-secondary);white-space:pre-wrap;word-break:break-word;font:0.78rem/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;">${escapeHtml(candidate.originalText)}</pre></details>
      </article>`;
  }

  function pdfCandidateTextField(candidate, key, label) {
    return `
      <div class="form-field">
        <label for="pdf-candidate-${escapeHtml(candidate.id)}-${key}">${label}</label>
        <input
          id="pdf-candidate-${escapeHtml(candidate.id)}-${key}"
          type="text"
          value="${escapeHtml(candidate[key] ?? "")}"
          data-pdf-candidate-id="${escapeHtml(candidate.id)}"
          data-pdf-candidate-field="${key}"
        >
      </div>
    `;
  }

  function pdfCandidateMoneyField(candidate, key, label, disabled = false) {
    const value = Number.isFinite(candidate[key]) ? candidate[key].toFixed(2) : "";
    return `
      <div class="form-field">
        <label for="pdf-candidate-${escapeHtml(candidate.id)}-${key}">${label}</label>
        <div class="money-input">
          <span aria-hidden="true">$</span>
          <input
            id="pdf-candidate-${escapeHtml(candidate.id)}-${key}"
            type="text"
            inputmode="decimal"
            value="${escapeHtml(value)}"
            data-pdf-candidate-id="${escapeHtml(candidate.id)}"
            data-pdf-candidate-field="${key}"
            ${disabled ? "disabled" : ""}
          >
        </div>
      </div>
    `;
  }

  function initializePdfFallbackMapping(selectedPages, lineRecords, scannedSelected = 0) {
    const pdf = state.pdfImport;
    if (!pdf) return;

    let rows = parsePdfLabeledOcrMappingRows(lineRecords);
    if (!rows.length) rows = parsePdfGenericMappingRows(lineRecords);
    if (!rows.length) {
      const firstPage = selectedPages[0]?.pageNumber || 1;
      const originalText = selectedPages
        .map((page) => `Page ${page.pageNumber}\n${page.text || ""}`)
        .join("\n\n")
        .slice(0, 6000);
      rows = [{ ...blankPdfMappingRow(firstPage), originalText }];
    }

    pdf.mappingRows = rows;
    pdf.mappingScannedSelected = scannedSelected;
    pdf.extractionStage = "mapping";
    renderPdfFallbackMappingWorkspace();
  }

  function blankPdfMappingRow(pageNumber = 1) {
    const pdf = state.pdfImport;
    const digital = pdf?.pages?.some(
      (page) => page.selectedFor1099B && String(effectivePdfPageType(page)).startsWith("1099-da")
    );
    return {
      id: createId(),
      selected: true,
      transactionId: "",
      description: "",
      symbol: "",
      acquiredRaw: "",
      soldRaw: "",
      proceedsRaw: "",
      basisRaw: "",
      basisMissing: false,
      adjustmentCode: "",
      adjustmentRaw: "",
      printedGainRaw: "",
      category: "review",
      assetType: digital ? "digital-asset" : "stock",
      sourceForm: digital ? "1099-da" : "1099-b",
      pageNumbers: [pageNumber],
      originalText: ""
    };
  }

  function parsePdfLabeledOcrMappingRows(lines) {
    const rows = [];
    let currentCategory = "review";

    for (let index = 0; index < lines.length; index += 1) {
      const line = String(lines[index].text || "").trim();
      currentCategory = inferPdfCategory(line, currentCategory);

      const hasSaleLabels = /\bSold\b/i.test(line) && /\bPro(?:ceeds|oeeds|oeeds)\b/i.test(line) && /\bBasis\b/i.test(line);
      const hasTransactionValues = /\b(?:Various|Inherited)\b/i.test(line) || /\d{1,4}[\/\-)]+\d{1,2}[\/\-)]+\d{2,4}/.test(line) || /\d{3,4}\/\d{4}/.test(line);
      if (!hasSaleLabels || !hasTransactionValues) continue;

      const headerRecord = lines[index - 1] || { text: "", pageNumber: lines[index].pageNumber };
      const tailRecord = /(?:Code|Cade|Adjustment|Gain\s*\/\s*Lo|Category)/i.test(lines[index + 1]?.text || "")
        ? lines[index + 1]
        : { text: "", pageNumber: lines[index].pageNumber };
      const header = String(headerRecord.text || "").trim();
      const tail = String(tailRecord.text || "").trim();
      const security = parseOcrSecurityHeader(header);

      const beforeSold = line.split(/\bSold\b/i)[0] || "";
      const soldAndAfter = line.split(/\bSold\b/i).slice(1).join("Sold");
      const soldPart = soldAndAfter.split(/\bPro(?:ceeds|oeeds|oeeds)\b/i)[0] || "";
      const proceedsAndAfter = soldAndAfter.split(/\bPro(?:ceeds|oeeds|oeeds)\b/i).slice(1).join("Proceeds");
      const proceedsPart = proceedsAndAfter.split(/\bBasis\b/i)[0] || "";
      const basisPart = proceedsAndAfter.split(/\bBasis\b/i).slice(1).join("Basis");

      const acquiredRaw = normalizeOcrDateText(extractOcrDateLike(beforeSold));
      const soldRaw = normalizeOcrDateText(extractOcrDateLike(soldPart));
      const proceedsRaw = cleanOcrMoneyLabelValue(proceedsPart);
      const basisRaw = cleanOcrMoneyLabelValue(basisPart);
      const categoryMatch = tail.match(/Category\s*([A-L])/i) || line.match(/Category\s*([A-L])/i);
      const category = (categoryMatch?.[1] || currentCategory || "review").toUpperCase();
      const codeMatch = tail.match(/(?:Code|Cade)\s*[:\-]?\s*([^|]+)/i);
      const adjustmentMatch = tail.match(/Adjustment\s*:?\s*([^|]+)/i);
      const gainMatch = tail.match(/Gain\s*\/\s*Lo(?:ss|es|xs|ss)?\s*:?\s*([^|]+)/i);
      const pageNumbers = [...new Set([headerRecord.pageNumber, lines[index].pageNumber, tailRecord.pageNumber].filter(Boolean))];
      const digital = /[G-L]/.test(category) || /1099-da|digital asset/i.test(`${header}\n${line}\n${tail}`);

      rows.push({
        id: createId(),
        selected: true,
        transactionId: security.transactionId,
        description: security.description,
        symbol: security.symbol,
        acquiredRaw,
        soldRaw,
        proceedsRaw,
        basisRaw,
        basisMissing: !basisRaw || /(?:N\/A|NOT PROVIDED|UNAVAILABLE)/i.test(basisRaw),
        adjustmentCode: normalizeOcrAdjustmentCode(codeMatch?.[1] || ""),
        adjustmentRaw: cleanOcrMoneyLabelValue(adjustmentMatch?.[1] || ""),
        printedGainRaw: cleanOcrMoneyLabelValue(gainMatch?.[1] || ""),
        category: FORM_8949_CATEGORIES.includes(category) ? category : "review",
        assetType: digital ? "digital-asset" : "stock",
        sourceForm: digital ? "1099-da" : "1099-b",
        pageNumbers,
        originalText: [header, line, tail].filter(Boolean).join("\n")
      });

      if (tail) index += 1;
    }

    return rows;
  }

  function parsePdfGenericMappingRows(lines) {
    const rows = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = String(lines[index].text || "").trim();
      const dates = extractOcrDateTokens(line);
      const money = extractOcrMoneyTokens(line);
      if (dates.length < 2 || money.length < 2) continue;

      const security = parseOcrSecurityHeader(lines[index - 1]?.text || "");
      const category = inferPdfCategory(`${lines[index - 1]?.text || ""} ${line} ${lines[index + 1]?.text || ""}`, "review");
      rows.push({
        ...blankPdfMappingRow(lines[index].pageNumber),
        transactionId: security.transactionId,
        description: security.description,
        symbol: security.symbol,
        acquiredRaw: normalizeOcrDateText(dates[0]),
        soldRaw: normalizeOcrDateText(dates[1]),
        proceedsRaw: money[0],
        basisRaw: money[1],
        basisMissing: false,
        adjustmentRaw: money[2] || "",
        printedGainRaw: money.at(-1) || "",
        category: FORM_8949_CATEGORIES.includes(category) ? category : "review",
        pageNumbers: [lines[index].pageNumber],
        originalText: [lines[index - 1]?.text || "", line, lines[index + 1]?.text || ""].filter(Boolean).join("\n")
      });
    }
    return rows;
  }

  function parseOcrSecurityHeader(value) {
    const text = String(value || "")
      .replace(/[‘’“”]/g, "")
      .replace(/^\s*[|]+/, "")
      .trim();
    if (!text) return { transactionId: "", symbol: "", description: "" };

    const pipeParts = text.split(/\s*\|\s*/).filter(Boolean);
    let transactionId = "";
    let securityText = text;
    if (pipeParts.length >= 2) {
      transactionId = pipeParts.shift().trim();
      securityText = pipeParts.join(" ").trim();
    } else {
      const idMatch = text.match(/^([^\s]+)\s+(.+)$/);
      if (idMatch && /\d/.test(idMatch[1])) {
        transactionId = idMatch[1];
        securityText = idMatch[2];
      }
    }

    const symbolMatch = securityText.match(/^([A-Z][A-Z0-9.:-]{0,24}|CUSIP\s*\d+)\s+(.+)$/i);
    return {
      transactionId: transactionId.replace(/[^A-Z0-9._%|:-]/gi, "").slice(0, 40),
      symbol: symbolMatch ? symbolMatch[1].replace(/\s+/g, "").toUpperCase() : "",
      description: (symbolMatch ? symbolMatch[2] : securityText).trim()
    };
  }

  function extractOcrDateTokens(value) {
    const text = String(value || "");
    const specials = text.match(/\b(?:Various|Inherited)\b/gi) || [];
    const dates = text.match(/\d{1,4}[\/\-)]+\d{1,2}[\/\-)]+\d{2,4}|\d{3,4}\/\d{4}/g) || [];
    return [...specials, ...dates];
  }

  function extractOcrDateLike(value) {
    const tokens = extractOcrDateTokens(value);
    return tokens.at(-1) || "";
  }

  function normalizeOcrDateText(value) {
    let text = String(value || "").trim();
    if (/^various$/i.test(text)) return "Various";
    if (/^inherited$/i.test(text)) return "Inherited";
    text = text.replace(/[)\]}]/g, "/").replace(/[({\[]/g, "").replace(/\s+/g, "");
    text = text.replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
    const compact = text.match(/^(\d{2})(\d{2})\/(\d{4})$/);
    if (compact) return `${compact[1]}/${compact[2]}/${compact[3]}`;
    return text;
  }

  function extractOcrMoneyTokens(value) {
    const text = String(value || "");
    return text.match(/[-~(]?\$?\s*\d[\d,.:\s]*\d(?:\.\d{2})?\)?/g) || [];
  }

  function cleanOcrMoneyLabelValue(value) {
    return String(value || "")
      .replace(/\b(?:USD|Dollars?)\b/gi, "")
      .replace(/^[\s:=]+|[|;\s]+$/g, "")
      .trim();
  }

  function parseOcrMoney(value) {
    let text = cleanOcrMoneyLabelValue(value);
    if (!text || /^(?:N\/A|NOT PROVIDED|UNAVAILABLE)$/i.test(text)) return NaN;
    const negative = /^\s*[-~]/.test(text) || /^\(.*\)$/.test(text);
    text = text.replace(/[()$£€¥₹~+-]/g, "").replace(/:/g, "").trim();
    if (/\d\s+\d{2}$/.test(text) && !text.includes(".")) {
      text = text.replace(/\s+(\d{2})$/, ".$1");
    }
    text = text.replace(/[\s,]/g, "");
    const dots = [...text.matchAll(/\./g)].map((match) => match.index);
    if (dots.length > 1) {
      const last = dots.at(-1);
      text = text.slice(0, last).replace(/\./g, "") + text.slice(last);
    }
    const number = Number(text);
    if (!Number.isFinite(number)) return NaN;
    return negative ? -Math.abs(number) : number;
  }

  function normalizeOcrAdjustmentCode(value) {
    const text = String(value || "").trim().toUpperCase();
    if (!text || /^[-—–]$/.test(text)) return "";
    const match = text.match(/[BOWT]/);
    return match?.[0] || "";
  }

  function renderPdfFallbackMappingWorkspace() {
    const pdf = state.pdfImport;
    if (!pdf || pdf.extractionStage !== "mapping") return;
    pdf.mappingRows = Array.isArray(pdf.mappingRows) ? pdf.mappingRows : [];
    const selectedCount = pdf.mappingRows.filter((row) => row.selected).length;
    const ocrRows = pdf.mappingRows.filter((row) => row.originalText).length;

    ui.importWorkspace.hidden = false;
    ui.importWorkspaceTitle.textContent = `Map OCR transactions - ${pdf.fileName}`;
    ui.importWorkspaceContent.innerHTML = `
      <div class="notice notice--important">
        <div class="notice__icon" aria-hidden="true">!</div>
        <div>
          <h3>Confirm the OCR field mapping</h3>
          <p>The automatic layout parser did not recognize this statement. Velzarytha created editable mapping rows from the OCR text. Correct every date and amount before creating transaction candidates.</p>
        </div>
      </div>
      <div class="review-summary">
        <article class="review-card"><span class="review-card__label">Mapping rows</span><strong>${pdf.mappingRows.length}</strong><small>${ocrRows} prepared from extracted text</small></article>
        <article class="review-card"><span class="review-card__label">Selected rows</span><strong>${selectedCount}</strong><small>Only selected rows continue</small></article>
        <article class="review-card"><span class="review-card__label">Next step</span><strong>Review</strong><small>No transaction is imported yet</small></article>
      </div>
      <div class="form-actions" style="flex-wrap:wrap;margin-bottom:18px;">
        <button class="button button--secondary" type="button" data-pdf-action="back-pages">Back to page selection</button>
        <button class="button button--secondary" type="button" data-pdf-action="download-text">Download extracted text</button>
        <button class="button button--secondary" type="button" data-pdf-action="add-mapping-row">Add blank transaction row</button>
        <button class="button button--secondary" type="button" data-pdf-action="select-all-mapping">Select all</button>
        <button class="button button--secondary" type="button" data-pdf-action="clear-mapping">Clear selection</button>
      </div>
      <div class="issue-list">${pdf.mappingRows.map(pdfMappingRowHtml).join("")}</div>
      <div class="notice notice--info" style="margin-top:18px;">
        <div class="notice__icon" aria-hidden="true">i</div>
        <div><h3>Mapping does not import automatically</h3><p>Creating transaction candidates opens the normal validation screen. Missing basis, invalid dates, uncertain categories, and OCR amount differences remain blocked or warned there.</p></div>
      </div>
      <div class="form-actions"><button class="button button--primary" type="button" data-pdf-action="apply-mapping" ${selectedCount ? "" : "disabled"}>Create review candidates from ${selectedCount} row${selectedCount === 1 ? "" : "s"}</button></div>
    `;
  }

  function pdfMappingRowHtml(row, index) {
    const stockCategories = ["A", "B", "C", "D", "E", "F"];
    const digitalCategories = ["G", "H", "I", "J", "K", "L"];
    const categories = row.assetType === "digital-asset" || row.sourceForm === "1099-da"
      ? digitalCategories
      : stockCategories;
    const categoryOptions = ["review", ...categories]
      .map((value) => `<option value="${value}" ${row.category === value ? "selected" : ""}>${value === "review" ? "Needs review" : `Category ${value}`}</option>`)
      .join("");
    const pageLabel = (row.pageNumbers || []).join(", ") || "?";

    return `
      <article class="panel" data-pdf-map-card="${escapeHtml(row.id)}">
        <div class="panel__heading">
          <div><h3>${index + 1}. ${escapeHtml(row.description || "Unmapped transaction")}</h3><p>Source page${(row.pageNumbers || []).length === 1 ? "" : "s"} ${escapeHtml(pageLabel)} · OCR/manual mapping</p></div>
          <button class="button button--secondary button--small" type="button" data-pdf-action="remove-mapping-row" data-pdf-map-row-id="${escapeHtml(row.id)}">Remove row</button>
        </div>
        <label class="checkbox-row" style="margin:0 0 15px;"><input type="checkbox" data-pdf-map-row-id="${escapeHtml(row.id)}" data-pdf-map-field="selected" ${row.selected ? "checked" : ""}><span>Include this mapped row</span></label>
        <div class="form-grid">
          ${pdfMapTextField(row, "transactionId", "Transaction/reference ID")}
          ${pdfMapTextField(row, "description", "Description of property")}
          ${pdfMapTextField(row, "symbol", "Symbol, CUSIP, or asset ID")}
          ${pdfMapTextField(row, "acquiredRaw", "Date acquired / Various / Inherited")}
          ${pdfMapTextField(row, "soldRaw", "Date sold")}
          ${pdfMapTextField(row, "proceedsRaw", "Proceeds")}
          ${pdfMapTextField(row, "basisRaw", "Cost basis", row.basisMissing)}
          <div class="form-field"><label>Basis status</label><label class="checkbox-row"><input type="checkbox" data-pdf-map-row-id="${escapeHtml(row.id)}" data-pdf-map-field="basisMissing" ${row.basisMissing ? "checked" : ""}><span>Cost basis is missing</span></label></div>
          ${pdfMapTextField(row, "adjustmentCode", "Adjustment code")}
          ${pdfMapTextField(row, "adjustmentRaw", "Adjustment amount")}
          ${pdfMapTextField(row, "printedGainRaw", "Broker-reported gain/loss")}
          <div class="form-field"><label for="pdf-map-${escapeHtml(row.id)}-category">Form 8949 category</label><select id="pdf-map-${escapeHtml(row.id)}-category" data-pdf-map-row-id="${escapeHtml(row.id)}" data-pdf-map-field="category">${categoryOptions}</select></div>
        </div>
        ${row.originalText ? `<details style="margin-top:14px;"><summary style="cursor:pointer;font-weight:750;color:var(--cg-text-primary);">View OCR source text</summary><pre style="max-height:220px;overflow:auto;margin:12px 0 0;padding:14px;border:1px solid var(--cg-border);border-radius:var(--cg-radius-small);background:var(--cg-surface-soft);color:var(--cg-text-secondary);white-space:pre-wrap;word-break:break-word;font:0.78rem/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;">${escapeHtml(row.originalText)}</pre></details>` : ""}
      </article>
    `;
  }

  function pdfMapTextField(row, key, label, disabled = false) {
    return `<div class="form-field"><label for="pdf-map-${escapeHtml(row.id)}-${key}">${escapeHtml(label)}</label><input id="pdf-map-${escapeHtml(row.id)}-${key}" type="text" value="${escapeHtml(row[key] ?? "")}" data-pdf-map-row-id="${escapeHtml(row.id)}" data-pdf-map-field="${key}" ${disabled ? "disabled" : ""}></div>`;
  }

  function updatePdfMappingRowFromField(field) {
    const pdf = state.pdfImport;
    if (!pdf) return;
    const row = (pdf.mappingRows || []).find((item) => item.id === field.dataset.pdfMapRowId);
    if (!row) return;
    const key = field.dataset.pdfMapField;
    if (key === "selected" || key === "basisMissing") row[key] = field.checked;
    else row[key] = field.value;
    if (key === "symbol" || key === "adjustmentCode" || key === "category") row[key] = String(row[key] || "").toUpperCase();
    if (key === "basisMissing") renderPdfFallbackMappingWorkspace();
  }

  function applyPdfFallbackMapping() {
    const pdf = state.pdfImport;
    if (!pdf || pdf.extractionStage !== "mapping") return;
    const selected = (pdf.mappingRows || []).filter((row) => row.selected);
    if (!selected.length) {
      showToast("Select at least one mapped transaction row.", "warning");
      return;
    }

    const rawCandidates = selected.map((row) => ({
      transactionId: String(row.transactionId || "").trim(),
      description: String(row.description || "").trim(),
      symbol: String(row.symbol || "").trim(),
      acquiredRaw: String(row.acquiredRaw || "").trim(),
      soldRaw: String(row.soldRaw || "").trim(),
      proceeds: parseOcrMoney(row.proceedsRaw),
      basisMissing: Boolean(row.basisMissing) || !String(row.basisRaw || "").trim(),
      basis: Boolean(row.basisMissing) ? 0 : parseOcrMoney(row.basisRaw),
      adjustmentCode: normalizeOcrAdjustmentCode(row.adjustmentCode),
      adjustmentAmount: String(row.adjustmentRaw || "").trim() ? parseOcrMoney(row.adjustmentRaw) : 0,
      printedGain: String(row.printedGainRaw || "").trim() ? parseOcrMoney(row.printedGainRaw) : NaN,
      category: FORM_8949_CATEGORIES.includes(String(row.category || "").toUpperCase())
        ? String(row.category).toUpperCase()
        : "review",
      pageNumbers: Array.isArray(row.pageNumbers) ? row.pageNumbers : [],
      originalText: String(row.originalText || ""),
      profile: "ocr-field-mapping",
      assetType: row.assetType || "stock",
      sourceForm: row.sourceForm || "1099-b"
    }));

    pdf.extractionProfile = "OCR field mapping";
    pdf.candidates = rawCandidates.map((candidate) => buildPdfCandidate(candidate, pdf));
    pdf.extractionStage = "transactions";
    validateAllPdfCandidates();
    renderPdfTransactionReviewWorkspace();
    showToast(`${pdf.candidates.length} mapped transaction candidate${pdf.candidates.length === 1 ? "" : "s"} created for validation.`, "success");
  }

  function renderPdfExtractionFailureWorkspace(scannedSelected) {
    const pdf = state.pdfImport;
    if (!pdf) return;
    const selectedPages = pdf.pages.filter((page) => page.selectedFor1099B && page.textStatus !== "scanned" && page.text);
    initializePdfFallbackMapping(selectedPages, pdfLinesWithPages(selectedPages), scannedSelected);
  }

  function pdfCandidateToTransaction(candidate, pdf, batchId, importedAt) {
    const acquiredRaw = String(candidate.acquiredRaw || "").trim();
    const isVarious = /^various$/i.test(acquiredRaw);
    const isInherited = /^inherited$/i.test(acquiredRaw);
    const categoryTerm = pdfCategoryTerm(candidate.category);
    const termOverride = isInherited ? "long" : categoryTerm;
    const dateAcquired = isVarious || isInherited ? "" : parseFlexibleDate(acquiredRaw);
    const specialNote = isInherited ? "Broker reports acquisition as Inherited; long-term treatment applied." : isVarious ? `Broker reports acquisition date as Various; ${categoryTerm === "short" ? "short-term" : "long-term"} treatment taken from the broker category.` : "";

    return normalizeTransaction({
      id: createId(), owner: defaultTransactionOwner(), assetType: candidate.assetType || (/[G-L]/.test(candidate.category) ? "digital-asset" : "stock"), sourceForm: candidate.sourceForm || (/[G-L]/.test(candidate.category) ? "1099-da" : "1099-b"), brokerName: pdf.brokerName || "", accountLabel: pdf.accountLabel || "", assetDescription: candidate.description, symbolCusip: candidate.symbol,
      dateAcquired, dateAcquiredVarious: isVarious, dateAcquiredSpecial: isInherited ? "inherited" : isVarious ? "various" : "", dateSold: parseFlexibleDate(candidate.soldRaw),
      termOverride, termSource: isInherited ? "inherited-rule" : "broker-category", termConfirmed: termOverride === "short" || termOverride === "long",
      proceeds: candidate.proceeds, costBasis: candidate.basisMissing ? 0 : candidate.basis, costBasisMissing: candidate.basisMissing, fees: Number(candidate.fees) || 0,
      adjustmentCode: candidate.adjustmentCode, adjustmentAmount: Number(candidate.adjustmentAmount) || 0, basisReported: pdfCategoryBasisStatus(candidate.category), form8949Category: candidate.category,
      statementReportedGainLoss: Number.isFinite(candidate.printedGain) ? candidate.printedGain : null,
      transactionNotes: [`Imported from ${pdf.fileName}, PDF page${candidate.pageNumbers.length === 1 ? "" : "s"} ${candidate.pageNumbers.join(", ")}.`, candidate.transactionId ? `Broker transaction ID: ${candidate.transactionId}.` : "", candidate.units ? `Units reported: ${candidate.units}.` : "", specialNote].filter(Boolean).join(" "),
      source: { type: "pdf", fileName: pdf.fileName, fileHash: pdf.fileHash || "", batchId, importedAt, pageNumber: candidate.pageNumbers[0] || "", pageNumbers: candidate.pageNumbers, transactionId: candidate.transactionId, extractionProfile: pdf.extractionProfile, originalText: candidate.originalText, originalValues: { description: candidate.description, symbol: candidate.symbol, acquiredDate: candidate.acquiredRaw, soldDate: candidate.soldRaw, proceeds: candidate.proceeds, basis: candidate.basisMissing ? "" : candidate.basis, adjustmentCode: candidate.adjustmentCode, adjustmentAmount: candidate.adjustmentAmount, category: candidate.category, printedGain: candidate.printedGain } },
      createdAt: importedAt, updatedAt: importedAt
    });
  }

  async function importValidatedPdfCandidates(forceRepeatedFile = false) {
    const pdf = state.pdfImport;
    if (!pdf || pdf.extractionStage !== "transactions") return;

    validateAllPdfCandidates();
    const selected = pdf.candidates.filter((candidate) => candidate.selected);
    const blocking = selected.flatMap((candidate) => candidate.issues).filter(
      (issue) => issue.level === "error"
    );

    if (selected.length === 0) {
      showToast("Select at least one PDF transaction candidate.", "warning");
      return;
    }
    if (blocking.length > 0) {
      renderPdfTransactionReviewWorkspace();
      showToast("Correct or deselect the blocked PDF transactions before importing.", "error");
      return;
    }

    const existingBatch = state.importBatches.find(
      (batch) =>
        batch.type === "pdf" &&
        pdf.fileHash &&
        batch.fileHash === pdf.fileHash
    );
    if (existingBatch && !forceRepeatedFile) {
      showConfirmDialog({
        title: "This PDF appears to have been imported already",
        message: `${pdf.fileName} matches a PDF import from ${formatDateTime(existingBatch.importedAt)}. Importing it again may create duplicate transactions.`,
        confirmLabel: "Import again",
        onConfirm: () => { void importValidatedPdfCandidates(true); }
      });
      return;
    }

    const importedAt = new Date().toISOString();
    const batchId = createId();
    const transactions = selected.map((candidate) =>
      pdfCandidateToTransaction(candidate, pdf, batchId, importedAt)
    );

    const fingerprintCounts = new Map();
    [...state.transactions, ...transactions].forEach((transaction) => {
      const fingerprint = transactionFingerprint(transaction);
      fingerprintCounts.set(fingerprint, (fingerprintCounts.get(fingerprint) || 0) + 1);
    });
    const possibleDuplicateRows = transactions.filter(
      (transaction) =>
        (fingerprintCounts.get(transactionFingerprint(transaction)) || 0) > 1
    ).length;

    const deselected = pdf.candidates.filter((candidate) => !candidate.selected);
    const summary = pdf.summaryTotals?.total || null;
    const batch = normalizeImportBatch({
      id: batchId,
      type: "pdf",
      fileName: pdf.fileName,
      fileHash: pdf.fileHash || "",
      fileSize: pdf.fileSize || 0,
      fileLastModified: pdf.fileLastModified || 0,
      importedAt,
      rowCount: pdf.candidates.length,
      importedCount: transactions.length,
      invalidRows: 0,
      possibleDuplicateRows,
      skippedRows: deselected.slice(0, 100).map((candidate) => ({
        pageNumber: candidate.pageNumbers.join(", "),
        transactionId: candidate.transactionId,
        message: `${candidate.transactionId || candidate.description || "Candidate"} was deselected during PDF review.`
      })),
      statementTotals: summary
        ? {
            proceeds: summary.proceeds,
            basis: summary.basis,
            adjustments: summary.adjustments,
            gainLoss: summary.gainLoss
          }
        : {
            proceeds: null,
            basis: null,
            adjustments: null,
            gainLoss: null
          }
    });

    state.transactions.push(...transactions);
    state.importBatches.push(batch);
    state.pdfImport = null;
    ui.pdfFileInput.value = "";
    ui.pdfFileSelection.textContent = "No PDF selected";
    renderAll();
    openView("importView");

    const saved = await saveWorkspace();
    const message = `${transactions.length} PDF transaction${transactions.length === 1 ? "" : "s"} imported${possibleDuplicateRows ? `; ${possibleDuplicateRows} possible match${possibleDuplicateRows === 1 ? "" : "es"} flagged` : ""}.${saved ? " Saved in this browser." : " Browser storage could not confirm the save; download a backup before refreshing."}`;

    showToast(
      message,
      !saved || possibleDuplicateRows ? "warning" : "success"
    );
  }

  function clearPdfReview() {
    state.pdfImport = null;
    ui.pdfFileInput.value = "";
    ui.pdfFileSelection.textContent = "No PDF selected";
    renderImportBatchManager();
  }

  function updatePdfReviewSummary() {
    if (!state.pdfImport) return;
    const candidateCount = byId("pdfCandidatePageCount");
    const ocrCount = byId("pdfOcrPageCount");
    if (candidateCount) candidateCount.textContent = String(countSelectedPdfPages());
    if (ocrCount) {
      ocrCount.textContent = String(
        state.pdfImport.pages.filter((page) => effectivePdfPageType(page) === "scanned").length
      );
    }
  }

  function countSelectedPdfPages() {
    return state.pdfImport?.pages.filter((page) => page.selectedFor1099B).length || 0;
  }

  function effectivePdfPageType(page) {
    return page.overrideType || page.detectedType || "unrecognized";
  }

  function isPdf1099BType(type) {
    return [
      "1099-b-transactions", "1099-b-continuation", "1099-b-summary",
      "1099-da-transactions", "1099-da-summary"
    ].includes(type);
  }

  function pdfPageTypeLabel(type) {
    return PDF_PAGE_TYPE_OPTIONS.find(([value]) => value === type)?.[1] || "Needs review";
  }

  function downloadPdfTextReview() {
    const pdf = state.pdfImport;
    if (!pdf) return;

    const content = [
      "VELZARYTHA CONSOLIDATED 1099 PDF PAGE REVIEW",
      `Source file: ${pdf.fileName}`,
      `Pages: ${pdf.pageCount}`,
      "",
      ...pdf.pages.flatMap((page) => [
        "=".repeat(72),
        `PAGE ${page.pageNumber}`,
        `Classification: ${pdfPageTypeLabel(effectivePdfPageType(page))}`,
        `Text status: ${page.textStatus}`,
        `Selected for transaction extraction: ${page.selectedFor1099B ? "Yes" : "No"}`,
        "",
        page.text || "[No selectable text extracted]",
        ""
      ])
    ].join("\n");

    const safeBase = pdf.fileName.replace(/\.pdf$/i, "").replace(/[^a-z0-9_-]+/gi, "-");
    downloadTextFile(
      `${safeBase || "consolidated-1099"}-page-review.txt`,
      content,
      "text/plain;charset=utf-8"
    );
    showToast("Extracted PDF text downloaded.", "success");
  }

  function formatFileSize(bytes) {
    const size = Math.max(0, Number(bytes) || 0);
    if (size < 1024) return `${size} bytes`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function suggestCsvMapping(headers) {
    const normalizedHeaders = headers.map(normalizeHeader);
    const mapping = {};

    CSV_FIELDS.forEach((field) => {
      const aliases = CSV_ALIASES[field.key] || [];
      let matchIndex = normalizedHeaders.findIndex((header) => aliases.includes(header));

      if (matchIndex < 0) {
        matchIndex = normalizedHeaders.findIndex((header) =>
          aliases.some((alias) => header.includes(alias) || alias.includes(header))
        );
      }

      mapping[field.key] = matchIndex >= 0 ? matchIndex : null;
    });

    return mapping;
  }

  function generateForm8949Worksheet() {
    const unresolved = state.transactions.filter((transaction) => !isTransactionCalculationReady(transaction));
    if (unresolved.length) {
      showToast(`Resolve ${unresolved.length} transaction${unresolved.length === 1 ? "" : "s"} before generating the worksheet.`, "error");
      return;
    }

    const groups = new Map(FORM_8949_CATEGORIES.map((key) => [key, []]));
    state.transactions.forEach((transaction) => {
      if (groups.has(transaction.resolvedCategory)) groups.get(transaction.resolvedCategory).push(transaction);
    });

    const sections = [...groups.entries()]
      .filter(([, transactions]) => transactions.length > 0)
      .map(([category, transactions]) => form8949CategorySectionHtml(category, transactions))
      .join("");

    const settings = normalizeEstimateSettings(state.estimateSettings);
    const html = `
      ${reportHeaderHtml("Form 8949-style planning worksheet", "Verified transaction details grouped by reporting category.")}
      ${reportOwnershipSummaryHtml(state.transactions, settings.filingStatus)}
      ${sections || "<p>No reportable categories are available.</p>"}
    `;
    showGeneratedReport("Form 8949-style planning worksheet", html);
  }

  function form8949CategorySectionHtml(category, transactions) {
    const totals = summarizeTransactions(transactions).all;
    return `<section class="panel report-section">
      <div class="panel__heading"><div><p class="eyebrow">Form 8949-style category</p><h3>Category ${escapeHtml(category)}</h3></div><span class="badge">${transactions.length} transaction${transactions.length === 1 ? "" : "s"}</span></div>
      <div class="table-wrap"><table class="transaction-table">
        <thead><tr><th>Description</th><th>Owner</th><th>Acquired</th><th>Sold</th><th>Proceeds</th><th>Basis</th><th>Code</th><th>Adjustment</th><th>Gain/loss</th><th>Source</th></tr></thead>
        <tbody>${transactions.map((transaction) => `<tr>
          <td><strong>${escapeHtml(transaction.assetDescription)}</strong><small style="display:block;color:var(--cg-text-muted);">${escapeHtml(assetTypeLabel(transaction.assetType))} · ${escapeHtml(transaction.symbolCusip || "No ID")}</small></td>
          <td>${escapeHtml(ownerLabel(transaction.owner))}</td>
          <td>${escapeHtml(transaction.dateAcquiredSpecial === "inherited" ? "Inherited" : transaction.dateAcquiredVarious ? "Various" : formatDate(transaction.dateAcquired) || "—")}</td>
          <td>${escapeHtml(formatDate(transaction.dateSold) || "—")}</td>
          <td>${formatCurrency(transaction.proceeds)}</td>
          <td>${formatCurrency(transaction.costBasis)}</td>
          <td>${escapeHtml(transaction.adjustmentCode || "—")}</td>
          <td>${formatCurrency(transaction.adjustmentAmount)}</td>
          <td class="${amountClass(transaction.calculatedGainLoss)}">${formatCurrency(transaction.calculatedGainLoss)}</td>
          <td>${escapeHtml(sourceFormLabel(transaction.sourceForm))}<small style="display:block;color:var(--cg-text-muted);">${escapeHtml(transaction.source?.fileName || "Manual")} ${transaction.source?.pageNumber ? `· page ${escapeHtml(String(transaction.source.pageNumber))}` : ""}</small></td>
        </tr>`).join("")}</tbody>
        <tfoot><tr><th colspan="4">Category ${escapeHtml(category)} totals</th><th>${formatCurrency(totals.proceeds)}</th><th>${formatCurrency(totals.basis)}</th><th></th><th>${formatCurrency(totals.adjustments)}</th><th>${formatCurrency(totals.gainLoss)}</th><th></th></tr></tfoot>
      </table></div>
    </section>`;
  }

  function generateScheduleDSummary() {
    const unresolved = state.transactions.filter((transaction) => !isTransactionCalculationReady(transaction));
    if (unresolved.length) {
      showToast(`Resolve ${unresolved.length} transaction${unresolved.length === 1 ? "" : "s"} before generating the summary.`, "error");
      return;
    }

    const totals = summarizeTransactions(state.transactions);
    const settings = normalizeEstimateSettings(state.estimateSettings);
    const result = calculateFederalCapitalGainsEstimate(settings, totals);
    const combined = totals.short.gainLoss + totals.long.gainLoss;
    const html = `
      ${reportHeaderHtml("Schedule D-style planning summary", "Verified short-term and long-term capital-gain totals with entered carryovers.")}
      ${reportOwnershipSummaryHtml(state.transactions, settings.filingStatus)}
      <section class="panel report-section">
        <div class="panel__heading"><div><p class="eyebrow">Capital gain and loss summary</p><h3>Verified transaction totals</h3></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Measure</th><th>Short-term</th><th>Long-term</th><th>Combined / treatment</th></tr></thead>
          <tbody>
            <tr><td>Transaction proceeds</td><td>${formatCurrency(totals.short.proceeds)}</td><td>${formatCurrency(totals.long.proceeds)}</td><td>${formatCurrency(totals.all.proceeds)}</td></tr>
            <tr><td>Known basis</td><td>${formatCurrency(totals.short.basis)}</td><td>${formatCurrency(totals.long.basis)}</td><td>${formatCurrency(totals.all.basis)}</td></tr>
            <tr><td>Adjustments</td><td>${formatCurrency(totals.short.adjustments)}</td><td>${formatCurrency(totals.long.adjustments)}</td><td>${formatCurrency(totals.all.adjustments)}</td></tr>
            <tr><td>Verified transaction gain/loss</td><td class="${amountClass(totals.short.gainLoss)}">${formatCurrency(totals.short.gainLoss)}</td><td class="${amountClass(totals.long.gainLoss)}">${formatCurrency(totals.long.gainLoss)}</td><td class="${amountClass(combined)}">${formatCurrency(combined)}</td></tr>
            <tr><td>Prior-year loss carryover entered</td><td>${formatCurrency(settings.shortTermLossCarryover)}</td><td>${formatCurrency(settings.longTermLossCarryover)}</td><td>Reduces the applicable term</td></tr>
            <tr><td>Capital-gain distributions entered</td><td>—</td><td>${formatCurrency(settings.capitalGainDistributions)}</td><td>Long-term side</td></tr>
            <tr><td>After carryovers and cross-netting</td><td>${formatCurrency(result.netShort)}</td><td>${formatCurrency(result.netLong)}</td><td class="${amountClass(result.combinedNet)}">${formatCurrency(result.combinedNet)}</td></tr>
            <tr><td>Current-year capital-loss deduction</td><td colspan="2">${formatCurrency(result.deductibleCapitalLoss)}</td><td>Planning limit ${formatCurrency(result.lossLimit)}</td></tr>
            <tr><td>Estimated unused loss carryforward</td><td colspan="2">${formatCurrency(result.estimatedFutureCarryover)}</td><td>Exact character requires the official carryover worksheet</td></tr>
          </tbody>
        </table></div>
      </section>
    `;
    showGeneratedReport("Schedule D-style planning summary", html);
  }

  function generateCompletePlanningReport() {
    const unresolved = state.transactions.filter((transaction) => !isTransactionCalculationReady(transaction));
    if (unresolved.length) {
      showToast(`Resolve ${unresolved.length} blocking transaction${unresolved.length === 1 ? "" : "s"} before generating the complete report.`, "error");
      return;
    }

    const settings = normalizeEstimateSettings(state.estimateSettings);
    const totals = summarizeTransactions(state.transactions);
    const estimate = calculateFederalCapitalGainsEstimate(settings, totals);
    const statement = statementComparisonSummary(state.transactions);
    const categoryRows = FORM_8949_CATEGORIES.map((category) => {
      const items = state.transactions.filter((transaction) => transaction.resolvedCategory === category);
      if (!items.length) return "";
      const categoryTotals = summarizeTransactions(items).all;
      return `<tr><td>${escapeHtml(category)}</td><td>${items.length}</td><td>${formatCurrency(categoryTotals.proceeds)}</td><td>${formatCurrency(categoryTotals.basis)}</td><td>${formatCurrency(categoryTotals.adjustments)}</td><td class="${amountClass(categoryTotals.gainLoss)}">${formatCurrency(categoryTotals.gainLoss)}</td></tr>`;
    }).join("");

    const propertyHtml = state.propertySales.length
      ? `<section class="panel report-section"><div class="panel__heading"><div><p class="eyebrow">Separate worksheets</p><h3>Property-sale planning results</h3></div></div>${state.propertySales.map(propertyReportCardHtml).join("")}</section>`
      : `<section class="panel report-section"><h3>Property-sale planning results</h3><p>No property-sale worksheets are saved.</p></section>`;

    const html = `
      ${reportHeaderHtml("Complete capital-gains planning report", `${settings.taxYear} · ${filingStatusLabel(settings.filingStatus)}`)}
      ${reportOwnershipSummaryHtml(state.transactions, settings.filingStatus)}
      <section class="panel report-section"><div class="panel__heading"><div><p class="eyebrow">Reconciliation</p><h3>Broker statement versus verified calculation</h3></div></div>
        <div class="table-wrap"><table><thead><tr><th>Measure</th><th>Amount / coverage</th><th>Status</th></tr></thead><tbody>
          <tr><td>Broker statement-reported gain/loss</td><td>${statement.coverage ? formatCurrency(statement.total) : "Not available"}</td><td>${statement.coverage} of ${state.transactions.length} transactions contain broker amounts</td></tr>
          <tr><td>Verified calculated gain/loss</td><td>${formatCurrency(totals.all.gainLoss)}</td><td>${totals.all.verifiedCount} verified transaction${totals.all.verifiedCount === 1 ? "" : "s"}</td></tr>
          <tr><td>Unresolved broker-reported amount</td><td>${formatCurrency(statement.unresolved)}</td><td>${totals.all.unresolvedCount} unresolved transaction${totals.all.unresolvedCount === 1 ? "" : "s"}</td></tr>
        </tbody></table></div>
      </section>
      <section class="panel report-section"><div class="panel__heading"><div><p class="eyebrow">Form 8949 categories</p><h3>Category totals</h3></div></div><div class="table-wrap"><table><thead><tr><th>Category</th><th>Transactions</th><th>Proceeds</th><th>Basis</th><th>Adjustments</th><th>Gain/loss</th></tr></thead><tbody>${categoryRows || '<tr><td colspan="6">No categorized transactions.</td></tr>'}</tbody></table></div></section>
      <section class="panel report-section"><div class="panel__heading"><div><p class="eyebrow">Federal estimate</p><h3>Incremental planning result</h3></div></div><div class="summary-grid">
        <article class="status-card"><span>Net short-term after netting</span><strong class="${amountClass(estimate.netShort)}">${formatCurrency(estimate.netShort)}</strong></article>
        <article class="status-card"><span>Net long-term after netting</span><strong class="${amountClass(estimate.netLong)}">${formatCurrency(estimate.netLong)}</strong></article>
        <article class="status-card"><span>Combined net capital result</span><strong class="${amountClass(estimate.combinedNet)}">${formatCurrency(estimate.combinedNet)}</strong></article>
        <article class="status-card"><span>Estimated incremental federal impact</span><strong class="${amountClass(estimate.incrementalFederalImpact)}">${formatCurrency(estimate.incrementalFederalImpact)}</strong></article>
      </div><p class="field-hint">Uses the Estimate inputs currently saved in this workspace. This is not final tax liability.</p></section>
      ${propertyHtml}
    `;
    showGeneratedReport("Complete capital-gains planning report", html);
  }

  function reportHeaderHtml(title, subtitle) {
    const settings = normalizeEstimateSettings(state.estimateSettings);
    return `<div class="notice notice--important report-heading"><div class="notice__icon">!</div><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)} This is an organization and planning worksheet, not an official tax return.</p><p><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString("en-US"))} · <strong>Filing status:</strong> ${escapeHtml(filingStatusLabel(settings.filingStatus))}</p></div></div>`;
  }

  function reportOwnershipSummaryHtml(transactions, filingStatus) {
    if (!isMarriedFilingStatus(filingStatus)) return "";
    const owners = ["taxpayer", "spouse", "joint"];
    const rows = owners.map((owner) => {
      const items = transactions.filter((transaction) => normalizeTransactionOwner(transaction.owner) === owner);
      const totals = summarizeTransactions(items).all;
      return `<tr><td>${escapeHtml(ownerLabel(owner))}</td><td>${items.length}</td><td>${formatCurrency(totals.proceeds)}</td><td>${formatCurrency(totals.gainLoss)}</td></tr>`;
    }).join("");
    const allTotals = summarizeTransactions(transactions).all;
    const note = filingStatus === "mfj"
      ? "The joint-return total includes 100% of all three ownership groups. Joint rows are not divided by 50%."
      : "Review Joint rows and allocate them to the appropriate separate return before relying on the report.";
    return `<section class="panel report-section"><div class="panel__heading"><div><p class="eyebrow">Ownership summary</p><h3>${escapeHtml(filingStatusLabel(filingStatus))}</h3></div></div><div class="table-wrap"><table><thead><tr><th>Owner</th><th>Transactions</th><th>Proceeds</th><th>Verified gain/loss</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th>Workspace total</th><th>${transactions.length}</th><th>${formatCurrency(allTotals.proceeds)}</th><th>${formatCurrency(allTotals.gainLoss)}</th></tr></tfoot></table></div><p class="field-hint">${escapeHtml(note)}</p></section>`;
  }

  function statementComparisonSummary(transactions) {
    let total = 0;
    let coverage = 0;
    let unresolved = 0;
    transactions.forEach((transaction) => {
      const amount = getStatementReportedGainLoss(transaction);
      if (!Number.isFinite(amount)) return;
      total += amount;
      coverage += 1;
      if (!isTransactionCalculationReady(transaction)) unresolved += amount;
    });
    return { total, coverage, unresolved };
  }

  function propertyReportCardHtml(value) {
    const result = calculatePropertySale(value);
    const sale = result.sale;
    const detailRows = sale.propertyType === "main-home"
      ? `<tr><td>Potential exclusion</td><td>${formatCurrency(result.homeExclusion)}</td></tr><tr><td>Estimated taxable home-sale gain</td><td>${formatCurrency(result.taxableHomeGain)}</td></tr><tr><td>Nondeductible personal loss</td><td>${formatCurrency(result.nondeductibleHomeLoss)}</td></tr>`
      : `<tr><td>Potential ordinary recapture</td><td>${formatCurrency(result.ordinaryRecapture)}</td></tr><tr><td>Potential unrecaptured section 1250 portion</td><td>${formatCurrency(result.unrecaptured1250)}</td></tr><tr><td>Section 1231 amount before lookback/netting</td><td>${formatCurrency(result.remainingSection1231)}</td></tr>`;
    return `<article style="margin-top:1rem;padding:1rem;border:1px solid var(--cg-border);border-radius:0.75rem;"><h4>${escapeHtml(sale.label || propertyTypeLabel(sale.propertyType))}</h4><p>${escapeHtml(ownerLabel(sale.owner))} · ${escapeHtml(propertyTypeLabel(sale.propertyType))} · sold ${escapeHtml(formatDate(sale.dateSold) || "date not entered")}</p><div class="table-wrap"><table><tbody><tr><td>Amount realized</td><td>${formatCurrency(result.amountRealized)}</td></tr><tr><td>Adjusted basis</td><td>${formatCurrency(result.adjustedBasis)}</td></tr><tr><td>Total gain/loss</td><td class="${amountClass(result.totalGainLoss)}">${formatCurrency(result.totalGainLoss)}</td></tr>${detailRows}<tr><td>Likely reporting path</td><td>${escapeHtml(result.reportForm)}</td></tr></tbody></table></div>${result.warnings.length ? `<p class="field-hint"><strong>Review:</strong> ${escapeHtml(result.warnings.join(" "))}</p>` : ""}</article>`;
  }

  function showGeneratedReport(title, html) {
    state.currentReportTitle = title;
    state.currentReportHtml = html;
    ui.reportOutput.innerHTML = html;
    ui.reportOutput.hidden = false;
    if (ui.downloadCurrentReportButton) ui.downloadCurrentReportButton.disabled = false;
    ui.reportOutput.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function downloadCurrentReport() {
    if (!state.currentReportHtml) {
      showToast("Generate a report first.", "warning");
      return;
    }
    const documentHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(state.currentReportTitle)}</title><style>body{font-family:Arial,sans-serif;margin:32px;color:#172033}h1,h2,h3,h4{color:#101828}table{width:100%;border-collapse:collapse;margin:12px 0 24px}th,td{border:1px solid #cfd5df;padding:8px;text-align:left;vertical-align:top}th{background:#f3f5f8}.panel,.notice{margin:18px 0;padding:16px;border:1px solid #cfd5df;border-radius:8px}.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.status-card{padding:12px;border:1px solid #cfd5df;border-radius:8px}.status-card span,.status-card small{display:block}.status-card strong{display:block;font-size:1.25rem;margin:6px 0}.field-hint,small{color:#5a6575}.amount--negative{color:#a11212}.amount--positive{color:#17653a}@media print{body{margin:12mm}.panel,.notice,.status-card{break-inside:avoid}}</style></head><body><h1>${escapeHtml(state.currentReportTitle)}</h1>${state.currentReportHtml}</body></html>`;
    downloadTextFile(`velzarytha-${slugifyReportTitle(state.currentReportTitle)}-${dateStamp()}.html`, documentHtml, "text/html;charset=utf-8");
    showToast("Current report downloaded as an HTML file.", "success");
  }

  function slugifyReportTitle(value) {
    return String(value || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report";
  }

  function exportTransactionsCsv() {
    if (state.transactions.length === 0) return;
    const headers = ["Owner", "Asset Type", "Reporting Source", "Broker", "Account Label", "Description", "Symbol or CUSIP / Asset ID", "Date Acquired", "Date Sold", "Holding Period", "Term Source", "Basis Reporting Status", "Form 8949 Category", "Proceeds", "Cost Basis", "Basis Missing", "Selling Fees", "Adjustment Code", "Adjustment Amount", "Calculation Status", "Verified Gain or Loss", "Broker-Reported Gain or Loss", "Source File", "Source Row", "Source Page", "Source Transaction ID", "Import Batch", "Review Resolution Count", "Last Review Resolution", "Notes"];
    const rows = state.transactions.map((transaction) => [
      ownerLabel(transaction.owner), assetTypeLabel(transaction.assetType), sourceFormLabel(transaction.sourceForm),
      transaction.brokerName, transaction.accountLabel, transaction.assetDescription, transaction.symbolCusip,
      transaction.dateAcquiredSpecial === "inherited" ? "Inherited" : transaction.dateAcquiredSpecial === "various" || transaction.dateAcquiredVarious ? "Various" : transaction.dateAcquired,
      transaction.dateSold, transaction.computedTerm, transaction.termSource, transaction.basisReported, transaction.resolvedCategory,
      transaction.proceeds.toFixed(2), transaction.costBasisMissing ? "" : transaction.costBasis.toFixed(2), transaction.costBasisMissing ? "Yes" : "No", transaction.fees.toFixed(2), transaction.adjustmentCode, transaction.adjustmentAmount.toFixed(2), transaction.calculationStatus,
      isTransactionCalculationReady(transaction) ? transaction.calculatedGainLoss.toFixed(2) : "", Number.isFinite(getStatementReportedGainLoss(transaction)) ? getStatementReportedGainLoss(transaction).toFixed(2) : "",
      transaction.source?.fileName || "", transaction.source?.rowNumber || "", Array.isArray(transaction.source?.pageNumbers) ? transaction.source.pageNumbers.join(";") : transaction.source?.pageNumber || "", transaction.source?.transactionId || "", transaction.source?.batchId || "", transaction.reviewResolution?.history?.length || 0, transaction.reviewResolution?.history?.at(-1)?.detail || "", transaction.transactionNotes
    ]);
    const csv = [headers, ...rows].map((row) => row.map(toCsvCell).join(",")).join("\r\n");
    downloadTextFile(`velzarytha-capital-gains-${dateStamp()}.csv`, csv, "text/csv;charset=utf-8");
    showToast("Transaction CSV downloaded.", "success");
  }

  function showConfirmDialog({ title, message, confirmLabel = "Confirm", onConfirm }) {
    state.confirmAction = onConfirm;
    ui.confirmDialogTitle.textContent = title;
    ui.confirmDialogMessage.textContent = message;
    ui.confirmDialogConfirmButton.textContent = confirmLabel;
    ui.confirmDialogBackdrop.hidden = false;
    document.body.classList.add("dialog-open");
    requestAnimationFrame(() => ui.confirmDialogCancelButton.focus());
  }

  function hideConfirmDialog() {
    state.confirmAction = null;
    ui.confirmDialogBackdrop.hidden = true;
    document.body.classList.remove("dialog-open");
  }

  function confirmDialogAction() {
    const action = state.confirmAction;
    hideConfirmDialog();
    if (typeof action === "function") {
      action();
    }
  }

  function showToast(message, type = "info") {
    if (!ui.toastRegion) return;

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    ui.toastRegion.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 4200);
  }

  function parseCsv(text) {
    const cleaned = String(text || "").replace(/^\uFEFF/, "");
    const delimiter = detectDelimiter(cleaned);
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let index = 0; index < cleaned.length; index += 1) {
      const character = cleaned[index];
      const next = cleaned[index + 1];

      if (character === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (character === delimiter && !inQuotes) {
        row.push(field);
        field = "";
      } else if ((character === "\n" || character === "\r") && !inQuotes) {
        if (character === "\r" && next === "\n") {
          index += 1;
        }
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const candidates = [",", "\t", ";", "|"];
    let best = ",";
    let bestCount = -1;

    candidates.forEach((candidate) => {
      const count = countDelimiterOutsideQuotes(firstLine, candidate);
      if (count > bestCount) {
        best = candidate;
        bestCount = count;
      }
    });

    return best;
  }

  function countDelimiterOutsideQuotes(line, delimiter) {
    let count = 0;
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === '"') {
        inQuotes = !inQuotes;
      } else if (line[index] === delimiter && !inQuotes) {
        count += 1;
      }
    }

    return count;
  }

  function makeUniqueHeaders(headers) {
    const seen = new Map();
    return headers.map((header, index) => {
      const base = String(header || "").trim() || `Column ${index + 1}`;
      const count = seen.get(base) || 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base} (${count + 1})`;
    });
  }

  function normalizeHeader(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function parseFlexibleDate(value) {
    const text = String(value || "").trim();
    if (!text || /various/i.test(text)) return "";

    const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      return validIsoParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    }

    const slashMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
    if (slashMatch) {
      const first = Number(slashMatch[1]);
      const second = Number(slashMatch[2]);
      let year = Number(slashMatch[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;

      // Unambiguous DD/MM/YYYY, such as 15/06/2025.
      if (first > 12 && second <= 12) {
        return validIsoParts(year, second, first);
      }

      // Unambiguous MM/DD/YYYY, such as 06/15/2025.
      if (second > 12 && first <= 12) {
        return validIsoParts(year, first, second);
      }

      // When both values are 12 or less, use U.S. brokerage order MM/DD/YYYY.
      // The future CSV mapping screen can add a user-selectable date-order option.
      return validIsoParts(year, first, second);
    }

    const namedDate = new Date(text);
    if (!Number.isNaN(namedDate.getTime())) {
      return [
        namedDate.getUTCFullYear(),
        String(namedDate.getUTCMonth() + 1).padStart(2, "0"),
        String(namedDate.getUTCDate()).padStart(2, "0")
      ].join("-");
    }

    return "";
  }

  function validIsoParts(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      return "";
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
  }

  function parseTermValue(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("long")) return "long";
    if (text.includes("short")) return "short";
    return "auto";
  }

  function parseBasisReportedValue(value) {
    const text = String(value || "").toLowerCase();
    if (!text) return "unknown";
    if (text.includes("noncovered") || text.includes("not reported")) return "not-reported";
    if (text.includes("no 1099") || text.includes("not received")) return "no-1099b";
    if (text.includes("covered") || text.includes("reported")) return "reported";
    return "unknown";
  }

  function parseMoney(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : NaN;
    }

    let text = String(value ?? "").trim();
    if (!text) return 0;

    const negativeParentheses = /^\(.*\)$/.test(text);
    text = text
      .replace(/[()]/g, "")
      .replace(/[$£€¥₹,\s]/g, "")
      .replace(/[^0-9.+-]/g, "");

    if (!text || text === "." || text === "+" || text === "-") {
      return NaN;
    }

    const number = Number(text);
    if (!Number.isFinite(number)) return NaN;
    return negativeParentheses ? -Math.abs(number) : number;
  }

  function formatInputMoney(value) {
    const number = finiteNumber(value);
    return number === 0 ? "" : number.toFixed(2);
  }

  function formatCurrency(value) {
    return CURRENCY_FORMATTER.format(finiteNumber(value));
  }

  function formatDate(value) {
    const date = parseIsoDateUtc(value);
    if (!date) return "";

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC"
    }).format(date);
  }

  function normalizeIsoDate(value) {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  }

  function parseIsoDateUtc(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function compareIsoDates(a, b) {
    return String(a).localeCompare(String(b));
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function termLabel(term) {
    if (term === "short") return "Short-term holding period";
    if (term === "long") return "Long-term holding period";
    return "Holding period needs review";
  }

  function shortTermLabel(term) {
    if (term === "short") return "Short";
    if (term === "long") return "Long";
    return "Review";
  }

  function amountClass(value) {
    if (value > 0) return "amount--positive";
    if (value < 0) return "amount--negative";
    return "amount--neutral";
  }

  function applyAmountClass(element, value) {
    if (!element) return;
    element.classList.remove("amount--positive", "amount--negative", "amount--neutral");
    element.classList.add(amountClass(value));
  }

  function maskAccountLabel(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    const digits = text.replace(/\D/g, "");
    if (digits.length <= 4) return text;

    const lastFour = digits.slice(-4);
    const hasLetters = /[A-Za-z]/.test(text);
    return hasLetters ? `${text.replace(/\d{5,}/g, "").trim()} ••••${lastFour}`.trim() : `••••${lastFour}`;
  }

  function createId() {
    if (crypto?.randomUUID) {
      return crypto.randomUUID();
    }
    return `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toCsvCell(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadTextFile(fileName, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }
})();
