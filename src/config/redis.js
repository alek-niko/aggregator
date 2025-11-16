/**
 * @module config.redis
 * @description Redis Pub/Sub clients for scalable inter-service messaging.
 *
 * This module provides separate Redis clients for publishing and subscribing:
 * - `publisher` is used to send messages to channels.
 * - `subscriber` is used to receive messages from channels.
 *
 * Features:
 * ---------
 *  - Supports multiple services subscribing/publishing to the same channels.
 *  - Event listeners for connection and error monitoring.
 *  - Easy to extend with additional Redis options (password, db, etc.).
 *
 * @example
 * --------------
 * import { publisher, subscriber } from '../config/redisPubSub.js';
 *
 * // Publish a message
 * await publisher.publish('some-channel', 'Hello, world!');
 *
 * // Subscribe to a channel
 * subscriber.on('message', (channel, message) => {
 *   console.log(`Received message from ${channel}: ${message}`);
 * });
 */

import Redis from 'ioredis';

// Redis configuration for Pub/Sub (environment variables override defaults)
const redisConfig = {
	host: process.env.REDIS_PUBSUB_HOST || 'localhost',     // Redis host (default: localhost)
	port: process.env.REDIS_PUBSUB_PORT || 6379,            // Redis port (default: 6379)
};

/**
 * Redis client instances
 *
 * - `publisher`: sends messages to channels
 * - `subscriber`: listens for messages from channels
 */
const publisher = new Redis(redisConfig);
const subscriber = new Redis(redisConfig);


// -----------------------------
// Publisher Event Listeners
// -----------------------------
publisher.on('connect', () => {
    console.log(`[Redis: Publisher] Connected to ${redisConfig.host}:${redisConfig.port}`);
});

publisher.on('error', (err) => {
    console.error(`[Redis: Publisher] Connection error @ ${redisConfig.host}:${redisConfig.port} - ${err.message}`);
});

// -----------------------------
// Subscriber Event Listeners
// -----------------------------
subscriber.on('connect', () => {
    console.log(`[Redis: Subscriber] Connected to ${redisConfig.host}:${redisConfig.port}`);
});

subscriber.on('error', (err) => {
    console.error(`[Redis: Subscriber] Connection error @ ${redisConfig.host}:${redisConfig.port} - ${err.message}`);
});


export { publisher, subscriber };