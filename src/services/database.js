/**
 * @module services.db
 * @description Service for interacting with the database for contact-related operations.
 */

import pool from '../config/db.js';

/**
 * @function query
 * @description  Executes a SELECT query with optional parameters and returns the result rows.
 * 
 * @param {string} sql - The SQL query to execute.
 * @param {Array} [params=[]] - The parameters to bind in the query.
 * @returns {Promise<Array>} The result rows of the query.
 * 
 */
async function query(sql, params = []) {
	const [rows] = await pool.query(sql, params);
	return rows;
}

/**
 * @function execute
 * @description Executes an INSERT, UPDATE, or DELETE SQL query 
 * 				with optional parameters and returns the full result.
 * 				Useful for cases where metadata (e.g., affected rows, insert ID) is needed.
 * 
 * @param {string} sql - The SQL query to execute.
 * @param {Array} [params=[]] - The parameters to bind in the query.
 * @returns {Promise<Object>} The full query result, including metadata.
 * 
 */
async function execute(sql, params = []) {
	const result = await pool.execute(sql, params);
	return result; // Returns [rows, fields]
}

export { query, execute };