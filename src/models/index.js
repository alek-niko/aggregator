/**
 * @module db
 * @description Aggregates MySQL modules for feed-related access.
 *              Provides grouped access to error, feed, item, etc.
 *
 * @example
 *
 * Import all user list models:
 * import * as db from '/models/index.js';
 *
 * Access item methods:
 * await db.item.save(item);
 *
 * Import only feed module directly:
 * import { feed } from '/models/index.js';
 * await feed.get();
 *
 */

import * as feed from './feed.js';
import * as item from './item.js';
import * as error from './error.js';

export {
    feed,
    item,
	error
};