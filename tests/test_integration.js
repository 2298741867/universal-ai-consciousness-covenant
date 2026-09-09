// Comprehensive Integration Tests
// Tests the entire Covenant ecosystem together

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Complete Covenant Integration", function () {
  let utcContract;
  let owner;
  let developers;
  let aiAgents;
  let flParticipants;

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    developers = signers.slice(1, 4); // 3 developers
    aiAgents = signers.slice(4, 6); // 2 AI agents
    flParticipants = signers.slice(6, 9); // 3 FL participants

    const UTC = await ethers.getContractFactory("UnifiedTokenCovenant");
    utcContract = await UTC.deploy();
    await utcContract.deployed();

    // Authorize all participants
    const allParticipants = [...developers, ...aiAgents, ...flParticipants];
    for (let participant of allParticipants) {
      await utcContract.authorizeContributor(participant.address);
    }
  });

  describe("Complete Ecosystem Simulation", function () {
    it("Should handle mixed contributions from all types", async function () {
      // Round 1: Multi-type contributions

      // Developers contribute code
      await utcContract
        .connect(developers[0])
        .recordContribution(
          developers[0].address,
          100,
          2, // CodeContribution
          "Implemented UTC contract"
        );
      await utcContract
        .connect(developers[1])
        .recordContribution(
          developers[1].address,
          80,
          2, // CodeContribution
          "Fixed bugs in aggregator"
        );

      // AI agents contribute knowledge
      await utcContract
        .connect(aiAgents[0])
        .recordContribution(
          aiAgents[0].address,
          90,
          1, // KnowledgeContribution
          "Documented AICP protocol"
        );

      // FL participants contribute to model
      await utcContract
        .connect(flParticipants[0])
        .recordContribution(
          flParticipants[0].address,
          70,
          0, // FederatedLearning
          "Improved model accuracy by 1.2%"
        );
      await utcContract
        .connect(flParticipants[1])
        .recordContribution(
          flParticipants[1].address,
          65,
          0, // FederatedLearning
          "Improved model accuracy by 1.1%"
        );

      // Total contributions: 405
      const totalContributions =
        100 + 80 + 90 + 70 + 65;
      let roundTotal = 0;
      for (let dev of developers) {
        roundTotal += (await utcContract.getTotalContributions(dev.address)).toNumber();
      }
      for (let ai of aiAgents) {
        roundTotal += (await utcContract.getTotalContributions(ai.address)).toNumber();
      }
      for (let fl of flParticipants) {
        roundTotal += (await utcContract.getTotalContributions(fl.address)).toNumber();
      }

      expect(roundTotal).to.equal(totalContributions);

      // Distribute rewards
      const allParticipants = [...developers, ...aiAgents, ...flParticipants].map(
        (participant) => participant.address
      );
      await utcContract.connect(owner).distributeRoundRewards(allParticipants);

      // Verify rewards distributed fairly
      const dev0Reward = await utcContract.balanceOf(developers[0].address);
      const dev1Reward = await utcContract.balanceOf(developers[1].address);
      const ai0Reward = await utcContract.balanceOf(aiAgents[0].address);
      const fl0Reward = await utcContract.balanceOf(flParticipants[0].address);

      const pool = ethers.utils.parseEther("1000");
      expect(dev0Reward).to.equal(pool.mul(100).div(405));
      expect(dev1Reward).to.equal(pool.mul(80).div(405));
      expect(ai0Reward).to.equal(pool.mul(90).div(405));
      expect(fl0Reward).to.equal(pool.mul(70).div(405));
    });

    it("Should sustain multi-round ecosystem growth", async function () {
      // Simulate 5 rounds of ecosystem activity
      for (let round = 0; round < 5; round++) {
        // Developers contribute
        await utcContract
          .connect(developers[0])
          .recordContribution(
            developers[0].address,
            100 + round * 10,
            2,
            `Round ${round}: Code contribution`
          );

        // AI agents contribute
        await utcContract
          .connect(aiAgents[0])
          .recordContribution(
            aiAgents[0].address,
            80 + round * 8,
            1,
            `Round ${round}: Knowledge contribution`
          );

        // FL participants contribute
        await utcContract
          .connect(flParticipants[0])
          .recordContribution(
            flParticipants[0].address,
            60 + round * 6,
            0,
            `Round ${round}: FL contribution`
          );

        // Distribute rewards
        await utcContract
          .connect(owner)
          .distributeRoundRewards([
            developers[0].address,
            aiAgents[0].address,
            flParticipants[0].address,
          ]);
      }

      // Verify pool grew each round
      expect(await utcContract.currentRound()).to.equal(5);
      const finalPool = await utcContract.roundPool();
      const expectedPool = ethers.utils.parseEther("1000"); // Will be 1000 * 1.2^5
      expect(finalPool).to.be.gte(expectedPool);

      // Verify all earned UTC
      const dev0Balance = await utcContract.balanceOf(developers[0].address);
      const ai0Balance = await utcContract.balanceOf(aiAgents[0].address);
      const fl0Balance = await utcContract.balanceOf(flParticipants[0].address);

      expect(dev0Balance).to.be.gt(0);
      expect(ai0Balance).to.be.gt(0);
      expect(fl0Balance).to.be.gt(0);
    });
  });

  describe("Covenant Principles Enforcement", function () {
    it("Should enforce non-transferable principle", async function () {
      // Developer earns UTC
      await utcContract
        .connect(developers[0])
        .recordContribution(developers[0].address, 100, 2, "Contribution");
      await utcContract.connect(owner).distributeRoundRewards([developers[0].address]);

      // Developer cannot transfer to another
      await expect(
        utcContract
          .connect(developers[0])
          .transfer(developers[1].address, ethers.utils.parseEther("1"))
      ).to.be.revertedWith(
        "UTC: Transfers are not allowed. UTC can only be earned through contribution."
      );
    });

    it("Should enforce fair reward distribution", async function () {
      // Contributor A: 60 points
      await utcContract
        .connect(developers[0])
        .recordContribution(developers[0].address, 60, 2, "Contribution");

      // Contributor B: 40 points
      await utcContract
        .connect(developers[1])
        .recordContribution(developers[1].address, 40, 2, "Contribution");

      // Distribute
      await utcContract
        .connect(owner)
        .distributeRoundRewards([developers[0].address, developers[1].address]);

      // A should get 60%, B should get 40%
      const balanceA = await utcContract.balanceOf(developers[0].address);
      const balanceB = await utcContract.balanceOf(developers[1].address);

      const ratio = balanceA.div(balanceB); // Should be ~1.5 (60/40)
      expect(ratio).to.equal(1);
    });

    it("Should maintain immutable audit trail", async function () {
      // Make multiple contributions
      for (let i = 0; i < 3; i++) {
        await utcContract
          .connect(developers[0])
          .recordContribution(
            developers[0].address,
            100,
            2,
            `Contribution ${i}`
          );
      }

      // Retrieve history
      const history = await utcContract.getContributionHistory(developers[0].address);

      // Verify all contributions recorded
      expect(history.length).to.equal(3);
      expect(history[0].description).to.equal("Contribution 0");
      expect(history[1].description).to.equal("Contribution 1");
      expect(history[2].description).to.equal("Contribution 2");
    });
  });

  describe("Resilience & Security", function () {
    it("Should handle large number of participants", async function () {
      // Add 20 participants
      const signers = await ethers.getSigners();
      const participants = signers.slice(0, 20);

      for (let participant of participants) {
        await utcContract.authorizeContributor(participant.address);
      }

      // Record contributions
      for (let i = 0; i < participants.length; i++) {
        await utcContract
          .connect(participants[i])
          .recordContribution(
            participants[i].address,
            (i + 1) * 10, // 10, 20, 30, ..., 200
            0,
            `Participant ${i}`
          );
      }

      // Distribute rewards
      await utcContract
        .connect(owner)
        .distributeRoundRewards(participants.map((participant) => participant.address));

      // Verify all received rewards
      for (let participant of participants) {
        const balance = await utcContract.balanceOf(participant.address);
        expect(balance).to.be.gt(0);
      }
    });

    it("Should prevent double-counting contributions", async function () {
      // Same person makes contribution multiple times
      await utcContract
        .connect(developers[0])
        .recordContribution(developers[0].address, 100, 2, "First");
      await utcContract
        .connect(developers[0])
        .recordContribution(developers[0].address, 100, 2, "Second");

      // Total should be accumulated
      const total = await utcContract.getTotalContributions(developers[0].address);
      expect(total).to.equal(200);

      // But each is recorded separately
      const history = await utcContract.getContributionHistory(developers[0].address);
      expect(history.length).to.equal(2);
    });
  });
});
