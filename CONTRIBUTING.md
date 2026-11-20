# Contributing to PatchPay

## Claiming a PatchPay bounty

To claim a bounty, open a pull request for the issue you are solving. The PR body must include the issue reference and a payout address:

```text
Fixes #<issue>

PatchPay-Address: bchtest:<chipnet-address>
```

Use a chipnet address beginning with `bchtest:` for chipnet bounties, or a mainnet address beginning with `bitcoincash:` for mainnet bounties.

Coding agents must also include the following line in the PR body:

```text
PatchPay-Agent: true
```

Payout is not immediate. It happens only after the PR is merged, every required CI check passes and is green, and a maintainer explicitly approves the payout.
