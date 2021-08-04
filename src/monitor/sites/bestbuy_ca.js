const Site = require('./Site'),
  fetch = require('node-fetch').default

const cache = require('../../redis')

const stockClr = 0x40c057
const STATUS_MAP = {
  ComingSoon: 0xfa5252,
  SoldOutOnline: 0xfa5252,
  InStockOnlineOnly: stockClr,
  InStock: stockClr,
}
const getColorForStatus = (status) => {
  return STATUS_MAP[status] ?? 0x5c7cfa
}
const statusInStock = (status) => (STATUS_MAP[status] ?? 0) === stockClr

module.exports = class BestBuyCASite extends Site {
  constructor() {
    super('bestbuy_ca')
    this.delay = 800
  }
  async getProductInfoForSKU(sku) {
    let res = await fetch(
      `https://api.bazaarvoice.com/data/products.json?passkey=ca56StNjkMTqvaQE5CE0wn1rAjkeCQZWzJEMeNfcAN1c8&apiversion=5.5&displaycode=18193-en_ca&filter=id%3Aeq%3A${sku}&limit=1`
    )
    let json = await res.json()
    let result = json.Results[0]
    let product = {}
    if (!result || !result.Id) {
      product = {
        sku: sku,
        name: sku,
        description: '?',
        image:
          'https://cdn.discordapp.com/attachments/797896535303389215/841376470844309574/questionmark.png',
        url: `https://www.bestbuy.ca/en-ca/product/~/${sku}`,
      }
    } else {
      product = {
        sku: result.Id,
        name: result.Name,
        description: result.Description,
        image: result.ImageUrl,
        url: result.ProductPageUrl,
      }
    }
    return product
  }
  async postToWebhook(productInfo, status, stock) {
    let now = new Date()

    let inStock = stock > 0 || statusInStock(status)
    //let urls = inStock ? WEBHOOK_URLS_STOCK : WEBHOOK_URLS_UNFILTERED
    let urls = this.webhooks
    urls.forEach((webhook) => {
      fetch(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: `(${this.name}) **Product status change** - [${productInfo.name}](${productInfo.url})`,
          embeds: [
            {
              title: productInfo.name,
              url: productInfo.url,
              color: getColorForStatus(status),
              fields: [
                {
                  name: 'Status',
                  value: status,
                  inline: true,
                },
                {
                  name: 'Stock Remaining',
                  value: stock.toString(),
                  inline: true,
                },
              ],
              footer: {
                text: 'sylv.ae',
              },
              timestamp: now.toISOString(),
              thumbnail: {
                url: productInfo.image,
              },
            },
          ],
          username: this.name,
        }),
      })
    })
  }
  async poll() {
    const res = await fetch(
      `https://www.bestbuy.ca/ecomm-api/availability/products?accept=application%2Fvnd.bestbuy.standardproduct.v1%2Bjson&accept-language=en-CA&locations=&postalCode=&skus=${this.runningSkus.join(
        '|'
      )}`,
      {
        headers: {
          'User-Agent': this.getUserAgent(),
        },
      }
    )
    const text = await res.text()
    const json = JSON.parse(text.substr(1))
    let availabilities = json.availabilities
    console.log(res.status, text)
    for (let obj of availabilities) {
      let sku = obj.sku
      let cached = await cache.hall(`bestbuy_ca.product:${sku}`, {
        status: 'Unknown',
        stock: 0,
      })
      cached.stock = parseInt(cached.stock)
      let status = obj.shipping.status,
        stock = obj.shipping.quantityRemaining
      if (
        (cached.status !== status || cached.stock !== stock) &&
        status !== 'Unknown'
      ) {
        // post to webhook
        console.log('Posting to webhook ig')
        this.postToWebhook(this.productInfo[sku], status, stock)
      }
      this.skuStatus[sku] = { status, stock }
      if (status !== 'Unknown')
        await cache.hset(`bestbuy_ca.product:${sku}`, { status, stock })
    }
  }
}
