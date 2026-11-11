# Strata App server

This folder is the real app. It uses the same front end as the page at the root of the repository (the blue layout, Plus Jakarta Sans, the New request bar, and the notices and comments panel). The root `index.html` is left as it is, so GitHub Pages can keep serving that file on its own. This server serves its own copy, with accounts wired in.

## What is in place

People create an account, confirm their email, and sign in. The role is stored on the server. A building manager and an OC manager can switch with each other. A property manager stays a property manager. A contractor stays a contractor. The old Manager / Contractor switch is not shown once someone is signed in, because one account is one role.

Buildings and properties are stored on the server. A person only sees the buildings assigned to their own account, and never another organisation's. A postcode outside the served list goes on a waiting list instead of becoming a building. Common property and private property are kept apart. Jobs and payments are not stored on the server yet. Notices and comments are saved for that organisation only.

## How to run it

You need Node.js 22 or newer.

```
cd app
cp .env.example .env
npm install
npm start
```

Open http://127.0.0.1:8787

Until an email service is connected, confirmation and password-reset messages are written to `app/var/outbox.jsonl`. Open the link in that file, then sign in. Do not commit `.env` or the `var` folder.

```
npm test
```

The specification prototype and its original checks live in `prototype/`.

```
cd prototype
npm install
npm test
```

## What you need to set up

- An email sending service, by filling in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` in `.env`.
- A web address of your own, in `PUBLIC_BASE_URL`, before any link is sent to a real person.
- Hosting for this server. GitHub Pages can only serve the static file at the root. It cannot run accounts.
- A platform-owner sign-in, if you want one, with `OWNER_EMAIL` and `OWNER_PASSWORD`. Leave them empty until you choose them.

Stripe test payments can be started only after the security tests have passed. A live secret key is refused. Nothing is marked paid until a signed payment notice arrives. The platform does not keep a balance of the job money: the record says Stripe holds it, and a connected contractor account is the destination. Leave `STRIPE_SECRET_KEY` empty until you have a test key (`sk_test_...`). Set `SECURITY_GATE=passed` only on a machine where `npm test` has passed.

The postcodes we serve start as 39 Melbourne postcodes within about 12 km of Flinders Street Station, taken from approximate centres. The platform owner can replace that list. Check it against a postcode map before launch. Victorian public holidays for 2026 and 2027 are stored for later deadlines and must be checked against the Victorian Government list.
