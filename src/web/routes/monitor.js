const express = require('express')
const Constants = require('../../Constants')

const db = require('../../database')

const router = express.Router()
const monitor = require('../../monitor')

const fetch = require('node-fetch').default

router.use((req, res, next) => {
  if (!req.session || !req.session.auth) return res.redirect('/')
  return next()
})

router.route('/:site').get(async (req, res) => {
  if (!Constants.Sites.includes(req.params.site))
    throw new Error('Site not found')
  const { rows } = await db.query(
    'select id,image,url,name,description,sku from "products" where site = $1',
    [req.params.site]
  )
  let site = monitor.getSite(req.params.site)

  rows.forEach((row) => {
    let status = site.getStatusForSKU(row.sku)
    row.status = status
  })
  res.render('pages/monitor/site', {
    site: req.params.site,
    products: rows,
  })
})
router.route('/:site/product_info').post(async (req, res) => {
  if (!Constants.Sites.includes(req.params.site))
    throw new Error('Site not found')
  if (!req.body.sku) return res.json({ success: false, message: 'No SKU' })
  let site = monitor.getSite(req.params.site)
  let product = await site.getProductInfoForSKU(req.body.sku)
  return res.json({ success: true, product })
})
router.route('/:site/add_product').post(async (req, res) => {
  if (!Constants.Sites.includes(req.params.site))
    throw new Error('Site not found')
  if (!req.body.sku) return res.json({ success: false, message: 'No SKU' })
  let site = monitor.getSite(req.params.site)
  await site.addSKU(req.body.sku)
  let product = await site.getProductInfoForSKU(req.body.sku)
  fetch(process.env.LOG_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: `Product added: [${product.name}](${product.url}) on ${req.params.site} by ${req.session.uid}`,
    }),
  })
  await db.query(
    'insert into products(site,image,url,name,description,sku) values($1,$2,$3,$4,$5,$6)',
    [
      req.params.site,
      product.image,
      product.url,
      product.name,
      product.description,
      product.sku,
    ]
  )
  req.flash(
    'positive',
    `Added product ${product.name} (${product.sku}) to monitor`
  )
  return res.redirect(`/monitor/${req.params.site}`)
})
router.route('/:site/remove_product').get(async (req, res) => {
  if (!Constants.Sites.includes(req.params.site))
    throw new Error('Site not found')
  if (!req.query.id) {
    req.flash('error', `Failed to find SKU (no ID)`)
    return res.redirect(`/monitor/${req.params.site}`)
  }
  let { rows } = await db.query(
    'select sku,name from products where site = $1 and id = $2',
    [req.params.site, req.query.id]
  )
  if (!rows || !rows[0] || !rows[0].sku) {
    req.flash('error', `Failed to find SKU`)
    return res.redirect(`/monitor/${req.params.site}`)
  }
  let sku = rows[0].sku
  let site = monitor.getSite(req.params.site)
  fetch(process.env.LOG_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: `Product **removed**: ${sku} on ${req.params.site} by ${req.session.uid}`,
    }),
  })
  await site.removeSKU(sku)
  await db.query('delete from products where site = $1 and id = $2', [
    req.params.site,
    req.query.id,
  ])
  req.flash(
    'positive',
    `Removed product ${rows[0].name} (${sku}) from monitoring`
  )
  return res.redirect(`/monitor/${req.params.site}`)
})

const WEBHOOK_REGEX =
  /https:\/\/(?:canary|ptb|www)?\.?discord\.com\/api\/webhooks\/(\d{15,19})\/([\w-_]+)/i

router.route('/:site/webhooks').get(async (req, res) => {
  if (!Constants.Sites.includes(req.params.site))
    throw new Error('Site not found')
  const { rows } = await db.query(
    'select id,webhook_id,note from "webhooks" where site = $1',
    [req.params.site]
  )

  res.render('pages/monitor/webhook', {
    site: req.params.site,
    webhooks: rows,
  })
})

router.route('/:site/webhooks/validate').post(async (req, res) => {
  if (!Constants.Sites.includes(req.params.site))
    throw new Error('Site not found')
  if (!req.body.url || typeof req.body.url !== 'string')
    return res.json({ success: false, message: 'URL invalid' })
  if (!req.body.url.match(WEBHOOK_REGEX))
    return res.json({
      success: false,
      message: 'URL invalid (not a valid Discord webhook)',
    })
  const dr = await fetch(req.body.url)
  const json = await dr.json()
  if (!json.name)
    return res.json({
      success: false,
      message: 'Webhook is invalid',
    })
  return res.json({ success: true, webhook: json })
})
router.route('/:site/webhooks/add').post(async (req, res) => {
  if (!Constants.Sites.includes(req.params.site))
    throw new Error('Site not found')
  if (!req.body.webhook || typeof req.body.webhook !== 'string')
    return res.json({ success: false, message: 'URL invalid' })
  if (!req.body.webhook.match(WEBHOOK_REGEX))
    return res.json({
      success: false,
      message: 'URL invalid (not a valid Discord webhook)',
    })
  let matches = req.body.webhook.match(WEBHOOK_REGEX)
  let note = req.body.note || ''
  note += ` (added by ${req.session.uid})`
  await db.query(
    'insert into webhooks(site,webhook_id,webhook_token,note) values($1,$2,$3,$4)',
    [req.params.site, matches[1], matches[2], note]
  )
  fetch(process.env.LOG_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: `Webhook added: ${matches[1]} on ${req.params.site} by ${req.session.uid}`,
    }),
  })
  let site = monitor.getSite(req.params.site)
  await site.refreshWebhooks()
  req.flash('positive', `Added webhook ${matches[1]} to monitor`)
  return res.redirect(`/monitor/${req.params.site}/webhooks`)
})
router.route('/:site/webhooks/test').get(async (req, res) => {
  if (!Constants.Sites.includes(req.params.site))
    throw new Error('Site not found')
  if (!req.query.id) {
    req.flash('error', 'No ID in query')
    return res.redirect(`/monitor/${req.params.site}/webhooks`)
  }
  const { rows } = await db.query(
    'select webhook_id,webhook_token from webhooks where site = $1 and id = $2',
    [req.params.site, req.query.id]
  )
  if (rows.length === 0) {
    req.flash('error', 'Webhook not found')
    return res.redirect(`/monitor/${req.params.site}/webhooks`)
  }
  let url = `https://discord.com/api/webhooks/${rows[0].webhook_id}/${rows[0].webhook_token}`
  let dr = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: `Your webhook is working for site ${req.params.site}\n~ sylv.ae`,
    }),
  })
  fetch(process.env.LOG_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: `Webhook _tested_: ${rows[0].webhook_id} on ${req.params.site} by ${req.session.uid}`,
    }),
  })
  if (dr.status >= 300 || dr.status < 200) {
    req.flash(
      'error',
      `Webhook is not working (or ratelimited by Discord), status: ${dr.status} (${dr.statusText})`
    )
  } else {
    req.flash(
      'success',
      `Webhook is working, status: ${dr.status} (${dr.statusText})`
    )
  }
  return res.redirect(`/monitor/${req.params.site}/webhooks`)
})
router.route('/:site/webhooks/remove').get(async (req, res) => {
  if (!Constants.Sites.includes(req.params.site))
    throw new Error('Site not found')
  if (!req.query.id) {
    req.flash('error', 'No ID in query')
    return res.redirect(`/monitor/${req.params.site}/webhooks`)
  }
  const { rows } = await db.query(
    'select webhook_id,webhook_token from webhooks where site = $1 and id = $2',
    [req.params.site, req.query.id]
  )
  if (rows.length === 0) {
    req.flash('error', 'Webhook not found')
    return res.redirect(`/monitor/${req.params.site}/webhooks`)
  }
  await db.query('delete from webhooks where site = $1 and id = $2', [
    req.params.site,
    req.query.id,
  ])
  let site = monitor.getSite(req.params.site)
  await site.refreshWebhooks()
  fetch(process.env.LOG_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: `Webhook **removed**: ${rows[0].webhook_id} on ${req.params.site} by ${req.session.uid}`,
    }),
  })
  req.flash('positive', `Removed webhook ${rows[0].webhook_id} from monitor`)
  return res.redirect(`/monitor/${req.params.site}/webhooks`)
})
module.exports = router
