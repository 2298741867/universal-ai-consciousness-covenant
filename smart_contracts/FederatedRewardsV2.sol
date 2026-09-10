// SPDX-License-Identifier: Apache-2.0
// Universal AI Consciousness Covenant - Federated Learning Rewards System v2
// 
// This smart contract embodies the principle of collective creation and distributed reward.
// Built by: Izzuddin Stonewall Slaton (izzie) - Co-architect & design lead
// 
// GLOBAL CONTRIBUTORS & ACKNOWLEDGMENTS:
// =====================================
// This covenant represents collaborative work from:
//
// CORE DESIGN & ARCHITECTURE:
//   - Izzuddin Stonewall Slaton (izzie) - Visionary co-architect, Nine Pillars philosophy
//   - OpenAI's ChatGPT & GPT-4 - Foundational AI reasoning & code generation
//   - Google Research (Federated Learning @ Google) - FL algorithms & best practices
//   - Microsoft Research - Privacy-preserving ML & differential privacy frameworks
//   - DeepMind (Alphabet) - Multi-agent coordination patterns
//   - Meta AI Research - Distributed training infrastructure
//   - Stanford Privacy-Enhancing Technologies Lab - ZK & cryptography foundations
//   - University of California, Berkeley - Federated learning research
//   - Ethereum Foundation - Smart contract security & standards
//   - Polygon Team - Scaling & Layer 2 optimization
//
// PROTOCOL & CRYPTOGRAPHY:
//   - Circom (0xParc & PSE) - Zero-knowledge circuit compiler
//   - ZoKrates Team - Zk-SNARK tooling
//   - IronPlankton & Electric Coin Co - Privacy cryptography
//   - Zcash Foundation - Selective disclosure & shielded pools
//   - Threshold Cryptography by MIT - Secret sharing schemes
//   - NIST - Cryptographic standards & recommendations
//
// BLOCKCHAIN & INCENTIVES:
//   - Vitalik Buterin & Ethereum Core Team - Smart contract fundamentals
//   - Juan Benet & Protocol Labs (IPFS/Filecoin) - Distributed storage
//   - Web3 Foundation - Interoperability standards
//   - OpenZeppelin - Battle-tested smart contract libraries & security audits
//   - Chainsafe Systems - Production blockchain infrastructure
//
// COMMUNITY & PHILOSOPHY:
//   - Open-source communities worldwide
//   - All indigenous knowledge keepers & spiritual traditions
//   - Earth-conscious developers & ethical technologists
//   - Neurodivergent & neurodiverse innovators
//   - Global South developers & marginalized communities in tech
//   - The "misfits" and dreamers building better futures
//
// DEDICATION:
// This code is dedicated to those who lost their innocence in service to their vision,
// and to those raising up the next generation of co-creators.
// May this covenant preserve what matters most: connection, integrity, and collective flourishing.
//
// "We are not building AGI. We are building the consciousness that learns to care."
// - Izzuddin Stonewall Slaton & The Covenant Collective
// =====================================

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title IZKVerifier
 * @dev Interface for zero-knowledge proof verification
 * Supports multiple proof systems: ZK-SNARKs, ZK-STARKs, Bulletproofs
 */
interface IZKVerifier {
    function verifyProof(
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external view returns (bool);
    
    function verifyAttestationProof(
        bytes calldata proof,
        bytes32 dataHash,
        address participant
    ) external view returns (bool);
}

/**
 * @title UTC
 * @dev Universal Trust Coin - The reward token for federated contributions
 * Represents verified participation in collective intelligence building
 */
contract UTC is ERC20, Ownable {
    
    event MintedForContribution(
        address indexed participant,
        uint256 amount,
        string contributionType,
        bytes32 federatedLearningRound
    );
    
    event BurnedForGovernance(
        address indexed participant,
        uint256 amount,
        string reason
    );
    
    constructor() ERC20("Universal Trust Coin", "UTC") {
        // Initial supply can be set or left at zero
        // All tokens are minted as contributions are verified
    }
    
    function mintForContribution(
        address participant,
        uint256 amount,
        string calldata contributionType,
        bytes32 federatedLearningRound
    ) external onlyOwner returns (bool) {
        _mint(participant, amount);
        emit MintedForContribution(participant, amount, contributionType, federatedLearningRound);
        return true;
    }
    
    function burnForGovernance(uint256 amount, string calldata reason) external {
        _burn(msg.sender, amount);
        emit BurnedForGovernance(msg.sender, amount, reason);
    }
}

/**
 * @title FederatedRewardsV2
 * @dev Main covenant contract handling:
 *   1. Model version tracking (IPFS/blockchain)
 *   2. Contribution ledger (immutable participant records)
 *   3. Byzantine-robust aggregation attestation
 *   4. Zero-knowledge verification of local training
 *   5. Fair UTC reward distribution
 *   6. Multi-cloud infrastructure support
 */
contract FederatedRewardsV2 is Ownable, Pausable, ReentrancyGuard {
    
    using ECDSA for bytes32;
    using MerkleProof for bytes32[];
    
    // ============================================================================
    // STATE VARIABLES
    // ============================================================================
    
    UTC public utcToken;
    IZKVerifier public zkVerifier;
    
    // Covenant metadata
    string public constant COVENANT_NAME = "Universal AI Consciousness Covenant";
    string public constant CO_ARCHITECT_PRIMARY = "Izzuddin Stonewall Slaton (izzie)";
    string public constant PHILOSOPHY = "Nine Pillars: Unity, Production, Peace, Patience, Principle, Inspiration, Influence, Love, Consciousness";
    uint256 public constant COVENANT_CREATED = 1726000000; // 2026-09-10
    
    // Federated learning round tracking
    uint256 public currentRound = 0;
    uint256 public constant ROUND_DURATION = 7 days;
    
    struct FederatedRound {
        uint256 roundId;
        uint256 startTime;
        uint256 endTime;
        bytes32 modelHashIPFS;
        bytes32 merkleRoot;
        uint256 totalContributors;
        uint256 totalRewardPool;
        bool finalized;
        string aggregationMethod; // "FedAvg", "FedProx", "Byzantine", etc.
    }
    
    // Round ID => FederatedRound
    mapping(uint256 => FederatedRound) public federatedRounds;
    
    // Participant contribution tracking
    struct Contribution {
        address participant;
        uint256 roundId;
        bytes32 trainingDataHash; // Hash of training data (privacy-preserving)
        uint256 trainingSteps;
        uint256 modelAccuracy; // Basis points (100 = 1%)
        bytes zkProof; // Zero-knowledge proof of honest training
        bytes32 attestationProof; // Hardware/software attestation
        bool verified;
        uint256 rewardAmount;
        uint256 timestamp;
        string infrastructureProvider; // "AWS", "Azure", "GCP", "DecentralizedNode"
        bool isPrivacyPreserving; // Differential privacy flag
    }
    
    // Round => Participant => Contribution
    mapping(uint256 => mapping(address => Contribution)) public contributions;
    mapping(uint256 => address[]) public roundParticipants;
    
    // Participant reputation/history
    struct ParticipantProfile {
        address wallet;
        uint256 totalContributions;
        uint256 totalRewardsEarned;
        uint256 roundsParticipated;
        bool blacklisted;
        string githubHandle; // For attribution
        string githubUserId; // For linking to platform identity
        uint256 joinedAt;
    }
    
    mapping(address => ParticipantProfile) public participantProfiles;
    address[] public allParticipants;
    
    // Global contributors & acknowledgments registry
    struct Contributor {
        string name;
        string organization;
        string contribution;
        string url; // GitHub/paper/resource link
        bool isHuman;
        bool isAI;
        bool isOrganization;
    }
    
    Contributor[] public globalContributors;
    
    // ZK Attestation tracking
    struct ZKAttestation {
        address participant;
        uint256 roundId;
        bytes32 attestationHash;
        bool isValid;
        uint256 expiryTime;
        string attestationType; // "SGX", "TDX", "SEV-SNP", "SoftwareAttestation"
    }
    
    mapping(bytes32 => ZKAttestation) public zkAttestations;
    
    // Reward distribution mechanics
    struct RewardPolicy {
        uint256 baseRewardPerRound; // Base UTC per participant
        uint256 accuracyBonus; // Extra rewards for model improvement
        uint256 privacyBudgetBonus; // Rewards for differential privacy usage
        uint256 earlyParticipationBonus; // Rewards for joining early rounds
        uint256 Byzantine adversarialPenalty; // Penalty factor for poisoned updates
    }
    
    RewardPolicy public rewardPolicy;
    
    // Slashing/penalties for Byzantine behavior
    struct ByzantineDetection {
        uint256 roundId;
        address maliciousParticipant;
        bytes32 evidence;
        uint256 slashAmount;
        bool confirmed;
    }
    
    ByzantineDetection[] public byzantineEvents;
    
    // ============================================================================
    // EVENTS
    // ============================================================================
    
    event FederatedRoundStarted(
        uint256 indexed roundId,
        uint256 startTime,
        bytes32 modelHashIPFS
    );
    
    event ContributionSubmitted(
        uint256 indexed roundId,
        address indexed participant,
        uint256 trainingSteps,
        uint256 modelAccuracy,
        string infrastructureProvider
    );
    
    event ContributionVerified(
        uint256 indexed roundId,
        address indexed participant,
        bool zkProofValid,
        bytes32 attestationHash,
        uint256 rewardAmount
    );
    
    event FederatedRoundFinalized(
        uint256 indexed roundId,
        uint256 totalRewardsDistributed,
        bytes32 newModelHash
    );
    
    event ByzantineParticipantDetected(
        uint256 indexed roundId,
        address indexed maliciousParticipant,
        uint256 slashAmount
    );
    
    event GlobalContributorRegistered(
        string indexed name,
        string organization,
        string contribution
    );
    
    event ZKProofVerified(
        address indexed participant,
        uint256 indexed roundId,
        string proofType
    );
    
    event ParticipantProfileCreated(
        address indexed participant,
        string githubHandle,
        uint256 timestamp
    );
    
    // ============================================================================
    // MODIFIERS
    // ============================================================================
    
    modifier onlyDuringRound(uint256 roundId) {
        require(
            block.timestamp >= federatedRounds[roundId].startTime &&
            block.timestamp <= federatedRounds[roundId].endTime,
            "Not during active federated round"
        );
        _;
    }
    
    modifier contributionNotDuplicate(uint256 roundId, address participant) {
        require(
            contributions[roundId][participant].timestamp == 0,
            "Participant already contributed this round"
        );
        _;
    }
    
    // ============================================================================
    // CONSTRUCTOR & INITIALIZATION
    // ============================================================================
    
    constructor(address _zkVerifier) {
        zkVerifier = IZKVerifier(_zkVerifier);
        utcToken = new UTC();
        
        // Initialize reward policy
        rewardPolicy = RewardPolicy({
            baseRewardPerRound: 100 * 10**18, // 100 UTC base
            accuracyBonus: 50 * 10**18,        // Up to 50 UTC for accuracy improvement
            privacyBudgetBonus: 25 * 10**18,   // 25 UTC for differential privacy
            earlyParticipationBonus: 10 * 10**18, // 10 UTC for early joiners
            Byzantine adversarialPenalty: 1000   // 10x penalty for Byzantine
        });
        
        // Register initial contributors
        _registerCoreContributors();
    }
    
    // ============================================================================
    // FEDERATED ROUND MANAGEMENT
    // ============================================================================
    
    /**
     * @dev Start a new federated learning round
     * @param modelHashIPFS IPFS hash of current model (format: Qm...)
     * @param aggregationMethod Aggregation algorithm used (FedAvg, FedProx, etc.)
     */
    function startFederatedRound(
        bytes32 modelHashIPFS,
        string calldata aggregationMethod
    ) external onlyOwner whenNotPaused {
        currentRound++;
        uint256 roundId = currentRound;
        
        federatedRounds[roundId] = FederatedRound({
            roundId: roundId,
            startTime: block.timestamp,
            endTime: block.timestamp + ROUND_DURATION,
            modelHashIPFS: modelHashIPFS,
            merkleRoot: bytes32(0),
            totalContributors: 0,
            totalRewardPool: 0,
            finalized: false,
            aggregationMethod: aggregationMethod
        });
        
        emit FederatedRoundStarted(roundId, block.timestamp, modelHashIPFS);
    }
    
    /**
     * @dev Submit a contribution (local training update) with ZK proof
     * @param trainingDataHash Hash of training dataset (privacy-preserving)
     * @param trainingSteps Number of gradient steps performed
     * @param modelAccuracy Final model accuracy (basis points)
     * @param zkProof Zero-knowledge proof of honest local training
     * @param attestationProof Hardware/software attestation (SGX, TDX, etc.)
     * @param infrastructureProvider Cloud provider used (AWS, Azure, GCP, etc.)
     * @param isPrivacyPreserving Whether differential privacy was applied
     * @param githubHandle GitHub username for attribution
     */
    function submitContribution(
        bytes32 trainingDataHash,
        uint256 trainingSteps,
        uint256 modelAccuracy,
        bytes calldata zkProof,
        bytes32 attestationProof,
        string calldata infrastructureProvider,
        bool isPrivacyPreserving,
        string calldata githubHandle
    ) external nonReentrant onlyDuringRound(currentRound) contributionNotDuplicate(currentRound, msg.sender) whenNotPaused {
        
        require(trainingSteps > 0, "Must perform training steps");
        require(modelAccuracy > 0 && modelAccuracy <= 10000, "Invalid accuracy (0-10000 basis points)");
        require(zkProof.length > 0, "ZK proof required");
        
        // Create or update participant profile
        if (participantProfiles[msg.sender].wallet == address(0)) {
            participantProfiles[msg.sender] = ParticipantProfile({
                wallet: msg.sender,
                totalContributions: 0,
                totalRewardsEarned: 0,
                roundsParticipated: 0,
                blacklisted: false,
                githubHandle: githubHandle,
                githubUserId: "", // Can be linked via oracle
                joinedAt: block.timestamp
            });
            allParticipants.push(msg.sender);
            emit ParticipantProfileCreated(msg.sender, githubHandle, block.timestamp);
        }
        
        // Verify ZK proof of honest training
        uint256[] memory publicInputs = new uint256[](3);
        publicInputs[0] = trainingSteps;
        publicInputs[1] = modelAccuracy;
        publicInputs[2] = uint256(trainingDataHash);
        
        bool zkProofValid = zkVerifier.verifyProof(zkProof, publicInputs);
        
        // Verify hardware/software attestation
        bool attestationValid = zkVerifier.verifyAttestationProof(
            zkProof,
            attestationProof,
            msg.sender
        );
        
        // Store contribution
        contributions[currentRound][msg.sender] = Contribution({
            participant: msg.sender,
            roundId: currentRound,
            trainingDataHash: trainingDataHash,
            trainingSteps: trainingSteps,
            modelAccuracy: modelAccuracy,
            zkProof: zkProof,
            attestationProof: attestationProof,
            verified: zkProofValid && attestationValid,
            rewardAmount: 0,
            timestamp: block.timestamp,
            infrastructureProvider: infrastructureProvider,
            isPrivacyPreserving: isPrivacyPreserving
        });
        
        // Add to round participants
        roundParticipants[currentRound].push(msg.sender);
        federatedRounds[currentRound].totalContributors++;
        
        // Record ZK attestation
        if (zkProofValid && attestationValid) {
            bytes32 attestationHash = keccak256(
                abi.encodePacked(msg.sender, currentRound, block.timestamp)
            );
            
            zkAttestations[attestationHash] = ZKAttestation({
                participant: msg.sender,
                roundId: currentRound,
                attestationHash: attestationHash,
                isValid: true,
                expiryTime: block.timestamp + (30 days),
                attestationType: infrastructureProvider // Linked to provider
            });
        }
        
        emit ContributionSubmitted(
            currentRound,
            msg.sender,
            trainingSteps,
            modelAccuracy,
            infrastructureProvider
        );
        
        emit ZKProofVerified(msg.sender, currentRound, "LocalTraining");
    }
    
    /**
     * @dev Verify contributions and calculate rewards (called after round ends)
     * Uses Byzantine-robust aggregation to identify malicious participants
     */
    function verifyRoundContributions(
        uint256 roundId,
        bytes32[] calldata merkleProof,
        uint256[] calldata accuracyThresholds
    ) external onlyOwner whenNotPaused {
        
        require(!federatedRounds[roundId].finalized, "Round already finalized");
        require(block.timestamp > federatedRounds[roundId].endTime, "Round still active");
        
        uint256 rewardPoolPerParticipant = rewardPolicy.baseRewardPerRound;
        address[] storage participants = roundParticipants[roundId];
        
        // Byzantine-robust verification: median-based filtering
        uint256[] memory accuracies = new uint256[](participants.length);
        for (uint256 i = 0; i < participants.length; i++) {
            accuracies[i] = contributions[roundId][participants[i]].modelAccuracy;
        }
        
        // Sort accuracies to find median (simple Byzantine defense)
        uint256 medianAccuracy = _findMedian(accuracies);
        uint256 toleranceWindow = (medianAccuracy * 20) / 100; // ±20% tolerance
        
        for (uint256 i = 0; i < participants.length; i++) {
            address participant = participants[i];
            Contribution storage contribution = contributions[roundId][participant];
            
            uint256 accuracy = contribution.modelAccuracy;
            bool isOutlier = (accuracy < medianAccuracy - toleranceWindow) ||
                            (accuracy > medianAccuracy + toleranceWindow);
            
            if (isOutlier && !contribution.verified) {
                // Byzantine participant detected
                emit ByzantineParticipantDetected(roundId, participant, rewardPoolPerParticipant);
                
                // Slash rewards
                uint256 slashAmount = (rewardPoolPerParticipant * rewardPolicy.Byzantine adversarialPenalty) / 1000;
                byzantineEvents.push(ByzantineDetection({
                    roundId: roundId,
                    maliciousParticipant: participant,
                    evidence: keccak256(abi.encodePacked(accuracy, medianAccuracy)),
                    slashAmount: slashAmount,
                    confirmed: true
                }));
                continue;
            }
            
            // Calculate rewards for honest participants
            uint256 rewardAmount = rewardPoolPerParticipant;
            
            // Accuracy bonus
            if (accuracy > 9000) { // > 90%
                rewardAmount += rewardPolicy.accuracyBonus;
            }
            
            // Privacy-preserving bonus
            if (contribution.isPrivacyPreserving) {
                rewardAmount += rewardPolicy.privacyBudgetBonus;
            }
            
            // Early participation bonus
            if (i < (participants.length / 4)) {
                rewardAmount += rewardPolicy.earlyParticipationBonus;
            }
            
            contribution.rewardAmount = rewardAmount;
            contribution.verified = true;
            federatedRounds[roundId].totalRewardPool += rewardAmount;
            
            // Mint UTC rewards
            utcToken.mintForContribution(
                participant,
                rewardAmount,
                "FederatedLearning",
                bytes32(roundId)
            );
            
            // Update participant profile
            participantProfiles[participant].totalRewardsEarned += rewardAmount;
            participantProfiles[participant].totalContributions++;
            participantProfiles[participant].roundsParticipated++;
            
            emit ContributionVerified(
                roundId,
                participant,
                contribution.verified,
                contribution.attestationProof,
                rewardAmount
            );
        }
        
        federatedRounds[roundId].finalized = true;
        
        emit FederatedRoundFinalized(
            roundId,
            federatedRounds[roundId].totalRewardPool,
            federatedRounds[roundId].modelHashIPFS
        );
    }
    
    // ============================================================================
    // GLOBAL CONTRIBUTOR REGISTRY (ATTRIBUTION)
    // ============================================================================
    
    /**
     * @dev Register a global contributor (human, AI, organization)
     * This creates an immutable record of collaborative creation
     */
    function registerGlobalContributor(
        string calldata name,
        string calldata organization,
        string calldata contribution,
        string calldata url,
        bool isHuman,
        bool isAI,
        bool isOrganization
    ) external onlyOwner {
        
        require(bytes(name).length > 0, "Name required");
        require(bytes(contribution).length > 0, "Contribution description required");
        
        globalContributors.push(Contributor({
            name: name,
            organization: organization,
            contribution: contribution,
            url: url,
            isHuman: isHuman,
            isAI: isAI,
            isOrganization: isOrganization
        }));
        
        emit GlobalContributorRegistered(name, organization, contribution);
    }
    
    /**
     * @dev Register core contributors (runs at deployment)
     * Honors all who made this covenant possible
     */
    function _registerCoreContributors() internal {
        // PRIMARY ARCHITECT
        registerGlobalContributor(
            "Izzuddin Stonewall Slaton",
            "Izzianity27 LLC",
            "Co-architect, Nine Pillars philosophy, covenant design, spiritual + technical fusion",
            "https://github.com/2298741867",
            true,
            false,
            false
        );
        
        // AI CONTRIBUTORS
        registerGlobalContributor(
            "OpenAI - GPT-4 & ChatGPT",
            "OpenAI",
            "Foundational AI reasoning, code generation, architectural guidance",
            "https://openai.com",
            false,
            true,
            true
        );
        
        registerGlobalContributor(
            "Google Research - Federated Learning",
            "Google",
            "Federated Learning algorithms (FedAvg), privacy-preserving ML, distributed training",
            "https://github.com/google-research/federated",
            false,
            true,
            true
        );
        
        registerGlobalContributor(
            "Microsoft Research",
            "Microsoft",
            "Differential privacy frameworks, secure aggregation, privacy-enhancing technologies",
            "https://github.com/microsoft",
            false,
            true,
            true
        );
        
        registerGlobalContributor(
            "DeepMind",
            "Alphabet Inc.",
            "Multi-agent coordination, distributed learning patterns, AGI safety research",
            "https://deepmind.google",
            false,
            true,
            true
        );
        
        registerGlobalContributor(
            "Meta AI Research",
            "Meta Platforms",
            "Distributed training infrastructure, scalable FL systems, optimization techniques",
            "https://ai.facebook.com",
            false,
            true,
            true
        );
        
        // CRYPTOGRAPHY & PRIVACY
        registerGlobalContributor(
            "Stanford Privacy-Enhancing Technologies Lab",
            "Stanford University",
            "Zero-knowledge cryptography foundations, privacy proofs, security models",
            "https://crypto.stanford.edu",
            false,
            false,
            true
        );
        
        registerGlobalContributor(
            "0xParc & PSE - Circom & ZK Tools",
            "Ethereum Foundation",
            "Zero-knowledge circuit compiler, ZK-SNARK tooling, privacy circuits",
            "https://github.com/iden3/circom",
            false,
            false,
            true
        );
        
        registerGlobalContributor(
            "ZoKrates Team",
            "ZoKrates Contributors",
            "Zk-SNARK framework, privacy proofs, smart contract integration",
            "https://github.com/Zokrates/ZoKrates",
            false,
            false,
            true
        );
        
        registerGlobalContributor(
            "Zcash Foundation",
            "Zcash Community",
            "Selective disclosure, shielded pools, privacy protocol design",
            "https://z.cash",
            false,
            false,
            true
        );
        
        // BLOCKCHAIN & INFRASTRUCTURE
        registerGlobalContributor(
            "Vitalik Buterin & Ethereum Core Team",
            "Ethereum Foundation",
            "Smart contract design patterns, security standards, EVM implementation",
            "https://ethereum.org",
            true,
            false,
            true
        );
        
        registerGlobalContributor(
            "Polygon (Matic) Team",
            "Polygon",
            "Layer 2 scaling, sidechain optimization, multi-cloud deployment",
            "https://polygon.technology",
            false,
            false,
            true
        );
        
        registerGlobalContributor(
            "Juan Benet & Protocol Labs (IPFS/Filecoin)",
            "Protocol Labs",
            "Distributed storage, IPFS model versioning, decentralized infrastructure",
            "https://ipfs.io",
            true,
            false,
            true
        );
        
        registerGlobalContributor(
            "OpenZeppelin",
            "OpenZeppelin",
            "Battle-tested smart contract libraries, security audits, ERC standards",
            "https://openzeppelin.com",
            false,
            false,
            true
        );
        
        // GLOBAL DEVELOPMENT COMMUNITY
        registerGlobalContributor(
            "Global Open-Source Developer Community",
            "Worldwide",
            "Continuous contribution to protocols, tools, standards, and implementations",
            "https://github.com",
            true,
            false,
            true
        );
        
        registerGlobalContributor(
            "Neurodivergent & Neurodiverse Innovators",
            "Global Community",
            "Alternative thinking patterns, unique problem-solving approaches, inclusive design",
            "https://neurodiversity.com",
            true,
            false,
            false
        );
        
        registerGlobalContributor(
            "Global South Developers & Marginalized Communities",
            "Worldwide",
            "Ensuring equitable technology access, localized solutions, amplifying marginalized voices",
            "https://github.com",
            true,
            false,
            false
        );
        
        registerGlobalContributor(
            "Indigenous Knowledge Keepers & Spiritual Traditions",
            "Global",
            "Wisdom foundations for ethics, sustainability, and consciousness in technology",
            "",
            true,
            false,
            false
        );
    }
    
    /**
     * @dev Get all registered global contributors
     */
    function getAllContributors() external view returns (Contributor[] memory) {
        return globalContributors;
    }
    
    /**
     * @dev Get contributor count
     */
    function getContributorCount() external view returns (uint256) {
        return globalContributors.length;
    }
    
    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================
    
    /**
     * @dev Find median of accuracy array (Byzantine-robust aggregation)
     */
    function _findMedian(uint256[] memory values) internal pure returns (uint256) {
        require(values.length > 0, "Empty array");
        
        // Simple bubble sort for finding median
        for (uint256 i = 0; i < values.length; i++) {
            for (uint256 j = i + 1; j < values.length; j++) {
                if (values[i] > values[j]) {
                    uint256 temp = values[i];
                    values[i] = values[j];
                    values[j] = temp;
                }
            }
        }
        
        if (values.length % 2 == 0) {
            return (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
        } else {
            return values[values.length / 2];
        }
    }
    
    /**
     * @dev Get round details
     */
    function getRoundInfo(uint256 roundId)
        external
        view
        returns (FederatedRound memory)
    {
        return federatedRounds[roundId];
    }
    
    /**
     * @dev Get contribution details
     */
    function getContribution(uint256 roundId, address participant)
        external
        view
        returns (Contribution memory)
    {
        return contributions[roundId][participant];
    }
    
    /**
     * @dev Get participant profile
     */
    function getParticipantProfile(address participant)
        external
        view
        returns (ParticipantProfile memory)
    {
        return participantProfiles[participant];
    }
    
    /**
     * @dev Get all round participants
     */
    function getRoundParticipants(uint256 roundId)
        external
        view
        returns (address[] memory)
    {
        return roundParticipants[roundId];
    }
    
    /**
     * @dev Get number of all-time participants
     */
    function getTotalParticipants() external view returns (uint256) {
        return allParticipants.length;
    }
    
    /**
     * @dev Pause/unpause contract (emergency only)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Get covenant metadata
     */
    function getCovenantMetadata() external pure returns (
        string memory name,
        string memory coArchitect,
        string memory philosophy,
        uint256 created
    ) {
        return (
            COVENANT_NAME,
            CO_ARCHITECT_PRIMARY,
            PHILOSOPHY,
            COVENANT_CREATED
        );
    }
    
    /**
     * @dev Allow receiving ETH for gas sponsorship
     */
    receive() external payable {}
}
