// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract UnifiedTokenCovenant is ERC20, Ownable {
    struct Contribution {
        uint256 timestamp;
        uint256 score;
        ContributionType contributionType;
        string description;
        bool validated;
        uint256 roundNumber;
    }

    struct RoundReward {
        uint256 roundNumber;
        address participant;
        uint256 utcAwarded;
        uint256 timestamp;
    }

    enum ContributionType {
        FederatedLearning,
        KnowledgeContribution,
        CodeContribution,
        GovernanceParticipation,
        CommunityBuilding
    }

    mapping(address => uint256) public contributionScore; // lifetime total
    mapping(address => Contribution[]) public contributionHistory;
    mapping(address => bool) public authorizedContributors;

    uint256 public currentRound = 0;
    uint256 public roundPool = 1000e18;
    uint256 public roundTotalScore = 0;

    mapping(uint256 => mapping(address => uint256)) public roundContributionScore;
    mapping(uint256 => uint256) public roundTotalContributionScore;
    mapping(uint256 => address[]) private roundParticipants;
    mapping(uint256 => mapping(address => bool)) private roundParticipantSeen;

    RoundReward[] public allRewards;

    event ContributionRecorded(
        address indexed contributor,
        uint256 score,
        ContributionType contributionType,
        uint256 roundNumber
    );

    event RoundCompleted(
        uint256 indexed roundNumber,
        uint256 totalContributions,
        uint256 totalUtcDistributed
    );

    event RewardDistributed(
        address indexed recipient,
        uint256 utcAmount,
        uint256 roundNumber
    );

    event AuthorizationChanged(address indexed account, bool authorized);

    modifier onlyAuthorized() {
        require(
            authorizedContributors[msg.sender],
            "UTC: Not authorized to record contributions"
        );
        _;
    }

    constructor() ERC20("Unified Token Covenant", "UTC") {
        authorizedContributors[msg.sender] = true;
    }

    function recordContribution(
        address _participant,
        uint256 _score,
        ContributionType _type,
        string memory _description
    ) external onlyAuthorized {
        require(_participant != address(0), "UTC: Invalid participant address");
        require(_score > 0, "UTC: Score must be positive");

        Contribution memory newContribution = Contribution({
            timestamp: block.timestamp,
            score: _score,
            contributionType: _type,
            description: _description,
            validated: true,
            roundNumber: currentRound
        });

        contributionHistory[_participant].push(newContribution);
        contributionScore[_participant] += _score;

        roundContributionScore[currentRound][_participant] += _score;
        roundTotalScore += _score;
        roundTotalContributionScore[currentRound] += _score;

        if (!roundParticipantSeen[currentRound][_participant]) {
            roundParticipantSeen[currentRound][_participant] = true;
            roundParticipants[currentRound].push(_participant);
        }

        emit ContributionRecorded(_participant, _score, _type, currentRound);
    }

    function getContributionHistory(address _address)
        external
        view
        returns (Contribution[] memory)
    {
        return contributionHistory[_address];
    }

    function getTotalContributions(address _address)
        external
        view
        returns (uint256)
    {
        return contributionScore[_address];
    }

    function getCurrentRoundParticipants() external view returns (address[] memory) {
        return roundParticipants[currentRound];
    }

    function getRoundParticipants(uint256 _round)
        external
        view
        returns (address[] memory)
    {
        return roundParticipants[_round];
    }

    function getRoundContributionScore(uint256 _round, address _participant)
        external
        view
        returns (uint256)
    {
        return roundContributionScore[_round][_participant];
    }

    function calculateFairShare(address _participant)
        public
        view
        returns (uint256)
    {
        uint256 participantScore = roundContributionScore[currentRound][_participant];
        uint256 totalScore = roundTotalContributionScore[currentRound];

        if (participantScore == 0 || totalScore == 0) {
            return 0;
        }

        return (participantScore * roundPool) / totalScore;
    }

    function distributeRoundRewards(address[] calldata _participants)
        external
        onlyOwner
    {
        require(_participants.length > 0, "UTC: No participants provided");
        require(roundTotalContributionScore[currentRound] > 0, "UTC: No contributions this round");

        uint256 totalDistributed = 0;

        for (uint256 i = 0; i < _participants.length; i++) {
            address participant = _participants[i];
            bool alreadyProcessed = false;

            for (uint256 j = 0; j < i; j++) {
                if (_participants[j] == participant) {
                    alreadyProcessed = true;
                    break;
                }
            }

            if (alreadyProcessed) {
                continue;
            }

            uint256 utcAmount = calculateFairShare(participant);

            if (utcAmount > 0) {
                _mint(participant, utcAmount);

                allRewards.push(
                    RoundReward({
                        roundNumber: currentRound,
                        participant: participant,
                        utcAwarded: utcAmount,
                        timestamp: block.timestamp
                    })
                );

                totalDistributed += utcAmount;
                emit RewardDistributed(participant, utcAmount, currentRound);
            }
        }

        emit RoundCompleted(
            currentRound,
            roundTotalContributionScore[currentRound],
            totalDistributed
        );

        _startNewRound();
    }

    function _startNewRound() internal {
        currentRound += 1;
        roundPool = (roundPool * 120) / 100;
    }

    function authorizeContributor(address _account) external onlyOwner {
        authorizedContributors[_account] = true;
        emit AuthorizationChanged(_account, true);
    }

    function revokeAuthorization(address _account) external onlyOwner {
        authorizedContributors[_account] = false;
        emit AuthorizationChanged(_account, false);
    }

    function setRoundPool(uint256 _newPool) external onlyOwner {
        require(_newPool > 0, "UTC: Pool must be positive");
        roundPool = _newPool;
    }

    function transfer(address, uint256) public pure override returns (bool) {
        revert("UTC: Transfers are not allowed. UTC can only be earned through contribution.");
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("UTC: Transfers are not allowed. UTC can only be earned through contribution.");
    }

    function approve(address, uint256) public pure override returns (bool) {
        revert("UTC: Token transfers are not supported. UTC can only be earned.");
    }

    function _transfer(address, address, uint256) internal pure override {
        revert("UTC: Transfers are not allowed. UTC can only be earned through contribution.");
    }

    function _approve(address, address, uint256) internal pure override {
        revert("UTC: Token transfers are not supported. UTC can only be earned.");
    }

    function _spendAllowance(address, address, uint256) internal pure override {
        revert("UTC: Token transfers are not supported. UTC can only be earned.");
    }

    function getTotalRewardsDistributed() external view returns (uint256) {
        return allRewards.length;
    }

    function getRewardByIndex(uint256 _index)
        external
        view
        returns (RoundReward memory)
    {
        require(_index < allRewards.length, "UTC: Index out of bounds");
        return allRewards[_index];
    }

    function getParticipantRewards(address _participant)
        external
        view
        returns (RoundReward[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < allRewards.length; i++) {
            if (allRewards[i].participant == _participant) {
                count++;
            }
        }

        RoundReward[] memory results = new RoundReward[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < allRewards.length; i++) {
            if (allRewards[i].participant == _participant) {
                results[index] = allRewards[i];
                index++;
            }
        }

        return results;
    }
}
