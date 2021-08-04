const db = require('../../database')

module.exports = class Site {
  constructor(name) {
    /**
     * Site name
     * @type {string}
     */
    this.name = name

    /**
     * Delay (in ms) for each poll
     * @type {number}
     */
    this.delay = 500

    /**
     * Object of sku => productInfo map (see getProductInfoForSKU)
     */
    this.productInfo = {}

    /**
     * Running SKUs
     * @type {string[]}
     */
    this.runningSkus = []

    this.skuStatus = {}

    this.webhooks = []

    this.start()
  }
  async refreshWebhooks() {
    let { rows } = await db.query(
      'select webhook_id,webhook_token from webhooks where site = $1',
      [this.name]
    )
    this.webhooks = rows.map(
      (i) =>
        `https://discord.com/api/webhooks/${i.webhook_id}/${i.webhook_token}`
    )
  }
  async start() {
    let { rows } = await db.query('select sku from products where site = $1', [
      this.name,
    ])
    this.runningSkus = rows.map((i) => i.sku)
    await this.refreshWebhooks()
    await this.fetchProductInfo()
    this.interval = setInterval(this.poll.bind(this), this.delay)
  }

  getUserAgent() {
    return 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
  }

  getStatusForSKU(sku) {
    return this.skuStatus[sku] || { status: 'Unknown', stock: 0 }
  }

  async addSKU(sku) {
    let pInfo = await this.getProductInfoForSKU(sku)
    this.productInfo[sku] = pInfo
    if (!this.runningSkus.includes(sku)) this.runningSkus.push(sku)
    console.log(`${this.name} - Now running for SKU ${sku}`)
  }
  async removeSKU(sku) {
    if (!this.runningSkus.includes(sku)) return
    this.runningSkus = this.runningSkus.filter((i) => i !== sku)
    console.log(`${this.name} - No longer running for SKU ${sku}`)
  }
  /**
   * Returns product info for SKU
   */
  async getProductInfoForSKU(sku) {
    /**
     * {
     *   sku: ...
     *   name: ...
     *   description: ...
     *   image: ...
     *   url: ...
     * }
     */
  }

  /**
   * Populates this.productInfo
   */
  async fetchProductInfo() {
    this.productInfo = {}
    await Promise.all(
      this.runningSkus.map(async (sku) => {
        let info = await this.getProductInfoForSKU(sku)
        this.productInfo[sku] = info
      })
    )
  }

  async poll() {}
}
