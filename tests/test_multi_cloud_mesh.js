"use strict";

const { expect } = require("chai");
const { CloudProvider } = require("../core/multi-cloud-mesh/cloud-provider");
const { AWSConnector } = require("../core/multi-cloud-mesh/aws-connector");
const { AzureConnector } = require("../core/multi-cloud-mesh/azure-connector");
const { GCPConnector } = require("../core/multi-cloud-mesh/gcp-connector");
const { MeshRouter } = require("../core/multi-cloud-mesh/mesh-router");

describe("Multi-Cloud Mesh", function () {
  it("enforces abstract provider methods", async function () {
    const provider = new CloudProvider({ name: "test", region: "local" });
    let deployError;
    let routeError;

    try {
      await provider.deployModel("model");
    } catch (error) {
      deployError = error;
    }

    try {
      await provider.routeMessage({});
    } catch (error) {
      routeError = error;
    }

    expect(deployError.message).to.equal("deployModel must be implemented by provider.");
    expect(routeError.message).to.equal("routeMessage must be implemented by provider.");
  });

  it("reports provider health based on availability", async function () {
    const provider = new AWSConnector();
    expect(await provider.healthCheck()).to.equal(true);
    provider.setAvailability(false);
    expect(await provider.healthCheck()).to.equal(false);
  });

  it("routes AICP messages across 3 cloud providers", async function () {
    const router = new MeshRouter();
    router.registerProvider(new AWSConnector({ weight: 1 }));
    router.registerProvider(new AzureConnector({ weight: 1 }));
    router.registerProvider(new GCPConnector({ weight: 1 }));

    const message = { intent: "submit_gradient_update", payload: { gradientHash: "Qm123" } };
    const seen = new Set();

    for (let i = 0; i < 6; i += 1) {
      const result = await router.routeAICPMessage(message);
      seen.add(result.selectedProvider);
    }

    expect(seen.has("aws")).to.equal(true);
    expect(seen.has("azure")).to.equal(true);
    expect(seen.has("gcp")).to.equal(true);
  });

  it("supports weighted routing", async function () {
    const router = new MeshRouter();
    router.registerProvider(new AWSConnector({ weight: 3 }));
    router.registerProvider(new AzureConnector({ weight: 2 }));
    router.registerProvider(new GCPConnector({ weight: 1 }));

    const message = { intent: "observe_round" };
    const sequence = [];

    for (let i = 0; i < 6; i += 1) {
      const result = await router.routeAICPMessage(message);
      sequence.push(result.selectedProvider);
    }

    expect(sequence).to.deep.equal(["aws", "aws", "aws", "azure", "azure", "gcp"]);
  });

  it("fails over when one provider is unavailable", async function () {
    const router = new MeshRouter();
    const aws = new AWSConnector({ weight: 1 });
    const azure = new AzureConnector({ weight: 1 });
    const gcp = new GCPConnector({ weight: 1 });

    azure.setAvailability(false);

    router.registerProvider(aws);
    router.registerProvider(azure);
    router.registerProvider(gcp);

    const seen = new Set();
    for (let i = 0; i < 6; i += 1) {
      const result = await router.routeAICPMessage({ intent: "route" });
      seen.add(result.selectedProvider);
    }

    expect(seen.has("azure")).to.equal(false);
    expect(seen.has("aws") || seen.has("gcp")).to.equal(true);
  });

  it("throws when no providers are healthy", async function () {
    const router = new MeshRouter();
    const aws = new AWSConnector();
    aws.setAvailability(false);
    router.registerProvider(aws);

    let error;
    try {
      await router.routeAICPMessage({ intent: "route" });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error.message).to.equal("No healthy cloud providers available.");
  });

  it("treats rejected health checks as unhealthy and continues", async function () {
    const router = new MeshRouter();
    const healthy = new AWSConnector();
    const unhealthy = new AzureConnector();
    unhealthy.healthCheck = async () => {
      throw new Error("probe timeout");
    };

    router.registerProvider(healthy);
    router.registerProvider(unhealthy);

    const result = await router.routeAICPMessage({ intent: "route" });
    expect(result.selectedProvider).to.equal("aws");
  });

  it("fails over when selected provider route operation rejects", async function () {
    const router = new MeshRouter();
    const aws = new AWSConnector({ weight: 1 });
    const azure = new AzureConnector({ weight: 1 });

    aws.routeMessage = async () => {
      throw new Error("transient route failure");
    };

    router.registerProvider(aws);
    router.registerProvider(azure);

    const result = await router.routeAICPMessage({ intent: "route" });
    expect(result.selectedProvider).to.equal("azure");
  });

  it("deploys a model to all healthy providers", async function () {
    const router = new MeshRouter();
    const aws = new AWSConnector();
    const azure = new AzureConnector();
    const gcp = new GCPConnector();

    gcp.setAvailability(false);

    router.registerProvider(aws);
    router.registerProvider(azure);
    router.registerProvider(gcp);

    const deployment = await router.deployModelEverywhere("covenant-model-v1");

    expect(deployment.deployedProviders).to.deep.equal(["aws", "azure"]);
    expect(deployment.deployments).to.have.lengthOf(2);
    expect(deployment.deployments[0].endpoint).to.include("covenant-model-v1");
  });
});
