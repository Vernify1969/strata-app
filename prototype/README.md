# TaskSpeck Strata: prototype and tests

A clickable prototype of a maintenance marketplace for building managers and contractors. Melbourne only to start.
It is one self-contained file, `taskspeck-managers.html` (HTML, CSS and JavaScript, no libraries, no build step).
It is a prototype: payments, emails, notifications, timers, file storage and address lookup are simulated or missing.

## Open it
Open `taskspeck-managers.html` in Chrome or Edge at phone width.
Add `?demo=1` to the address to skip registration and use the sample data (nothing is saved).

## Run the tests
```
npm install
npm test
```
Needs Node 18 or newer. The tests load the HTML file in jsdom, click buttons and read the screen.
Set `APP=/path/to/file.html` to test another copy. 34 suites, 1520 checks, all passing at handover. The QR reporting tests (tests/qr.js) check the QR encoder, the places, the public report page, one queue for each building, the statuses and the emergency alert.
Some tests compare dates with today's date. They have no network access and change no files.

## Where things are in the file
Part 1 styles, Part 2 page structure, Part 3 data and helpers, Part 4 manager screens, budgets, payments, reports, accounts and saving,
Part 5 contractor screens, Part 6 actions and start-up. Screens are functions in `V`, actions are in `A`, state is `S`, buildings `B`, jobs `J`, contractors `CON`.
The service area is a list of postcodes (`S.set.pcs`, starting from `DEFAULT_PCS`); `PC` holds approximate centres used only for distances and the map.

## Please check (see the Word handover document for the full brief)
1. Money maths: GST, the 15% fee, deposits, extras, invoice holds, refunds, annual budgets, rounding.
2. Security: HTML escaping of every value, accounts and passwords (browser only), saved data, role permissions.
3. Edge cases: dates, weekends, financial year, inconsistent state, postcodes the app has no position for.
4. Code quality and the route to production.
5. Accessibility, mobile and performance.
6. Test gaps: real-browser tests (for example Playwright) and unit tests for the pure rules.

Report findings first (severity, where, what goes wrong, suggested fix) before changing code.
Business rules in the handover document are decisions, not mistakes.
