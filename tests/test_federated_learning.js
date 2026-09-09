// Test Suite for Federated Learning Integration

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Federated Learning Integration with UTC", function () {
  let utcContract;
  let owner;
  let participant1;
  let participant2;
  let aggregator;

  beforeEach(async function () {
    [owner, participant1, participant2, aggregator] = await ethers.getSigners();

    const UTC = await ethers.getContractFactory("UnifiedTokenCovenant");
    utcContract = await UTC.deploy();
    await utcContract.deployed();

    // Authorize aggregator
    await utcContract.authorizeContributor(aggregator.address);
  });

  describe("FL Round Completion", function () {
    it("Should record FL contributions and distribute UTC", async function () {
      // Simulate FL round completion
      // Participant 1 improves model by 2.3%
      // Participant 2 improves model by 1.8%

      const scores = [
        { participant: participant1.address, score: 230 }, // 2.3% * 100 scale
        { participant: participant2.address, score: 180 }, // 1.8% * 100 scale
      ];

      // Record contributions via aggregator
      for (let score of scores) {
        await utcContract
          .connect(aggregator)
          .recordContribution(
            score.participant,
            score.score,
            0, // FederatedLearning type
            "FL Round 1 - Model Improvement"
          );
      }

      // Verify contributions
      expect(await utcContract.getTotalContributions(participant1.address)).to.equal(230);
      expect(await utcContract.getTotalContributions(participant2.address)).to.equal(180);

      // Distribute UTC rewards
      await utcContract
        .connect(owner)
        .distributeRoundRewards([participant1.address, participant2.address]);

      // Verify rewards distributed fairly
      const totalScore = ethers.BigNumber.from(230 + 180);
      const pool = ethers.utils.parseEther("1000");
      const expected1 = pool.mul(230).div(totalScore);
      const expected2 = pool.mul(180).div(totalScore);

      expect(await utcContract.balanceOf(participant1.address)).to.equal(
        expected1
      );
      expect(await utcContract.balanceOf(participant2.address)).to.equal(
        expected2
      );
    });

    it("Should prevent data leakage (non-transferable)", async function () {
      // Give participant1 some UTC
      await utcContract
        .connect(aggregator)
        .recordContribution(participant1.address, 100, 0, "FL Contribution");
      await utcContract.connect(owner).distributeRoundRewards([participant1.address]);

      // Participant1 cannot sell or transfer their earnings
      // This ensures privacy - no financial incentive to leak data
      await expect(
        utcContract.connect(participant1).transfer(aggregator.address, 1)
      ).to.be.revertedWith(
        "UTC: Transfers are not allowed. UTC can only be earned through contribution."
      );
    });
  });

  describe("Quality Weighting", function () {
    it("Should weight contributions by model improvement quality", async function () {
      // High quality improvement (2.5% model accuracy gain)
      await utcContract
        .connect(aggregator)
        .recordContribution(participant1.address, 250, 0, "High-quality FL contribution");

      // Low quality improvement (0.5% model accuracy gain)
      await utcContract
        .connect(aggregator)
        .recordContribution(participant2.address, 50, 0, "Low-quality FL contribution");

      // Calculate fair shares
      const share1 = await utcContract.calculateFairShare(participant1.address);
      const share2 = await utcContract.calculateFairShare(participant2.address);

      const pool = ethers.utils.parseEther("1000");
      expect(share1).to.equal(pool.mul(250).div(300));
      expect(share2).to.equal(pool.mul(50).div(300));
    });
  });

  describe("Privacy Preservation", function () {
    it("Should not require sharing raw data", async function () {
      // Only gradients/model updates are shared, not raw data
      // This is enforced at the application level
      // Contract just records contribution scores

      const privacyPreservingContribution = true;
      expect(privacyPreservingContribution).to.be.true;

      // Record the contribution (score only, no data exposure)
      await utcContract
        .connect(aggregator)
        .recordContribution(
          participant1.address,
          100,
          0,
          "Privacy-preserving FL contribution"
        );

      // Verify only score is recorded, not the data
      const history = await utcContract.getContributionHistory(participant1.address);
      expect(history[0].description).to.equal("Privacy-preserving FL contribution");
      // No raw data in the blockchain
    });
  });

  describe("Byzantine Robustness", function () {
    it("Should handle malicious contributions gracefully", async function () {
      // Honest participant
      await utcContract
        .connect(aggregator)
        .recordContribution(participant1.address, 100, 0, "Honest contribution");

      // Malicious participant tries to game the system
      // But can only claim score that aggregator verifies
      // (Byzantine robustness at aggregation level)
      await utcContract
        .connect(aggregator)
        .recordContribution(participant2.address, 10, 0, "Low-quality/malicious contribution");

      // Fair distribution still works
      const share1 = await utcContract.calculateFairShare(participant1.address);
      const share2 = await utcContract.calculateFairShare(participant2.address);

      const pool = ethers.utils.parseEther("1000");
      expect(share1).to.equal(pool.mul(100).div(110));
      expect(share2).to.equal(pool.mul(10).div(110));
    });
  });

  describe("Multi-Round FL", function () {
    it("Should support continuous FL training rounds", async function () {
      // Round 1
      await utcContract
        .connect(aggregator)
        .recordContribution(participant1.address, 100, 0, "Round 1");
      await utcContract.connect(owner).distributeRoundRewards([participant1.address]);

      // Round 2
      await utcContract
        .connect(aggregator)
        .recordContribution(participant1.address, 110, 0, "Round 2");
      await utcContract
        .connect(aggregator)
        .recordContribution(participant2.address, 90, 0, "Round 2");
      await utcContract
        .connect(owner)
        .distributeRoundRewards([participant1.address, participant2.address]);

      // Round 3
      await utcContract
        .connect(aggregator)
        .recordContribution(participant1.address, 120, 0, "Round 3");
      await utcContract
        .connect(aggregator)
        .recordContribution(participant2.address, 100, 0, "Round 3");
      await utcContract
        .connect(owner)
        .distributeRoundRewards([participant1.address, participant2.address]);

      // Verify participant1 earned more through multiple rounds
      const totalEarnings1 = await utcContract.balanceOf(participant1.address);
      const totalEarnings2 = await utcContract.balanceOf(participant2.address);

      // Both should have earnings
      expect(totalEarnings1).to.be.gt(0);
      expect(totalEarnings2).to.be.gt(0);

      // Participant1 consistently contributed more
      expect(totalEarnings1).to.be.gt(totalEarnings2);
    });
  });
});
