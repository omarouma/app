'use strict';

const Redis = require('ioredis');
const crypto = require('crypto');

class RedisBus {
  constructor(url, namespace = 'gagachat') {
    this.instanceId = crypto.randomUUID();
    this.channel = `${namespace}:realtime`;
    const options = { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 2, connectTimeout:8000, commandTimeout:8000 };
    this.publisher = new Redis(url, options);
    this.subscriber = new Redis(url, options);
    this.ready = false;
    for (const connection of [this.publisher,this.subscriber]) {
      connection.on('error', () => { this.ready = false; });
      connection.on('close', () => { this.ready = false; });
      connection.on('ready', () => {
        this.ready = this.publisher.status === 'ready' && this.subscriber.status === 'ready';
      });
    }
  }

  async start(onEvent) {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
    await this.subscriber.subscribe(this.channel);
    this.subscriber.on('message', (_channel, encoded) => {
      try {
        const envelope = JSON.parse(encoded);
        if (envelope.origin !== this.instanceId) onEvent(envelope.user_id, envelope.event);
      } catch (_) { /* Reject malformed bus events. */ }
    });
    this.ready = true;
  }

  async publish(userId, event) {
    if (!this.ready) return false;
    await this.publisher.publish(this.channel, JSON.stringify({
      origin: this.instanceId, user_id: userId, event
    }));
    return true;
  }

  async setPresence(userId, ttlSeconds = 75) {
    if (!this.ready) return;
    await this.publisher.set(`${this.channel}:presence:${userId}`, this.instanceId, 'EX', ttlSeconds);
  }

  async close() {
    this.ready = false;
    await Promise.allSettled([this.subscriber.quit(), this.publisher.quit()]);
  }
}

module.exports = { RedisBus };
