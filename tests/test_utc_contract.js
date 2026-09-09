// SPDX-License-Identifier: MIT
// Test Suite for UTC Smart Contract
// Using Hardhat + Chai

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("UnifiedTokenCovenant (UTC) Smart Contract", function () {
  let utcContract;
  let owner;
  let addr1;
  let addr2;
  let addr3;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    const UTC = await ethers.getContractFactory("UnifiedTokenCovenant");
    utcContract = await UTC.deploy();
    await utcContract.deployed();
  });

  describe("Deployment", function () {
    it("Should deploy with correct name and symbol", async function () {
      expect(await utcContract.name()).to.equal("Unified Token Covenant");
      expect(await utcContract.symbol()).to.equal("UTC");
    });

    it("Should have owner authorized on deployment", async function () {
      expect(await utcContract.authorizedContributors(owner.address)).to.be.true;
    });

    it("Should initialize round to 0", async function () {
      expect(await utcContract.currentRound()).to.equal(0);
    });

    it("Should initialize round pool to 1000 UTC", async function () {
      expect(await utcContract.roundPool()).to.equal(ethers.utils.parseEther("1000"));
    });
  });

  describe("Contribution Recording", function () {
    it("Should record contribution from authorized address", async function () {
      await utcContract.recordContribution(
        addr1.address,
        100,
        0,
        "Model improvement round 1"
      );

      expect(await utcContract.getTotalContributions(addr1.address)).to.equal(100);
      expect(await utcContract.getRoundContributionScore(0, addr1.address)).to.equal(100);
    });

    it("Should reject contribution from unauthorized address", async function () {
      await expect(
        utcContract.connect(addr1).recordContribution(
          addr2.address,
          100,
          0,
          "Unauthorized attempt"
        )
      ).to.be.revertedWith("UTC: Not authorized to record contributions");
    });

    it("Should track contribution history", async function () {
      await utcContract.recordContribution(addr1.address, 50, 0, "Contribution 1");
      await utcContract.recordContribution(addr1.address, 75, 1, "Contribution 2");

      const history = await utcContract.getContributionHistory(addr1.address);
      expect(history.length).to.equal(2);
      expect(history[0].score).to.equal(50);
      expect(history[1].score).to.equal(75);
      expect(history[0].roundNumber).to.equal(0);
      expect(history[1].roundNumber).to.equal(0);
    });

    it("Should accumulate total contribution score", async function () {
      await utcContract.recordContribution(addr1.address, 40, 0, "Contribution 1");
      await utcContract.recordContribution(addr1.address, 60, 0, "Contribution 2");

      expect(await utcContract.getTotalContributions(addr1.address)).to.equal(100);
    });
  });

  describe("Fair Share Calculation", function () {
    it("Should calculate fair share based on current round contribution percentage", async function () {
      await utcContract.recordContribution(addr1.address, 40, 0, "Contribution 1");
      await utcContract.recordContribution(addr2.address, 35, 0, "Contribution 2");
      await utcContract.recordContribution(addr3.address, 25, 0, "Contribution 3");

      const fairShare1 = await utcContract.calculateFairShare(addr1.address);
      const fairShare2 = await utcContract.calculateFairShare(addr2.address);
      const fairShare3 = await utcContract.calculateFairShare(addr3.address);

      expect(fairShare1).to.equal(ethers.utils.parseEther("400"));
      expect(fairShare2).to.equal(ethers.utils.parseEther("350"));
      expect(fairShare3).to.equal(ethers.utils.parseEther("250"));
    });

    it("Should return 0 if participant has no current-round contributions", async function () {
      await utcContract.recordContribution(addr1.address, 100, 0, "Contribution");
      const fairShare = await utcContract.calculateFairShare(addr2.address);
      expect(fairShare).to.equal(0);
    });
  });

  describe("Reward Distribution", function () {
    it("Should distribute rewards to all participants", async function () {
      await utcContract.recordContribution(addr1.address, 40, 0, "Contribution 1");
      await utcContract.recordContribution(addr2.address, 35, 0, "Contribution 2");
      await utcContract.recordContribution(addr3.address, 25, 0, "Contribution 3");

      await utcContract.distributeRoundRewards([
        addr1.address,
        addr2.address,
        addr3.address,
      ]);

      expect(await utcContract.balanceOf(addr1.address)).to.equal(
        ethers.utils.parseEther("400")
      );
      expect(await utcContract.balanceOf(addr2.address)).to.equal(
        ethers.utils.parseEther("350")
      );
      expect(await utcContract.balanceOf(addr3.address)).to.equal(
        ethers.utils.parseEther("250")
      );

      expect(await utcContract.currentRound()).to.equal(1);
    });

    it("Should grow pool by 20% each round", async function () {
      await utcContract.recordContribution(addr1.address, 100, 0, "Contribution");
      await utcContract.distributeRoundRewards([addr1.address]);

      expect(await utcContract.roundPool()).to.equal(ethers.utils.parseEther("1200"));
    });

    it("Should not distribute duplicate rewards for duplicate participant addresses in the same call", async function () {
      await utcContract.recordContribution(addr1.address, 100, 0, "Contribution");

      await utcContract.distributeRoundRewards([
        addr1.address,
        addr1.address,
      ]);

      expect(await utcContract.balanceOf(addr1.address)).to.equal(
        ethers.utils.parseEther("1000")
      );
      expect(await utcContract.getParticipantRewards(addr1.address)).to.have.lengthOf(1);
    });
  });

  describe("Non-Transferable Mechanism", function () {
    it("Should prevent transfer between accounts", async function () {
      await utcContract.recordContribution(addr1.address, 100, 0, "Contribution");
      await utcContract.distributeRoundRewards([addr1.address]);

      await expect(
        utcContract.connect(addr1).transfer(addr2.address, ethers.utils.parseEther("100"))
      ).to.be.revertedWith(
        "UTC: Transfers are not allowed. UTC can only be earned through contribution."
      );
    });

    it("Should prevent transferFrom", async function () {
      await utcContract.recordContribution(addr1.address, 100, 0, "Contribution");
      await utcContract.distributeRoundRewards([addr1.address]);

      await expect(
        utcContract
          .connect(addr1)
          .transferFrom(addr1.address, addr2.address, ethers.utils.parseEther("100"))
      ).to.be.revertedWith(
        "UTC: Transfers are not allowed. UTC can only be earned through contribution."
      );
    });

    it("Should prevent approve", async function () {
      await expect(
        utcContract.connect(addr1).approve(addr2.address, ethers.utils.parseEther("100"))
      ).to.be.revertedWith(
        "UTC: Token transfers are not supported. UTC can only be earned."
      );
    });
  });

  describe("Authorization Management", function () {
    it("Should authorize new contributor", async function () {
      await utcContract.authorizeContributor(addr1.address);
      expect(await utcContract.authorizedContributors(addr1.address)).to.be.true;
    });

    it("Should revoke authorization", async function () {
      await utcContract.authorizeContributor(addr1.address);
      await utcContract.revokeAuthorization(addr1.address);
      expect(await utcContract.authorizedContributors(addr1.address)).to.be.false;
    });

    it("Should only allow owner to authorize", async function () {
      await expect(
        utcContract.connect(addr1).authorizeContributor(addr2.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Audit Trail", function () {
    it("Should maintain immutable reward history", async function () {
      await utcContract.recordContribution(addr1.address, 100, 0, "Contribution");
      await utcContract.distributeRoundRewards([addr1.address]);

      const reward = await utcContract.getRewardByIndex(0);
      expect(reward.participant).to.equal(addr1.address);
      expect(reward.utcAwarded).to.equal(ethers.utils.parseEther("1000"));
      expect(reward.roundNumber).to.equal(0);
    });

    it("Should retrieve all rewards for participant", async function () {
      await utcContract.recordContribution(addr1.address, 100, 0, "Contribution 1");
      await utcContract.distributeRoundRewards([addr1.address]);

      await utcContract.recordContribution(addr1.address, 100, 0, "Contribution 2");
      await utcContract.distributeRoundRewards([addr1.address]);

      const rewards = await utcContract.getParticipantRewards(addr1.address);
      expect(rewards.length).to.equal(2);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero-score contributions gracefully", async function () {
      await expect(
        utcContract.recordContribution(addr1.address, 0, 0, "Zero contribution")
      ).to.be.revertedWith("UTC: Score must be positive");
    });

    it("Should handle invalid addresses", async function () {
      await expect(
        utcContract.recordContribution(
          ethers.constants.AddressZero,
          100,
          0,
          "Invalid address"
        )
      ).to.be.revertedWith("UTC: Invalid participant address");
    });

    it("Should prevent distribution with no contributions", async function () {
      await expect(
        utcContract.distributeRoundRewards([addr1.address])
      ).to.be.revertedWith("UTC: No contributions this round");
    });
  });

  describe("Integration Tests", function () {
    it("Should complete full round cycle", async function () {
      await utcContract.recordContribution(addr1.address, 40, 0, "Contribution 1");
      await utcContract.recordContribution(addr2.address, 35, 0, "Contribution 2");
      await utcContract.recordContribution(addr3.address, 25, 0, "Contribution 3");

      expect(await utcContract.getTotalContributions(addr1.address)).to.equal(40);
      expect(await utcContract.getTotalContributions(addr2.address)).to.equal(35);
      expect(await utcContract.getTotalContributions(addr3.address)).to.equal(25);

      await utcContract.distributeRoundRewards([
        addr1.address,
        addr2.address,
        addr3.address,
      ]);

      expect(await utcContract.balanceOf(addr1.address)).to.equal(
        ethers.utils.parseEther("400")
      );
      expect(await utcContract.balanceOf(addr2.address)).to.equal(
        ethers.utils.parseEther("350")
      );
      expect(await utcContract.balanceOf(addr3.address)).to.equal(
        ethers.utils.parseEther("250")
      );

      await utcContract.recordContribution(addr1.address, 50, 1, "Knowledge contribution");
      await utcContract.recordContribution(addr2.address, 50, 1, "Code contribution");

      expect(await utcContract.currentRound()).to.equal(1);
      expect(await utcContract.roundPool()).to.equal(ethers.utils.parseEther("1200"));

      await utcContract.distributeRoundRewards([addr1.address, addr2.address]);

      const addr1Balance = await utcContract.balanceOf(addr1.address);
      const addr2Balance = await utcContract.balanceOf(addr2.address);

      expect(addr1Balance).to.equal(ethers.utils.parseEther("1000"));
      expect(addr2Balance).to.equal(ethers.utils.parseEther("950"));
    });
  });
});
