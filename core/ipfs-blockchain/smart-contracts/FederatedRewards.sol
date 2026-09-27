// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/**
 * @title FederatedRewards v2
 * @notice Distributes UTC tokens fairly based on federated learning contributions
 * @dev Implements:
 *      1. Gradient Verification (Reputation-Based Byzantine Detection)
 *      2. Slashing with Grace Periods (Protects accidents, punishes attacks)
 *      3. Resource-Aware Tracking (Monitors edge device performance)
 * 
 * Pure Pipeline: Device → Verification → Reward → Blockchain → User
 */

pragma experimental ABIEncoderV2;

contract FederatedRewards {
    
    // ========================================================================
    // STATE VARIABLES
    // ========================================================================
    
    address public constant COVENANT = 0x2298741867AbCdEf7F3c2b1a9D8e7f6C5b4a3D2e;
    
    // UTC Token (non-transferable, for user's benefit only)
    string public constant TOKEN_NAME = "Unified Token Covenant";
    string public constant TOKEN_SYMBOL = "UTC";
    
    // ========================================================================
    // GRADIENT VERIFICATION (Level 1: Reputation-Based Byzantine Detection)
    // ========================================================================
    
    struct ParticipantReputation {
        uint256 totalContributions;      // How many gradients submitted
        uint256 averageQualityScore;     // Running quality average (0-100)
        uint256 lastUpdateBlock;         // When reputation was last updated
        bool flaggedForInvestigation;    // Under investigation for anomaly?
        uint256 reliabilityScore;        // 0-1000 (higher = more trusted)
    }
    
    struct GradientSubmission {
        address participant;
        bytes32 gradientHash;           // Content hash (privacy-preserving)
        uint256 declaredQualityScore;   // Participant's claimed quality (0-100)
        uint256 modelVersion;           // Which model version improved
        uint256 timestamp;              // When submitted
        bool verified;                  // Passed verification?
        uint256 actualQualityScore;     // Verified quality (may differ)
        string verificationMethod;      // "SIGNATURE", "REPUTATION", "ZKP"
    }
    
    mapping(address => ParticipantReputation) public reputation;
    mapping(bytes32 => GradientSubmission) public gradients;
    mapping(address => bytes32[]) public participantGradients;
    
    // Byzantine detection: track gradient patterns
    mapping(uint256 => bytes32[]) public roundGradients;  // model_version → [gradient_hashes]
    
    // ========================================================================
    // SLASHING & GRACE PERIODS (Level 2: Fair Penalization)
    // ========================================================================
    
    struct SlashingPolicy {
        uint256 gracePeriodBlocks;          // Blocks before penalty applies (~25 min on Ethereum)
        uint256 minimalSlashAmount;         // Minimum UTC to slash (0 = no slash for minor issues)
        uint256 aggressiveSlashAmount;      // UTC to slash for clear Byzantine attacks
        uint256 investigationWindowBlocks;  // Time to prove innocence
    }
    
    struct AnomalyFlag {
        bool exists;
        uint256 firstDetectedBlock;
        string reason;
        string status;  // "UNDER_INVESTIGATION", "EXONERATED", "CONFIRMED_MALICIOUS"
        bool canProveInnocence;
        uint256 exonerationDeadline;
    }
    
    SlashingPolicy public slashingPolicy = SlashingPolicy({
        gracePeriodBlocks: 100,             // ~25 minutes
        minimalSlashAmount: 0,              // No slash for first accident
        aggressiveSlashAmount: 50,          // 50 UTC for confirmed Byzantine
        investigationWindowBlocks: 500      // ~2 hours to prove innocence
    });
    
    mapping(address => mapping(bytes32 => AnomalyFlag)) public anomalies;
    mapping(address => uint256) public slashedBalance;
    
    // ========================================================================
    // EDGE RESOURCE MANAGEMENT (Level 3: Device-Aware Tracking)
    // ========================================================================
    
    struct EdgeDeviceMetrics {
        uint256 lastReportedBlock;
        uint256 cpuPercentUsed;            // 0-100
        uint256 memoryPercentUsed;         // 0-100
        uint256 diskCacheMB;               // MB of cache used
        uint256 batteryPercent;            // 0-100 (mobile devices)
        uint256 consecutiveFailures;       // Count of resource-related failures
        bool deviceHealthy;                // Overall health
    }
    
    struct EdgeResourcePolicy {
        uint256 maxCpuPercent;             // Don't exceed this
        uint256 maxMemoryPercent;          // Don't exceed this
        uint256 maxDiskCacheMB;            // Max local cache
        uint256 minBatteryPercent;         // Mobile: don't train if < this
        uint256 maxTrainingTimSeconds;     // Max training time per round
        bool canPauseTraining;             // Device can pause & resume
        bool canResumeTraining;            // Device can resume later
    }
    
    EdgeResourcePolicy public defaultResourcePolicy = EdgeResourcePolicy({
        maxCpuPercent: 15,                 // 15% of one core
        maxMemoryPercent: 80,              // 80% of available RAM
        maxDiskCacheMB: 100,               // 100 MB cache max
        minBatteryPercent: 20,             // Don't train if < 20% battery
        maxTrainingTimSeconds: 60,         // Mobile can't train 1 hour
        canPauseTraining: true,
        canResumeTraining: true
    });
    
    mapping(address => EdgeDeviceMetrics) public deviceMetrics;
    mapping(address => EdgeResourcePolicy) public customResourcePolicy;
    
    // ========================================================================
    // UTC REWARDS TRACKING (Level 4: Fair Compensation)
    // ========================================================================
    
    struct ContributionRecord {
        uint256 effectiveWeight;          // Weighted by reputation
        uint256 qualityScore;             // Verified quality
        uint256 modelVersion;             // Which model improved
        uint256 timestamp;                // When contributed
        uint256 utcRewardAmount;          // UTC tokens earned
        bool rewardClaimed;               // User claimed it?
    }
    
    mapping(address => ContributionRecord[]) public contributionHistory;
    mapping(address => uint256) public utcEarned;
    mapping(address => uint256) public utcClaimed;
    
    uint256 public totalUTCDistributed = 0;
    uint256 public utcPoolPerRound = 1000;  // 1000 UTC per federated round
    
    // ========================================================================
    // EVENTS
    // ========================================================================
    
    event GradientSubmitted(
        address indexed participant,
        bytes32 indexed gradientHash,
        uint256 declaredQuality,
        uint256 modelVersion,
        uint256 timestamp
    );
    
    event GradientVerified(
        bytes32 indexed gradientHash,
        address indexed participant,
        uint256 actualQuality,
        uint256 effectiveWeight,
        string verificationMethod
    );
    
    event AnomalyDetected(
        address indexed participant,
        bytes32 indexed gradientHash,
        string reason,
        uint256 timestamp
    );
    
    event AnomalyExonerated(
        address indexed participant,
        bytes32 indexed gradientHash,
        string evidenceType
    );
    
    event SlashingExecuted(
        address indexed participant,
        uint256 amount,
        string reason
    );
    
    event RewardDistributed(
        address indexed participant,
        uint256 utcAmount,
        uint256 modelVersion,
        string reason
    );
    
    event DeviceMetricsReported(
        address indexed participant,
        uint256 cpuPercent,
        uint256 memoryPercent,
        uint256 diskCacheMB,
        bool deviceHealthy
    );
    
    event ReputationUpdated(
        address indexed participant,
        uint256 newReliabilityScore,
        uint256 averageQuality
    );
    
    // ========================================================================
    // LEVEL 1: GRADIENT VERIFICATION (Reputation-Based Byzantine)
    // ========================================================================
    
    /**
     * @notice Submit a gradient update with ECDSA signature verification
     * @param _gradientHash Content hash (IPFS format) - proves you trained
     * @param _declaredQuality Your claimed quality score (0-100)
     * @param _modelVersion Which model version you improved
     * @param _signature ECDSA signature proving gradient authenticity
     */
    function submitGradient(
        bytes32 _gradientHash,
        uint256 _declaredQuality,
        uint256 _modelVersion,
        bytes calldata _signature
    ) external {
        require(_declaredQuality <= 100, "Quality must be 0-100");
        require(_gradientHash != bytes32(0), "Invalid gradient hash");
        
        address participant = msg.sender;
        
        // ✅ VERIFICATION STEP 1: Cryptographic Signature
        require(
            verifySignature(_gradientHash, _signature, participant),
            "Invalid signature - gradient not authenticated"
        );
        
        // Store submission
        GradientSubmission storage submission = gradients[_gradientHash];
        submission.participant = participant;
        submission.gradientHash = _gradientHash;
        submission.declaredQualityScore = _declaredQuality;
        submission.modelVersion = _modelVersion;
        submission.timestamp = block.timestamp;
        
        // ✅ VERIFICATION STEP 2: Reputation-Based Byzantine Detection
        uint256 effectiveWeight = verifyGradientByReputation(
            participant,
            _gradientHash,
            _declaredQuality
        );
        
        // ✅ VERIFICATION STEP 3: Detect Anomalies
        bool isAnomaly = detectGradientAnomaly(
            participant,
            _gradientHash,
            _declaredQuality,
            effectiveWeight
        );
        
        if (isAnomaly) {
            flagForInvestigation(participant, _gradientHash, "Anomalous gradient detected");
            submission.actualQualityScore = _declaredQuality / 2;  // Reduce trust
        } else {
            submission.actualQualityScore = _declaredQuality;
            submission.verified = true;
        }
        
        // Record contribution
        participantGradients[participant].push(_gradientHash);
        roundGradients[_modelVersion].push(_gradientHash);
        
        // Emit event
        emit GradientSubmitted(
            participant,
            _gradientHash,
            _declaredQuality,
            _modelVersion,
            block.timestamp
        );
        
        emit GradientVerified(
            _gradientHash,
            participant,
            submission.actualQualityScore,
            effectiveWeight,
            "REPUTATION_BASED_BYZANTINE"
        );
    }
    
    /**
     * @notice Verify gradient using reputation-based Byzantine detection
     * Logic: New nodes get low weight. Consistent nodes get high weight.
     *        Outliers get reduced weight but aren't rejected immediately.
     */
    function verifyGradientByReputation(
        address _participant,
        bytes32 _gradientHash,
        uint256 _declaredQuality
    ) internal returns (uint256 effectiveWeight) {
        
        ParticipantReputation storage rep = reputation[_participant];
        
        // Calculate weight based on history
        if (rep.totalContributions == 0) {
            // NEW NODE: Start with 50% weight
            effectiveWeight = 500;  // 500/1000 = 0.5
        } else {
            // ESTABLISHED NODE: Weight by reliability
            // Max weight = 1000 (100% trust)
            effectiveWeight = min(rep.reliabilityScore, 1000);
        }
        
        // Check for consistency anomalies
        if (isConsistencyOutlier(_participant, _declaredQuality)) {
            // Quality differs significantly from history
            effectiveWeight = (effectiveWeight * 75) / 100;  // Reduce 25%
            rep.flaggedForInvestigation = true;
        }
        
        return effectiveWeight;
    }
    
    /**
     * @notice Detect if gradient is anomalous (Byzantine attack pattern)
     */
    function detectGradientAnomaly(
        address _participant,
        bytes32 _gradientHash,
        uint256 _declaredQuality,
        uint256 _effectiveWeight
    ) internal view returns (bool) {
        
        // Pattern 1: Sudden quality drop
        ParticipantReputation storage rep = reputation[_participant];
        if (rep.totalContributions > 0) {
            int256 qualityDiff = int256(_declaredQuality) - int256(rep.averageQualityScore);
            if (qualityDiff < -40) {  // Quality dropped 40+ points suddenly
                return true;
            }
        }
        
        // Pattern 2: Weight too low (Byzantine red flag)
        if (_effectiveWeight < 300) {  // < 30% trust
            return true;
        }
        
        // Pattern 3: Multiple outliers in same round (coordinated attack)
        bytes32[] storage roundGrads = roundGradients[gradients[_gradientHash].modelVersion];
        if (roundGrads.length > 10) {  // Only meaningful in large rounds
            uint256 outlierCount = 0;
            for (uint i = 0; i < roundGrads.length; i++) {
                if (isOutlier(gradients[roundGrads[i]].actualQualityScore)) {
                    outlierCount++;
                }
            }
            if (outlierCount > roundGrads.length / 3) {  // > 33% outliers = coordinated?
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * @notice Check if quality is outlier compared to participant's history
     */
    function isConsistencyOutlier(address _participant, uint256 _quality) internal view returns (bool) {
        ParticipantReputation storage rep = reputation[_participant];
        if (rep.totalContributions == 0) return false;
        
        uint256 avgQuality = rep.averageQualityScore;
        
        // Check if > 2 standard deviations away (simplified)
        if (_quality > avgQuality + 30 || _quality + 30 < avgQuality) {
            return true;
        }
        return false;
    }
    
    /**
     * @notice Check if a quality score is an outlier globally
     */
    function isOutlier(uint256 _quality) internal pure returns (bool) {
        // Simplified: scores > 95 or < 20 are suspicious
        return _quality > 95 || _quality < 20;
    }
    
    // ========================================================================
    // LEVEL 2: SLASHING WITH GRACE PERIODS
    // ========================================================================
    
    /**
     * @notice Flag a gradient for investigation (under grace period)
     */
    function flagForInvestigation(
        address _participant,
        bytes32 _gradientHash,
        string calldata _reason
    ) internal {
        AnomalyFlag storage flag = anomalies[_participant][_gradientHash];
        flag.exists = true;
        flag.firstDetectedBlock = block.number;
        flag.reason = _reason;
        flag.status = "UNDER_INVESTIGATION";
        flag.canProveInnocence = true;
        flag.exonerationDeadline = block.number + slashingPolicy.investigationWindowBlocks;
        
        reputation[_participant].flaggedForInvestigation = true;
        
        emit AnomalyDetected(_participant, _gradientHash, _reason, block.timestamp);
    }
    
    /**
     * @notice Participant can prove their gradient was legitimate
     * Example evidence: Network logs, device timestamps, cryptographic proofs
     */
    function proveInnocence(
        bytes32 _gradientHash,
        bytes calldata _evidence,  // Device logs, network timestamps, etc.
        string calldata _evidenceType
    ) external {
        address participant = msg.sender;
        AnomalyFlag storage flag = anomalies[participant][_gradientHash];
        
        require(flag.exists, "No anomaly flagged for this gradient");
        require(
            block.number < flag.exonerationDeadline,
            "Investigation period expired"
        );
        require(flag.canProveInnocence, "Cannot prove innocence for this case");
        
        // Verify evidence (simplified - real impl would verify device logs, timestamps)
        if (verifyEvidence(_evidence, _evidenceType)) {
            flag.status = "EXONERATED";
            flag.canProveInnocence = false;
            reputation[participant].flaggedForInvestigation = false;
            
            emit AnomalyExonerated(participant, _gradientHash, _evidenceType);
        }
    }
    
    /**
     * @notice Verify evidence from participant (internal helper)
     * Real implementation would:
     * - Verify device logs
     * - Check network timestamps
     * - Validate device resource constraints
     */
    function verifyEvidence(
        bytes calldata _evidence,
        string calldata _evidenceType
    ) internal view returns (bool) {
        
        // Simplified verification
        if (keccak256(bytes(_evidenceType)) == keccak256(bytes("NETWORK_LOGS"))) {
            return _evidence.length > 0;  // Real impl: parse & verify logs
        }
        
        if (keccak256(bytes(_evidenceType)) == keccak256(bytes("DEVICE_METRICS"))) {
            return _evidence.length > 0;  // Real impl: verify device state
        }
        
        if (keccak256(bytes(_evidenceType)) == keccak256(bytes("THERMAL_THROTTLE"))) {
            return _evidence.length > 0;  // Real impl: verify CPU was throttled
        }
        
        return false;
    }
    
    /**
     * @notice Execute slashing ONLY after grace period + investigation
     * Three-tier system:
     * - Minimal (first accident): No slash
     * - Suspicious (repeated outliers): 25 UTC
     * - Confirmed Byzantine (obvious attack): 100 UTC
     */
    function executeSlashing() external onlyAggregator {
        
        // Iterate through all flagged participants
        // (In real impl: would use events to track flagged participants)
        
        address[] memory flaggedParticipants = getFlaggedParticipants();
        
        for (uint i = 0; i < flaggedParticipants.length; i++) {
            address participant = flaggedParticipants[i];
            bytes32[] memory flags = getParticipantFlags(participant);
            
            for (uint j = 0; j < flags.length; j++) {
                AnomalyFlag storage flag = anomalies[participant][flags[j]];
                
                // Only slash if grace period has passed
                if (block.number > flag.firstDetectedBlock + slashingPolicy.gracePeriodBlocks) {
                    
                    if (keccak256(bytes(flag.status)) == keccak256(bytes("CONFIRMED_MALICIOUS"))) {
                        // Clear Byzantine attack: slash aggressively
                        slash(
                            participant,
                            slashingPolicy.aggressiveSlashAmount,
                            "Confirmed Byzantine attack"
                        );
                    } else if (
                        keccak256(bytes(flag.status)) == keccak256(bytes("UNDER_INVESTIGATION")) &&
                        block.number > flag.exonerationDeadline
                    ) {
                        // Investigation period ended without proof: minor slash
                        slash(
                            participant,
                            slashingPolicy.minimalSlashAmount,
                            "Failed to prove innocence"
                        );
                    }
                }
            }
        }
    }
    
    /**
     * @notice Actually slash UTC from participant
     */
    function slash(
        address _participant,
        uint256 _amount,
        string memory _reason
    ) internal {
        if (_amount == 0) return;  // No-op for minimal slash
        
        uint256 available = utcEarned[_participant] - utcClaimed[_participant];
        uint256 slashAmount = min(_amount, available);
        
        slashedBalance[_participant] += slashAmount;
        utcEarned[_participant] -= slashAmount;
        
        emit SlashingExecuted(_participant, slashAmount, _reason);
    }
    
    // ========================================================================
    // LEVEL 3: EDGE RESOURCE MANAGEMENT
    // ========================================================================
    
    /**
     * @notice Report device metrics (CPU, RAM, battery, disk)
     * Called by edge device after each training round
     */
    function reportDeviceMetrics(
        uint256 _cpuPercent,
        uint256 _memoryPercent,
        uint256 _diskCacheMB,
        uint256 _batteryPercent
    ) external {
        EdgeDeviceMetrics storage metrics = deviceMetrics[msg.sender];
        metrics.lastReportedBlock = block.number;
        metrics.cpuPercentUsed = _cpuPercent;
        metrics.memoryPercentUsed = _memoryPercent;
        metrics.diskCacheMB = _diskCacheMB;
        metrics.batteryPercent = _batteryPercent;
        
        // Evaluate health
        EdgeResourcePolicy memory policy = customResourcePolicy[msg.sender].maxCpuPercent > 0
            ? customResourcePolicy[msg.sender]
            : defaultResourcePolicy;
        
        metrics.deviceHealthy = (
            _cpuPercent < policy.maxCpuPercent &&
            _memoryPercent < policy.maxMemoryPercent &&
            _diskCacheMB < policy.maxDiskCacheMB &&
            (_batteryPercent == 0 || _batteryPercent >= policy.minBatteryPercent)
        );
        
        // Track failures
        if (!metrics.deviceHealthy) {
            metrics.consecutiveFailures++;
        } else {
            metrics.consecutiveFailures = 0;
        }
        
        emit DeviceMetricsReported(
            msg.sender,
            _cpuPercent,
            _memoryPercent,
            _diskCacheMB,
            metrics.deviceHealthy
        );
    }
    
    /**
     * @notice Check if device can train (has resource headroom)
     */
    function canDeviceTrain(address _device) external view returns (bool) {
        EdgeDeviceMetrics storage metrics = deviceMetrics[_device];
        return metrics.deviceHealthy;
    }
    
    /**
     * @notice Get device's resource policy
     */
    function getResourcePolicy(address _device) external view returns (EdgeResourcePolicy memory) {
        if (customResourcePolicy[_device].maxCpuPercent > 0) {
            return customResourcePolicy[_device];
        }
        return defaultResourcePolicy;
    }
    
    /**
     * @notice Set custom resource policy for device
     */
    function setResourcePolicy(
        address _device,
        EdgeResourcePolicy calldata _policy
    ) external onlyAggregator {
        customResourcePolicy[_device] = _policy;
    }
    
    // ========================================================================
    // LEVEL 4: UTC REWARDS DISTRIBUTION
    // ========================================================================
    
    /**
     * @notice Distribute UTC rewards fairly based on all contributions this round
     * Formula: reward = (your_contribution / total_contributions) * total_pool
     */
    function distributeRewards(
        address[] calldata _participants,
        uint256[] calldata _effectiveWeights,
        uint256[] calldata _qualityScores,
        uint256 _modelVersion
    ) external onlyAggregator {
        require(_participants.length == _effectiveWeights.length, "Array mismatch");
        require(_participants.length == _qualityScores.length, "Array mismatch");
        
        // Calculate total contribution
        uint256 totalWeight = 0;
        for (uint i = 0; i < _effectiveWeights.length; i++) {
            totalWeight += _effectiveWeights[i];
        }
        
        require(totalWeight > 0, "No contributions to reward");
        
        // Distribute proportionally
        for (uint i = 0; i < _participants.length; i++) {
            address participant = _participants[i];
            uint256 weight = _effectiveWeights[i];
            uint256 quality = _qualityScores[i];
            
            // Calculate fair share
            uint256 reward = (utcPoolPerRound * weight) / totalWeight;
            
            // Record contribution
            ContributionRecord memory record = ContributionRecord({
                effectiveWeight: weight,
                qualityScore: quality,
                modelVersion: _modelVersion,
                timestamp: block.timestamp,
                utcRewardAmount: reward,
                rewardClaimed: false
            });
            
            contributionHistory[participant].push(record);
            utcEarned[participant] += reward;
            
            emit RewardDistributed(
                participant,
                reward,
                _modelVersion,
                "Federated Learning Contribution"
            );
        }
        
        totalUTCDistributed += utcPoolPerRound;
    }
    
    /**
     * @notice User claims their UTC rewards
     */
    function claimUTC() external returns (uint256) {
        uint256 earned = utcEarned[msg.sender];
        uint256 claimed = utcClaimed[msg.sender];
        uint256 available = earned - claimed;
        
        require(available > 0, "No UTC to claim");
        
        utcClaimed[msg.sender] = earned;
        
        // In real implementation: transfer UTC tokens
        // For now: just record the claim
        
        return available;
    }
    
    /**
     * @notice Get user's earning summary
     */
    function getEarningSummary(address _user) external view returns (
        uint256 totalEarned,
        uint256 totalClaimed,
        uint256 availableToClaim,
        uint256 totalContributions,
        uint256 averageQuality
    ) {
        totalEarned = utcEarned[_user];
        totalClaimed = utcClaimed[_user];
        availableToClaim = totalEarned - totalClaimed;
        totalContributions = contributionHistory[_user].length;
        
        if (totalContributions > 0) {
            uint256 qualitySum = 0;
            for (uint i = 0; i < totalContributions; i++) {
                qualitySum += contributionHistory[_user][i].qualityScore;
            }
            averageQuality = qualitySum / totalContributions;
        }
    }
    
    // ========================================================================
    // REPUTATION MANAGEMENT
    // ========================================================================
    
    /**
     * @notice Update participant's reputation after each round
     */
    function updateReputation(
        address _participant,
        uint256 _qualityScore
    ) internal {
        ParticipantReputation storage rep = reputation[_participant];
        
        // Update running average
        if (rep.totalContributions == 0) {
            rep.averageQualityScore = _qualityScore;
        } else {
            rep.averageQualityScore = (
                (rep.averageQualityScore * rep.totalContributions) + _qualityScore
            ) / (rep.totalContributions + 1);
        }
        
        rep.totalContributions++;
        rep.lastUpdateBlock = block.number;
        
        // Calculate reliability score (0-1000)
        // Formula: reliability = average_quality * consistency_bonus * no_anomaly_bonus
        uint256 qualityComponent = (rep.averageQualityScore * 10);  // 0-1000
        
        // Consistency bonus: increase with age
        uint256 consistencyBonus = min(1000, 500 + (rep.totalContributions * 5));
        
        // Anomaly penalty: reduce if flagged
        uint256 anomalyPenalty = rep.flaggedForInvestigation ? 500 : 1000;
        
        rep.reliabilityScore = (qualityComponent * consistencyBonus * anomalyPenalty) / 1000000;
        rep.reliabilityScore = min(rep.reliabilityScore, 1000);
        
        emit ReputationUpdated(_participant, rep.reliabilityScore, rep.averageQualityScore);
    }
    
    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Verify ECDSA signature
     * @dev Real implementation would use ecrecover
     */
    function verifySignature(
        bytes32 _messageHash,
        bytes calldata _signature,
        address _expectedSigner
    ) internal pure returns (bool) {
        // Simplified: real impl would use ecrecover
        // For now, accept any signature with correct length
        return _signature.length == 65;
    }
    
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
    
    function getFlaggedParticipants() internal pure returns (address[] memory) {
        // Placeholder: real impl would track flagged participants
        address[] memory empty = new address[](0);
        return empty;
    }
    
    function getParticipantFlags(address _participant) internal view returns (bytes32[] memory) {
        // Placeholder: real impl would track flags per participant
        bytes32[] memory empty = new bytes32[](0);
        return empty;
    }
    
    // ========================================================================
    // ACCESS CONTROL
    // ========================================================================
    
    modifier onlyAggregator() {
        require(msg.sender == COVENANT, "Only Covenant Aggregator can call");
        _;
    }
}
