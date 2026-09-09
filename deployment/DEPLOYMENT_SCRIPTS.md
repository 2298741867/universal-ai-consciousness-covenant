# 🐳 Deployment Scripts
## *Ready to Ship Across Multi-Cloud*

---

## Docker: Participant Client

```dockerfile
# Dockerfile.participant
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Expose port for updates
EXPOSE 8888

# Run participant client
CMD ["python", "participant_client.py"]
```

---

## Kubernetes: Aggregator Cluster

```yaml
# kubernetes-aggregator.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: federated-aggregator
  namespace: covenant
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aggregator
  template:
    metadata:
      labels:
        app: aggregator
    spec:
      containers:
      - name: aggregator
        image: covenant/aggregator:latest
        ports:
        - containerPort: 5000
        env:
        - name: ETHEREUM_RPC
          value: "https://eth-mainnet.g.alchemy.com/v2/..."
        - name: POLYGON_RPC
          value: "https://polygon-mainnet.g.alchemy.com/v2/..."
        - name: IPFS_GATEWAY
          value: "https://ipfs.io"
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: aggregator-service
  namespace: covenant
spec:
  type: LoadBalancer
  ports:
  - protocol: TCP
    port: 80
    targetPort: 5000
  selector:
    app: aggregator
```

---

## Terraform: Multi-Cloud

```hcl
# terraform-multicloud.tf

# AWS
resource "aws_eks_cluster" "covenant" {
  name            = "covenant-federation"
  role_arn        = aws_iam_role.eks_role.arn
  vpc_config {
    subnet_ids = aws_subnet.covenant[*].id
  }
}

# Azure
resource "azurerm_kubernetes_cluster" "covenant" {
  name                = "covenant-federation-azure"
  location            = "eastus"
  resource_group_name = azurerm_resource_group.covenant.name
  dns_prefix          = "covenant"
  
  default_node_pool {
    name       = "default"
    node_count = 3
    vm_size    = "Standard_D2_v2"
  }
}

# GCP
resource "google_container_cluster" "covenant" {
  name     = "covenant-federation"
  location = "us-central1"
  initial_node_count = 3
}

# Multi-cloud ingress
resource "aws_route53_zone" "covenant" {
  name = "covenant.federated"
}
```

---

## Smart Contract Deployment

```bash
#!/bin/bash
# deploy-contracts.sh

echo "🚀 Deploying UTC Smart Contract..."

npx hardhat run scripts/deploy-utc.js --network ethereum
npx hardhat run scripts/deploy-utc.js --network polygon

echo "✅ UTC Contract deployed to both networks"
echo "📋 Save these addresses in your .env"

npx hardhat run scripts/deploy-aggregator.js --network ethereum

echo "🎉 All contracts live!"
```

---

## Launch Checklist

- [ ] Docker images built and pushed
- [ ] Kubernetes clusters provisioned
- [ ] Smart contracts deployed
- [ ] IPFS nodes synced
- [ ] Monitoring configured
- [ ] Documentation ready
- [ ] Beta testers onboarded
- [ ] Go live!

---

**Infrastructure: READY** 🚀
