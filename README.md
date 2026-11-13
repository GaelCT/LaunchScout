# LaunchScout

A privacy-first company discovery demo for Bakersfield and nearby Central Valley cities. Relates to [issue #2](https://github.com/GaelCT/LaunchScout/issues/2).

## Demo status

All 20 company listings, opportunities, and statistics are fictional and visibly labeled. Issue #2 remains open until reviewed public company data from #1 replaces these fixtures.

## Run and check

Requires Node.js 22.13+. Run `npm ci` and `npm run dev`. Use `npm run build` to type-check and build. Install the test browser with `npx playwright install chromium` and run `npm test` for desktop and mobile Chromium tests.

## Features

Discover cards, company details, editable non-AI outreach drafts, copy fallback, city/industry/opportunity filters, saved and passed collections, undo, restore, dark/light themes, and directional swipe animations. Reduced-motion settings are respected.

## Privacy

The origin-scoped localStorage key `launchscout.preferences.v1` stores saved and passed company IDs, filters, and the theme. Privacy controls clear these independently or together. Nothing syncs between devices. No resume uploads, AI requests, analytics, or automatic emails exist in this snapshot. Drafts are in memory and disappear when the company dialog closes; explicit copying puts content on the device clipboard. Browser-storage failures leave the interface usable in memory.

## Remaining

Integrate reviewed source URLs, verification dates, actual company facts and supported opportunities from #1. Define listing maintenance ownership and cadence.
