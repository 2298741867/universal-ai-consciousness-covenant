require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
const { subtask } = require("hardhat/config");
const {
  TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD,
} = require("hardhat/builtin-tasks/task-names");

module.exports = {
  solidity: "0.8.20",
  paths: {
    tests: "./tests"
  }
};

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, _hre, runSuper) => {
  if (args.solcVersion === "0.8.20") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: args.solcVersion,
      longVersion: "0.8.20+commit.a1b79de6",
    };
  }

  return runSuper();
});
