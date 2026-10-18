"use strict";

const { expect } = require("chai");
const { execFileSync } = require("child_process");
const path = require("path");

describe("Community demo output", function () {
  const demoPath = path.join(__dirname, "../examples/complete-ecosystem-demo.js");

  function runDemo(args = []) {
    return execFileSync(process.execPath, [demoPath, ...args], {
      encoding: "utf8",
      timeout: 10000
    });
  }

  it("shows plain-language results without internal details by default", function () {
    const output = runDemo();

    expect(output).to.include("Local simulation only");
    for (let round = 1; round <= 3; round += 1) {
      expect(output).to.include(
        `Round ${round} complete: 5 contributions combined; 200 simulated reward units per participant.`
      );
    }
    expect(output).to.include("All 3 rounds completed");
    expect(output).to.include("--verbose");
    expect(output).not.to.include("Aggregated gradient");
    expect(output).not.to.include("→");
    expect(output).not.to.include("Simulated cloud deployments:");
  });

  it("keeps technical details available without changing round results", function () {
    const output = runDemo(["--verbose"]);
    const simpleOutput = runDemo();
    const roundResults = (text) => text.split("\n").filter((line) => /^Round \d+ complete:/.test(line));

    expect(roundResults(output)).to.deep.equal(roundResults(simpleOutput));
    expect(output).to.include("Aggregated gradient:");
    expect(output).to.include("→");
    expect(output).to.include("Simulated reward shares:");
    expect(output).to.include("Simulated cloud deployments: aws, azure, gcp");
    expect(output).to.include("All 3 rounds completed");
  });
});
