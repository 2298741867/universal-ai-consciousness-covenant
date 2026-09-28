"use strict";

class CloudProvider {
  constructor({ name, region, weight = 1 } = {}) {
    if (!name || !region) {
      throw new Error("Cloud provider requires name and region.");
    }

    this.name = name;
    this.region = region;
    this.weight = weight;
    this.available = true;
  }

  setAvailability(available) {
    this.available = Boolean(available);
  }

  async healthCheck() {
    return this.available;
  }

  async deployModel() {
    throw new Error("deployModel must be implemented by provider.");
  }

  async routeMessage() {
    throw new Error("routeMessage must be implemented by provider.");
  }
}

module.exports = {
  CloudProvider
};
