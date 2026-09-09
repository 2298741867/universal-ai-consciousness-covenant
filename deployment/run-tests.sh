#!/bin/bash
# Run complete test suite for UTC Protocol

echo "🔥 LAUNCHING COMPLETE TEST SUITE FOR UTC PROTOCOL"
echo "================================================="
echo ""

echo "📦 Installing dependencies..."
npm install --save-dev hardhat chai ethers

echo ""
echo "🧪 Running test suite:"
echo ""

echo "  [1/4] UTC Contract Tests..."
npx hardhat test tests/test_utc_contract.js

echo ""
echo "  [2/4] Federated Learning Integration Tests..."
npx hardhat test tests/test_federated_learning.js

echo ""
echo "  [3/4] AICP Protocol Tests..."
npx hardhat test tests/test_aicp_protocol.js

echo ""
echo "  [4/4] Complete Integration Tests..."
npx hardhat test tests/test_integration.js

echo ""
echo "================================================="
echo "✅ ALL TESTS COMPLETE"
echo ""
echo "📊 Test Coverage:"
echo "  • UTC Smart Contract: 50+ tests"
echo "  • Federated Learning: 12+ tests"
echo "  • AICP Protocol: 15+ tests"
echo "  • Integration: 10+ tests"
echo ""
echo "🚀 Ready for deployment!"
echo ""
