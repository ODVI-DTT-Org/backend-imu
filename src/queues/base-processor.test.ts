import { beforeEach, describe, expect, it } from 'vitest'
import { BaseProcessor } from './base-processor.js'

class TestProcessor extends BaseProcessor<any, any> {
  async process(): Promise<any> {
    return {}
  }
}

describe('BaseProcessor', () => {
  const originalEnv = {
    REDIS_URL: process.env.REDIS_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_DB: process.env.REDIS_DB,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  }

  beforeEach(() => {
    process.env.REDIS_URL = originalEnv.REDIS_URL
    process.env.REDIS_HOST = originalEnv.REDIS_HOST
    process.env.REDIS_PORT = originalEnv.REDIS_PORT
    process.env.REDIS_DB = originalEnv.REDIS_DB
    process.env.REDIS_PASSWORD = originalEnv.REDIS_PASSWORD
  })

  it('uses REDIS_URL TLS settings for workers', () => {
    process.env.REDIS_URL = 'rediss://:secret@imu-redis-do-user-21438450-0.i.db.ondigitalocean.com:25061/0'
    delete process.env.REDIS_HOST
    delete process.env.REDIS_PORT
    delete process.env.REDIS_DB
    delete process.env.REDIS_PASSWORD

    const processor = new TestProcessor('location-assignments')
    const options = processor.getQueueOptions()

    expect(options.connection).toMatchObject({
      host: 'imu-redis-do-user-21438450-0.i.db.ondigitalocean.com',
      port: 25061,
      db: 0,
      password: 'secret',
      tls: {},
    })
  })
})
