/**
 * @module FeedItem
 * @description Exports the {@link FeedItem} class, which serves as a standardized
 * data structure for a single news entry fetched from an RSS or Atom feed.
 */

'use strict';

/**
 * @typedef {Object} FeedItemProperties
 * 
 * @property {string}		[title='']			- Title of the feed item.
 * @property {string}		[description='']	- Full description (content) of the item.
 * @property {string}		[summary='']		- Short summary of the item.
 * @property {Date|null}	[date=null]			- Date the item "occurred" (often the same as `pubdate`).
 * @property {Date|null}	[pubdate=null]		- Published date of the item.
 * @property {string}		[link='']			- Link to the full article.
 * @property {string}		[origlink='']		- Original link, if different from `link`.
 * @property {string}		[author='']			- Author of the feed item.
 * @property {string}		[guid='']			- Globally Unique Identifier (often used for duplicate checking).
 * @property {string}		[comments='']		- Link or text regarding comments.
 * @property {Object|null}	[image=null]		- Image information (e.g., URL, title).
 * @property {string[]}		[categories=[]]		- Array of categories/tags associated with the item.
 * @property {Object}		[enclosures={}]		- Objects representing enclosures (e.g., podcasts, attachments).
 * @property {Object}		[meta={}]			- Metadata about the feed source itself.
 * @property {Object}		[x={}]				- Additional custom properties not defined in the standard.
 */

/**
 * @class FeedItem
 * @description Represents a standardized, single news entry (item) within an RSS feed.
 */	
class FeedItem {

	/**
     * @constructor
     * @param {FeedItemProperties} [options={}] - Feed item properties used for initialization.
     */
	constructor({
		title		= '',
		description	= '',
		summary		= '',
		date		= null,
		pubdate		= null,
		link		= '',
		origlink	= '',
		author		= '',
		guid		= '',
		comments	= '',
		image		= null,
		categories	= [],
		enclosures	= {},
		meta		= {},
		x			= {}
	} = {}) {
		this.title			= title;			/** @type {string} */
		this.description	= description;		/** @type {string} */
		this.summary		= summary;			/** @type {string} */
		this.date			= date;				/** @type {Date|null} */
		this.pubdate		= pubdate;			/** @type {Date|null} */
		this.link			= link;				/** @type {string} */
		this.origlink		= origlink;			/** @type {string} */
		this.author			= author;			/** @type {string} */
		this.guid			= guid;				/** @type {string} */
		this.comments		= comments;			/** @type {string} */
		this.image			= image;			/** @type {Object|null} */
		this.categories		= categories;		/** @type {string[]} */
		this.enclosures		= enclosures;		/** @type {Object} */
		this.meta			= meta;				/** @type {Object} */
		this.x				= x;				/** @type {Object} */
	}
}

export default FeedItem;