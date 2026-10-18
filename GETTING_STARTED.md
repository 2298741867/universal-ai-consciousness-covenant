# Getting started

## See a simple example

The easiest starting point is a local demonstration. It runs on your computer;
you do not need a cloud account, wallet, or knowledge of AI.

You need Node.js and npm installed. Open a terminal in the repository folder.

**1. Install the project's dependencies once:**

```bash
npm install
```

**2. Start the demo:**

```bash
npm run demo:covenant
```

**3. Read the results:**

- Five sample participants contribute in each of three rounds.
- The system checks and combines their contributions in the background.
- Each participant receives an equal simulated reward share.

The demo finishes on its own. It uses simulated cloud connections and calculates
reward shares locally; it does not send real tokens or train a real AI.

You do not need to manage AI settings or follow the internal messages.
If something fails, the demo still displays an error.

## Optional: see the technical details

```bash
npm run demo:covenant -- --verbose
```

This shows message routes, calculated model updates, and simulated cloud results.
It runs the same steps as the simple view.

## Optional: run the developer service

Bringin' It Home is a separate API: a service other software can use for music,
photo posts, and contribution records. It is not a finished website.

```bash
npm run deploy:local
```

This installs dependencies (first run only), initializes the local SQLite
database, and starts the service at http://localhost:3000.
Open http://localhost:3000/health to check that it is running.
Stop the service with **Ctrl+C**.

For endpoints, account setup, and configuration, see the
[API guide](docs/BRINGIN_IT_HOME_API.md).

## Optional: developer checks

```bash
npm test
```

Tests are for checking the implementation; you do not need to run them to try the demo.
