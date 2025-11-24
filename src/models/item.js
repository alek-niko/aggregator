/**
 *  @module db.items
 *  @description This module contains low-level methods to interact with the `rss_news` table in the database.
 * 				 It serves as the Data Access Object (DAO) for news item history.
 *
	`id`			bigint(8) unsigned NOT NULL AUTO_INCREMENT COMMENT 'newsId',
	`title`			varchar(255) NOT NULL,
	`url`			varchar(255) DEFAULT NULL,
	`category`		tinyint(3) unsigned NOT NULL COMMENT 'rss_cats',
	`website`		smallint(5) unsigned NOT NULL COMMENT 'rss sites',
	`date`			datetime NOT NULL DEFAULT current_timestamp(),
*/

/**
 * @imports Database service functions for executing SQL queries.
 * @description Provides access to `query` for SELECT operations and 
 * 				`execute` for INSERT, UPDATE, DELETE, and other statements.
 */
import { query, execute } from '../services/database.js';

/**
 * @function save
 * @description Inserts a new news item record into the `rss_news` table.
 * 
 * @param {Object} item - The news item data to be saved.
 * @param {string} item.title - The title of the news item.
 * @param {string} item.url - The URL/link to the full article.
 * @param {number} item.category - The category ID.
 * @param {number} item.website - The website/feed ID.
 * @returns {Promise<number|null>} A promise that resolves to the **inserted row's ID** if successful,
 * or **null** if the insertion failed (e.g., affectedRows is 0).
 */
async function save(item) {

	// Destructure the required properties from the input item object.
	const {
		title,
		url,
		category,
		website,
	} = item;

	// The SQL query for inserting a new row into the rss_news table.
	// NOTE: The database handles the `date` column DEFAULT current_timestamp().
	const sqlQuery = `
		INSERT INTO rss_news (title, url, category, website)
		VALUES (?,?,?,?)
	`;

	// Array of parameters corresponding to the placeholders in the SQL query.
	const params = [title, url, category, website];

	// Execute the insertion query.
	const [result] = await execute(sqlQuery, params);

	// Return the insertId if at least one row was affected.
	return result.affectedRows ? result.insertId : null;
}

/**
 * @function existsByUrlOrTitle
 * @description Checks if a news item already exists in the `rss_news` table 
 * 				based on its URL or Title for a specific website/feed.
 * 
 * @param {number} websiteId - The ID of the feed/website to check against.
 * @param {string} url - The URL of the news item.
 * @param {string} title - The title of the news item.
 * @returns {Promise<boolean>} A promise that resolves to **true** if a matching item is found, otherwise **false**.
 */
async function existsByUrlOrTitle(websiteId, url, title) {
	// Check for existence of an item linked to this website/feed (websiteId)
	// where the URL or the Title matches.
	const sqlQuery = `
		SELECT 1 FROM rss_news 
		WHERE website = ? AND (url = ? OR title = ?) 
		LIMIT 1
	`;

	// Execute the query.
	const rows = await query(sqlQuery, [websiteId, url, title]);

	// If rows.length > 0, a match was found.
	return rows.length > 0;
}

/**
 * @function bulkInsertIgnore
 * @description Executes a race-safe, bulk insertion using INSERT IGNORE.
 * 				Uses the 'query' function to support the specialized 'VALUES ?' syntax.
 * 
 * @param {Array<Array>} values - 2D array of item values ([title, url, category, website]...).
 * @returns {Promise<void>}
 */
async function bulkInsertIgnore(values) {

    if (!values || values.length === 0) {
        return;
    }

    const insertSql = `INSERT IGNORE INTO rss_news (title, url, category, website) VALUES ?`;

    // CRITICAL FIX: Use 'query' instead of 'execute' for bulk insertion (VALUES ?).
    // The underlying pool.query method supports the bulk array substitution.
    // The returned rows are discarded, but the operation succeeds.
    await query(insertSql, [values]);
}

/**
 * @function getInsertedItemsByUrlAndDate
 * @description Retrieves items that were inserted in the current batch, identified by 
 * 				URL, website, and a start time timestamp. This is the post-UPSERT identification step.
 * 
 * @param {number} websiteId - The ID of the feed/website.
 * @param {string[]} urls - An array of all URLs processed in the current batch.
 * @param {string} startTime - The timestamp string (MySQL format) when processing began.
 * @returns {Promise<Object[]>} A promise that resolves to an array of inserted item rows.
 */
async function getInsertedItemsByUrlAndDate(websiteId, urls, startTime) {

	if (!urls || urls.length === 0) {
		return [];
	}

	const selectSql = `SELECT url FROM rss_news WHERE website = ? AND url IN (?) AND date >= ?`;

	// Execute the SELECT query.
	const rows = await query(selectSql, [websiteId, urls, startTime]);

	// Return the resulting rows (which only contain the 'url' needed for mapping).
	return rows;
}

export {
	save,
	existsByUrlOrTitle,

	bulkInsertIgnore,
	getInsertedItemsByUrlAndDate
}