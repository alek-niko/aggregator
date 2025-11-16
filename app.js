/**
 * @module app
 * @description The main entry point for the RSS Feed Aggregator application.
 * This script initializes the environment, creates the core {@link RssAggregator} instance,
 * and starts the feed monitoring process by loading configurations from the database.
 *
 * @requires dotenv/config
 * @requires module:./src/rss/Aggregator
 */

// Import environment variables from the .env file into process.env
import 'dotenv/config'

// Import the RssAggregator class, which handles all core aggregation,
// publishing (Redis), and subscription management logic.
import Aggregator from './src/rss/Aggregator.js';

/**
 * @const {RssAggregator} rssAggregator - The initialized instance of the main application handler.
 */
const aggregator = new Aggregator();

/**
 * Executes the main startup sequence.
 * Loads feed configurations from the database.
 * Initializes the FeedEmitter with the loaded feeds.
 * Starts the recurring fetch intervals.
 * Begins listening for Redis control commands.
 */
aggregator.start();