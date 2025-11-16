/**
 * @module rss.aggregator
 * @description This module exports the main class {@link Aggregator},
 * 				which is responsible for the core functions of the RSS feed processing system.
 * 				It coordinates feed fetching, database persistence, and real-time messaging
 * 				via Redis Pub/Sub.
 */

import * as dbFeed from '../models/feed.js' 
import * as dbItem from '../models/item.js' 
import * as dbError from '../models/error.js' 

import FeedEmitter from './FeedEmitter.js';

import { publisher, subscriber } from '../database/redis.js';

/**
 * @class Aggregator
 * @description The main class responsible for orchestrating RSS feed aggregation.
 * 				It manages the FeedEmitter, handles database interactions,
 * 				and uses Redis Pub/Sub for communication.
 */
class Aggregator {

	/**
     * @constructor
     * @description Initializes a new instance of the RssAggregator.
     * Sets up the FeedEmitter with specified options and initializes event handlers.
     */
	constructor() {
		/**
		 * @property {FeedEmitter} feedEmitter - The instance of the underlying feed-monitoring library.
		 */
		this.feedEmitter = new FeedEmitter({
			// Prevents the emitter from fetching all feeds immediately on creation.
			skipFirstLoad: true,
			// Custom user agent to identify the aggregator client during fetches.
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'
		});

		this.initializeEventHandlers();
	}

	/**
     * @method initializeEventHandlers
     * @description Sets up all event handlers for feed events and process-wide error handling.
     * This method is crucial for the application's reactivity and stability.
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
     * 				Saves the item to the database and publishes it to 
	 * 				a Redis channel specific to its category.
     *
     * @param {FeedItem} item - The RSS item data, including title, url, category, and website ID.
     * @returns {Promise<void>}
     */
	async handleNewItem(item) {

		try {
			// Save the item and retrieve the newly inserted ID.
			const id = await dbItem.save(item);
			item.id = id;

			// Publish the item to Redis. The channel is dynamically set by category.
			publisher.publish(
				`feed:wire:${item.category}`,
				JSON.stringify({
					event: `feed:wire:${item.category}`,
					data: item
				})
			);

		} catch (error) {
			// Log the error and proceed. The system should not crash if saving a single item fails.
            // Using dbError.log here is risky as it could create an error loop.
			console.error('Error saving news item and publishing:', error);
		}
	}

	/**
     * @method handleError
     * @description Handles errors that occur during feed processing (e.g., fetch, parse errors).
     * 				Logs the error to the database, removes problematic feeds, 
	 * 				and publishes the error to a Redis channel.
     *
     * @param {FeedError} error - The feed error object.
     * @returns {Promise<void>}
     */
	async handleError(error) {

		// Log to console for immediate visibility.
		console.log(`[${error.name}] ${error.message}: ${error.feed}`);

		// Handle permanent/severe errors by removing the feed.
		if (['fetch_url_error', 'parse_url_error'].includes(error.name)) {
			// Remove the feed from the emitter to stop retrying immediately.
			// Handle this better
			this.feedEmitter.remove(error.feed);
		}

		// Log the error to the database. Wrapped in a try/catch to ensure stability.
		try {
			await dbError.log({
				type: error.name,
				message: error.message,
				feedId: error.feedId,
			});
		} catch (e) {
			// This is the fallback of the fallback (failed to log an error).
			console.error('CRITICAL: Failed to log error to the database:', e);
		}

		// Publish the error to a central Redis channel for monitoring/other services.
		publisher.publish(
			`aggregator-errors`,
			JSON.stringify({
				event: `error`,
				type: error.name,
				message: error.message,
				feedId: error.feedId,
				feed: error.feed,
			})
		);
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
     * Supports 'add', 'remove', and 'replace' commands for managing feeds dynamically.
     *
     * @param {string} channel - The Redis channel name (expected 'aggregator').
     * @param {string} data - The JSON string payload containing the command (`cmd`) and feed information.
     * @returns {void}
     */
	handleRedisMessage(channel, data) {

		try {
            const message = JSON.parse(data);

            switch (message.cmd) {
                case "add":
                    // Adds a new feed to the emitter. Assumes 'message' contains the full feed object.
                    this.feedEmitter.add(message);
                    console.log(`[CMD] Added feed: ${message.url}`);
                    break;
                case "remove":
                    // Removes a feed by its URL.
                    this.feedEmitter.remove(message.url);
                    console.log(`[CMD] Removed feed: ${message.url}`);
                    break;
                case "replace":
                    // Removes and then re-adds the feed to apply new settings (e.g., refresh interval).
                    this.feedEmitter.remove(message.url);
                    this.feedEmitter.add(message);
                    console.log(`[CMD] Replaced feed: ${message.url}`);
                    break;
                default:
                    console.warn(`[CMD] Unknown command received on ${channel}: ${message.cmd}`);
            }

        } catch (error) {
            console.error('Error processing Redis message:', error, 'Raw Data:', data);
        }
	}

	/**
     * @method handleUncaughtException
     * @description Handles uncaught exceptions (synchronous errors) that occur in the process.
     * Logs the error and attempts to shut down gracefully (though Node will exit shortly after).
	 * 
	 * Handles uncaught exceptions that occur in the Node.js process.
     * Logs the error details and exits immediately as the process state is corrupted.
     *
     * @param {Error} err - The error object.
     * @returns {void}
     */
	handleUncaughtException(err) {

		// Log the error details with stack trace.
        console.error('FATAL: Uncaught Exception:', err.stack || err);

        // It's common practice to exit the process after an uncaught exception.
        
		// Clean shutdown: destroy feeds before exiting.
        this.feedEmitter.destroy(); 
        process.exit(1);
	}

	/**
     * @method handleUnhandledRejection
     * @description Handles unhandled promise rejections in the Node.js process.
     * Logs the reason but often does NOT exit immediately, though exiting is safer.
     * We'll exit immediately here for maximum stability.
     *
     * @param {*} reason - The reason why the promise was rejected.
     * @param {Promise<any>} promise - The promise that was rejected.
     * @returns {void}
     */
    handleUnhandledRejection(reason, promise) {
        // Log the rejection details.
		syslog.error('FATAL: Unhandled Rejection at:', promise, 'reason:', reason);

		// Clean shutdown: destroy feeds before exiting.
        this.feedEmitter.destroy();
        process.exit(1);
    }

	/**
     * @method start
     * @description Starts the RSS Aggregator by loading all active RSS feeds from the database
     * and adding them to the feed emitter for monitoring.
     *
     * @returns {Promise<void>}
     */
    async start() {

        console.log('Starting RSS Aggregator...');

        try {
            // Fetch all feed configuration sites from the database.
            const feeds = await dbFeed.get();

            if (!feeds || feeds.length === 0) {
                console.warn('No feeds found in the database. Aggregator is running but not monitoring any sites.');
            }

            // Add each feed configuration to the emitter for monitoring.
            for (const feed of feeds) {
                this.feedEmitter.add(feed);
            }
            console.log(`Successfully started monitoring ${feeds.length} feeds.`);

        } catch (error) {
            console.error('FATAL: Failed to initialize/start aggregator due to DB error:', error);
            // Re-throw or exit, as the core functionality is disabled without feeds.
            throw error;
        }
    }
}

export default Aggregator;