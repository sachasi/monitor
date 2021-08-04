const express = require('express')
const expressLayouts = require('express-ejs-layouts'),
  bodyParser = require('body-parser'),
  path = require('path')
const qs = require('qs')

const fetch = require('node-fetch').default

const session = require('express-session'),
  RedisStore = require('connect-redis')(session)

const db = require('../database')
const cache = require('../redis')

const app = express()
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(
  session({
    store: new RedisStore({
      client: cache.redis,
    }),
    saveUninitialized: false,
    secret: process.env.SECRET,
    resave: false,
  })
)
app.use(require('cookie-parser')(process.env.SECRET))
app.use(require('connect-flash')())
app.use((req, res, next) => {
  res.locals = res.locals || {}
  res.locals.m = req.query.m || ''
  res.locals.messages = req.flash()
  return next()
})

app.use(expressLayouts)

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '..', 'views'))
app.enable('trust proxy')
app.set('layout', 'layout.ejs')
app.enable('layout extractMetas')
app.enable('layout extractScripts')
app.enable('layout extractStyles')

app.use('/monitor', require('./routes/monitor'))

function getRedirectURI() {
  return `${process.env.BASE_URL}/discord/redirect`
}
function getScopes() {
  return 'identify'
}

const WHITELIST = process.env.WHITELIST.split(/, ?/)

app.get('/', (req, res) => {
  res.render('pages/index.ejs')
})
app.get('/login', (req, res) => {
  res.redirect(
    `https://discord.com/api/oauth2/authorize?client_id=${
      process.env.DISCORD_CLIENT_ID
    }&redirect_uri=${getRedirectURI()}&response_type=code&scope=${getScopes()}`
  )
})
app.get('/discord/redirect', async (req, res) => {
  let code = req.query.code
  if (!code) return res.redirect('/login')
  let r = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: qs.stringify({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectURI(),
    }),
  })
  let j = await r.json()
  let token = `${j.token_type} ${j.access_token}`
  let mer = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: token,
    },
  })
  let me = await mer.json()
  req.session.uid = me.id
  if (!WHITELIST.includes(req.session.uid))
    return res.send('your account is not whitelisted')
  req.session.auth = true
  return res.redirect('/monitor/bestbuy_ca')
})

app.listen(3000)
