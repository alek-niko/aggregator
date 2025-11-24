/**
 * @module rss.aggregator
 * @description This module exports the main class {@link Aggregator},
 * 				which is responsible for the core functions of the RSS feed processing system.
 * 				It coordinates feed fetching, database persistence, and real-time messaging
 * 				via Redis Pub/Sub.
 */

'use strict';

import * as dbError from '../models/error.js' // Keep for direct error logging
import FeedEmitter from './FeedEmitter.js';
import ItemService from '../services/ItemService.js';
import { publisher, subscriber } from '../config/redis.js';

/**
 * @class Aggregator
 * @description The main class responsible for orchestrating RSS feed aggregation.
 * 				It manages the FeedEmitter, handles database persistence via ItemService,
 * 				and uses Redis Pub/Sub for communication and control.
 */
class Aggregator {

	/**
	 * @constant {number} MAX_CONSECUTIVE_FAILURES - The maximum number of consecutive transient errors before a feed is permanently disabled.
	 */
	static MAX_CONSECUTIVE_FAILURES = 5;

	/**
	 * @constructor
	 * @description Initializes a new instance of the Aggregator.
	 * Sets up the FeedEmitter, service layer access, Redis clients, and event handlers.
	 */
	constructor() {
		/**
		 * @property {FeedEmitter} feedEmitter - The instance of the underlying feed-monitoring library.
		 */
		this.feedEmitter = new FeedEmitter({
			// Custom user agent to identify the aggregator client during fetches.
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'
		});

		/**
		 * @property {Map<number, object>} failureTracker - Tracks consecutive failures for each feed ID.
		 * The structure is: { feedId: { count: number, originalInterval: number } }
		 */
		this.failureTracker = new Map();

		this.itemService = new ItemService();
		this.publisher = publisher

		this.initializeEventHandlers();
	}

	/**
	 * @method start
	 * @description Starts the RSS Aggregator by calling FeedEmitter's internal initialization.
	 *
	 * @returns {Promise<void>}
	 */
	async start() {

		console.log('Starting RSS Aggregator...');

		try {
			// Emitter fetches feeds from the DB and starts their polling intervals.
			const feedCount = await this.feedEmitter.init();

			console.log(`Successfully started monitoring ${feedCount} feeds.`);

		} catch (error) {
			console.error('FATAL: Failed to initialize/start aggregator:', error);
			// Re-throw or exit, as the core functionality is disabled without feeds.
			throw error;
		}
	}

	/**
	 * @method initializeEventHandlers
	 * @description Sets up all event handlers for feed events, Redis Pub/Sub control, and process stability.
	 */
	initializeEventHandlers() {

		// Handle new RSS items
		this.feedEmitter.on('new-item', item => this.handleNewItem(item));

		// Handle errors
		this.feedEmitter.on('error', error => this.handleError(error));

		// Subscribe to the aggregator channel for control commands (add/remove feeds).
		subscriber.subscribe('aggregator', (err, count) => this.handleRedisSubscription(err, count));

		// Handle incoming messages on all subscribed channels.
		subscriber.on("message", (channel, data) => this.handleRedisMessage(channel, data));

		process.on('unhandledRejection', (reason, promise) => this.handleUnhandledRejection(reason, promise));

		// Process Stability & Shutdown Handlers

		// Communication handler (e.g., for cluster messages)
		process.on('message', this.handleProcessMessage);

		// Graceful Shutdown Handlers (SIGTERM/SIGINT)
		process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
		process.on('SIGINT', () => this.handleShutdown('SIGINT'));

		// Exit Handler (Final cleanup logging)
		process.on('exit', () => console.log('[instance] Instance terminated.'));

		// Critical Error Handlers (Ensure immediate exit after corruption)
		process.on('uncaughtException', err => this.handleUncaughtException(err));
		process.on('unhandledRejection', (reason, promise) => this.handleUnhandledRejection(reason, promise));
	}

	/**
	 * @method handleNewItem
	 * @description Handles a new RSS item received by the feed emitter.
	 * 				Saves the item to the database using ItemService and publishes it to Redis.
	 *
	 * @param {Object} item - The RSS item data, including 'website' (feedId).
	 * @returns {Promise<void>}
	 */
	async handleNewItem(item) {

		try {
			// ItemService.insert handles database insertion and returns the new ID.
			const id = await this.itemService.insert(item);
			item.id = id;

			// Publish the item to the category-specific Redis channel.
			this.publisher.publish(
				`feed:wire:${item.category}`,
				JSON.stringify({
					event: `feed:wire:${item.category}`,
					data: item
				})
			);

			// Clear backoff tracking as the item fetch/save was successful.
			this.failureTracker.delete(item.website);

		} catch (error) {

			// Log the save error using the direct database error logger (dbError.log).
			console.error('Error saving news item and publishing:', error);

			dbError.log({
				type: error.name || 'item_save_error',
				message: error.message,
				feed_id: item.website ?? null, // Ensure null coercion
			}).catch(e => console.error('CRITICAL: Failed to log error to DB:', e));
		}
	}

	/**
	 * @method handleProcessMessage
	 * @description Handles incoming messages from the parent process (IPC).
	 * 				Supported commands: 'reload'
	 * 
	 * @param {string | object} message - The incoming IPC message.
	 * @returns {void}
	 */
	handleProcessMessage(message) {

		if (typeof message === 'object' && message.command) {
			switch (message.command) {
				case 'reload':
					// Command to reload the feed configuration from the database
					console.log(`[IPC] Received 'reload' command. Initiating feed refresh.`);
					this.feedEmitter.reloadFeeds();
					break;
				default:
					console.warn(`[IPC] Received unknown command: ${message.command}`);
			}
		}
	}

	/**
	 * @method handleShutdown
	 * @description Initiates a graceful shutdown of the process.
	 * 				Cleans up resources like Redis client connections and stops all feed intervals.
	 * 
	 * @param {string} signalOrReason - The signal (SIGINT/SIGTERM) or reason (CRITICAL_ERROR).
	 * @returns {void}
	 */
	handleShutdown(signalOrReason) {

		console.warn(`[SHUTDOWN] Initiating graceful shutdown due to: ${signalOrReason}`);

		// Stop all polling intervals in the emitter
		this.feedEmitter.destroy();

		// Publish a shutdown notice (optional, good for monitoring)
		this.publisher.publish(
			'aggregator-status',
			JSON.stringify({ status: 'shutdown', reason: signalOrReason, pid: process.pid })
		);

		// Close the Redis client connections
		if (this.publisher && typeof this.publisher.quit === 'function') {
			this.publisher.quit();
		}

		// Exit the process gracefully
		process.exit(0);
	}

	/**
	 * @method handleError
	 * @description Handles errors that occur during feed processing (e.g., fetch, parse errors).
	 * 				Logs the error and implements exponential backoff for transient errors.
	 *
	 * @param {FeedError} error - The feed error object.
	 * @returns {Promise<void>}
	 */
	async handleError(error) {

		// Publish for real-time monitoring
		const dataToPublish = (typeof error.toJSON === 'function')
			? error.toJSON() // Use custom method if available (i.e., if it's a FeedError)
			: {
				name: error.name || 'UnknownError',
				message: error.message,
				feed: error.feed ?? null,
				feedId: error.feedId ?? null
			};

		// Publish for real-time monitoring
		this.publisher.publish('aggregator-errors', JSON.stringify(dataToPublish));

		// Log to console
		console.error(`[${error.name}] ${error.message}`, { feed: error.feed, id: error.feedId });

		const isTransientError = ['fetch_url_error', 'parse_url_error'].includes(error.name);
		const isCriticalError = ['db_connect_error', 'redis_error'].includes(error.name);

		// Handle Transient Errors (Backoff Logic)
		if (isTransientError && error.feedId && error.feed) {

			// This method returns a running Feed instance containing the current config.
			const feedConfig = this.feedEmitter.getFeedConfig(error.feed);

			if (feedConfig) {
				// Ensure backoff/removal is completed before proceeding.
				await this.handleFeedFailure(error.feedId, error.feed, feedConfig.refresh);
			} else {
				console.warn(`[WARNING] Could not find running feed config for ID ${error.feedId}. Skipping backoff.`);
			}

			// Handle Critical Errors (Shutdown Logic)
		} else if (isCriticalError) {

			console.error('CRITICAL SYSTEM ERROR DETECTED. Shutting down.', error);

			// Log the critical error to the database BEFORE shutting down
			await dbError.log({
				type: error.name || 'critical_error',
				message: error.message,
				feed_id: error.feedId ?? null, // Ensure null coercion
			}).catch(e => console.error('CRITICAL: Failed to log error to DB during shutdown:', e));

			this.handleShutdown('CRITICAL_ERROR');

			// Handle Other Errors (Clear tracking if they succeed on the next run)
		} else {

			// Log the error to the database for audit
			await dbError.log({
				type: error.name || 'internal_error',
				message: error.message,
				feed_id: error.feedId ?? null, // FIX: Used feed_id and null coercion.
			}).catch(e => console.error('CRITICAL: Failed to log error to DB during internal failure:', e));

			// Clear tracking if it was a successful fetch but failed in processing.
			this.failureTracker.delete(error.feedId);
		}
	}

	/**
	 * @method handleFeedFailure
	 * @description Implements exponential backoff for a feed that has failed a transient operation.
	 * 				If the failure threshold is reached, the feed is removed permanently.
	 * 
	 * @param {number} feedId - The ID of the feed that failed.
	 * @param {string} feedUrl - The URL of the feed (needed for removal).
	 * @param {number} originalInterval - The base polling interval in ms.
	 * @returns {Promise<void>}
	 */
	async handleFeedFailure(feedId, feedUrl, originalInterval) {
		const tracking = this.failureTracker.get(feedId) || { count: 0, originalInterval };

		tracking.count += 1;
		this.failureTracker.set(feedId, tracking);

		// Check if the maximum failure threshold is reached
		if (tracking.count >= Aggregator.MAX_CONSECUTIVE_FAILURES) {
			// PERMANENT REMOVAL: Log as permanently failed and remove.
			console.error(`[FATAL FEED] Feed ID ${feedId} (${feedUrl}) permanently disabled after ${Aggregator.MAX_CONSECUTIVE_FAILURES} consecutive failures.`);

			// Remove the feed from the emitter to stop all retries and delete from DB.
			await this.feedEmitter.remove(feedUrl); // This is now an async operation
			this.failureTracker.delete(feedId);

			// Publish the permanent failure for external monitoring
			this.publisher.publish(
				'aggregator-errors',
				JSON.stringify({
					type: 'permanent_failure',
					feedId,
					feedUrl,
					message: `Permanently disabled after ${tracking.count} consecutive failures.`
				})
			);

			// Log the permanent removal reason to the database error log
			await dbError.log({
				type: 'permanent_failure',
				message: `Feed disabled due to ${tracking.count} consecutive failures.`,
				feed_id: feedId, // Use feed_id (snake_case)
			});

			return;
		}

		// Exponential Backoff Calculation
		// New interval = Original Interval * 2^(count - 1), capped at 24 hours.
		const multiplier = Math.pow(2, tracking.count - 1);
		const MAX_INTERVAL_MS = 86400000; // 24 hours
		const newInterval = Math.min(originalInterval * multiplier, MAX_INTERVAL_MS);

		console.warn(
			`[FEED FAILURE ${tracking.count}/${Aggregator.MAX_CONSECUTIVE_FAILURES}] ` +
			`Feed ID ${feedId} (${feedUrl}) failed. New interval set to ${newInterval / 60000} minutes.`
		);

		// Update the feed's interval in the Emitter
		await this.feedEmitter.updateInterval(feedUrl, newInterval);
	}

	/**
	 * @method handleRedisSubscription
	 * @description Handles the result of subscribing to a Redis channel.
	 *
	 * @param {?Error} err - Error object if the subscription fails.
	 * @param {number} count - Number of channels currently subscribed to by this client.
	 * @returns {void}
	 */
	handleRedisSubscription(err, count) {
		if (err) {
			console.error('Failed to subscribe to Redis control channel:', err);
		} else {
			console.log(`Subscribed to 'aggregator' channel. Total channels: ${count}`);
		}
	}

	/**
	 * @method handleRedisMessage
	 * @description Handles control messages received from the Redis channel.
	 * 				Supports 'add', 'remove', and 'replace' commands for managing feeds dynamically.
	 *
	 * @param {string} channel - The Redis channel name (expected 'aggregator').
	 * @param {string} data - The JSON string payload containing the command (`cmd`) and feed information.
	 * @returns {void}
	 */
	handleRedisMessage(channel, data) {

		// Use an IIFE to handle the asynchronous Redis processing logic
		(async () => {
			try {
				const message = JSON.parse(data);

				switch (message.cmd) {
					case "add":
						await this.feedEmitter.add(message);
						console.log(`[CMD] Added feed: ${message.url}`);
						break;
					case "remove":
						await this.feedEmitter.remove(message.url);
						console.log(`[CMD] Removed feed: ${message.url}`);
						break;
					case "replace":
						// Ensure atomic replacement by awaiting removal then addition
						await this.feedEmitter.remove(message.url);
						await this.feedEmitter.add(message);
						console.log(`[CMD] Replaced feed: ${message.url}`);
						break;
					default:
						console.warn(`[CMD] Unknown command received on ${channel}: ${message.cmd}`);
				}

			} catch (error) {
				console.error('Error processing Redis message:', error, 'Raw Data:', data);
			}
		})();
	}

	/**
	 * @method handleUncaughtException
	 * @description Handles uncaught exceptions (synchronous errors) that corrupt the process state.
	 * 				Logs the error and attempts a final cleanup before exiting immediately.
	 *
	 * @param {Error} err - The error object.
	 * @returns {void}
	 */
	handleUncaughtException(err) {

		// Log the error details with stack trace.
		console.error('FATAL: Uncaught Exception:', err.stack || err);

		// Clean shutdown: destroy feeds before exiting.
		this.feedEmitter.destroy();
		process.exit(1);
	}

	/**
	 * @method handleUnhandledRejection
	 * @description Handles unhandled promise rejections. Logs the reason and exits immediately for stability.
	 *
	 * @param {*} reason - The reason why the promise was rejected.
	 * @param {Promise<any>} promise - The promise that was rejected.
	 * @returns {void}
	 */
	handleUnhandledRejection(reason, promise) {
		// Log the rejection details.
		console.error('FATAL: Unhandled Rejection at:', promise, 'reason:', reason);

		// Clean shutdown: destroy feeds before exiting.
		this.feedEmitter.destroy();
		process.exit(1);
	}

}

export default Aggregator;