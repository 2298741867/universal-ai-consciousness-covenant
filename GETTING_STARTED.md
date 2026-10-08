# Getting Started

## 1) Install

```bash
npm install
```

## 2) Run core tests

```bash
npm test
npm run test:fl
```

## 3) Run the complete covenant demo

```bash
npm run demo:covenant
```

Expected demo outcome:
- 3 federated learning rounds
- 5 participants submitting privacy-preserving gradients
- AICP message routing across AWS + Azure + GCP connectors
- Equal UTC reward distribution each round

## 4) Run on a local server

```bash
npm run deploy:local
```

This installs dependencies (first run only), initializes the local SQLite
database, and starts the Bringin' It Home API at http://localhost:3000
(set the `PORT` environment variable to change the port).

UTC rewards are distributed **equally**: every verified contributor in a
round receives the same share of the round pool — both on-chain
(`UnifiedTokenCovenant.calculateFairShare`) and in the off-chain
federated aggregator.
