# Velzarytha

Velzarytha is a static GitHub Pages website focused on two browser-based utilities:

- **Capital Gains Estimator**
- **PDF Toolkit**

The site uses HTML, CSS, and JavaScript. No build step is required.

## Local testing

1. Extract the project.
2. Double-click `index.html` to preview the site in a browser.
3. Test both tools and the About, Privacy, Terms, and Disclaimer pages.

The project is also suitable for GitHub Pages.

## Publish to GitHub Pages

1. Create a GitHub repository named `velzarytha` under the `velzarytha` GitHub account.
2. Upload the **contents of this folder** to the repository root. Do not upload the ZIP as the website.
3. Open **Settings → Pages**.
4. Choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.
6. The expected project URL is:
   `https://velzarytha.github.io/velzarytha/`

If the repository is deployed under a different GitHub username or repository name, update the canonical URL, `robots.txt`, and `sitemap.xml` before publishing.

## Included pages

- `/index.html` — homepage
- `/tools/capital-gains-estimator.html` — Capital Gains Estimator
- `/tools/pdf-toolkit/index.html` — PDF Toolkit
- `/pages/about.html`
- `/pages/privacy.html`
- `/pages/terms.html`
- `/pages/disclaimer.html`

## PDF Toolkit dependencies

The PDF Toolkit includes its core local assets, but some optional capabilities load third-party libraries from CDNs when those features are used. GitHub Pages serves the site over HTTPS, so those dependencies can load normally for visitors with network access.

## Notes

Tax and financial tools are for planning and estimation and should be checked against current official guidance or professional advice when appropriate.
## Local testing (Windows)

After extracting the ZIP, open **the `index.html` in the top-level `velzarytha` folder** first. Do not start by opening `tools/pdf-toolkit/index.html`; that file is the PDF Toolkit page itself.

The PDF Toolkit stylesheet is also embedded as a local fallback so the toolkit remains styled when opened directly with `file://`.
