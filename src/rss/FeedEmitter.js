/**
 * @module FeedEmitter
 * @description Exports the {@link FeedEmitter} class, which inherits from Node's built-in
 * EventEmitter. This class acts as the main hub for managing multiple feed instances,
 * scheduling their fetching via {@link FeedManager}, and emitting events for new items
 * and errors to the application layer.
 *
 */

import { EventEmitter } from 'events';
import FeedError from './FeedError.js';
import FeedManager from './FeedManager.js';
import Feed from './Feed.js';

/**
 * @class FeedEmitter
 * @augments {EventEmitter}
 * @description Main class responsible for managing all RSS/Atom feeds and emitting events.
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

		this.feedList = new Map();			/** {Map<string, Feed>} -  Map storing active Feed instances, keyed by feed URL. */
		this.userAgent = userAgent;			/** @type {string} */
		this.skipFirstLoad = skipFirstLoad;	/** @type {boolean} */
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
     * @description Adds one or more new feed configurations to the list, validates them,
     * and initializes their fetching intervals.
     *
     * @param {...(Object|Object[])} userFeedConfig - One or more feed configurations (objects or arrays of objects) to add.
     * @returns {Feed[]} The updated list of all active feed objects.
     */
	add(...userFeedConfig) {

		userFeedConfig.flat().forEach(config => {
            try {
                // Validate the configuration object.
                FeedEmitter.validateFeedObject(config, this.userAgent);
                
                // Handle both single URL strings and arrays of URLs.
                const urls = Array.isArray(config.url) ? config.url : [config.url];

                urls.forEach(url => {

                    // Create a new Feed instance with the combined configuration.
                    const feed = new Feed({ ...config, url, handler: { handle: this.onError.bind(this) } });
                    
					// Add or update the feed in the list.
                    this.addOrUpdateFeedList(feed);
                });

            } catch (error) {
                // If validation fails, emit the error but don't stop the process.
                this.emit('error', error);
            }
        });

        return this.list;
	}

	/**
     * @method remove
     * @description Removes a feed from the feed list by its URL and stops its refresh interval.
     *
     * @param {string} url - The URL of the feed to remove.
     * @throws {FeedError} If the input is not a string.
     * @returns {void}
     */
	remove(url) {
        if (typeof url !== 'string') {
            throw new FeedError('Feed URL to remove must be a string', 'type_error');
        }
        this.removeFromFeedList(url);
    }

	/**
     * @public
     * @property {Feed[]} list - Getter that returns the list of all feeds currently registered.
     * @returns {Feed[]} Array of active feed objects.
     */
    get list() {
        return [...this.feedList.values()];
    }

	/**
     * @private
     * @method addOrUpdateFeedList
     * @description Handles the logic for replacing an existing feed or adding a new one.
     *
     * @param {Feed} feed - Feed object to add or update.
     * @returns {void}
     */
	addOrUpdateFeedList(feed) {
        // If the URL already exists, destroy the old instance before adding the new one.
        if (this.feedList.has(feed.url)) {
            this.removeFromFeedList(feed.url);
        }
        this.addToFeedList(feed);
    }

	/**
     * @private
     * @method addToFeedList
     * @description Adds a new feed instance to the list and sets up its refresh interval.
     *
     * @param {Feed} feed - Feed object to add.
     * @returns {void}
     */
    addToFeedList(feed) {
        // NOTE: The line `feed.items = []` here is potentially destructive if the `feed`
        // object came from the database with existing history. It should be initialized
        // in the `Feed` constructor, not here, unless explicit reset is intended.
        // Assuming the `Feed` constructor handles initial `items` correctly.
        // feed.items = [];

        // Setup interval and store the reference on the Feed object itself.
        feed.interval = this.createSetInterval(feed);
        this.feedList.set(feed.url, feed);
    }	

	/**
     * @private
     * @method removeFromFeedList
     * @description Removes a feed from the internal Map and calls its `destroy` method to clear its interval.
     *
     * @param {string} url - URL of the feed to remove.
     * @returns {void}
     */
	removeFromFeedList(url) {

        const feed = this.feedList.get(url);
        
		if (feed) {
            // Stop the interval and remove its reference.
            feed.destroy();
            this.feedList.delete(url);
        }
    }

	/**
     * @private
     * @method createSetInterval
     * @description Creates a refresh interval for a feed and triggers the initial fetch.
     *
     * @param {Feed} feed - Feed object to set interval for.
     * @returns {NodeJS.Timeout} The ID of the interval.
     */
	createSetInterval(feed) {

		// Initialize the manager for this specific feed.
		const feedManager = new FeedManager(this, feed);
		
		// Trigger the initial fetch immediately. The `skipFirstLoad` flag
        // controls whether items found during this first load are emitted.
		feedManager.getContent(true);

		// Set up the recurring interval for subsequent checks.
        return setInterval(() => feedManager.getContent(), feed.refresh);
	}

	/**
     * @method onError
     * @description Central error handler for errors originating from the Feed instances.
     * This method ensures the FeedEmitter emits all errors from the processing pipeline.
     *
     * @param {Error|FeedError} error - The error object passed from a Feed instance.
     * @returns {void}
     */
    onError(error) {
        this.emit('error', error);
    }

	/**
     * @method destroy
     * @description Clears all feeds, stopping their refresh intervals, and empties the feed list.
     *
     * @returns {void}
     */
    destroy() {
        // Call the individual destroy method on each Feed instance to clear intervals.
        this.feedList.forEach(feed => feed.destroy());
        // Clear the internal map.
        this.feedList.clear();
    }
}

export default FeedEmitter;