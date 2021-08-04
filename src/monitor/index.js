const Site = require('./sites/Site')

class Monitor {
  constructor() {
    this.sites = []
    this.registerSites()
  }
  registerSite(site) {
    this.sites.push(site)
  }
  registerSites() {
    this.registerSite(new (require('./sites/bestbuy_ca'))())
  }

  /**
   * Get site class instance
   * @param {string} site
   * @returns {Site}
   */
  getSite(siteName) {
    return this.sites.find((site) => site.name === siteName)
  }
}

module.exports = new Monitor()
