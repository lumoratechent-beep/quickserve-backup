<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/277fff03-da49-41d0-9233-a22436e25a05

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Browser testing

Playwright runs Chromium against a local Vite server, which it starts automatically.

1. Install the browser after installing dependencies: `npx playwright install chromium`.
2. Run tests: `npm run test:browser`.
3. Use the interactive runner: `npm run test:browser:ui`.
4. Open the latest HTML report: `npm run test:browser:report`.

Admin tests use synthetic accounts and intercepted API responses, so they do not access the live database. They cover tablet and desktop toolbar sizing, row density, filters, and vendor information popups. Screenshots and failure traces are saved in the ignored `test-results/` folder.
