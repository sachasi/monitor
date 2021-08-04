const redis = require('redis')
const EventEmitter = require('eventemitter3')

class RedisCache extends EventEmitter {
  constructor() {
    super()
    this.redis = redis.createClient({
      auth_pass: process.env.REDIS_AUTHPASS,
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    })
    this.redis.on('error', (err) => {
      console.error('Redis error:', err)
      this.emit('error', err)
    })
    this.ttl = 10
  }

  async hset(hash, kv) {
    return new Promise((resolve, reject) => {
      this.redis.hmset(hash, Object.entries(kv).flat(), (err, res) => {
        if (err) return reject(err)
        //this.redis.expire(hash, this.ttl)
        resolve(res)
      })
    })
  }
  async hget(hash, field) {
    return new Promise((resolve, reject) => {
      this.redis.hget(hash, field, (err, res) => {
        if (err) return reject(err)
        resolve(res)
      })
    })
  }
  async hall(hash, def) {
    return new Promise((resolve, reject) => {
      this.redis.hgetall(hash, (err, res) => {
        if (err) return reject(err)
        resolve(res || def)
      })
    })
  }
}

const cache = new RedisCache()
module.exports = cache
