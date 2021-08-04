const { Client, Pool } = require('pg').native
const pool = new Pool()

module.exports = pool
