# Velzarytha Fixed Assets v3

A browser-based fixed asset and depreciation-management beta built with HTML, CSS, and vanilla JavaScript.

## Open in VS Codium

1. Extract the ZIP.
2. Open the extracted `velzarytha-fixed-assets-v3` folder in VS Codium.
3. Right-click `index.html` and choose **Open with Live Server**.
4. If the browser does not open, visit `http://127.0.0.1:5500/` manually.

## Main workflow

1. Create a company.
2. Open **Elections** and enter the selected tax year's business taxable income, Section 179 carryforward, bonus class elections, and state profile.
3. Add assets with the guided wizard.
4. Open **Data Review** and resolve errors and warnings.
5. Build reports or the Form 4562 preview.
6. Export a JSON backup.

## v3 features

- Multiple companies and clients
- Automatic migration from earlier localStorage versions
- Guided six-step asset wizard
- Category-driven recovery period, method, convention, book life, and ADS defaults
- Automatic entity-level mid-quarter test and convention application
- Section 179 annual dollar limit, phase-out, priority allocation, taxable-income limitation, and carryforward summary
- Class-level bonus-depreciation elections
- Acquisition-date-sensitive bonus percentage rules
- Used-property, related-party, QIP, listed-property, mileage, and vehicle review fields
- Passenger-auto and heavy-SUV configured limits
- Federal, book, ADS, and configurable state comparison schedules
- Disposal gain/loss and potential Section 1245 recapture screening
- Current-year, book-versus-tax, disposal, and asset-rollforward reports
- Expanded Form 4562 preview and direct PDF download
- CSV asset import and template
- CSV report exports
- JSON backup and restore
- Data-quality review center
- Audit history and single-step undo for recent asset/company changes
- Built-in calculation self-tests
- Light and dark themes

## Data storage

Data is stored in browser `localStorage`. Clearing browser data can erase the database. Use **Backup JSON** regularly and keep copies outside the browser.

## Important calculation limits

This remains a planning and organization beta. It is not represented as IRS-authorized or filing-ready software.

Areas that still require professional review include:

- Asset classification and eligibility facts
- Short tax years
- Complex mid-quarter and disposal-year conventions
- General asset accounts
- Partnership, shareholder, spouse, controlled-group, and pass-through Section 179 limitations
- Section 179 carryforward allocation to specific historical property
- Luxury-auto limit interactions in unusual fact patterns
- Qualified production property and other specialized provisions
- State-specific additions, subtractions, and carryforwards
- AMT schedules for historical assets
- Section 1245, Section 1250, unrecaptured Section 1250 gain, installment sales, and Form 4797 classification
- Official Form 4562 field completion and attachments

Keep the included `noindex, nofollow` meta tag while the software is being tested.

## Verification references used for supplied 2025–2026 settings

- IRS Publication 946 (2025), including the 2025 and 2026 Section 179 amounts
- 2025 Instructions for Form 4562
- Revenue Procedure 2025-32 for 2026 Section 179 inflation adjustments
- Revenue Procedure 2026-15 for 2026 passenger-auto limits
- Notice 2026-11 and related IRS guidance for the permanent 100% additional first-year depreciation rule
- Notice 2026-10 for the 2026 standard mileage rate

The constants remain editable because later guidance or legislation can change treatment.
