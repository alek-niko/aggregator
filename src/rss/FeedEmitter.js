/**
 * @module rss.feed.emitter
 * @description Exports the {@link FeedEmitter} class, which inherits from Node's built-in
 * 				EventEmitter. This class acts as the main hub for managing multiple feed instances,
 * 				scheduling their fetching via {@link FeedManager}, and emitting events for new items
 * 				and errors to the application layer.
 *
 */

import { EventEmitter } from 'events';
import FeedError from './FeedError.js';
import FeedManager from './FeedManager.js';
import Feed from './Feed.js';

// Import the FeedService to manage persistent feed configurations in MySQL.
import FeedService from '../services/FeedService.js';

/**
 * @class FeedEmitter
 * @augments {EventEmitter}
 * @description Main class responsible for orchestrating feed management, including database
 *				persistence, interval scheduling, and event emission.
 */
class FeedEmitter extends EventEmitter {
	/**
	 * @static
	 * @constant {string} DEFAULT_UA - Default user agent string for the aggregator bot.
	 */
	static DEFAULT_UA = 'CyberPunk-News-Aggregator/1.0 (+http://cyberpunk.xyz/bot-info)';

	/**
	 * @constructor
	 * @param {Object} [options={}] - Configuration options for FeedEmitter.
	 * @param {string} [options.userAgent=FeedEmitter.DEFAULT_UA] - Custom user agent string.
	 * @param {boolean} [options.skipFirstLoad=false] - If true, initial fetch (on startup) will not emit new items.
	 */
	constructor({ userAgent = FeedEmitter.DEFAULT_UA, skipFirstLoad = false } = {}) {
		
		super();

		this.userAgent = userAgent;         /** @type {string} */
		this.skipFirstLoad = skipFirstLoad; /** @type {boolean} */

		// Initialize the asynchronous service layer for MySQL configuration management.
		this.feedService = new FeedService();

		/** 
		 * @property {Map<string, { intervalId: NodeJS.Timeout, feed: Feed }>} activeIntervals - 
		 * Map storing the **runtime control** for actively polling feeds. Keyed by feed URL. 
		 * Stores the `setInterval` ID and the live `Feed` instance.
		 */
		this.activeIntervals = new Map();
	}

	/**
	 * @static
	 * @method validateFeedObject
	 * @description Validates a single feed configuration object for required properties.
	 *
	 * @param {Object} feed - Feed configuration object to validate.
	 * @param {string} ua - User agent to use if none is provided in the feed config.
	 * @throws {FeedError} If the feed configuration is missing a URL or if the URL type is incorrect.
	 * @returns {void}
	 */
	static validateFeedObject(feed, ua) {

		// Corrected check: ensure `url` exists and is either a string or a non-empty array.
		if (!feed || !feed.url || (typeof feed.url !== 'string' && !Array.isArray(feed.url) || (Array.isArray(feed.url) && feed.url.length === 0))) {
			throw new FeedError('Invalid feed configuration object: missing or invalid URL', 'type_error');
		}

		// Assign the default UA if the configuration doesn't provide one.
		feed.userAgent = feed.userAgent || ua;
	}

	/**
	 * @method add
	 * @description Adds one or more new feed configurations to the database,
	 *				and initializes their fetching intervals.
	 * @async
	 * @param {...(Object|Object[])} userFeedConfig - One or more feed configurations (objects or arrays of objects) to add.
	 * @returns {Promise<Object[]>} A promise that resolves to the list of all feed configurations in the database.
	 */
	async add(...userFeedConfig) {

		const configs = userFeedConfig.flat();

		for (const config of configs) {

			try {
				// Validate the configuration object.
				FeedEmitter.validateFeedObject(config, this.userAgent);
				
				// Handle both single URL strings and arrays of URLs.
				const urls = Array.isArray(config.url) ? config.url : [config.url];

				for (const url of urls) {

					// PERSIST/UPDATE CONFIG IN DB (Returns the saved config, including the DB ID)
					const dbFeedConfig = await this.feedService.addOrUpdate({ ...config, url });

					// Start the interval using the persisted config
					await this.startFeedInterval(dbFeedConfig);
				}

			} catch (error) {
				// If validation fails, emit the error but don't stop the process.
				this.emit('error', error);
			}
		}

		// This is a simplification; a truly async method should probably return the list via DB query
		return await this.list;
	}

	/**
	 * @method remove
	 * @description Removes a feed from the database by its URL and stops its refresh interval.
	 * 
	 * @async
	 * @param {string} url - The URL of the feed to remove.
	 * @throws {FeedError} If the input is not a string.
	 * @returns {Promise<void>}
	 */
	async remove(url) {

		if (typeof url !== 'string') {
			throw new FeedError('Feed URL to remove must be a string', 'type_error');
		}

		// Stop the running interval and clean up runtime resources.
		this.stopFeedInterval(url);

		// Delete the configuration from the database.
		await this.feedService.remove(url);
	}

	/**
	 * @public
	 * @property {Promise<Object[]>} list - Getter that asynchronously returns the list of all feeds 
	 * currently registered in the database.
	 * @returns {Promise<Object[]>} A promise that resolves to an array of feed configurations.
	 */
	get list() {
		// Asynchronously fetch all feed configurations from the database.
		return this.feedService.getAll(); 
	}

	/**
	 * @private
	 * @method startFeedInterval
	 * @description Initializes a Feed instance and sets up its refresh interval.
	 *
	 * @async
	 * @param {Object} feedConfig - Feed configuration object loaded from the database.
	 * @returns {Promise<void>}
	 */
	async startFeedInterval(feedConfig) {
		// Stop if already running (re-initialization logic)
		this.stopFeedInterval(feedConfig.url);

		// Create a new Feed instance with the configuration.
		const feed = new Feed({ 
			...feedConfig, 
			handler: { handle: this.onError.bind(this) } 
		});
		
		// 3. Setup interval and await the result of the initial fetch.
		const intervalId = await this.createSetInterval(feed);
		
		// Store the interval ID (may be null if initial fetch failed) and the feed instance.
        this.activeIntervals.set(feed.url, { intervalId, feed });
	}

	/**
	 * @private
	 * @method stopFeedInterval
	 * @description Clears a feed's interval and removes it from the active list.
	 *
	 * @param {string} url - URL of the feed to stop.
	 * @returns {void}
	 */
	stopFeedInterval(url) {

		const activeFeed = this.activeIntervals.get(url);
		
		if (activeFeed && activeFeed.intervalId !== null) {
            // Use standard `clearInterval`
            clearInterval(activeFeed.intervalId);

            // Call destroy on the Feed instance (a no-op in the reviewed code, but good practice).
            activeFeed.feed.destroy(); 
            
            // Mark the interval as null in case the feed object is still tracked (e.g., waiting for backoff)
            activeFeed.intervalId = null;
        }

		// Remove tracking entirely only if the interval was running AND it's not needed for backoff tracking,
        // but since Aggregator.getFeedConfig needs it, we only delete if we're doing a full DB removal.
        // For simple stops/updates, we leave the entry with intervalId: null.
	}

	/**
	 * @private
	 * @method createSetInterval
	 * @description Creates a refresh interval for a feed and triggers the initial fetch.
	 *
	 * @async
	 * @param {Feed} feed - Feed object to set interval for.
	 * @returns {Promise<NodeJS.Timeout|null>} The ID of the interval, or null if the initial fetch failed.
	 */
	async createSetInterval(feed) {

		// Initialize the manager for this specific feed.
		const feedManager = new FeedManager(this, feed);
		
		// Trigger the initial fetch immediately and AWAIT the result.
        // getContent() must return a boolean indicating success/failure.
        const success = await feedManager.getContent(this.skipFirstLoad);

		if (success) {
            // Only set up the recurring interval if the initial fetch was successful.
            return setInterval(() => feedManager.getContent(), feed.refresh);
        } else {
            // If it failed, the backoff logic (via Aggregator.handleError) will call updateInterval()
            // to start a new, slower interval. Return null to signal the initial attempt failed.
            return null;
        }
	}

	/**
	 * @method onError
	 * @description Central error handler for errors originating from the Feed instances.
	 * 				This method ensures the FeedEmitter emits all errors from the processing pipeline.
	 *
	 * @param {Error|FeedError} error - The error object passed from a Feed instance.
	 * @returns {void}
	 */
	onError(error) {
		this.emit('error', error);
	}

	/**
     * @method destroy
     * @description Clears all feeds, stopping their refresh intervals, and empties the feed map.
     * 				This is the correct method for graceful shutdown.
     *
     * @returns {void}
     */
    destroy() {
        // Use stopFeedInterval logic for a clean shutdown of each running feed.
        // Get all URLs and stop them one by one.
        for (const url of this.activeIntervals.keys()) {
            this.stopFeedInterval(url);
        }

        // Clear the internal map entirely after all intervals are stopped.
        this.activeIntervals.clear();
        console.log('[FeedEmitter] All polling intervals stopped and feed tracking cleared.'); // Console output for clarity
    }

	/**
	 * @method init
	 * @description Loads all feeds from the database and starts their fetching intervals.
	 * 				This should be called once on application startup.
	 * 
	 * * @returns {Promise<void>}
	 */
	async init() {
        try {
            const allFeeds = await this.feedService.getAll();
            let startedCount = 0;
            
            for (const feedConfig of allFeeds) {
                // Process feeds sequentially during startup for safer initial DB access.
                await this.startFeedInterval(feedConfig);
                startedCount++;
            }
            return startedCount;

        } catch (error) {
            this.emit('error', new FeedError('Failed to load initial feeds from database', 'db_error', null, null, error));
            return 0;
        }
    }

	/**
     * @method getFeedConfig
     * @description Retrieves the current configuration of an actively running feed.
     * 				This config contains the original `refresh` rate needed for backoff calculations.
     *
     * @param {string} url - The URL of the feed.
     * @returns {Feed|null} The running Feed instance or null if not found.
     */
    getFeedConfig(url) {
        const activeFeed = this.activeIntervals.get(url);
        
        if (activeFeed && activeFeed.feed) {
            // The running Feed instance holds the config (id, url, refresh, etc.)
            return activeFeed.feed; 
        }
        return null;
    }

	/**
	 * @method updateInterval
	 * @description Stops the current interval for a feed, updates its configuration 
	 * 				in the database, and starts a new interval with the provided time.
	 *
	 * @param {string} url - The URL of the feed to update.
	 * @param {number} newInterval - The new refresh interval in milliseconds.
	 * @returns {Promise<void>}
	 */
	async updateInterval(url, newInterval) {

		const activeFeedEntry = this.activeIntervals.get(url);

		if (activeFeedEntry) {
			
			// STOP THE OLD INTERVAL
			this.stopFeedInterval(url);

			// UPDATE CONFIG IN DATABASE
			const feedConfig = activeFeedEntry.feed;
			
			// Create a config object for the service layer
			const updatedConfig = { 
				...feedConfig, 
				refresh: newInterval 
			};

			// This update persists the new, slower refresh rate in the database.
            const dbFeedConfig = await this.feedService.addOrUpdate(updatedConfig);
			
			// 3. START A NEW INTERVAL
            // The original Feed instance is discarded, and a new one is started with the new config.
            await this.startFeedInterval(dbFeedConfig);

		} else {
			console.warn(`[FeedEmitter] Cannot update interval for non-running feed: ${url}`);
		}
	}

	/**
     * @method reloadFeeds
     * @description Stops all current intervals and re-initializes the aggregator 
     * 				by loading the latest configuration from the database.
	 * 
     * @returns {Promise<number>} The number of feeds successfully restarted.
     */
    async reloadFeeds() {
        this.destroy(); // Stop all running intervals and clear tracking
        return await this.init(); // Load and start feeds again
    }

}

export default FeedEmitter;