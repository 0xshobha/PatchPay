/** Minimal CI so PRs get at least one check run (PatchPay pays only on green checks). */
export const MINIMAL_CI_YML = `name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Replace with your real build / test commands, e.g. npm ci && npm test
      - run: echo "add your tests here"
`;
