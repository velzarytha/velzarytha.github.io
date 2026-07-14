window.VELZARYTHA_DATA = {
  schemaVersion: 3,
  categories: {
    furniture: {
      label: "Office furniture & fixtures", recovery: 7, adsRecovery: 10,
      method: "200db", convention: "half-year", classKey: "7-year",
      section179: true, bonus: true, tangiblePersonal: true, listed: false,
      bookLife: 7, bookMethod: "sl", stateReview: false
    },
    computers: {
      label: "Computers & peripherals", recovery: 5, adsRecovery: 5,
      method: "200db", convention: "half-year", classKey: "5-year",
      section179: true, bonus: true, tangiblePersonal: true, listed: false,
      bookLife: 3, bookMethod: "sl", stateReview: false
    },
    passengerVehicle: {
      label: "Passenger automobile / light vehicle", recovery: 5, adsRecovery: 5,
      method: "200db", convention: "half-year", classKey: "5-year",
      section179: true, bonus: true, tangiblePersonal: true, listed: true,
      vehicle: true, passengerAuto: true, bookLife: 5, bookMethod: "sl", stateReview: true
    },
    heavySuv: {
      label: "Heavy SUV (over 6,000 and not over 14,000 lbs GVWR)", recovery: 5, adsRecovery: 5,
      method: "200db", convention: "half-year", classKey: "5-year",
      section179: true, bonus: true, tangiblePersonal: true, listed: true,
      vehicle: true, heavySuv: true, bookLife: 5, bookMethod: "sl", stateReview: true
    },
    heavyTruck: {
      label: "Heavy truck / van — review passenger-use exceptions", recovery: 5, adsRecovery: 5,
      method: "200db", convention: "half-year", classKey: "5-year",
      section179: true, bonus: true, tangiblePersonal: true, listed: true,
      vehicle: true, bookLife: 5, bookMethod: "sl", stateReview: true
    },
    machinery: {
      label: "Machinery & equipment", recovery: 7, adsRecovery: 10,
      method: "200db", convention: "half-year", classKey: "7-year",
      section179: true, bonus: true, tangiblePersonal: true, listed: false,
      bookLife: 7, bookMethod: "sl", stateReview: false
    },
    landImprovement: {
      label: "Land improvements", recovery: 15, adsRecovery: 20,
      method: "150db", convention: "half-year", classKey: "15-year",
      section179: false, bonus: true, tangiblePersonal: false, listed: false,
      bookLife: 15, bookMethod: "sl", stateReview: true
    },
    residential: {
      label: "Residential rental real property", recovery: 27.5, adsRecovery: 30,
      method: "sl", convention: "mid-month", classKey: "27.5-year residential",
      section179: false, bonus: false, tangiblePersonal: false, listed: false,
      realProperty: true, bookLife: 27.5, bookMethod: "sl", stateReview: true
    },
    nonresidential: {
      label: "Nonresidential real property", recovery: 39, adsRecovery: 40,
      method: "sl", convention: "mid-month", classKey: "39-year nonresidential",
      section179: false, bonus: false, tangiblePersonal: false, listed: false,
      realProperty: true, bookLife: 39, bookMethod: "sl", stateReview: true
    },
    qip: {
      label: "Qualified Improvement Property (eligibility attestation required)", recovery: 15, adsRecovery: 20,
      method: "200db", convention: "half-year", classKey: "15-year",
      section179: true, bonus: true, tangiblePersonal: false, listed: false,
      qip: true, bookLife: 15, bookMethod: "sl", stateReview: true
    },
    intangible197: {
      label: "Section 197 intangible", recovery: 15, adsRecovery: 15,
      method: "amortization", convention: "full-month", classKey: "section-197",
      section179: false, bonus: false, tangiblePersonal: false, listed: false,
      intangible: true, bookLife: 15, bookMethod: "sl", stateReview: false
    },
    software: {
      label: "Off-the-shelf computer software", recovery: 3, adsRecovery: 3,
      method: "200db", convention: "half-year", classKey: "3-year",
      section179: true, bonus: true, tangiblePersonal: true, listed: false,
      bookLife: 3, bookMethod: "sl", stateReview: false
    },
    land: {
      label: "Land — non-depreciable", recovery: 0, adsRecovery: 0,
      method: "none", convention: "none", classKey: "nondepreciable",
      section179: false, bonus: false, tangiblePersonal: false, listed: false,
      nondepreciable: true, bookLife: 0, bookMethod: "none", stateReview: false
    },
    custom: {
      label: "Custom / other — manual classification required", recovery: 5, adsRecovery: 5,
      method: "sl", convention: "half-year", classKey: "custom",
      section179: false, bonus: false, tangiblePersonal: false, listed: false,
      bookLife: 5, bookMethod: "sl", manualReview: true, stateReview: true
    }
  },
  methods: {
    "200db": "MACRS 200% declining balance",
    "150db": "MACRS 150% declining balance",
    "sl": "Straight-line",
    "ads": "ADS straight-line",
    "amortization": "Straight-line amortization",
    "units": "Units of production — book only",
    "none": "Non-depreciable"
  },
  conventions: {
    "auto": "Automatic",
    "half-year": "Half-year",
    "mid-quarter": "Mid-quarter",
    "mid-month": "Mid-month",
    "full-month": "Full-month",
    "full-year": "Full-year — book only",
    "none": "None"
  },
  bonusClassKeys: ["3-year", "5-year", "7-year", "10-year", "15-year", "20-year", "custom"],
  states: ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"],
  stateProfiles: {
    federal: { label: "Federal-conforming estimate", bonusMode: "federal", section179Mode: "federal" },
    noBonus: { label: "No state bonus; federal Section 179", bonusMode: "none", section179Mode: "federal" },
    custom: { label: "Custom state limits", bonusMode: "custom", section179Mode: "custom" }
  },
  stateWarnings: {
    CA: "California commonly requires federal-to-state depreciation adjustments. Configure and verify a state profile before relying on the state schedule.",
    NY: "New York conformity can vary by provision and taxpayer. Review current state instructions.",
    NJ: "New Jersey depreciation modifications may apply. Review current state instructions."
  },
  macrsHalfYearRates: {
    "3|200db": [33.33,44.45,14.81,7.41],
    "5|200db": [20,32,19.2,11.52,11.52,5.76],
    "7|200db": [14.29,24.49,17.49,12.49,8.93,8.92,8.93,4.46],
    "10|200db": [10,18,14.4,11.52,9.22,7.37,6.55,6.55,6.56,6.55,3.28],
    "15|150db": [5,9.5,8.55,7.7,6.93,6.23,5.9,5.9,5.91,5.9,5.91,5.9,5.91,5.9,5.91,2.95],
    "20|150db": [3.75,7.219,6.677,6.177,5.713,5.285,4.888,4.522,4.462,4.461,4.462,4.461,4.462,4.461,4.462,4.461,4.462,4.461,4.462,4.461,2.231]
  },
  suppliedSettings: {
    "2024": {
      section179Limit: 1220000, section179Threshold: 3050000, suvCap: 30500,
      transitionBonusPercent: 60, permanentBonusPercent: 100,
      permanentBonusAcquiredAfter: "2025-01-19", mileageRate: 0.67,
      midQuarterThreshold: 40,
      autoCapsBonus: [20200,19600,11800,7060], autoCapsNoBonus: [12200,19600,11800,7060],
      verifiedDate: "2026-07-14", sourceNote: "Historical planning values; verify against the applicable year's official instructions."
    },
    "2025": {
      section179Limit: 2500000, section179Threshold: 4000000, suvCap: 31300,
      transitionBonusPercent: 40, permanentBonusPercent: 100,
      permanentBonusAcquiredAfter: "2025-01-19", mileageRate: 0.70,
      midQuarterThreshold: 40,
      autoCapsBonus: [20200,19600,11800,7060], autoCapsNoBonus: [12200,19600,11800,7060],
      verifiedDate: "2026-07-14", sourceNote: "2025 Section 179 values reflect current IRS materials. Bonus percentage depends on acquisition timing and elections."
    },
    "2026": {
      section179Limit: 2560000, section179Threshold: 4090000, suvCap: 32000,
      transitionBonusPercent: 20, permanentBonusPercent: 100,
      permanentBonusAcquiredAfter: "2025-01-19", mileageRate: 0.725,
      midQuarterThreshold: 40,
      autoCapsBonus: [20300,19800,11900,7160], autoCapsNoBonus: [12300,19800,11900,7160],
      verifiedDate: "2026-07-14", sourceNote: "2026 Section 179 and passenger-auto limits reflect IRS guidance available on the verification date."
    }
  },
  csvColumns: [
    "company","ein","company_state","asset_name","asset_tag","category","date_acquired","placed_in_service",
    "cost_basis","exchange_adjustment","land_value","business_use_percent","recovery_period","method","convention",
    "section179_election","section179_priority","listed_property","vehicle_gvwr","business_miles","total_miles",
    "state","book_life","book_salvage","prior_federal_depreciation","notes"
  ]
};
