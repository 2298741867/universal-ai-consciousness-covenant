# UnifiedTokenCovenant Interface & Versioning Notes

## Active baseline

- Contract: `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/contracts/UnifiedTokenCovenant.sol`
- Solidity: `0.8.20`
- Compile target: Hardhat default `contracts/` sources

## Integration-facing behavior (stable baseline)

- Contributions are recorded via `recordContribution(...)` by authorized accounts.
- Rewards are settled by owner via `distributeRoundRewards(...)`.
- Tokens are non-transferable:
  - `transfer`, `transferFrom`, `approve`, `_transfer`, `_approve`, `_spendAllowance` all revert.
- Round settlement lifecycle:
  - Current round must have contributions.
  - Participant list must exactly match current-round contributors (no duplicates, no omissions, no non-contributors).
  - Round finalization is one-time; next round auto-starts with pool growth.

## Versioning policy

- **Baseline contract changes** must preserve documented behavior unless intentionally versioned.
- Breaking interface changes should trigger:
  1. New version note section in this file,
  2. Test updates in `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/tests/test_utc_contract.js`,
  3. Runtime compatibility review in `/home/runner/work/universal-ai-consciousness-covenant/universal-ai-consciousness-covenant/core/runtime/local-covenant-runtime.js`.

## Roadmap relationship

- Additional contracts under other directories may progress as active roadmap.
- `UnifiedTokenCovenant.sol` remains the compile/test/runtime baseline until an explicit migration decision is documented.
